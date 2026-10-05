import { describe, expect, it } from "vitest";
import { evaluateCompliance } from "../../regulations/evaluate";
import { estimatePointTimes, haversineM, matchRouteAlongLines } from "../../regulations/geometry";
import { at, closure, dataset, geometry, period, ROAD_A, ROAD_B } from "../../regulations/__tests__/helpers";
import type { ComplianceReport, FactSet, RegulationDataset, RegulationRecord } from "../../regulations/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";
import { parseStrategyResult, solveStrategy } from "../solver";
import { tomtomAvoidRequest } from "../tomtomProvider";
import type { RouteStrategy, RoutingAvoidance, RoutingProvider } from "../types";

/* ─── Synthetic geography (lat 41.0 west→east; ROAD_A on it, ROAD_B 5 km north) ─── */

const ROAD_C: [number, number][] = [[41.09, -8.62], [41.09, -8.6]];

/** Densify to ≤100 m spacing (the evaluator refuses coarse routes near constraints). */
function path(corners: [number, number][]): [number, number][] {
  const out: [number, number][] = [corners[0]!];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!, b = corners[i]!;
    const n = Math.max(1, Math.ceil(haversineM(a, b) / 100));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
const lengthM = (p: [number, number][]) => p.slice(1).reduce((s, q, i) => s + haversineM(p[i]!, q), 0);

const BASE = path([[41.0, -8.7], [41.0, -8.5]]);
const VIA_B = path([[41.0, -8.7], [41.0, -8.64], [41.045, -8.64], [41.045, -8.58], [41.0, -8.58], [41.0, -8.5]]);
const VIA_C = path([[41.0, -8.7], [41.0, -8.64], [41.09, -8.64], [41.09, -8.58], [41.0, -8.58], [41.0, -8.5]]);

const DEPART = at("2026-10-01T12:00:00+01:00");

function route(id: string, pts: [number, number][], kmh = 60): RoutePlanOption {
  const d = lengthM(pts);
  const dur = Math.round((d / 1000 / kmh) * 3600);
  return {
    id, title: id, subtitle: "", polyline: pts, distanceM: Math.round(d), durationSec: dur, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
    tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [dur],
    legPointCounts: [pts.length], roadNumbers: [], departAtIso: DEPART, colorIndex: 0, routing: { role: "primary", params: {} },
  };
}

/** Fake provider: which path it returns depends on the constraints it is asked to avoid. */
function fakeProvider(table: (avoided: Set<string>) => [number, number][] | "error" | null): RoutingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name: "fake",
    calls,
    describe: tomtomAvoidRequest,
    async route(_s: RouteStrategy, avoid: RoutingAvoidance[]) {
      const ids = new Set(avoid.flatMap((a) => a.constraintIds));
      calls.push([...ids].sort());
      const r = table(ids);
      if (r === "error") throw new Error("HTTP 503");
      if (r === null) return { ...route("none", []), error: "No route returned" };
      return route(`r${calls.length}`, r);
    },
  };
}

const ALWAYS = [period("2026-10-01T00:00", "2026-10-03T00:00")];
const A = closure("closure-a", "road-a", { activePeriods: ALWAYS });
const B = closure("closure-b", "road-b", { activePeriods: ALWAYS });
const C = closure("closure-c", "road-c", { activePeriods: ALWAYS });
const GEOMS = [geometry("road-a", ROAD_A), geometry("road-b", ROAD_B), geometry("road-c", ROAD_C)];
const ds = (...regs: RegulationRecord[]) => dataset(regs, GEOMS);

const evaluator = (facts: FactSet = {}) => (o: RoutePlanOption, d: RegulationDataset): ComplianceReport =>
  evaluateCompliance(
    d,
    { route: { points: o.polyline, pointTimesMs: estimatePointTimes(o.polyline, o.legPointCounts, o.legDurationSec, Date.parse(o.departAtIso!)), timesAreEstimates: true }, stops: [], facts },
    { timeToleranceMin: 0, sampleStepMin: 5 },
  );

const solve = (provider: RoutingProvider, d: RegulationDataset, extra: Partial<Parameters<typeof solveStrategy>[0]> = {}) =>
  solveStrategy({ strategy: "FASTEST", provider, evaluate: evaluator(), getDataset: async () => d, inputsKey: "k", ...extra });

const onLine = (pts: [number, number][], line: [number, number][]) => matchRouteAlongLines(pts, [line], { toleranceM: 30, minMatchLengthM: 200, maxHeadingDiffDeg: 30 }).runs.length > 0;

describe("no restriction ⇒ baseline is the final route", () => {
  it("UNCHANGED, zero deltas, one provider request", async () => {
    const p = fakeProvider(() => BASE);
    const { result, finalOption } = await solve(p, ds());
    expect(result.outcome).toBe("UNCHANGED");
    expect(result.deviations).toEqual([]);
    expect(result.total).toEqual({ deltaDistanceM: 0, deltaDurationSec: 0 });
    expect(result.final!.route.fingerprint).toBe(result.baseline.route.fingerprint);
    expect(finalOption!.id).toBe("r1");
    expect(p.calls).toEqual([[]]);
  });
  it("with a supplied baseline, NO provider request at all", async () => {
    const p = fakeProvider(() => BASE);
    await solve(p, ds(), { baseline: route("base", BASE) });
    expect(p.calls).toEqual([]);
  });
});

describe("one restriction ⇒ reroute, re-evaluate, record the deviation", () => {
  it("avoids A via B; final no longer intersects A; baseline kept; totals exact", async () => {
    const p = fakeProvider((av) => (av.has("closure-a") ? VIA_B : BASE));
    const { result, finalOption } = await solve(p, ds(A));
    expect(result.outcome).toBe("CLEANED");
    expect(onLine(result.baseline.route.polyline, ROAD_A)).toBe(true);
    expect(onLine(finalOption!.polyline, ROAD_A)).toBe(false);
    expect(result.final!.report.status).toBe("ROUTE_COMPLIANT");
    expect(result.deviations).toHaveLength(1);
    const d = result.deviations[0]!;
    expect(d.triggers.map((t) => t.constraintId)).toEqual(["closure-a"]);
    expect(d.triggers[0]!.basis).toBe("applies");
    expect(d.triggers[0]!.outcomeAfter).toBe("avoided");
    expect(d.triggers[0]!.passageBefore).toBeDefined();
    expect(d.status).toBe("APPLIED");
    expect(d.perConstraintImpact).toBe("single_trigger");
    const base = route("x", BASE), viaB = route("y", VIA_B);
    expect(result.total).toEqual({ deltaDistanceM: viaB.distanceM - base.distanceM, deltaDurationSec: viaB.durationSec - base.durationSec });
    expect(d.deltaDistanceM).toBe(result.total!.deltaDistanceM);
    expect(d.method.rectangles.length).toBeGreaterThan(0);
  });
});

describe("reroute introduces a NEW restriction ⇒ second step", () => {
  it("A → B (closed) → C; two deviations; step deltas sum to the total", async () => {
    const p = fakeProvider((av) => (av.has("closure-a") && av.has("closure-b") ? VIA_C : av.has("closure-a") ? VIA_B : BASE));
    const { result } = await solve(p, ds(A, B));
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations.map((d) => d.triggers.map((t) => t.constraintId))).toEqual([["closure-a"], ["closure-b"]]);
    expect(p.calls).toEqual([[], ["closure-a"], ["closure-a", "closure-b"]]); // cumulative: A is never re-allowed
    const sum = result.deviations.reduce((s, d) => s + d.deltaDistanceM, 0);
    expect(sum).toBe(result.total!.deltaDistanceM);
  });

  it("two constraints at the SAME place ⇒ avoided in one step, per-constraint impact NOT attributed", async () => {
    const A2 = closure("closure-a2", "road-a", { activePeriods: ALWAYS });
    const p = fakeProvider((av) => (av.has("closure-a") ? VIA_C : BASE));
    const { result } = await solve(p, ds(A, A2));
    expect(result.deviations).toHaveLength(1);
    expect(result.deviations[0]!.triggers.map((t) => t.constraintId).sort()).toEqual(["closure-a", "closure-a2"]);
    expect(result.deviations[0]!.perConstraintImpact).toBe("unavailable_multiple_triggers");
  });

  it("two constraints at DIFFERENT places ⇒ earliest first, one step each (exact per-step attribution)", async () => {
    const both = path([[41.0, -8.7], [41.0, -8.5], [41.045, -8.5], [41.045, -8.7]]); // A first, then B
    const p = fakeProvider((av) => (av.has("closure-a") && av.has("closure-b") ? VIA_C : av.has("closure-a") ? path([[41.0, -8.7], [41.0, -8.64], [41.02, -8.64], [41.02, -8.5], [41.045, -8.5], [41.045, -8.7]]) : both));
    const { result } = await solve(p, ds(A, B));
    expect(result.deviations.map((d) => d.triggers.map((t) => t.constraintId))).toEqual([["closure-a"], ["closure-b"]]);
    expect(result.deviations.every((d) => d.perConstraintImpact === "single_trigger")).toBe(true);
  });
});

describe("timing is recalculated after every reroute", () => {
  // B is only closed from 12:12 local; the baseline would never be there, the detour is.
  const B_LATE = closure("closure-b-late", "road-b", { activePeriods: [period("2026-10-01T12:12", "2026-10-01T13:00")] });
  it("detour becomes affected by a timed restriction because its ETA moved into the window", async () => {
    const p = fakeProvider((av) => (av.has("closure-a") && av.has("closure-b-late") ? VIA_C : av.has("closure-a") ? VIA_B : BASE));
    const slowVia = (o: RoutePlanOption) => o; // keep generated timing
    const { result } = await solve(p, ds(A, B_LATE), { evaluate: (o, d) => evaluator()(slowVia(o), d) });
    const second = result.attempts[1]!;
    expect(second.applies.map((x) => x.constraintId)).toEqual(["closure-b-late"]);
    const passage = second.applies[0]!.exposure!;
    const windowStart = Date.parse("2026-10-01T11:12:00Z"); // 12:12 Lisbon
    expect(Date.parse(passage.toIso)).toBeGreaterThan(windowStart); // detour passage overlaps the window
    const basePassage = result.attempts[0]!.applies[0]!.exposure!;
    expect(Date.parse(basePassage.toIso)).toBeLessThan(windowStart); // baseline timing would have been before it
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations).toHaveLength(2);
  });
  it("control: the same restriction does not apply when the detour passes before the window", async () => {
    const early = closure("closure-b-late", "road-b", { activePeriods: [period("2026-10-01T12:40", "2026-10-01T13:00")] });
    const p = fakeProvider((av) => (av.has("closure-a") ? VIA_B : BASE));
    const { result } = await solve(p, ds(A, early));
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations).toHaveLength(1);
  });
});

describe("vehicle facts", () => {
  const HGV_ONLY = closure("hgv-a", "road-a", { activePeriods: ALWAYS }, {
    appliesTo: { kind: "fact", fact: "vehicle.grossWeightKg", op: "gt", value: 3500, label: "peso bruto > 3500 kg", evidence: ["test-evidence"] },
  });
  it("known 40 t ⇒ applies ⇒ rerouted", async () => {
    const p = fakeProvider((av) => (av.size ? VIA_B : BASE));
    const { result } = await solve(p, ds(HGV_ONLY), { evaluate: evaluator({ "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "t" } }) });
    expect(result.outcome).toBe("CLEANED");
  });
  it("known 3 t ⇒ does not apply ⇒ unchanged", async () => {
    const p = fakeProvider((av) => (av.size ? VIA_B : BASE));
    const { result } = await solve(p, ds(HGV_ONLY), { evaluate: evaluator({ "vehicle.grossWeightKg": { status: "known", value: 3_000, source: "t" } }) });
    expect(result.outcome).toBe("UNCHANGED");
  });
  it("missing weight ⇒ UNCERTAIN, not rerouted, not green, never assumed permissive", async () => {
    const p = fakeProvider((av) => (av.size ? VIA_B : BASE));
    const { result } = await solve(p, ds(HGV_ONLY));
    expect(result.outcome).toBe("UNCHANGED_UNCERTAIN");
    expect(result.final!.report.status).toBe("POTENTIALLY_AFFECTED");
    expect(result.unresolved[0]!.constraintIds).toEqual(["hgv-a"]);
    expect(p.calls).toEqual([[]]);
  });
});

describe("precautionary avoidance (legal status not verified)", () => {
  const INTERP = closure("interp-a", "road-a", { activePeriods: ALWAYS }, { legalStatus: "INTERPRETED" });
  it("geometry+time+vehicle apply but legal status is INTERPRETED ⇒ avoided, labelled precautionary", async () => {
    const p = fakeProvider((av) => (av.has("interp-a") ? VIA_B : BASE));
    const { result } = await solve(p, ds(INTERP));
    expect(result.attempts[0]!.status).toBe("POTENTIALLY_AFFECTED"); // never "affected" by an unverified rule
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations[0]!.triggers[0]).toMatchObject({ constraintId: "interp-a", basis: "precautionary_unverified_legal_status", outcomeAfter: "avoided" });
  });
  it("uncertain because of a MISSING vehicle fact ⇒ not avoided (no guess either way)", async () => {
    const hgvInterp = closure("interp-hgv", "road-a", { activePeriods: ALWAYS }, {
      legalStatus: "INTERPRETED",
      appliesTo: { kind: "fact", fact: "vehicle.grossWeightKg", op: "gt", value: 3500, label: "peso bruto > 3500 kg", evidence: ["test-evidence"] },
    });
    const p = fakeProvider((av) => (av.size ? VIA_B : BASE));
    const { result } = await solve(p, ds(hgvInterp));
    expect(result.outcome).toBe("UNCHANGED_UNCERTAIN");
    expect(p.calls).toEqual([[]]);
  });
});

describe("failures are visible and never green", () => {
  it("provider ignores avoidance and returns the same route ⇒ UNRESOLVED (loop stopped)", async () => {
    const p = fakeProvider(() => BASE);
    const { result, finalOption } = await solve(p, ds(A));
    expect(result.outcome).toBe("UNRESOLVED");
    expect(finalOption).toBeNull();
    expect(result.final).toBeNull();
    expect(result.unresolved[0]!.reason).toMatch(/rota já avaliada/);
    expect(p.calls.length).toBe(2);
  });
  it("provider returns a different route that still uses A ⇒ UNRESOLVED 'não evitou'", async () => {
    const stillA = path([[41.0, -8.7], [41.0, -8.5], [41.02, -8.5]]);
    const p = fakeProvider((av) => (av.size ? stillA : BASE));
    const { result } = await solve(p, ds(A));
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.deviations[0]!.status).toBe("PROVIDER_IGNORED");
    expect(result.unresolved[0]!.reason).toMatch(/não evitou/);
  });
  it("no alternative ⇒ UNRESOLVED", async () => {
    const p = fakeProvider((av) => (av.size ? null : BASE));
    expect((await solve(p, ds(A))).result.outcome).toBe("UNRESOLVED");
  });
  it("provider error on reroute ⇒ UNRESOLVED; on baseline ⇒ ERROR", async () => {
    expect((await solve(fakeProvider((av) => (av.size ? "error" : BASE)), ds(A))).result.outcome).toBe("UNRESOLVED");
    expect((await solve(fakeProvider(() => "error"), ds(A))).result.outcome).toBe("ERROR");
  });
  it("alternative worse than baseline (A → B → C → back through A-like) ⇒ UNRESOLVED, nothing proposed", async () => {
    const p = fakeProvider((av) => (av.has("closure-c") ? BASE : av.has("closure-b") ? VIA_C : av.has("closure-a") ? VIA_B : BASE));
    const { result, finalOption } = await solve(p, ds(A, B, C));
    expect(result.outcome).toBe("UNRESOLVED");
    expect(finalOption).toBeNull();
  });
  it("iteration cap", async () => {
    // Each reroute lands on a new closure.
    const regs = [A, B, C];
    const p = fakeProvider((av) => (av.has("closure-b") ? VIA_C : av.has("closure-a") ? VIA_B : BASE));
    const { result } = await solve(p, ds(...regs), { maxReroutes: 1 });
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.unresolved.map((u) => u.reason).join()).toMatch(/limite de 1 desvios/);
  });
  it("constraint without resolved geometry cannot be avoided ⇒ UNRESOLVED (explicit)", async () => {
    const unresolvedGeom = { ...geometry("road-a", ROAD_A), status: "UNRESOLVED" as const, resolved: undefined, screeningArea: { bbox: { south: 40.99, west: -8.63, north: 41.01, east: -8.59 }, method: "t", evidence: ["test-evidence"] } };
    const d = dataset([A], [unresolvedGeom]);
    const { result } = await solve(fakeProvider(() => BASE), d);
    // Screening-only geometry can only make the route UNCERTAIN — never "affected", never rerouted blindly.
    expect(result.outcome).toBe("UNCHANGED_UNCERTAIN");
  });
  it("avoidances beyond provider limits are refused before any request", () => {
    const far: RoutingAvoidance = { id: "x", kind: "avoid_path", lines: [[[37.0, -8.9], [42.0, -6.5]]], constraintIds: ["x"] };
    expect(tomtomAvoidRequest([far]).ok).toBe(false);
  });
});

describe("dataset re-read every iteration (discovery feeds the pipeline)", () => {
  it("a constraint that appears after discovery on iteration 0 is acted upon", async () => {
    let current = ds();
    const p = fakeProvider((av) => (av.has("closure-a") ? VIA_B : BASE));
    const { result } = await solve(p, current, {
      getDataset: async () => current,
      discover: async (_r, it) => {
        if (it === 0) current = ds(A);
        return { runId: `run-${it}`, localMs: 0, externalMs: 0 };
      },
    });
    expect(result.outcome).toBe("CLEANED");
    expect(result.discoveryRunIds).toEqual(["run-0", "run-1"]);
  });
});

describe("persistence", () => {
  it("result survives a JSON round-trip identically; corrupt results are rejected", async () => {
    const p = fakeProvider((av) => (av.has("closure-a") ? VIA_B : BASE));
    const { result } = await solve(p, ds(A));
    const back = parseStrategyResult(JSON.parse(JSON.stringify(result)));
    expect(back).toEqual(JSON.parse(JSON.stringify(result)));
    expect(back!.total).toEqual(result.total);
    expect(parseStrategyResult({ ...result, schemaVersion: 2 })).toBeNull();
    expect(parseStrategyResult({ ...result, final: { route: {} } })).toBeNull();
    expect(parseStrategyResult("garbage")).toBeNull();
  });
});
