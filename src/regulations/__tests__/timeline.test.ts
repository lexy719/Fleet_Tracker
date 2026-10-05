import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomLeixoesEspinho.json";
import { simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { evaluateCompliance, evaluateRegulation } from "../evaluate";
import { haversineM } from "../geometry";
import { REGULATION_DATASET } from "../repository";
import { buildRouteTiming, DEFAULT_TIMING_MODEL, getPassageWindow, planStops, routeTimingInput, type TimingModel } from "../timeline";
import type { EvaluationInput, FactSet, RegulationResult, RouteStopInput } from "../types";
import { closure, dataset, geometry, period } from "./helpers";

const H = 3600;
const MIN = 60_000;

/* ─── A straight synthetic road, 1 point every ~100 m, constant speed ─── */
function straight(km: number, drivingSec: number, lat0 = 40.0, lng0 = -8.6): { points: [number, number][]; legPointCounts: number[]; legDurationSec: number[] } {
  const n = Math.round(km * 10) + 1;
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) points.push([lat0 - (i / (n - 1)) * (km / 111.2), lng0]);
  return { points, legPointCounts: [n], legDurationSec: [drivingSec] };
}
/** Index of the point reached after `sec` of driving on `straight()` routes. */
const idxAt = (r: ReturnType<typeof straight>, sec: number) => Math.round((sec / r.legDurationSec[0]!) * (r.points.length - 1));

describe("planned stops follow the EU rules as modelled (and agree with simulateDrivingSchedule)", () => {
  it.each([
    [3 * H, 0, []],
    [5 * H, 0, ["break@16200"]],
    [10 * H, 0, ["break@16200", "rest@32400"]],
    [2 * H, 8 * H, ["rest@3600"]],
    [2 * H, 4 * H, ["break@1800"]],
    [20 * H, 0, ["break@16200", "rest@32400", "break@48600", "rest@64800"]],
  ])("%is driving, %is already today", (total, today, expected) => {
    const stops = planStops(total, { drivenTodaySec: today });
    expect(stops.map((s) => `${s.kind}@${s.atDrivingSec}`)).toEqual(expected);
    if (today === 0) {
      // simulateDrivingSchedule assumes a fresh continuous count; from zero both must agree.
      const sim = simulateDrivingSchedule(total, today);
      expect(stops.filter((s) => s.kind === "break").length).toBe(sim.breakCount);
      expect(stops.filter((s) => s.kind === "rest").length).toBe(sim.restCount);
    }
  });
  it("the timeline's arrival equals simulateDrivingSchedule's elapsed time", () => {
    const r = straight(700, 9.5 * H);
    const t = buildRouteTiming(r.points, r.legPointCounts, r.legDurationSec, 0);
    expect(t.arrivalMs / 1000).toBeCloseTo(simulateDrivingSchedule(9.5 * H, 0).totalElapsedSec, 0);
  });
});

describe("local passage window — uncertainty accumulated only up to the point", () => {
  const r = straight(700, 10 * H);
  const T0 = Date.parse("2026-10-06T07:00:00+01:00");
  const t = buildRouteTiming(r.points, r.legPointCounts, r.legDurationSec, T0);
  const win = (sec: number) => getPassageWindow(t, idxAt(r, sec), idxAt(r, sec) + 1);

  it("immediately after departure: ±5 min, no breaks", () => {
    const w = win(60);
    expect((w.expectedFromMs - T0) / MIN).toBeCloseTo(1, 0);
    expect(-w.minShiftMs / MIN).toBeCloseTo(5, 0);
    expect(w.maxShiftMs / MIN).toBeCloseTo(5, 0);
    expect(w.uncertaintySources.join()).toMatch(/nenhuma pausa obrigatória antes deste ponto/);
  });
  it("30 / 45 min in: margin grows with driving so far (≈6.5 / ≈7 min), NOT the whole trip", () => {
    expect(win(30 * 60).maxShiftMs / MIN).toBeCloseTo(6.5, 0);
    expect(win(45 * 60).maxShiftMs / MIN).toBeCloseTo(7.25, 0);
  });
  it("3h in (more than 60 min before the 4h30 limit): no break uncertainty", () => {
    expect(win(3 * H).maxShiftMs / MIN).toBeCloseTo(14, 0);
  });
  it("4h00 in (inside the flexibility window before the break): the break may already have been taken ⇒ +45 min on the late side only", () => {
    const w = win(4 * H);
    expect(w.maxShiftMs / MIN).toBeCloseTo(17 + 45, 0);
    expect(-w.minShiftMs / MIN).toBeCloseTo(17, 0);
    expect(w.uncertaintySources.join()).toMatch(/pode ser feita antes deste ponto/);
  });
  it("exactly at 4h30 driving: break not yet counted in expected, but possible", () => {
    const w = win(4.5 * H);
    expect((w.expectedFromMs - T0) / MIN).toBeCloseTo(270, 0);
    expect(w.maxShiftMs / MIN).toBeGreaterThan(45);
  });
  it("after the first break: expected includes the 45 min", () => {
    const w = win(5 * H);
    expect((w.expectedFromMs - T0) / MIN).toBeCloseTo(300 + 45, 0);
    expect(w.breaksBefore.map((b) => b.kind)).toEqual(["break"]);
    expect(w.maxShiftMs / MIN).toBeCloseTo(20, 0); // no more flexibility until 8h
  });
  it("long 10h journey: point after 9h30 includes break + 11h rest; margin capped at 30 min", () => {
    const w = win(9.5 * H);
    expect((w.expectedFromMs - T0) / MIN).toBeCloseTo(570 + 45 + 660, 0);
    expect(-w.minShiftMs / MIN).toBeCloseTo(30, 0);
    expect(w.breaksBefore.map((b) => b.kind)).toEqual(["break", "rest"]);
  });
  it("driver who already drove 8h today: rest after 1h; point at 1h30 is the next day", () => {
    const t2 = buildRouteTiming(r.points, r.legPointCounts, r.legDurationSec, T0, { ...DEFAULT_TIMING_MODEL, driver: { drivenTodaySec: 8 * H } });
    const w = getPassageWindow(t2, idxAt(r, 1.5 * H), idxAt(r, 1.5 * H) + 1);
    expect((w.expectedFromMs - T0) / MIN).toBeCloseTo(90 + 660, 0);
  });
  it("latest ≥ expected ≥ earliest everywhere (invariant)", () => {
    for (let i = 0; i < t.expectedMs.length; i += 37) {
      expect(t.latestMs[i]!).toBeGreaterThanOrEqual(t.expectedMs[i]!);
      expect(t.expectedMs[i]!).toBeGreaterThanOrEqual(t.earliestMs[i]!);
    }
  });
});

/* ─── VCI regression on the real TomTom route + a long continuation ─── */

const VCI = REGULATION_DATASET.regulations.find((r) => r.id === "pt-dl155a2026-vci-pesados")!;
type FR = { legs: { travelTimeInSeconds: number; points: number[][] }[] };
const ORIG = (fixture as unknown as { original: FR }).original;
const leg1 = ORIG.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
/** Synthetic 6h continuation south (so the WHOLE trip is ~7h, as in the reported case). */
const leg2: [number, number][] = [];
{
  const [a0, b0] = leg1[leg1.length - 1]!;
  for (let i = 1; i <= 2000; i++) leg2.push([a0 - (i / 2000) * 3.9, b0 + (i / 2000) * 0.7]);
}
const LONG = { points: [...leg1, ...leg2], legPointCounts: [leg1.length, leg2.length], legDurationSec: [ORIG.legs[0]!.travelTimeInSeconds, 6 * H] };
const FACTS: FactSet = {
  "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "test" },
  "vehicle.axleCount": { status: "known", value: 5, source: "test" },
  "vehicle.firstAxleHeightM": { status: "known", value: 1.35, source: "test" },
  "vehicle.isGoodsVehicle": { status: "known", value: true, source: "test" },
  "vehicle.ownerCategory": { status: "known", value: "private", source: "test" },
  "authorization.pt-vci-habilitacao": { status: "known", value: false, source: "test" },
  "authorization.pt-imt-aet": { status: "known", value: false, source: "test" },
};
const STOPS: RouteStopInput[] = [
  { id: "s1", type: "pickup", lat: 41.185, lng: -8.696 },
  { id: "s2", type: "delivery", lat: leg2[leg2.length - 1]![0], lng: leg2[leg2.length - 1]![1] },
];

function vciAt(departIso: string, model: TimingModel | undefined, legacyTolMin = 15): RegulationResult {
  const route = routeTimingInput(LONG.points, LONG.legPointCounts, LONG.legDurationSec, Date.parse(departIso), model);
  const input: EvaluationInput = { route, stops: STOPS, facts: FACTS };
  return evaluateRegulation(VCI, REGULATION_DATASET, input, { timeToleranceMin: legacyTolMin, sampleStepMin: 5 });
}

describe("VCI (Tue 2026-10-06 — Mon 5 Oct is a national holiday — weekdays 07:00–21:00) with the local timeline", () => {
  // Nominal VCI passage offset from departure (read from the evaluator's own exposure).
  const probe = vciAt("2026-10-06T03:00:00+01:00", DEFAULT_TIMING_MODEL);
  const offsetMin = (Date.parse(probe.exposure!.fromIso) - Date.parse("2026-10-06T03:00:00+01:00")) / MIN;
  const departFor = (localPassage: string) => new Date(Date.parse(`2026-10-06T${localPassage}:00+01:00`) - offsetMin * MIN).toISOString();

  it("the VCI is reached early in the trip (< 1h)", () => {
    expect(offsetMin).toBeGreaterThan(5);
    expect(offsetMin).toBeLessThan(60);
  });
  it("A. clearly before the window (passage 06:30) ⇒ DOES_NOT_APPLY", () => {
    expect(vciAt(departFor("06:30"), DEFAULT_TIMING_MODEL).outcome).toBe("DOES_NOT_APPLY");
  });
  it("B. near the boundary (passage 06:55) ⇒ UNKNOWN from a LOCAL window of a few minutes, not ±11h", () => {
    const r = vciAt(departFor("06:55"), DEFAULT_TIMING_MODEL);
    expect(r.outcome).toBe("UNKNOWN");
    const w = r.exposure!.window!;
    const widthMin = (Date.parse(w.latestIso) - Date.parse(w.earliestIso)) / MIN;
    expect(widthMin).toBeLessThan(25);
    expect(r.reasons.map((x) => x.text).join()).toMatch(/janela possível 06:4\d–07:0\d .*margem de ETA ±\d min/);
    expect(r.reasons.map((x) => x.text).join()).not.toMatch(/675/);
  });
  it("C. clearly inside (passage 08:30) ⇒ APPLIES", () => {
    expect(vciAt(departFor("08:30"), DEFAULT_TIMING_MODEL).outcome).toBe("APPLIES");
  });
  it("D. clearly after (passage 21:40) ⇒ DOES_NOT_APPLY", () => {
    expect(vciAt(departFor("21:40"), DEFAULT_TIMING_MODEL).outcome).toBe("DOES_NOT_APPLY");
  });
  it("before/after: the old whole-trip tolerance made even 06:30 UNKNOWN on a 7h trip", () => {
    const sched = simulateDrivingSchedule(LONG.legDurationSec.reduce((a, b) => a + b, 0), 0);
    const oldTol = Math.round(15 + (sched.totalElapsedSec - LONG.legDurationSec.reduce((a, b) => a + b, 0)) / 60);
    expect(vciAt(departFor("06:30"), undefined, oldTol).outcome).toBe("UNKNOWN");
    expect(vciAt(departFor("06:30"), DEFAULT_TIMING_MODEL).outcome).toBe("DOES_NOT_APPLY");
  });
  it("departure +5 / +30 min moves the outcome across the boundary as expected", () => {
    expect(vciAt(departFor("06:30"), DEFAULT_TIMING_MODEL).outcome).toBe("DOES_NOT_APPLY");
    expect(vciAt(new Date(Date.parse(departFor("06:30")) + 25 * MIN).toISOString(), DEFAULT_TIMING_MODEL).outcome).toBe("UNKNOWN");
    expect(vciAt(new Date(Date.parse(departFor("06:30")) + 60 * MIN).toISOString(), DEFAULT_TIMING_MODEL).outcome).toBe("APPLIES");
  });
});

/* ─── Synthetic timed restrictions on the straight road ─── */

const R = straight(700, 10 * H);
/** A closure on the ~2 km of road reached after `atSec` of driving. */
function closureAt(id: string, atSec: number, when: Parameters<typeof closure>[2]) {
  const i = idxAt(R, atSec);
  const line = R.points.slice(i, i + 21);
  return { reg: closure(id, `g-${id}`, when), geom: geometry(`g-${id}`, line) };
}
function outcome(departIso: string, cs: ReturnType<typeof closureAt>[], model: TimingModel = DEFAULT_TIMING_MODEL, route = R) {
  const ds = dataset(cs.map((c) => c.reg), cs.map((c) => c.geom));
  const input: EvaluationInput = { route: routeTimingInput(route.points, route.legPointCounts, route.legDurationSec, Date.parse(departIso), model), stops: [], facts: {} };
  return evaluateCompliance(ds, input, { timeToleranceMin: 15, sampleStepMin: 5 });
}
const W = (start: string, end: string) => ({ windows: [{ start, end, evidence: ["test-evidence"] }] });

describe("timed restrictions along the route", () => {
  it("restriction 30 min in, window 08:00–10:00: departure 07:15 (passage 07:45 ±6) ⇒ DOES_NOT_APPLY", () => {
    expect(outcome("2026-10-06T07:15:00+01:00", [closureAt("a", 30 * 60, W("08:00", "10:00"))]).status).toBe("ROUTE_COMPLIANT");
  });
  it("restriction just BEFORE the mandatory break (4h20), window starting 11:40 — passage 11:20 + possible early break ⇒ UNKNOWN, not DOES_NOT_APPLY", () => {
    const r = outcome("2026-10-06T07:00:00+01:00", [closureAt("a", 4 * H + 20 * 60, W("11:40", "14:00"))]);
    expect(r.status).toBe("POTENTIALLY_AFFECTED");
  });
  it("restriction just AFTER the break (4h40 driving ⇒ 12:25 expected), window 12:00–13:00 ⇒ APPLIES (the break is counted)", () => {
    const r = outcome("2026-10-06T07:00:00+01:00", [closureAt("a", 4 * H + 40 * 60, W("12:00", "13:00"))]);
    expect(r.status).toBe("ROUTE_AFFECTED");
  });
  it("pure driving time (legacy, no breaks) says 11:40 ⇒ inside 11:35–11:50; the timeline counts the 45 min break ⇒ 12:25 ⇒ outside", () => {
    const exact: TimingModel = { ...DEFAULT_TIMING_MODEL, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 } };
    const c = closureAt("a", 4 * H + 40 * 60, W("11:35", "11:50"));
    expect(outcome("2026-10-06T07:00:00+01:00", [c], exact).status).toBe("ROUTE_COMPLIANT");
    const legacy = evaluateCompliance(dataset([c.reg], [c.geom]), { route: routeTimingInput(R.points, R.legPointCounts, R.legDurationSec, Date.parse("2026-10-06T07:00:00+01:00")), stops: [], facts: {} }, { timeToleranceMin: 0, sampleStepMin: 5 });
    expect(legacy.status).toBe("ROUTE_AFFECTED");
  });
  it("multiple timed restrictions on the same route are evaluated with their own windows", () => {
    const r = outcome("2026-10-06T07:00:00+01:00", [
      closureAt("early", 30 * 60, W("07:00", "09:00")), // passage 07:30 ⇒ applies
      closureAt("late", 8 * H, W("07:00", "09:00")), // passage ~15:45 ⇒ does not
    ]);
    expect(r.results.find((x) => x.regulationId === "early")!.outcome).toBe("APPLIES");
    expect(r.results.find((x) => x.regulationId === "late")!.outcome).toBe("DOES_NOT_APPLY");
  });
  it("overnight closure 21:00→05:00 crossing midnight: departure 22:30, restriction 2h in (00:30) ⇒ APPLIES", () => {
    const r = outcome("2026-10-06T22:30:00+01:00", [closureAt("n", 2 * H, { activePeriods: [period("2026-10-06T21:00", "2026-10-07T05:00")] })]);
    expect(r.status).toBe("ROUTE_AFFECTED");
  });
  it("midnight: closure only from 00:00 on the 7th, passage 23:55 on the 6th ±~10 min ⇒ UNKNOWN (straddles midnight)", () => {
    const r = outcome("2026-10-06T22:55:00+01:00", [closureAt("m", 1 * H, { activePeriods: [period("2026-10-07T00:00", "2026-10-07T06:00")] })]);
    expect(r.status).toBe("POTENTIALLY_AFFECTED");
  });
  it("multi-day route: restriction reached after the daily rest is evaluated on DAY 2", () => {
    const r20 = straight(1400, 20 * H);
    const i = idxAt(r20, 12 * H);
    const c = { reg: closure("d2", "g-d2", { activePeriods: [period("2026-10-07T06:00", "2026-10-07T12:00")] }), geom: geometry("g-d2", r20.points.slice(i, i + 21)) };
    // 12h driving + 45 min break + 11h rest + ... ⇒ day 2 morning.
    const r = outcome("2026-10-06T07:00:00+01:00", [c], DEFAULT_TIMING_MODEL, r20);
    expect(r.status).toBe("ROUTE_AFFECTED");
    expect(r.results[0]!.exposure!.fromIso.slice(0, 10)).toBe("2026-10-07");
  });
});

describe("boundary semantics stay half-open [start, end)", () => {
  const exact: TimingModel = { ...DEFAULT_TIMING_MODEL, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 }, breakFlexMin: 0 };
  it("passage ending before 07:00 ⇒ not in force; passage at/after 07:00 ⇒ in force; passage from 21:00 ⇒ not", () => {
    // 1h in. Departure 05:58 ⇒ passage ~06:58–06:59.
    expect(outcome("2026-10-06T05:57:00+01:00", [closureAt("b", H, W("07:00", "21:00"))], exact).status).toBe("ROUTE_COMPLIANT");
    expect(outcome("2026-10-06T06:00:00+01:00", [closureAt("b", H, W("07:00", "21:00"))], exact).status).toBe("ROUTE_AFFECTED");
    // 20:03 + 1h ⇒ passage 21:00–21:01 ⇒ end is exclusive ⇒ not in force.
    expect(outcome("2026-10-06T20:03:00+01:00", [closureAt("b", H, W("07:00", "21:00"))], exact).status).toBe("ROUTE_COMPLIANT");
    expect(outcome("2026-10-06T20:00:00+01:00", [closureAt("b", H, W("07:00", "21:00"))], exact).status).toBe("ROUTE_AFFECTED");
  });
});

describe("DST (Europe/Lisbon)", () => {
  // 2026-10-25: 02:00 WEST → 01:00 WET. Departure 00:30 WEST (= 23:30Z), restriction 1h45 in ⇒ 01:15Z = 01:15 WET.
  it("fall-back: absolute time is used; local window 02:00–03:00 is NOT hit (naive local add would say 02:15)", () => {
    const exact: TimingModel = { ...DEFAULT_TIMING_MODEL, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 } };
    const r = outcome("2026-10-24T23:30:00Z", [closureAt("dst", 1.75 * H, W("02:00", "03:00"))], exact);
    expect(r.status).toBe("ROUTE_COMPLIANT");
    const hit = outcome("2026-10-24T23:30:00Z", [closureAt("dst", 1.75 * H, W("01:00", "02:00"))], exact);
    expect(hit.status).toBe("ROUTE_AFFECTED");
  });
  it("spring-forward: 2026-03-29 01:00 WET → 02:00 WEST; departure 00:30 WET, restriction 1h in ⇒ 02:30 WEST", () => {
    const exact: TimingModel = { ...DEFAULT_TIMING_MODEL, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 } };
    expect(outcome("2026-03-29T00:30:00Z", [closureAt("s", H, W("02:15", "03:00"))], exact).status).toBe("ROUTE_AFFECTED");
    expect(outcome("2026-03-29T00:30:00Z", [closureAt("s", H, W("01:15", "01:45"))], exact).status).toBe("ROUTE_COMPLIANT");
  });
});

describe("degenerate inputs never become compliant", () => {
  it("missing departure (NaN) ⇒ evaluation error / not green", () => {
    const c = closureAt("x", H, W("00:00", "23:59"));
    const input: EvaluationInput = { route: routeTimingInput(R.points, R.legPointCounts, R.legDurationSec, Number.NaN, DEFAULT_TIMING_MODEL), stops: [], facts: {} };
    const r = evaluateCompliance(dataset([c.reg], [c.geom]), input);
    expect(r.status).not.toBe("ROUTE_COMPLIANT");
  });
  it("invalid timezone ⇒ EVALUATION_ERROR", () => {
    const c = closureAt("tz", H, { timeZone: "Mars/Olympus", windows: [{ start: "00:00", end: "23:00", evidence: ["test-evidence"] }] });
    const input: EvaluationInput = { route: routeTimingInput(R.points, R.legPointCounts, R.legDurationSec, Date.parse("2026-10-06T07:00:00Z"), DEFAULT_TIMING_MODEL), stops: [], facts: {} };
    expect(evaluateCompliance(dataset([c.reg], [c.geom]), input).status).toBe("EVALUATION_ERROR");
  });
  it("provider duration change moves the passage accordingly", () => {
    const slow = { ...R, legDurationSec: [12 * H] };
    const c = closureAt("p", 3 * H, W("11:00", "12:00")); // geometric position fixed; time depends on duration
    // Normal speed: position reached at 3h ⇒ 10:00 ⇒ not in force. Slower (×1.2): 3h36 ⇒ 10:36+ ⇒ still before 11:00 ±…
    expect(outcome("2026-10-06T07:00:00+01:00", [c]).status).toBe("ROUTE_COMPLIANT");
    const d = Date.parse(outcome("2026-10-06T07:00:00+01:00", [c], DEFAULT_TIMING_MODEL, slow).results[0]!.exposure!.fromIso);
    const n = Date.parse(outcome("2026-10-06T07:00:00+01:00", [c]).results[0]!.exposure!.fromIso);
    expect(d - n).toBeGreaterThan(30 * MIN);
  });
  it("route distance sanity (test helper)", () => {
    expect(haversineM(R.points[0]!, R.points[R.points.length - 1]!) / 1000).toBeCloseTo(700, -1);
  });
});
