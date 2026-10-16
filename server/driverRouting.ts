import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MemoryIngestionStore } from "../src/ingestion/store";
import { SOURCES, fetchUrlFor } from "../src/ingestion/sources";
import { runSource, buildIngestedConstraints } from "../src/ingestion/pipeline";
import { assessFreshness } from "../src/ingestion/freshness";
import {
  MunicipalityIndex,
  isMunicipalityDataset,
} from "../src/ingestion/municipalities";
import {
  assessRouteCoverage,
  routeMunicipalities,
  candidateNearRoute,
  RouteProximityIndex,
} from "../src/ingestion/coverage";
import { buildRegulationDataset } from "../src/regulations/repository";
import { evaluateCompliance } from "../src/regulations/evaluate";
import {
  routeTimingInput,
  DEFAULT_TIMING_MODEL,
} from "../src/regulations/timeline";
import { canonicalJson, hashString } from "../src/regulations/decisionInputs";
import { solveStrategy } from "../src/solver/solver";
import { tomtomRoutingProvider } from "../src/solver/tomtomProvider";
import { getTruckPreset } from "../src/tomtom/truckPresets";
import type { FactSet } from "../src/regulations/types";
import type { RoutingProvider, RoutingAvoidance } from "../src/solver/types";
import type {
  RoutePlanOption,
  PlanRoutePlanningOpts,
} from "../src/tomtom/planRoutes";
import type {
  CandidateConstraint,
  SourceRecord,
  SourceState,
} from "../src/ingestion/types";

type Point = [number, number];
export type DriverRouteRequest = {
  from: Point;
  stops: { at: Point; label: string; kind: "fuel" | "destination" }[];
  lang: "pt" | "es" | "en";
  truck: { weightKg: number; lengthM: number; widthM: number; heightM: number };
  avoided?: { id: string; lines: Point[][] }[];
};
const point = (p: unknown): p is Point =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every(Number.isFinite) &&
  Math.abs(p[0]) <= 90 &&
  Math.abs(p[1]) <= 180;
export function validateDriverRequest(raw: unknown): DriverRouteRequest {
  if (!raw || typeof raw !== "object")
    throw new Error("Pedido de rota inválido");
  const r = raw as DriverRouteRequest;
  if (
    !point(r.from) ||
    !Array.isArray(r.stops) ||
    !r.stops.length ||
    r.stops.length > 12 ||
    r.stops.some(
      (s) =>
        !s ||
        !point(s.at) ||
        typeof s.label !== "string" ||
        s.label.length > 300 ||
        !["fuel", "destination"].includes(s.kind),
    )
  )
    throw new Error("Paragens inválidas");
  if (
    !["pt", "es", "en"].includes(r.lang) ||
    !r.truck ||
    ![r.truck.weightKg, r.truck.lengthM, r.truck.widthM, r.truck.heightM].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    r.truck.weightKg > 100000 ||
    r.truck.lengthM > 30 ||
    r.truck.widthM > 5 ||
    r.truck.heightM > 6
  )
    throw new Error("Perfil do camião inválido");
  if (
    r.avoided &&
    (!Array.isArray(r.avoided) ||
      r.avoided.length > 20 ||
      r.avoided.some(
        (a) =>
          typeof a.id !== "string" ||
          !Array.isArray(a.lines) ||
          a.lines.length > 20 ||
          a.lines.some(
            (l) =>
              !Array.isArray(l) ||
              l.length < 2 ||
              l.length > 5000 ||
              !l.every(point),
          ),
      ))
  )
    throw new Error("Desvios inválidos");
  return r;
}

/** Uses the same evaluator and clean-route solver as dispatch. Never substitutes a failed solve with a direct route. */
export async function solveDriverRoute(
  request: DriverRouteRequest,
  provider: RoutingProvider,
  dataset: ReturnType<typeof buildRegulationDataset>,
  now: Date,
  options: {
    baseline?: RoutePlanOption;
    getDataset?: () => Promise<typeof dataset>;
  } = {},
) {
  const facts: FactSet = Object.fromEntries(
    Object.entries({
      "vehicle.grossWeightKg": request.truck.weightKg,
      "vehicle.isGoodsVehicle": true,
      "vehicle.heightM": request.truck.heightM,
      "vehicle.widthM": request.truck.widthM,
      "vehicle.lengthM": request.truck.lengthM,
    }).map(([id, value]) => [
      id,
      { status: "known", value, source: "driver request" },
    ]),
  );
  return solveStrategy({
    strategy: "FASTEST",
    provider,
    baseline: options.baseline,
    getDataset: options.getDataset ?? (async () => dataset),
    inputsKey: hashString(canonicalJson(request)),
    now: () => now,
    evaluate: (route, currentDataset) =>
      evaluateCompliance(
        currentDataset,
        {
          route: routeTimingInput(
            route.polyline,
            route.legPointCounts,
            route.legDurationSec,
            Date.parse(route.departAtIso ?? now.toISOString()),
            DEFAULT_TIMING_MODEL,
          ),
          facts,
          routeRoadNumbers: route.roadNumbers,
          stops: [
            {
              id: "origin",
              type: "pickup",
              lat: request.from[0],
              lng: request.from[1],
            },
            ...request.stops.map((s, i) => ({
              id: `stop-${i}`,
              type:
                s.kind === "fuel" ? ("stop" as const) : ("delivery" as const),
              lat: s.at[0],
              lng: s.at[1],
            })),
          ],
        },
        undefined,
        now,
      ),
  });
}

export function createDriverRoutingService(key: string, root: string) {
  const store = new MemoryIngestionStore();
  const cachePath = resolve(root, ".cache/driver-road-intelligence.json");
  let index: MunicipalityIndex | null = null;
  let pending: Promise<void> | null = null;
  const initialized = (async () => {
    const data: unknown = JSON.parse(
      await readFile(
        resolve(root, "public/data/caop2025-municipios.json"),
        "utf8",
      ),
    );
    if (!isMunicipalityDataset(data)) throw new Error("Registo CAOP inválido");
    index = new MunicipalityIndex(data);
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as {
        states: SourceState[];
        candidates: CandidateConstraint[];
      };
      for (const s of cached.states) await store.putSourceState(s);
      for (const s of SOURCES)
        await store.putCandidates(
          s.id,
          cached.candidates.filter((c) => c.sourceId === s.id),
        );
    } catch {
      /* First run: freshness remains UNKNOWN until successful retrieval. */
    }
  })();
  async function refresh(sources: SourceRecord[], now: Date) {
    // Serialize refreshes across reroutes and fuel selection; respect each registered cadence.
    const work = (pending ?? Promise.resolve()).then(async () => {
      const states = await store.getSourceStates();
      await Promise.all(
        sources.map(async (source) => {
          const state = states.find((s) => s.sourceId === source.id);
          const age = now.getTime() - Date.parse(state?.lastAttemptAt ?? "");
          if (
            Number.isFinite(age) &&
            age < source.cadence.checkEveryMin * 60000
          )
            return;
          await runSource(source, {
            store,
            now,
            fetch: (_url, init) => {
              const url =
                source.access.kind === "SAME_ORIGIN_PROXY"
                  ? source.access.upstreamUrl
                  : fetchUrlFor(source);
              if (!url || !url.startsWith("https://"))
                throw new Error("Fonte não disponível");
              return fetch(url, {
                ...init,
                signal: AbortSignal.any([
                  init.signal,
                  AbortSignal.timeout(12000),
                ]),
              });
            },
          });
        }),
      );
      await mkdir(resolve(root, ".cache"), { recursive: true });
      await writeFile(
        `${cachePath}.tmp`,
        JSON.stringify({
          states: await store.getSourceStates(),
          candidates: await store.getAllCandidates(),
        }),
      );
      await rename(`${cachePath}.tmp`, cachePath);
    });
    pending = work;
    try {
      await work;
    } finally {
      if (pending === work) pending = null;
    }
  }
  return async (r: DriverRouteRequest) => {
    if (!key) throw new Error("Chave do routing FleetOS em falta no servidor");
    await initialized;
    const now = new Date();
    const preset = {
      ...getTruckPreset("artic-40"),
      maxGrossWeightKg: r.truck.weightKg,
      vehicleLength: r.truck.lengthM,
      vehicleWidth: r.truck.widthM,
      vehicleHeight: r.truck.heightM,
    };
    const planning: PlanRoutePlanningOpts = {
      departAt: now,
      navigationLanguage: { pt: "pt-PT", es: "es-ES", en: "en-GB" }[
        r.lang
      ] as PlanRoutePlanningOpts["navigationLanguage"],
      waypointStops: r.stops.map((s, i) => ({
        id: `stop-${i}`,
        name: s.label,
      })),
      truck: {
        fleetTruckId: "driver-demo",
        preset,
        cargoWeightKg: Math.max(0, r.truck.weightKg - preset.kerbWeightKg),
      },
    };
    const base = tomtomRoutingProvider(
      key,
      [r.from, ...r.stops.map((s) => s.at)].map(([lat, lng]) => ({ lat, lng })),
      planning,
    );
    const requested: RoutingAvoidance[] = (r.avoided ?? []).map((a) => ({
      id: a.id,
      kind: "avoid_path",
      lines: a.lines,
      constraintIds: [],
    }));
    const provider: RoutingProvider = {
      ...base,
      describe: (a) => base.describe([...requested, ...a]),
      route: (strategy, a) => base.route(strategy, [...requested, ...a]),
    };
    const baseline = await provider.route("FASTEST", []);
    if (baseline.error || baseline.polyline.length < 2)
      throw new Error(baseline.error ?? "Rota indisponível");
    let selected: SourceRecord[] = [];
    // Repeat route scope after each detour so newly crossed municipalities are fetched too.
    const collect = async (route: RoutePlanOption) => {
      const codes = new Set(
        index
          ? routeMunicipalities(route.polyline, index).lookups.flatMap((l) =>
              l.status === "inside"
                ? [l.municipality.code]
                : l.status === "near_border"
                  ? l.candidates.map((m) => m.code)
                  : [],
            )
          : [],
      );
      selected = SOURCES.filter(
        (s) =>
          s.enabled &&
          !s.synthetic &&
          fetchUrlFor(s) &&
          (s.coverage.jurisdiction.kind === "national" ||
            s.coverage.jurisdiction.municipalityCodes.some((code) =>
              codes.has(code),
            )),
      );
      await refresh(selected, now);
    };
    await collect(baseline);
    const getData = async () => {
      const states = await store.getSourceStates();
      const freshness = Object.fromEntries(
        SOURCES.map((s) => [
          s.id,
          assessFreshness(
            s,
            states.find((st) => st.sourceId === s.id),
            now,
          ),
        ]),
      );
      const candidates = await store.getAllCandidates();
      const ingested = buildIngestedConstraints(
        candidates,
        SOURCES,
        freshness,
        now,
      );
      return {
        dataset: buildRegulationDataset([], ingested),
        candidates,
        freshness,
        ingested,
      };
    };
    // Keep full baseline guidance and discover new municipalities after each solver detour.
    const solvingProvider: RoutingProvider = {
      ...provider,
      route: (strategy, a) =>
        provider.route(strategy, a).then(async (route) => {
          await collect(route);
          return route;
        }),
    };
    const initial = await getData();
    const solved = await solveDriverRoute(
      r,
      solvingProvider,
      initial.dataset,
      now,
      { baseline, getDataset: async () => (await getData()).dataset },
    );
    const route = solved.finalOption;
    if (!route || !route.navigation?.instructions.length)
      throw new Error(
        solved.result.unresolved.map((u) => u.reason).join("; ") ||
          "Rota sem instruções utilizáveis",
      );
    const data = await getData();
    const coverage = assessRouteCoverage({
      route: route.polyline,
      index,
      sources: SOURCES,
      freshness: data.freshness,
      candidates: data.candidates,
      status: solved.result.final?.report.status,
    });
    const proximity = new RouteProximityIndex(route.polyline, 150);
    const near = data.candidates.filter((c) =>
      candidateNearRoute(c, route.polyline, 150, proximity),
    );
    const alerts = near
      .filter(
        (c) =>
          ["ACTIVE", "INFORMATIONAL"].includes(c.gate.decision) &&
          c.fields.geometry.provenance === "VERIFIED" &&
          ["FRESH", "AGING"].includes(data.freshness[c.sourceId]?.state) &&
          c.fields.validity.state === "VERIFIED" &&
          c.fields.validity.value &&
          Date.parse(c.fields.validity.value.start) <= now.getTime() &&
          (!c.fields.validity.value.end ||
            Date.parse(c.fields.validity.value.end) >= now.getTime()),
      )
      .flatMap((c) => {
        const g = c.fields.geometry.value;
        const lines =
          g?.kind === "point"
            ? [[g.point]]
            : g?.kind === "lines"
              ? g.lines
              : [];
        return lines.map((coords, i) => ({
          id: `project2:${c.id}:${i}`,
          category:
            c.fields.category.value === "ROAD_CLOSURE"
              ? 8
              : c.fields.category.value === "ROADWORKS"
                ? 9
                : 3,
          text: c.title,
          from: c.fields.locationText.value,
          coords,
          source: c.sourceId,
        }));
      });
    return {
      route: {
        points: route.polyline,
        summary: {
          travelTimeInSeconds: route.durationSec,
          trafficDelayInSeconds: route.trafficDelaySec,
        },
        guidance: { instructions: route.navigation.instructions },
        sections: route.navigation.sections,
      },
      intelligence: {
        engine: "FleetOS",
        project: 2,
        datasetVersion: data.dataset.version,
        outcome: solved.result.outcome,
        status: solved.result.final?.report.status,
        constraints: data.dataset.regulations.length,
        activeFeedConstraints: data.ingested.constraints.length,
        deviations: solved.result.deviations,
        coverage: {
          complete: coverage.complete,
          headline: coverage.headline,
          notes: coverage.notes,
          municipalities: coverage.municipalities,
        },
        sources: selected.map((s) => ({
          id: s.id,
          name: s.name,
          ...data.freshness[s.id],
        })),
        reviewRequired: near.filter(
          (c) => c.gate.decision === "REVIEW_REQUIRED",
        ).length,
        reviewStore: "server-ingestion; browser reviews not synchronized",
        checkedAt: now.toISOString(),
      },
      alerts,
    };
  };
}

/** Local development bridge only. Fixed route API, bounded input, restricted browser origins. */
export function driverRoutingMiddleware(
  route: ReturnType<typeof createDriverRoutingService>,
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (req.url !== "/api/driver/route") {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (
      origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1):(8082|8084)$/.test(origin)
    ) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Usa POST" }));
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += String(chunk);
        if (body.length > 512000) throw new Error("Pedido demasiado grande");
      }
      let request: DriverRouteRequest;
      try {
        request = validateDriverRequest(JSON.parse(body));
      } catch (e) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: e instanceof Error ? e.message : "Pedido inválido",
          }),
        );
        return;
      }
      res.end(JSON.stringify(await route(request)));
    } catch (e) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error:
            e instanceof Error
              ? e.message.replace(/([?&]key=)[^&\s]+/g, "$1***")
              : "Routing FleetOS indisponível",
        }),
      );
    }
  };
}
