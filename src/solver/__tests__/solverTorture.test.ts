import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateCompliance } from "../../regulations/evaluate";
import { haversineM } from "../../regulations/geometry";
import { at, closure, dataset, geometry, period, ROAD_A, ROAD_B } from "../../regulations/__tests__/helpers";
import { routeTimingInput } from "../../regulations/timeline";
import type { ComplianceReport, RegulationDataset, RegulationRecord } from "../../regulations/types";
import { getTruckPreset } from "../../tomtom/truckPresets";
import { planStrategyRoute, type RoutePlanOption } from "../../tomtom/planRoutes";
import { solveStrategy } from "../solver";
import { adaptiveRectangles, avoidanceMetrics, tomtomAvoidRequest } from "../tomtomProvider";
import type { RouteStrategy, RoutingAvoidance, RoutingProvider } from "../types";

/* Synthetic geography: lat 41.0 west→east (ROAD_A on it); ROAD_B 5 km north; ROAD_D east of A on 41.0. */
const ROAD_C: [number, number][] = [[41.09, -8.62], [41.09, -8.6]];
const ROAD_D: [number, number][] = [[41.0, -8.56], [41.0, -8.54]];
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
const DEPART = at("2026-10-06T12:00:00+01:00");

function route(id: string, pts: [number, number][], kmh = 60): RoutePlanOption {
  const d = lengthM(pts);
  const dur = Math.round((d / 1000 / kmh) * 3600);
  return {
    id, title: id, subtitle: "", polyline: pts, distanceM: Math.round(d), durationSec: dur, trafficDelaySec: 0, fuelCostEur: 0, tollCostEur: 0,
    tollPricedEur: 0, tollEstimatedEur: 0, tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [dur],
    legPointCounts: [pts.length], roadNumbers: [], departAtIso: DEPART, colorIndex: 0,
  };
}
function fake(table: (av: Set<string>) => RoutePlanOption | "error" | null): RoutingProvider & { calls: string[][] } {
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
      return r;
    },
  };
}
const ALWAYS = [period("2026-10-01T00:00", "2026-10-20T00:00")];
const G = [geometry("road-a", ROAD_A), geometry("road-b", ROAD_B), geometry("road-c", ROAD_C), geometry("road-d", ROAD_D)];
const ds = (...regs: RegulationRecord[]) => dataset(regs, G);
const A = closure("A", "road-a", { activePeriods: ALWAYS });
const B = closure("B", "road-b", { activePeriods: ALWAYS });
/** Timeline-aware evaluator with zero margin (exact timings for torture scenarios). */
const evaluate = (o: RoutePlanOption, d: RegulationDataset): ComplianceReport =>
  evaluateCompliance(
    d,
    { route: routeTimingInput(o.polyline, o.legPointCounts, o.legDurationSec, Date.parse(o.departAtIso!), { version: 1, driver: { drivenTodaySec: 0 }, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 }, breakFlexMin: 0, restFlexMin: 0 }), stops: [], facts: {} },
    { timeToleranceMin: 0, sampleStepMin: 5 },
  );
const solve = (p: RoutingProvider, d: RegulationDataset, base: RoutePlanOption = route("base", BASE), extra: Partial<Parameters<typeof solveStrategy>[0]> = {}) =>
  solveStrategy({ strategy: "FASTEST", provider: p, baseline: base, evaluate, getDataset: async () => d, inputsKey: "k", ...extra });

describe("solver torture", () => {
  it("B. affected → alternative also affected → second alternative clean", async () => {
    const p = fake((av) => (av.has("B") ? route("c", VIA_C) : av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result } = await solve(p, ds(A, B));
    expect(result.outcome).toBe("CLEANED");
    expect(result.attempts.map((a) => a.status)).toEqual(["ROUTE_AFFECTED", "ROUTE_AFFECTED", "ROUTE_COMPLIANT"]);
  });

  it("E. oscillation A → B → A is detected (cycle), never loops", async () => {
    const p = fake((av) => (av.has("B") ? route("base-again", BASE) : av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result, finalOption } = await solve(p, ds(A, B));
    expect(result.outcome).toBe("UNRESOLVED");
    expect(finalOption).toBeNull();
    expect(result.unresolved.map((u) => u.reason).join()).toMatch(/rota já avaliada/);
    expect(p.calls.length).toBe(2);
  });

  it("H. avoidance beyond provider limits (constraints spread over Portugal) ⇒ refused before requesting", async () => {
    const regs: RegulationRecord[] = [];
    const geoms = [];
    for (let i = 0; i < 12; i++) {
      const lat = 37.2 + i * 0.4, lng = -8.8 + (i % 2) * 1.5;
      geoms.push(geometry(`g${i}`, [[lat, lng], [lat, lng + 0.02]]));
      regs.push(closure(`c${i}`, `g${i}`, { activePeriods: ALWAYS }));
    }
    const req = tomtomAvoidRequest(geoms.map((g, i) => ({ id: `a${i}`, kind: "avoid_path" as const, lines: g.resolved!.lines, constraintIds: [`c${i}`] })));
    expect(req.ok).toBe(false);
  });

  it("real curated geometries (VCI ring, IP3 sections) remain expressible as provider avoidance, with bounded false area", async () => {
    const { buildRegulationDataset } = await import("../../regulations/repository");
    const d = buildRegulationDataset(["ip3-duplicacao-cortes-noturnos-2026-09-28"]);
    for (const id of ["pt-vci-porto", "ip3-troco-vila-pouca-tondela-sul", "ip3-troco-canas-sao-miguel-outeiro"]) {
      const g = d.geometries.find((x) => x.id === id)!;
      const req = tomtomAvoidRequest([{ id, kind: "avoid_path", lines: g.resolved!.lines, constraintIds: [id] }]);
      expect(req.ok).toBe(true);
      if (req.ok) expect(avoidanceMetrics(req.request.rectangles, g.resolved!.lines).falseAreaKm2).toBeLessThan(60);
    }
  });

  it("I. twelve nearby closures fit in ≤ 10 rectangles, each closure fully covered, no huge area", () => {
    const lines: [number, number][][] = [];
    for (let i = 0; i < 12; i++) lines.push([[40.0 + i * 0.01, -8.5], [40.0 + i * 0.01, -8.49]]);
    const rects = adaptiveRectangles(lines, 10, 150);
    expect(rects.length).toBeLessThanOrEqual(10);
    for (const l of lines) for (const [la, lo] of l) expect(rects.some((r) => la >= r.south && la <= r.north && lo >= r.west && lo <= r.east)).toBe(true);
    expect(avoidanceMetrics(rects, lines).rectAreaKm2).toBeLessThan(40);
  });

  it("J. the same restriction encountered twice (route loops back over it) ⇒ one trigger, one avoidance", async () => {
    const twice = path([[41.0, -8.7], [41.0, -8.55], [41.001, -8.55], [41.001, -8.7], [41.002, -8.7], [41.002, -8.5]]);
    const p = fake((av) => (av.has("A") ? route("c", VIA_C) : route("t", twice)));
    const { result } = await solve(p, ds(A), route("t", twice));
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations[0]!.triggers.map((t) => t.constraintId)).toEqual(["A"]);
  });

  it("L. route geometry with a loop and duplicate points is evaluated without error", async () => {
    const loop = [...path([[41.0, -8.7], [41.0, -8.66], [41.02, -8.66], [41.02, -8.68], [41.0, -8.68]]), [41.0, -8.68] as [number, number], ...path([[41.0, -8.68], [41.0, -8.5]])];
    const p = fake((av) => (av.has("A") ? route("c", VIA_C) : route("l", loop)));
    const { result } = await solve(p, ds(A), route("l", loop));
    expect(["CLEANED", "UNRESOLVED"]).toContain(result.outcome);
    expect(result.attempts[0]!.status).not.toBe("EVALUATION_ERROR");
  });

  it("M/N. origin or destination inside the restricted stretch: provider cannot avoid ⇒ UNRESOLVED, not green", async () => {
    const startOnA = path([[41.0, -8.615], [41.0, -8.5]]);
    const endOnA = path([[41.0, -8.7], [41.0, -8.605]]);
    for (const r of [startOnA, endOnA]) {
      const p = fake(() => route("same-but-new", r.map(([a, b]) => [a + 0.0000001, b] as [number, number])));
      const { result, finalOption } = await solve(p, ds(A), route("x", r));
      expect(result.outcome).toBe("UNRESOLVED");
      expect(finalOption).toBeNull();
    }
  });

  it("O/P. restriction ending or starting DURING traversal ⇒ applies (every shift overlaps an in-force minute)", async () => {
    // BASE reaches ROAD_A at ~12:06 and leaves at ~12:08.
    const ends = closure("A-ends", "road-a", { activePeriods: [period("2026-10-06T11:00", "2026-10-06T12:07")] });
    const starts = closure("A-starts", "road-a", { activePeriods: [period("2026-10-06T12:07", "2026-10-06T13:00")] });
    for (const c of [ends, starts]) {
      const rep = evaluate(route("base", BASE), ds(c));
      expect(rep.status).toBe("ROUTE_AFFECTED");
    }
  });

  it("a detour can make a downstream TIMED restriction irrelevant (passage moves past its window) ⇒ not avoided", async () => {
    // BASE passes D at ~12:11–12:13; VIA_B (≈10 km longer) at ~12:21. D in force 12:05–12:15.
    const D = closure("D", "road-d", { activePeriods: [period("2026-10-06T12:05", "2026-10-06T12:15")] });
    const p = fake((av) => (av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result } = await solve(p, ds(A, D));
    expect(result.attempts[0]!.applies.map((x) => x.constraintId).sort()).toEqual(["A", "D"]);
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations.map((d) => d.triggers.map((t) => t.constraintId))).toEqual([["A"]]); // D never needed a detour
    expect(p.calls).toEqual([["A"]]);
  });

  it("a FASTER detour moves a downstream passage EARLIER into a timed window ⇒ second deviation", async () => {
    // BASE at 60 km/h passes D at ~12:11; a 150 km/h detour passes D at ~12:07. D in force 12:02–12:09 only.
    const D = closure("D", "road-d", { activePeriods: [period("2026-10-06T12:02", "2026-10-06T12:09")] });
    const VIA_B_D = path([[41.0, -8.7], [41.0, -8.64], [41.045, -8.64], [41.045, -8.58], [41.0, -8.58], [41.0, -8.5]]);
    const AVOID_D = path([[41.0, -8.7], [41.0, -8.64], [41.045, -8.64], [41.045, -8.5]]);
    const p = fake((av) => (av.has("D") ? route("d", AVOID_D, 150) : av.has("A") ? route("b", VIA_B_D, 150) : route("base", BASE)));
    const { result } = await solve(p, ds(A, D));
    expect(result.attempts[0]!.applies.map((x) => x.constraintId)).toEqual(["A"]); // D not in force at baseline passage
    expect(result.attempts[1]!.applies.map((x) => x.constraintId)).toEqual(["D"]); // …but is after the faster detour
    expect(result.outcome).toBe("CLEANED");
    expect(result.deviations).toHaveLength(2);
  });

  it("invalid route geometry (NaN) ⇒ EVALUATION_ERROR ⇒ ERROR outcome, never clean", async () => {
    const bad = route("bad", [[41.0, -8.7], [Number.NaN, -8.6], [41.0, -8.5]]);
    const { result, finalOption } = await solve(fake(() => bad), ds(A), bad);
    expect(result.outcome).toBe("ERROR");
    expect(finalOption).toBeNull();
  });

  it("zero-length / single-point baseline ⇒ ERROR (no route to clean)", async () => {
    const { result } = await solve(fake(() => route("z", [[41, -8.6]])), ds(A), route("z", [[41, -8.6]]));
    expect(result.outcome).toBe("ERROR");
  });

  it("very long route with many constraints terminates within the iteration cap", async () => {
    const regs = [A, B, closure("C", "road-c", { activePeriods: ALWAYS })];
    let n = 0;
    const p = fake(() => route(`r${++n}`, n % 2 ? VIA_B : VIA_C));
    const { result } = await solve(p, ds(...regs), route("base", BASE), { maxReroutes: 3 });
    expect(result.outcome).toBe("UNRESOLVED");
    expect(p.calls.length).toBeLessThanOrEqual(3);
  });
});

describe("TomTom provider chaos (stubbed fetch)", () => {
  const planning = { waypointStops: [{ id: "s2", name: "B" }], truck: { fleetTruckId: "t1", cargoWeightKg: 20_000, preset: getTruckPreset("artic-40") }, departAt: new Date("2026-10-06T05:00:00Z") };
  const wps = [{ lat: 41, lng: -8.62 }, { lat: 41, lng: -8.6 }];
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it.each([
    ["HTTP 500", () => Promise.resolve(new Response("boom", { status: 500 }))],
    ["malformed JSON", () => Promise.resolve(new Response("{not json", { status: 200 }))],
    ["network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["route without geometry", () => Promise.resolve(new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 1, travelTimeInSeconds: 1 }, legs: [{ summary: { travelTimeInSeconds: 1 }, points: [] }] }] }), { status: 200 }))],
    ["empty routes", () => Promise.resolve(new Response(JSON.stringify({ routes: [] }), { status: 200 }))],
  ])("%s ⇒ unusable option, and the solver reports UNRESOLVED/ERROR (never clean)", async (_l, impl) => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(impl));
    let opt: RoutePlanOption;
    try {
      opt = await planStrategyRoute("k", wps, planning, "FASTEST", "x");
    } catch {
      opt = { ...route("err", []), error: "threw" };
    }
    expect(opt.error || opt.polyline.length < 2).toBeTruthy();
    const provider: RoutingProvider = { name: "tt", describe: tomtomAvoidRequest, route: async () => opt };
    const { result } = await solve(provider, ds(A));
    expect(["UNRESOLVED", "ERROR"]).toContain(result.outcome);
  });
  it("route with a NaN coordinate from the provider is refused by the evaluator (ERROR)", async () => {
    vi.stubGlobal("window", globalThis);
    const body = { routes: [{ summary: { lengthInMeters: 2000, travelTimeInSeconds: 120 }, legs: [{ summary: { travelTimeInSeconds: 120 }, points: [{ latitude: 41, longitude: -8.62 }, { latitude: null, longitude: -8.61 }, { latitude: 41, longitude: -8.6 }] }] }] };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))));
    const opt = await planStrategyRoute("k", wps, planning, "FASTEST", "x");
    const { result } = await solve(fake(() => opt), ds(A), opt);
    expect(result.outcome).toBe("ERROR");
  });
});

describe("9. multi-deviation FAILURE CHAINS (could any of these appear green?)", () => {
  const HGV_B = closure("B?", "road-b", { activePeriods: ALWAYS }, { appliesTo: { kind: "fact", fact: "vehicle.grossWeightKg", op: "gt", value: 3500, label: "pesados > 3,5 t", evidence: ["test-evidence"] } });
  const rows: Record<string, unknown>[] = [];
  const record = (chain: string, r: { outcome: string; final: unknown; deviations: unknown[]; unresolved: { reason: string }[] }) =>
    rows.push({ chain, outcome: r.outcome, final: r.final ? "route" : "null", deviations: r.deviations.length, why: r.unresolved.map((u) => u.reason).join(" | ").slice(0, 80) });

  it("A → alt hits B → avoiding A+B returns no route ⇒ UNRESOLVED, nothing proposed", async () => {
    const p = fake((av) => (av.has("B") ? null : av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result, finalOption } = await solve(p, ds(A, B));
    record("A → alt hits B → no route", result);
    expect(result.outcome).toBe("UNRESOLVED");
    expect(finalOption).toBeNull();
    expect(p.calls).toEqual([["A"], ["A", "B"]]); // cumulative avoidance
  });
  it("A → alt hits B → provider error ⇒ never CLEANED", async () => {
    const p = fake((av) => (av.has("B") ? "error" : av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result, finalOption } = await solve(p, ds(A, B));
    record("A → alt hits B → provider 503", result);
    expect(["UNRESOLVED", "ERROR"]).toContain(result.outcome);
    expect(finalOption).toBeNull();
  });
  it("A → alt hits B → A+B not expressible as provider avoidance ⇒ UNRESOLVED with the reason, no request sent", async () => {
    const p = fake((av) => (av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    p.describe = (avoid) => (avoid.length > 1 ? { ok: false, reason: "limite do fornecedor (teste)" } : tomtomAvoidRequest(avoid));
    const { result } = await solve(p, ds(A, B));
    record("A → alt hits B → avoidance refused", result);
    expect(result.outcome).toBe("UNRESOLVED");
    expect(result.unresolved.map((u) => u.reason).join()).toMatch(/limite do fornecedor/);
    expect(p.calls).toEqual([["A"]]);
  });
  it("A → alt only UNKNOWN on B (missing vehicle fact) ⇒ CLEANED_UNCERTAIN, never plain CLEANED", async () => {
    const p = fake((av) => (av.has("A") ? route("b", VIA_B) : route("base", BASE)));
    const { result } = await solve(p, ds(A, HGV_B));
    record("A → alt UNKNOWN on B", result);
    expect(result.outcome).toBe("CLEANED_UNCERTAIN");
    expect(result.final!.report.status).toBe("POTENTIALLY_AFFECTED");
  });
  it("clean but materially worse ⇒ CLEANED with impact.materiallyWorse (shown, not hidden)", async () => {
    const p = fake((av) => (av.has("A") ? route("slow", VIA_C, 25) : route("base", BASE)));
    const { result } = await solve(p, ds(A));
    record("A → much slower clean route", result);
    expect(result.outcome).toBe("CLEANED");
    expect(result.impact!.materiallyWorse).toBe(true);
    expect(result.impact!.durationRatio).toBeGreaterThan(1.15);
  });
  it("A → alt hits B → alt hits A again (A↔B) ⇒ cycle ⇒ UNRESOLVED, terminates", async () => {
    let n = 0;
    const p = fake((av) => (av.size === 0 ? route("base", BASE) : route(`r${++n}`, n % 2 ? VIA_B : BASE.map(([a, b]) => [a, b + 1e-12] as [number, number]))));
    const { result } = await solve(p, ds(A, B));
    record("A ↔ B oscillation", result);
    expect(result.outcome).toBe("UNRESOLVED");
    expect(p.calls.length).toBeLessThanOrEqual(6);
    console.log("\n=== Failure chains ===");
    console.table(rows);
  });
});
