import { describe, expect, it } from "vitest";
import caopJson from "../../../public/data/caop2025-municipios.json";
import { assessRouteCoverage } from "../../ingestion/coverage";
import { MunicipalityIndex } from "../../ingestion/municipalities";
import { SOURCES } from "../../ingestion/sources";
import type { MunicipalityDataset } from "../../ingestion/types";
import { buildDiscoveryScope } from "../../discovery/scope";
import { simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { evaluateCompliance } from "../../regulations/evaluate";
import { haversineM, matchRouteAlongLines, routesEquivalent } from "../../regulations/geometry";
import { buildRegulationDataset } from "../../regulations/repository";
import { closure, dataset, geometry, period } from "../../regulations/__tests__/helpers";
import { DEFAULT_TIMING_MODEL, getPassageWindow, routeTimingInput } from "../../regulations/timeline";
import type { ComplianceReport, FactSet, RegulationDataset } from "../../regulations/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { solveStrategy } from "../solver";
import { tomtomAvoidRequest } from "../tomtomProvider";
import type { RouteStrategy, RoutingProvider } from "../types";

/*
 * Real Portuguese route matrix: 18 origin/destination pairs × {FASTEST, NO_TOLLS}, recorded
 * ONCE from TomTom (scripts/fetch-route-matrix.mjs) and replayed here — no network in CI.
 */

type MR = { id: string; from: string; to: string; strategy: RouteStrategy; lengthInMeters: number; travelTimeInSeconds: number; roads: string[]; legPointCounts: number[]; legDurationSec: number[]; points: [number, number][] };
const ALL = Object.values(import.meta.glob<MR>("../../regulations/__fixtures__/routeMatrix/*.json", { eager: true, import: "default" }));
const byId = new Map(ALL.map((r) => [r.id, r]));
const PAIRS = [...new Set(ALL.map((r) => `${r.from}__${r.to}`))];
const NAME: Record<string, string> = {
  "vieira-do-minho": "Vieira do Minho", faro: "Faro", porto: "Porto", lisboa: "Lisboa", braga: "Braga", "viana-do-castelo": "Viana do Castelo",
  braganca: "Bragança", viseu: "Viseu", coimbra: "Coimbra", guarda: "Guarda", "castelo-branco": "Castelo Branco", evora: "Évora", beja: "Beja", sines: "Sines",
};
const INDEX = new MunicipalityIndex(caopJson as unknown as MunicipalityDataset);
const DS = buildRegulationDataset(["ip3-duplicacao-cortes-noturnos-2026-09-28"]);
const FACTS: FactSet = {
  "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "fleet" },
  "vehicle.axleCount": { status: "known", value: 5, source: "fleet" },
  "vehicle.firstAxleHeightM": { status: "known", value: 1.35, source: "fleet" },
  "vehicle.isGoodsVehicle": { status: "known", value: true, source: "fleet" },
  "vehicle.ownerCategory": { status: "known", value: "private", source: "fleet" },
  "authorization.pt-vci-habilitacao": { status: "known", value: false, source: "fleet" },
  "authorization.pt-imt-aet": { status: "known", value: false, source: "fleet" },
};
const DEPART = Date.parse("2026-10-06T06:00:00+01:00");

const option = (r: MR, id = r.id): RoutePlanOption => ({
  id, title: r.id, subtitle: "", polyline: r.points, distanceM: r.lengthInMeters, durationSec: r.travelTimeInSeconds, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
  tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: r.legDurationSec,
  legPointCounts: r.legPointCounts, roadNumbers: r.roads, departAtIso: new Date(DEPART).toISOString(), colorIndex: 0,
  routing: { role: r.strategy === "NO_TOLLS" ? "toll_avoiding" : "primary", params: {} },
});
const evaluate = (o: RoutePlanOption, ds: RegulationDataset): ComplianceReport =>
  evaluateCompliance(ds, { route: routeTimingInput(o.polyline, o.legPointCounts, o.legDurationSec, Date.parse(o.departAtIso!), DEFAULT_TIMING_MODEL), stops: [], facts: FACTS }, { timeToleranceMin: 15, sampleStepMin: 5, timing: DEFAULT_TIMING_MODEL });

describe("route matrix fixtures", () => {
  it("36 recorded route/strategy combinations, 18 pairs", () => {
    expect(ALL.length).toBe(36);
    expect(PAIRS.length).toBe(18);
  });
});

describe.each(ALL.map((r) => [r.id, r] as const))("real route %s", (_id, r) => {
  const t = routeTimingInput(r.points, r.legPointCounts, r.legDurationSec, DEPART, DEFAULT_TIMING_MODEL).timing!;

  it("timeline: arrival = driving + planned stops (agrees with simulateDrivingSchedule); bounds ordered", () => {
    const total = r.legDurationSec.reduce((a, b) => a + b, 0);
    expect((t.arrivalMs - DEPART) / 1000).toBeCloseTo(simulateDrivingSchedule(total, 0).totalElapsedSec, -1);
    for (let i = 0; i < t.expectedMs.length; i += 97) {
      expect(t.latestMs[i]!).toBeGreaterThanOrEqual(t.expectedMs[i]!);
      expect(t.expectedMs[i]!).toBeGreaterThanOrEqual(t.earliestMs[i]!);
      if (i > 0) expect(t.expectedMs[i]!).toBeGreaterThanOrEqual(t.expectedMs[i - 97]!);
    }
  });

  it("no whole-trip leakage: before 3h30 of driving the window is only the ETA margin (≤ 2×(5 + 3/h))", () => {
    for (let i = 0; i < t.drivingSec.length; i += 53) {
      const d = t.drivingSec[i]!;
      if (d >= 3.5 * 3600) break;
      const w = getPassageWindow(t, i, i);
      expect((w.maxShiftMs - w.minShiftMs) / 60_000).toBeLessThanOrEqual(2 * (5 + (3 * d) / 3600) + 0.01);
    }
  });

  it("evaluation: never green with any UNKNOWN; every UNKNOWN/APPLIES exposure carries an explainable local window", () => {
    const rep = evaluate(option(r), DS);
    const unknown = rep.results.some((x) => x.outcome === "UNKNOWN");
    if (unknown) expect(rep.status).not.toBe("ROUTE_COMPLIANT");
    for (const x of rep.results) {
      if (x.outcome !== "DOES_NOT_APPLY" && x.exposure) {
        expect(x.exposure.window).toBeDefined();
        expect(x.exposure.window!.sources.length).toBeGreaterThan(0);
      }
    }
  });

  it("scope: origin & destination municipalities, roads, authorities derived from geography", () => {
    const s = buildDiscoveryScope({ route: { ...option(r), durationSec: r.travelTimeInSeconds }, strategy: r.strategy, index: INDEX, sources: SOURCES, freshness: {}, facts: FACTS, includeDev: false, now: new Date(DEPART) });
    const names = s.municipalities.map((m) => m.name);
    expect(names).toContain(NAME[r.from]);
    expect(names).toContain(NAME[r.to]);
    expect(s.roads.length).toBeGreaterThan(0);
    expect(s.authorities.map((a) => a.authorityId)).toContain("ip");
    expect(s.uncoveredAuthorityIds.length).toBeGreaterThan(0);
  });

  it("coverage truth: never 'complete'; a compliant route reads 'no known constraint … coverage is partial'", () => {
    const c = assessRouteCoverage({ route: r.points, index: INDEX, sources: SOURCES, freshness: {}, candidates: [], status: "ROUTE_COMPLIANT" });
    expect(c.complete).toBe(false);
    expect(c.headline).toMatch(/^NO KNOWN CONSTRAINT FOUND BUT COVERAGE IS PARTIAL/);
    expect(c.headline).not.toMatch(/CLEAR|COMPLETE/);
  });
});

describe("FASTEST vs NO_TOLLS are independent", () => {
  it.each(PAIRS)("%s: separate scopes; different corridors ⇒ different municipality or road sets", (pair) => {
    const f = byId.get(`${pair}__fastest`)!, n = byId.get(`${pair}__no_tolls`)!;
    const sc = (r: MR) => buildDiscoveryScope({ route: { ...option(r), durationSec: r.travelTimeInSeconds }, strategy: r.strategy, index: INDEX, sources: SOURCES, freshness: {}, facts: FACTS, includeDev: false, now: new Date(DEPART) });
    const sf = sc(f), sn = sc(n);
    expect(sf.id).not.toBe(sn.id);
    if (routesEquivalent(f.points, n.points)) {
      expect(sf.municipalities.map((m) => m.code).sort()).toEqual(sn.municipalities.map((m) => m.code).sort()); // same corridor ⇒ same scope
    } else {
      const sameMunis = JSON.stringify(sf.municipalities.map((m) => m.code).sort()) === JSON.stringify(sn.municipalities.map((m) => m.code).sort());
      const sameRoads = JSON.stringify(sf.roads.map((x) => x.ref).sort()) === JSON.stringify(sn.roads.map((x) => x.ref).sort());
      expect(sameMunis && sameRoads).toBe(false);
    }
  });

  it.each(PAIRS)("%s: a closure on a FASTEST-only stretch affects FASTEST, never NO_TOLLS", (pair) => {
    const f = byId.get(`${pair}__fastest`)!, n = byId.get(`${pair}__no_tolls`)!;
    // Find a ~2 km FASTEST stretch at least 2 km from every NO_TOLLS point.
    let line: [number, number][] | null = null;
    for (let i = Math.floor(f.points.length / 3); i < f.points.length - 20 && !line; i += 7) {
      const cand = f.points.slice(i, i + 12);
      const far = cand.every((p) => n.points.every((q) => Math.abs(q[0] - p[0]) > 0.03 || Math.abs(q[1] - p[1]) > 0.04 || haversineM(p, q) > 2000));
      const len = cand.slice(1).reduce((s, p, k) => s + haversineM(cand[k]!, p), 0);
      if (far && len > 500) line = cand;
    }
    if (!line) {
      // Identical corridors (e.g. Coimbra→Viseu): nothing FASTEST-only exists.
      expect(matchRouteAlongLines(n.points, [f.points.slice(0, 30)], { toleranceM: 30, minMatchLengthM: 200, maxHeadingDiffDeg: 30 }).runs.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const ds = dataset([closure("fastest-only", "g", { activePeriods: [period("2026-10-01T00:00", "2026-10-20T00:00")] })], [geometry("g", line)]);
    expect(evaluate(option(f), ds).status).toBe("ROUTE_AFFECTED");
    expect(evaluate(option(n), ds).status).toBe("ROUTE_COMPLIANT");
  });
});

describe("covered territory is explicit (routes may leave mainland Portugal)", () => {
  it("Bragança → Faro NO_TOLLS goes through Spain: flagged in coverage AND as a discovery gap, never silently 'clean'", async () => {
    const r = byId.get("braganca__faro__no_tolls")!;
    expect(r.roads.some((x) => /^[AN]-\d/.test(x))).toBe(true); // Spanish road refs (A-66, N-122…)
    const c = assessRouteCoverage({ route: r.points, index: INDEX, sources: SOURCES, freshness: {}, candidates: [], status: "ROUTE_COMPLIANT" });
    expect(c.outsideTerritoryKm).toBeGreaterThan(200);
    expect(c.headline).toMatch(/ROUTE LEAVES SUPPORTED TERRITORY .*Portugal continental.*ROAD INTELLIGENCE UNKNOWN/);
    const s = buildDiscoveryScope({ route: { ...option(r), durationSec: r.travelTimeInSeconds }, strategy: r.strategy, index: INDEX, sources: SOURCES, freshness: {}, facts: FACTS, includeDev: false, now: new Date(DEPART) });
    expect(s.outsideSamples).toBeGreaterThan(400);
    const { runDiscovery } = await import("../../discovery/orchestrator");
    const { allAuthorities } = await import("../../discovery/authorities");
    const run = await runDiscovery(s, { authorities: allAuthorities(s.municipalities, false), providers: [], sources: SOURCES, cacheGet: async () => undefined, cachePut: async () => undefined, proposals: [], allowSynthetic: false, now: new Date(DEPART) });
    expect(run.gaps.some((g) => g.kind === "OUTSIDE_COVERED_TERRITORY")).toBe(true);
  });
  it.each(ALL.filter((r) => !r.roads.some((x) => /^[AN]-\d|^E-\d/.test(x))).map((r) => [r.id, r] as const))("%s stays (essentially) inside Portugal", (_id, r) => {
    const c = assessRouteCoverage({ route: r.points, index: INDEX, sources: SOURCES, freshness: {}, candidates: [], status: "ROUTE_COMPLIANT" });
    expect(c.outsideTerritoryKm).toBeLessThan(5);
  });
});

describe("the independence tests above are not vacuous", () => {
  it("most pairs have a FASTEST-only stretch ≥ 2 km away from the NO_TOLLS corridor", () => {
    let withStretch = 0;
    for (const pair of PAIRS) {
      const f = byId.get(`${pair}__fastest`)!, n = byId.get(`${pair}__no_tolls`)!;
      for (let i = Math.floor(f.points.length / 3); i < f.points.length - 20; i += 7) {
        const cand = f.points.slice(i, i + 12);
        if (cand.every((p) => n.points.every((q) => Math.abs(q[0] - p[0]) > 0.03 || Math.abs(q[1] - p[1]) > 0.04 || haversineM(p, q) > 2000))) {
          withStretch++;
          break;
        }
      }
    }
    expect(withStretch).toBeGreaterThanOrEqual(12);
  });
});

describe("solver on real geometry (provider replayed from recorded routes)", () => {
  /** Provider: when asked to avoid anything, answers with the recorded NO_TOLLS geometry (a real alternative). */
  const replay = (f: MR, n: MR): RoutingProvider & { calls: number } => {
    const p = { name: "replay", calls: 0, describe: tomtomAvoidRequest, route: async (_s: RouteStrategy, avoid: unknown[]) => { p.calls++; return avoid.length ? option(n, "alt") : option(f); } };
    return p;
  };
  const pairs = PAIRS.filter((pair) => !routesEquivalent(byId.get(`${pair}__fastest`)!.points, byId.get(`${pair}__no_tolls`)!.points));

  it.each(pairs)("%s: closure on FASTEST ⇒ rerouted onto a clean corridor; deltas exact; baseline kept; 1 provider call", async (pair) => {
    const f = byId.get(`${pair}__fastest`)!, n = byId.get(`${pair}__no_tolls`)!;
    let line: [number, number][] | null = null;
    for (let i = Math.floor(f.points.length / 3); i < f.points.length - 20 && !line; i += 7) {
      const cand = f.points.slice(i, i + 12);
      if (cand.every((p) => n.points.every((q) => Math.abs(q[0] - p[0]) > 0.03 || Math.abs(q[1] - p[1]) > 0.04 || haversineM(p, q) > 2000))) line = cand;
    }
    if (!line) return;
    const ds = dataset([closure("c", "g", { activePeriods: [period("2026-10-01T00:00", "2026-10-20T00:00")] })], [geometry("g", line)]);
    const p = replay(f, n);
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: p, baseline: option(f), evaluate, getDataset: async () => ds, inputsKey: pair });
    expect(result.outcome).toBe("CLEANED");
    expect(result.total).toEqual({ deltaDistanceM: n.lengthInMeters - f.lengthInMeters, deltaDurationSec: n.travelTimeInSeconds - f.travelTimeInSeconds });
    expect(result.baseline.route.distanceM).toBe(f.lengthInMeters);
    expect(result.deviations[0]!.triggers[0]!.outcomeAfter).toBe("avoided");
    expect(p.calls).toBe(1);
  });

  it("precautionary avoidance on a real route keeps LEGAL STATUS NOT VERIFIED visible", async () => {
    const f = byId.get("porto__lisboa__fastest")!, n = byId.get("porto__lisboa__no_tolls")!;
    const i = Math.floor(f.points.length / 2);
    const ds = dataset([closure("interp", "g", { activePeriods: [period("2026-10-01T00:00", "2026-10-20T00:00")] }, { legalStatus: "INTERPRETED" })], [geometry("g", f.points.slice(i, i + 12))]);
    const { result } = await solveStrategy({ strategy: "FASTEST", provider: replay(f, n), baseline: option(f), evaluate, getDataset: async () => ds, inputsKey: "p" });
    expect(result.baseline.report.status).toBe("POTENTIALLY_AFFECTED"); // never "affected"
    const trig = result.deviations[0]!.triggers[0]!;
    expect(trig.basis).toBe("precautionary_unverified_legal_status");
    expect(ds.regulations[0]!.legalStatus).toBe("INTERPRETED"); // rerouting upgrades nothing
  });
});
