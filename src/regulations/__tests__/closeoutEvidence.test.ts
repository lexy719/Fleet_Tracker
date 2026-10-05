import { describe, expect, it } from "vitest";
import fixture from "../__fixtures__/tomtomLeixoesEspinho.json";
import vmf from "../__fixtures__/routeMatrix/vieira-do-minho__faro__fastest.json";
import { simulateDrivingSchedule } from "../../ops/euDrivingRules";
import { evaluateCompliance, evaluateRegulation } from "../evaluate";
import { REGULATION_DATASET } from "../repository";
import { DEFAULT_TIMING_MODEL, getPassageWindow, routeTimingInput, type TimingModel } from "../timeline";
import type { EvaluationInput, FactSet, RegulationResult, RouteStopInput } from "../types";
import { closure, dataset, geometry } from "./helpers";

/*
 * Phase 3C.5 close-out EVIDENCE. Each test prints its table (vitest stdout) and asserts
 * every row, so the printed evidence cannot drift from what the code does.
 */

const MIN = 60_000;
const H = 3600;
const fmt = (ms: number) =>
  new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const table = (title: string, rows: Record<string, string | number>[]) => {
  console.log(`\n=== ${title} ===`);
  console.table(rows);
};

/* ─── VCI regression on the real TomTom route + a 6h continuation (≈7h trip) ─── */
const VCI = REGULATION_DATASET.regulations.find((r) => r.id === "pt-dl155a2026-vci-pesados")!;
type FR = { legs: { travelTimeInSeconds: number; points: number[][] }[] };
const leg1 = (fixture as unknown as { original: FR }).original.legs.flatMap((l) => l.points.map((p) => [p[0], p[1]] as [number, number]));
const leg2: [number, number][] = [];
{
  const [a0, b0] = leg1[leg1.length - 1]!;
  for (let i = 1; i <= 2000; i++) leg2.push([a0 - (i / 2000) * 3.9, b0 + (i / 2000) * 0.7]);
}
const LONG = { points: [...leg1, ...leg2], legPointCounts: [leg1.length, leg2.length], legDurationSec: [(fixture as unknown as { original: FR }).original.legs[0]!.travelTimeInSeconds, 6 * H] };
const FACTS: FactSet = {
  "vehicle.grossWeightKg": { status: "known", value: 40_000, source: "t" },
  "vehicle.axleCount": { status: "known", value: 5, source: "t" },
  "vehicle.firstAxleHeightM": { status: "known", value: 1.35, source: "t" },
  "vehicle.isGoodsVehicle": { status: "known", value: true, source: "t" },
  "vehicle.ownerCategory": { status: "known", value: "private", source: "t" },
  "authorization.pt-vci-habilitacao": { status: "known", value: false, source: "t" },
  "authorization.pt-imt-aet": { status: "known", value: false, source: "t" },
};
const STOPS: RouteStopInput[] = [
  { id: "s1", type: "pickup", lat: 41.185, lng: -8.696 },
  { id: "s2", type: "delivery", lat: leg2[leg2.length - 1]![0], lng: leg2[leg2.length - 1]![1] },
];
const EXACT: TimingModel = { ...DEFAULT_TIMING_MODEL, margin: { baseMin: 0, perDrivingHourMin: 0, maxMin: 0 }, breakFlexMin: 0, restFlexMin: 0 };
function vci(departMs: number, model: TimingModel): RegulationResult {
  const input: EvaluationInput = { route: routeTimingInput(LONG.points, LONG.legPointCounts, LONG.legDurationSec, departMs, model), stops: STOPS, facts: FACTS };
  return evaluateRegulation(VCI, REGULATION_DATASET, input, { timeToleranceMin: 15, sampleStepMin: 5 });
}
const probe = vci(Date.parse("2026-10-06T03:00:00+01:00"), DEFAULT_TIMING_MODEL);
const OFFSET = Date.parse(probe.exposure!.fromIso) - Date.parse("2026-10-06T03:00:00+01:00");
/** Departure so the expected VCI entry is `hhmm` on Tue 2026-10-06 (Lisbon). */
const departFor = (hhmm: string) => Date.parse(`2026-10-06T${hhmm}:00+01:00`) - OFFSET;
const oldWholeTripTolMin = (() => {
  const total = LONG.legDurationSec.reduce((a, b) => a + b, 0);
  return Math.round(15 + (simulateDrivingSchedule(total, 0).totalElapsedSec - total) / 60);
})();

describe("B. ORIGINAL TIMING BUG — VCI (in force weekdays 07:00–21:00, [start, end))", () => {
  const cases: { label: string; entry: string; model: TimingModel; expected: RegulationResult["outcome"]; why: string }[] = [
    { label: "1 clearly before opening", entry: "06:15", model: DEFAULT_TIMING_MODEL, expected: "DOES_NOT_APPLY", why: "whole window ends before 07:00" },
    { label: "2 approaching opening, no overlap", entry: "06:46", model: DEFAULT_TIMING_MODEL, expected: "DOES_NOT_APPLY", why: "latest possible passage still before 07:00" },
    { label: "3 window overlaps opening", entry: "06:55", model: DEFAULT_TIMING_MODEL, expected: "UNKNOWN", why: "some admissible shifts are in force, others not ⇒ UNKNOWN (POTENTIALLY_AFFECTED)" },
    { label: "4 clearly inside", entry: "08:30", model: DEFAULT_TIMING_MODEL, expected: "APPLIES", why: "every admissible shift is in force" },
    { label: "5 approaching closing, whole window inside", entry: "20:35", model: DEFAULT_TIMING_MODEL, expected: "APPLIES", why: "latest possible passage still before 21:00" },
    { label: "6a exact closing 21:00 (no ETA margin)", entry: "21:00", model: EXACT, expected: "DOES_NOT_APPLY", why: "[07:00, 21:00): 21:00 itself is not in force" },
    { label: "6b entry at 21:00 with real ETA margin", entry: "21:00", model: DEFAULT_TIMING_MODEL, expected: "UNKNOWN", why: "earliest possible passage is before 21:00 ⇒ cannot exclude" },
    { label: "7 clearly after closing", entry: "21:40", model: DEFAULT_TIMING_MODEL, expected: "DOES_NOT_APPLY", why: "earliest possible passage after 21:00" },
  ];

  it("regression table (printed) — every row asserted", () => {
    const rows = cases.map((c) => {
      const r = vci(departFor(c.entry), c.model);
      expect(r.outcome).toBe(c.expected);
      const w = r.exposure!.window!;
      return {
        case: c.label,
        expected: `${fmt(Date.parse(r.exposure!.fromIso))}–${fmt(Date.parse(r.exposure!.toIso))}`,
        window: `${fmt(Date.parse(w.earliestIso))}–${fmt(Date.parse(w.latestIso))}`,
        widthMin: Math.round((Date.parse(w.latestIso) - Date.parse(w.earliestIso)) / MIN),
        restriction: "07:00–21:00 (weekdays)",
        result: r.outcome,
        reason: c.why,
      };
    });
    table(`VCI regression — trip ≈7h (old whole-trip tolerance was ±${oldWholeTripTolMin} min)`, rows);
  });

  it("the old whole-trip tolerance would have made the 06:15 and 06:46 cases UNKNOWN — the bug is gone", () => {
    expect(oldWholeTripTolMin).toBe(60); // 15 min + one 45-min break, applied symmetrically to EVERY point of the trip
    for (const e of ["06:15", "06:46"]) {
      const legacy = evaluateRegulation(
        VCI,
        REGULATION_DATASET,
        { route: routeTimingInput(LONG.points, LONG.legPointCounts, LONG.legDurationSec, departFor(e)), stops: STOPS, facts: FACTS },
        { timeToleranceMin: oldWholeTripTolMin, sampleStepMin: 5 },
      );
      expect(legacy.outcome).toBe("UNKNOWN");
      expect(vci(departFor(e), DEFAULT_TIMING_MODEL).outcome).toBe("DOES_NOT_APPLY");
    }
  });
});

/* ─── Break placement ─── */
function straight(km: number, prefix: [number, number][] = []) {
  const n = Math.round(km * 10) + 1;
  const pts: [number, number][] = [...prefix];
  for (let i = 0; i < n; i++) pts.push([40.0 - (i / (n - 1)) * (km / 111.2), -8.6]);
  return pts;
}
const ROAD = straight(700); // driven in 10 h (70 km/h)
const idxAt = (sec: number) => Math.round((sec / (10 * H)) * (ROAD.length - 1));
const D0 = Date.parse("2026-10-06T07:00:00+01:00");

describe("C. BREAK MODEL — breaks only affect DOWNSTREAM passages", () => {
  const t = routeTimingInput(ROAD, [ROAD.length], [10 * H], D0, DEFAULT_TIMING_MODEL).timing!;
  const row = (label: string, sec: number) => {
    const w = getPassageWindow(t, idxAt(sec), idxAt(sec) + 1);
    return { label, w, r: { case: label, driving: `${(sec / H).toFixed(2)} h`, earliest: fmt(w.earliestMs), expected: fmt(w.expectedFromMs), latest: fmt(w.latestMs), breaksBefore: w.breaksBefore.map((b) => b.kind).join("+") || "none", assumptions: w.uncertaintySources.join(" | ") } };
  };
  it("A/B/C table (printed) with assertions", () => {
    const b = row("B segment BEFORE break (3h00)", 3 * H);
    const c = row("C segment in the flex window before the 4h30 limit (4h10)", 4 * H + 10 * 60);
    const a = row("A segment AFTER the break (5h00)", 5 * H);
    table("Break placement (fresh driver, departure 07:00)", [b.r, c.r, a.r]);
    expect(b.w.breaksBefore).toEqual([]);
    expect(b.w.uncertaintySources.join(" | ")).not.toMatch(/pode ser feita antes/); // 3h00 is outside the 60-min flex
    expect(c.w.uncertaintySources.join(" | ")).toMatch(/pausa de 45 min obrigatória após 4h30 de condução pode ser feita antes deste ponto/);
    expect((b.w.maxShiftMs - b.w.minShiftMs) / MIN).toBeLessThan(30); // no break term
    expect(c.w.breaksBefore).toEqual([]);
    expect((c.w.latestMs - c.w.expectedFromMs) / MIN).toBeGreaterThan(45); // may take the break early ⇒ late side only
    expect((c.w.expectedFromMs - c.w.earliestMs) / MIN).toBeLessThan(25); // early side: margin only
    expect(a.w.breaksBefore.map((x) => x.kind)).toEqual(["break"]);
    expect((a.w.expectedFromMs - D0) / MIN).toBeCloseTo(300 + 45, 0);
  });

  /** Route that reaches the same road after an extra out-and-back loop of `loopKm`. */
  const withLoop = (loopKm: number) => {
    const loop: [number, number][] = [];
    const n = Math.round(loopKm * 5);
    for (let i = 0; i <= n; i++) loop.push([40.0, -8.6 + (i / n) * (loopKm / 2 / 85)]);
    for (let i = n; i >= 0; i--) loop.push([40.0005, -8.6 + (i / n) * (loopKm / 2 / 85)]);
    return [...loop, ...ROAD];
  };
  const X = 4 * H + 20 * 60; // restricted segment reached at 4h20 on the baseline
  const seg = ROAD.slice(idxAt(X), idxAt(X) + 21);
  const evalAt = (pts: [number, number][], drivingSec: number, windowStart: string, windowEnd: string, model: TimingModel) => {
    const ds = dataset([closure("x", "g", { windows: [{ start: windowStart, end: windowEnd, evidence: ["test-evidence"] }] })], [geometry("g", seg)]);
    return evaluateCompliance(ds, { route: routeTimingInput(pts, [pts.length], [drivingSec], D0, model), stops: [], facts: {} }, { timeToleranceMin: 0, sampleStepMin: 5 }).results[0]!;
  };
  // 700 km in 10 h ⇒ 70 km/h; a 30 km loop adds ~26 min of driving before X.
  const DETOUR = withLoop(30);
  const detourSec = 10 * H + (30 / 70) * H;

  it("D/E/F reroute moves the break BEFORE the segment and flips applicability both ways (printed)", () => {
    const baseE = evalAt(ROAD, 10 * H, "11:00", "11:50", EXACT);
    const detE = evalAt(DETOUR, detourSec, "11:00", "11:50", EXACT);
    const baseF = evalAt(ROAD, 10 * H, "12:20", "13:00", EXACT);
    const detF = evalAt(DETOUR, detourSec, "12:20", "13:00", EXACT);
    table("Reroute changes break position (segment X; exact timing to isolate the effect)", [
      { case: "D baseline reaches X", passage: `${fmt(Date.parse(baseE.exposure!.fromIso))}`, note: "4h20 driving — break not yet due" },
      { case: "D detour reaches X", passage: `${fmt(Date.parse(detE.exposure!.fromIso))}`, note: "≈4h46 driving — 45 min break now BEFORE X" },
      { case: "E window 11:00–11:50", passage: "baseline / detour", note: `${baseE.outcome} → ${detE.outcome} (applicable → non-applicable)` },
      { case: "F window 12:20–13:00", passage: "baseline / detour", note: `${baseF.outcome} → ${detF.outcome} (non-applicable → applicable)` },
    ]);
    expect(Date.parse(detE.exposure!.fromIso) - Date.parse(baseE.exposure!.fromIso)).toBeGreaterThan((26 + 45 - 3) * MIN);
    expect([baseE.outcome, detE.outcome]).toEqual(["APPLIES", "DOES_NOT_APPLY"]);
    expect([baseF.outcome, detF.outcome]).toEqual(["DOES_NOT_APPLY", "APPLIES"]);
  });

  it("future breaks never move EARLIER passages: points before the first break are identical with or without later stops", () => {
    const short = routeTimingInput(ROAD.slice(0, idxAt(3 * H) + 1), [idxAt(3 * H) + 1], [3 * H], D0, DEFAULT_TIMING_MODEL).timing!;
    for (let i = 0; i < short.expectedMs.length; i += 50) {
      expect(t.expectedMs[i]).toBeCloseTo(short.expectedMs[i]!, -1);
      expect(t.latestMs[i]).toBeCloseTo(short.latestMs[i]!, -1);
    }
  });
});

/* ─── Long real route: uncertainty grows progressively ─── */
describe("4. LONG REAL ROUTE — Vieira do Minho → Faro (fastest, 638 km)", () => {
  const r = vmf as unknown as { points: [number, number][]; legPointCounts: number[]; legDurationSec: number[] };
  const t = routeTimingInput(r.points, r.legPointCounts, r.legDurationSec, Date.parse("2026-10-06T06:00:00+01:00"), DEFAULT_TIMING_MODEL).timing!;
  it("window width per position (printed): narrow early, grows with driving, breaks only downstream", () => {
    const at = (h: number) => t.drivingSec.findIndex((d) => d >= h * H);
    const rows = [0.25, 0.5, 1, 2, 3, 3.75, 4.25, 5, 6, 7].map((h) => {
      const i = at(h);
      const w = getPassageWindow(t, i, i);
      return { h, i, w };
    }).filter((x) => x.i >= 0);
    table(
      "Passage window along the route (total ≈7h driving)",
      rows.map(({ h, w }) => ({ drivingH: h, expected: fmt(w.expectedFromMs), earliest: fmt(w.earliestMs), latest: fmt(w.latestMs), earlySideMin: Math.round(-w.minShiftMs / MIN), lateSideMin: Math.round(w.maxShiftMs / MIN), breaksBefore: w.breaksBefore.length })),
    );
    const early = rows.find((x) => x.h === 0.5)!.w;
    expect((early.maxShiftMs - early.minShiftMs) / MIN).toBeLessThan(15); // ±6.5 min at 30 min in, on a 7h trip
    for (let k = 1; k < rows.length; k++) expect(-rows[k]!.w.minShiftMs).toBeGreaterThanOrEqual(-rows[k - 1]!.w.minShiftMs - 1);
    expect(rows.filter((x) => x.h < 4.5).every((x) => x.w.breaksBefore.length === 0)).toBe(true);
  });
});
