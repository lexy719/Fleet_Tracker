import { hashString, routeGeometryHash } from "../regulations/decisionInputs";
import { routesEquivalent, simplifyByLegs } from "../regulations/geometry";
import { provenanceOf } from "../regulations/alternatives";
import type { ComplianceReport, Condition, RegulationDataset, RegulationResult } from "../regulations/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import { MATERIALLY_WORSE } from "./types";
import type {
  ConstraintRef,
  TraceSpan,
  RoadDeviation,
  RouteStrategy,
  RouteSummary,
  RoutingAvoidance,
  RoutingProvider,
  SolverAttempt,
  StoredRoute,
  StrategyOutcome,
  StrategyResult,
} from "./types";

/*
 * Iterative clean-route solver. For one strategy:
 *   route → discovery (route-driven) → dataset → evaluate (route's OWN timing)
 *   → accepted constraints that APPLY → provider-neutral avoidances → new route → …
 * Every route, including rerouted ones, goes through the same evaluator; the provider is
 * never trusted to have honoured an avoidance.
 */

export const DEFAULT_MAX_REROUTES = 6;
/** Constraints whose passage starts within this of the earliest one are avoided together (same place). */
export const CO_LOCATED_MS = 5 * 60_000;

/**
 * Would apply but for an unverified legal status (the evaluator downgrades APPLIES to
 * UNKNOWN with a legal_status reason). Uncertainty from missing facts is NOT avoided.
 */
export function precautionary(r: RegulationResult): boolean {
  return r.outcome === "UNKNOWN" && r.reasons.some((x) => x.kind === "legal_status");
}
const mustAvoid = (r: RegulationResult) => r.effect !== "advisory" && (r.outcome === "APPLIES" || precautionary(r));

export type SolveArgs = {
  strategy: RouteStrategy;
  provider: RoutingProvider;
  /** Baseline route if already fetched (avoids a duplicate provider request). */
  baseline?: RoutePlanOption;
  /** Deterministic evaluation of one route (timing derived from that route). */
  evaluate: (route: RoutePlanOption, dataset: RegulationDataset) => ComplianceReport;
  /** Current constraint dataset — re-read every iteration (discovery may ingest). */
  getDataset: () => Promise<RegulationDataset>;
  /** Route-driven discovery for this route; may refresh sources through 3B. */
  discover?: (route: RoutePlanOption, iteration: number) => Promise<{ runId: string; localMs: number; externalMs: number; phases?: Record<string, number> } | null>;
  inputsKey: string;
  maxReroutes?: number;
  now?: () => Date;
  clock?: () => number;
};

export function summarize(o: RoutePlanOption): RouteSummary {
  return {
    optionId: o.id,
    fingerprint: routeGeometryHash(o.polyline),
    distanceM: o.distanceM,
    durationSec: o.durationSec,
    ...(o.departAtIso ? { departAtIso: o.departAtIso } : {}),
    ...(o.arrivalAtIso ? { arrivalAtIso: o.arrivalAtIso } : {}),
    roadNumbers: o.roadNumbers,
    provenance: provenanceOf(o),
  };
}

function stored(o: RoutePlanOption): StoredRoute {
  const s = simplifyByLegs(o.polyline, o.legPointCounts, 5);
  return {
    ...summarize(o),
    routing: o.routing,
    trafficDelaySec: o.trafficDelaySec,
    polyline: s.points,
    legPointCounts: s.legPointCounts,
    legDurationSec: o.legDurationSec,
    providerCosts: { fuelCostEur: o.fuelCostEur, tollCostEur: o.tollCostEur, tollDataQuality: o.tollDataQuality },
  };
}

/** Rebuild a route option from a stored route (map display / confirmation of a reused result). */
export function storedToOption(s: StoredRoute, id: string, title: string): RoutePlanOption {
  return {
    id,
    title,
    subtitle: "resultado Road Intelligence guardado",
    polyline: s.polyline,
    distanceM: s.distanceM,
    durationSec: s.durationSec,
    trafficDelaySec: s.trafficDelaySec ?? 0,
    routing: s.routing,
    fuelCostEur: s.providerCosts?.fuelCostEur ?? 0,
    tollCostEur: s.providerCosts?.tollCostEur ?? 0,
    tollPricedEur: 0,
    tollEstimatedEur: 0,
    tollDataQuality: (s.providerCosts?.tollDataQuality as RoutePlanOption["tollDataQuality"]) ?? "none",
    tollSectionCount: 0,
    stopArrivals: [],
    legDurationSec: s.legDurationSec,
    legPointCounts: s.legPointCounts,
    roadNumbers: s.roadNumbers,
    ...(s.departAtIso ? { departAtIso: s.departAtIso } : {}),
    ...(s.arrivalAtIso ? { arrivalAtIso: s.arrivalAtIso } : {}),
    colorIndex: 21,
    comparisonRole: "other",
  };
}

function describeCondition(c: Condition): string {
  switch (c.kind) {
    case "all":
      return c.of.length === 0 ? "todo o trânsito" : c.of.map(describeCondition).join(" e ");
    case "any":
      return c.of.map(describeCondition).join(" ou ");
    case "not":
      return `não (${describeCondition(c.of)})`;
    case "fact":
    case "stopInArea":
      return c.label;
  }
}

function refOf(r: RegulationResult, dataset: RegulationDataset): ConstraintRef {
  const reg = dataset.regulations.find((x) => x.id === r.regulationId);
  return {
    constraintId: r.regulationId,
    title: r.title,
    kind: reg?.kind ?? "LEGAL_RESTRICTION",
    ...(reg?.origin ? { origin: reg.origin } : {}),
    ...(reg ? { vehicleScope: describeCondition(reg.appliesTo) } : {}),
    evidence: (reg?.evidence ?? [])
      .filter((e) => r.evidenceIds.includes(e.id) || reg?.origin)
      .slice(0, 4)
      .map((e) => ({ id: e.id, url: e.url, authority: e.authority, ...(e.quote ? { quote: e.quote } : {}), verification: e.verification })),
  };
}

/** Provider-neutral avoidance for constraints with usable resolved geometry. */
export function avoidancesFor(constraintIds: string[], dataset: RegulationDataset): { avoidances: RoutingAvoidance[]; untranslatable: { constraintId: string; reason: string }[] } {
  const avoidances: RoutingAvoidance[] = [];
  const untranslatable: { constraintId: string; reason: string }[] = [];
  for (const id of constraintIds) {
    const reg = dataset.regulations.find((r) => r.id === id);
    const geom = reg && dataset.geometries.find((g) => g.id === reg.location.geometryId);
    if (!geom || geom.status !== "RESOLVED" || !geom.resolved || geom.resolved.verification === "UNVERIFIED") {
      untranslatable.push({ constraintId: id, reason: "sem geometria resolvida utilizável para pedir um desvio" });
      continue;
    }
    avoidances.push({ id: `avoid-${id}`, kind: "avoid_path", lines: geom.resolved.lines, constraintIds: [id] });
  }
  return { avoidances, untranslatable };
}

export async function solveStrategy(args: SolveArgs): Promise<{ result: StrategyResult; finalOption: RoutePlanOption | null; routes: RoutePlanOption[] }> {
  const clock = args.clock ?? (() => performance.now());
  const now = args.now ?? (() => new Date());
  const t0 = clock();
  const timings = { evaluateMs: 0, orchestrationMs: 0, discoveryLocalMs: 0, externalRoutingMs: 0, externalDiscoveryMs: 0, datasetMs: 0 };
  const maxReroutes = args.maxReroutes ?? DEFAULT_MAX_REROUTES;
  const attempts: SolverAttempt[] = [];
  const deviations: RoadDeviation[] = [];
  const unresolved: StrategyResult["unresolved"] = [];
  const discoveryRunIds: string[] = [];
  const routes: RoutePlanOption[] = [];
  const avoiding = new Map<string, RoutingAvoidance>();
  const trace: TraceSpan[] = [];
  const span = (phase: string, iteration: number, ms: number, external = false) => trace.push({ phase, iteration, ms: Math.round(ms * 10) / 10, ...(external ? { external } : {}) });

  const errorResult = (message: string, baseline?: RoutePlanOption, report?: ComplianceReport): { result: StrategyResult; finalOption: null; routes: RoutePlanOption[] } => ({
    result: {
      schemaVersion: 1,
      strategy: args.strategy,
      solvedAt: now().toISOString(),
      outcome: "ERROR",
      baseline: baseline && report ? { route: stored(baseline), report } : { route: { ...emptySummary(), polyline: [], legPointCounts: [], legDurationSec: [] }, report: report ?? emptyReport(message) },
      final: null,
      attempts,
      deviations,
      total: null,
      unresolved: [{ reason: message, constraintIds: [] }],
      datasetVersion: report?.datasetVersion ?? "",
      discoveryRunIds,
      inputsKey: args.inputsKey,
      timings,
    },
    finalOption: null,
    routes,
  });

  let route: RoutePlanOption;
  if (args.baseline) route = args.baseline;
  else {
    const te = clock();
    try {
      route = await args.provider.route(args.strategy, []);
    } catch (e) {
      timings.externalRoutingMs += clock() - te;
      span("routing request (baseline)", 0, clock() - te, true);
      return errorResult(`fornecedor de rotas falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
    timings.externalRoutingMs += clock() - te;
    span("routing request (baseline)", 0, clock() - te, true);
  }
  if (route.error || route.polyline.length < 2) return errorResult(`rota base indisponível${route.error ? `: ${route.error}` : ""}`);
  routes.push(route);

  const baselineRoute = route;
  let baselineReport: ComplianceReport | null = null;
  let lastReport: ComplianceReport | null = null;
  let lastDataset: RegulationDataset | null = null;
  let outcome: StrategyOutcome = "ERROR";
  const seen: RoutePlanOption[] = [];
  let firstIngested: string[] | null = null;
  const ingestedIds = (d: RegulationDataset) => d.regulations.filter((r) => r.origin).map((r) => r.id).sort();

  for (let iteration = 0; ; iteration++) {
    if (args.discover) {
      const td = clock();
      const d = await args.discover(route, iteration).catch(() => null);
      const wall = clock() - td;
      span("discovery", iteration, wall);
      if (d) {
        discoveryRunIds.push(d.runId);
        timings.externalDiscoveryMs += d.externalMs;
        timings.discoveryLocalMs += Math.max(0, wall - d.externalMs);
        if (d.externalMs > 0) span("discovery:source fetches", iteration, d.externalMs, true);
        for (const [k, v] of Object.entries(d.phases ?? {})) span(`discovery:${k}`, iteration, v);
      } else timings.discoveryLocalMs += wall;
    }
    const tds = clock();
    const dataset = await args.getDataset();
    timings.datasetMs += clock() - tds;
    span("dataset", iteration, clock() - tds);
    if (firstIngested === null) firstIngested = ingestedIds(dataset);
    const te = clock();
    const report = args.evaluate(route, dataset);
    timings.evaluateMs += clock() - te;
    span("evaluate", iteration, clock() - te);
    const tb = clock();
    if (iteration === 0) baselineReport = report;
    lastReport = report;
    lastDataset = dataset;
    seen.push(route);

    const applies = report.results.filter(mustAvoid);
    const uncertainRes = report.results.filter((r) => r.outcome === "UNKNOWN" && !precautionary(r));
    const prevAttempt = attempts.at(-1);
    attempts.push({
      iteration,
      route: summarize(route),
      status: report.status,
      datasetVersion: dataset.version,
      applies: applies.map((r) => ({ ...refOf(r, dataset), ...(r.exposure ? { exposure: r.exposure } : {}) })),
      uncertain: uncertainRes.map((r) => ({ ...refOf(r, dataset), reasons: r.reasons.map((x) => x.text).slice(0, 3) })),
      requestedAvoiding: [...avoiding.keys()],
      ...(prevAttempt && deviations.at(-1) ? { providerRequest: deviations.at(-1)!.method } : {}),
    });
    span("bookkeeping (attempt record + geometry hash)", iteration, clock() - tb);

    // Complete the previous deviation with what happened on THIS route (new timing).
    const dev = deviations.at(-1);
    if (dev && dev.iteration === iteration - 1) {
      for (const t of dev.triggers) {
        const r = report.results.find((x) => x.regulationId === t.constraintId);
        t.outcomeAfter = !r || r.outcome === "DOES_NOT_APPLY" ? "avoided" : mustAvoid(r) ? "still_applies" : "uncertain";
        if (r?.exposure) t.passageAfter = r.exposure;
      }
      const ignored = dev.triggers.filter((t) => t.outcomeAfter === "still_applies").length;
      dev.status = ignored === 0 ? "APPLIED" : ignored === dev.triggers.length ? "PROVIDER_IGNORED" : "PARTIAL";
    }

    if (report.status === "EVALUATION_ERROR") {
      unresolved.push({ reason: "erro de avaliação — rota não pode ser considerada limpa", constraintIds: report.results.filter((r) => r.error).map((r) => r.regulationId) });
      outcome = iteration === 0 ? "ERROR" : "UNRESOLVED";
      break;
    }
    if (applies.length === 0) {
      const uncertain = report.status === "POTENTIALLY_AFFECTED" || report.status === "ROUTE_AFFECTED";
      outcome = iteration === 0 ? (uncertain ? "UNCHANGED_UNCERTAIN" : "UNCHANGED") : uncertain ? "CLEANED_UNCERTAIN" : "CLEANED";
      if (uncertain) unresolved.push({ reason: "restrições INCERTAS (factos ou geometria em falta) — não evitadas automaticamente", constraintIds: uncertainRes.map((r) => r.regulationId) });
      break;
    }

    // A constraint we already asked to avoid still applies ⇒ provider ignored the request.
    const repeated = applies.filter((r) => avoiding.has(`avoid-${r.regulationId}`)).map((r) => r.regulationId);
    // Avoid the EARLIEST conflict first (plus co-located ones): a detour changes the ETA of
    // everything downstream, so later conflicts are re-judged on the new route's timing.
    const pending = applies.filter((r) => !avoiding.has(`avoid-${r.regulationId}`));
    const startOf = (r: RegulationResult) => (r.exposure ? Date.parse(r.exposure.fromIso) : Number.NEGATIVE_INFINITY);
    const first = Math.min(...pending.map(startOf));
    const fresh = pending.filter((r) => startOf(r) - first <= CO_LOCATED_MS || !Number.isFinite(first)).map((r) => r.regulationId);
    if (fresh.length === 0) {
      unresolved.push({ reason: "o fornecedor não evitou a restrição pedida", constraintIds: repeated });
      outcome = "UNRESOLVED";
      break;
    }
    const { avoidances, untranslatable } = avoidancesFor(fresh, dataset);
    if (untranslatable.length) unresolved.push({ reason: untranslatable[0]!.reason, constraintIds: untranslatable.map((u) => u.constraintId) });
    if (avoidances.length === 0) {
      outcome = "UNRESOLVED";
      break;
    }
    if (iteration >= maxReroutes) {
      unresolved.push({ reason: `limite de ${maxReroutes} desvios atingido`, constraintIds: applies.map((r) => r.regulationId) });
      outcome = "UNRESOLVED";
      break;
    }
    avoidances.forEach((a) => avoiding.set(a.id, a));
    const all = [...avoiding.values()];
    const described = args.provider.describe(all);
    if (!described.ok) {
      unresolved.push({ reason: described.reason, constraintIds: fresh });
      outcome = "UNRESOLVED";
      break;
    }
    const tr = clock();
    let next: RoutePlanOption;
    try {
      next = await args.provider.route(args.strategy, all);
    } catch (e) {
      timings.externalRoutingMs += clock() - tr;
      span(`routing request ${iteration + 1}`, iteration, clock() - tr, true);
      unresolved.push({ reason: `fornecedor de rotas falhou: ${e instanceof Error ? e.message : String(e)}`, constraintIds: fresh });
      outcome = "UNRESOLVED";
      break;
    }
    timings.externalRoutingMs += clock() - tr;
    span(`routing request ${iteration + 1}`, iteration, clock() - tr, true);
    const tcy = clock();
    if (next.error || next.polyline.length < 2) {
      unresolved.push({ reason: `sem rota alternativa do fornecedor${next.error ? ` (${next.error})` : ""}`, constraintIds: fresh });
      outcome = "UNRESOLVED";
      break;
    }
    if (seen.some((s) => routeGeometryHash(s.polyline) === routeGeometryHash(next.polyline) || routesEquivalent(s.polyline, next.polyline))) {
      unresolved.push({ reason: "o fornecedor devolveu uma rota já avaliada (sem desvio efetivo) — ciclo interrompido", constraintIds: fresh });
      outcome = "UNRESOLVED";
      break;
    }
    const triggers = applies
      .filter((r) => fresh.includes(r.regulationId))
      .map((r) => ({
        ...refOf(r, dataset),
        basis: r.outcome === "APPLIES" ? ("applies" as const) : ("precautionary_unverified_legal_status" as const),
        ...(r.exposure ? { passageBefore: r.exposure } : {}),
        outcomeAfter: "uncertain" as const,
      }));
    deviations.push({
      id: `dev-${hashString(`${args.strategy}|${iteration}|${fresh.join(",")}|${routeGeometryHash(next.polyline)}`)}`,
      strategy: args.strategy,
      iteration,
      triggers,
      before: summarize(route),
      after: summarize(next),
      deltaDistanceM: next.distanceM - route.distanceM,
      deltaDurationSec: next.durationSec - route.durationSec,
      perConstraintImpact: triggers.length === 1 ? "single_trigger" : "unavailable_multiple_triggers",
      method: described.request,
      status: "PARTIAL",
      reason: triggers.map((t) => t.title).join("; "),
    });
    span("cycle check + deviation record", iteration, clock() - tcy);
    routes.push(next);
    route = next;
  }

  const usable = outcome === "UNCHANGED" || outcome === "UNCHANGED_UNCERTAIN" || outcome === "CLEANED" || outcome === "CLEANED_UNCERTAIN";
  const finalOption = usable ? route : null;
  const tst = clock();
  const baselineStored = stored(baselineRoute);
  const finalStored = finalOption && lastReport ? { route: stored(finalOption), report: lastReport } : null;
  span("store routes (simplify + hash)", -1, clock() - tst);
  const wallMs = clock() - t0;
  const topLevel = trace.filter((x) => !x.phase.includes(":")).reduce((s, x) => s + x.ms, 0);
  const impact = finalOption
    ? (() => {
        const durationRatio = baselineRoute.durationSec > 0 ? finalOption.durationSec / baselineRoute.durationSec : 1;
        const distanceRatio = baselineRoute.distanceM > 0 ? finalOption.distanceM / baselineRoute.distanceM : 1;
        const extra = finalOption.durationSec - baselineRoute.durationSec;
        return {
          durationRatio: Math.round(durationRatio * 1000) / 1000,
          distanceRatio: Math.round(distanceRatio * 1000) / 1000,
          materiallyWorse: (durationRatio >= MATERIALLY_WORSE.durationRatio && extra >= MATERIALLY_WORSE.minExtraSec) || distanceRatio >= MATERIALLY_WORSE.distanceRatio,
        };
      })()
    : undefined;
  timings.orchestrationMs = Math.max(0, clock() - t0 - timings.evaluateMs - timings.externalRoutingMs - timings.externalDiscoveryMs - timings.discoveryLocalMs - timings.datasetMs);
  return {
    result: {
      schemaVersion: 1,
      strategy: args.strategy,
      solvedAt: now().toISOString(),
      outcome,
      baseline: { route: baselineStored, report: baselineReport! },
      final: finalStored,
      attempts,
      deviations,
      total: finalOption ? { deltaDistanceM: finalOption.distanceM - baselineRoute.distanceM, deltaDurationSec: finalOption.durationSec - baselineRoute.durationSec } : null,
      unresolved,
      datasetVersion: lastDataset?.version ?? "",
      discoveryRunIds,
      inputsKey: args.inputsKey,
      ingestedConstraintIds: { first: firstIngested ?? [], last: lastDataset ? ingestedIds(lastDataset) : [] },
      timings,
      trace,
      wallMs: Math.round(wallMs * 10) / 10,
      unexplainedMs: Math.round(Math.max(0, wallMs - topLevel) * 10) / 10,
      ...(impact ? { impact } : {}),
    },
    finalOption,
    routes,
  };
}

function emptySummary(): RouteSummary {
  return { optionId: "", fingerprint: "", distanceM: 0, durationSec: 0, roadNumbers: [], provenance: "" };
}
function emptyReport(message: string): ComplianceReport {
  return { status: "EVALUATION_ERROR", datasetId: "", datasetVersion: "", evaluatedAt: new Date().toISOString(), results: [{ regulationId: "solver", regulationVersion: 0, title: "solver", outcome: "UNKNOWN", reasons: [{ kind: "error", text: message }], caveats: [], evidenceIds: [], error: message }] };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Validate a persisted StrategyResult (corrupt ⇒ null, never shown as a clean route). */
export function parseStrategyResult(raw: unknown): StrategyResult | null {
  if (!isObj(raw) || raw.schemaVersion !== 1) return null;
  if (raw.strategy !== "FASTEST" && raw.strategy !== "NO_TOLLS") return null;
  if (typeof raw.outcome !== "string" || !Array.isArray(raw.attempts) || !Array.isArray(raw.deviations)) return null;
  if (!isObj(raw.baseline) || !isObj(raw.baseline.route) || !isObj(raw.baseline.report)) return null;
  if (raw.final !== null && (!isObj(raw.final) || !isObj(raw.final.route) || !Array.isArray((raw.final.route as Record<string, unknown>).polyline))) return null;
  if (typeof raw.inputsKey !== "string" || typeof raw.datasetVersion !== "string") return null;
  return raw as unknown as StrategyResult;
}
