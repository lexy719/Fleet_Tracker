import { planStops, type DriverState } from "../ops/drivingStops";
export { planStops, type DriverState } from "../ops/drivingStops";
import { estimatePointTimes } from "./geometry";

/*
 * Route driving timeline — FleetOS PLANNING logic (not tachograph-certified).
 *
 * The provider gives pure driving time. Along the route we place the stops the EU rules
 * (Reg. 561/2006, as modelled in ops/euDrivingRules) make mandatory, at the LATEST legal
 * point (same policy as simulateDrivingSchedule):
 *   - 45 min break after 4h30 continuous driving;
 *   - 11 h daily rest after 9 h daily driving (subsumes a pending break).
 *
 * For every route point:
 *   expected = departure + driving so far + planned stops strictly before this point
 *   earliest = expected − ETA margin (grows with driving time so far, capped)
 *   latest   = expected + ETA margin + the NEXT planned stop if the driver may take it
 *              before reaching this point (within the flexibility window before the limit)
 * Uncertainty is therefore LOCAL: a point 45 min after departure carries 45 min worth of
 * ETA margin, never the breaks/rests of the rest of the journey.
 *
 * Assumptions (disclosed in explanations):
 *  - provider travel times are the driving times (traffic-aware at departure time);
 *  - breaks/rests are taken no LATER than the legal limit, and possibly up to
 *    `breakFlexMin` / `restFlexMin` earlier;
 *  - taking a stop early is not propagated to later stops (second-order effect);
 *  - planned job stops (loading/unloading) are not modelled as time here.
 */

export type TimingModel = {
  version: 1;
  driver: DriverState;
  /** ETA margin at a point = base + perDrivingHour × driving hours so far, capped at max. */
  margin: { baseMin: number; perDrivingHourMin: number; maxMin: number };
  /** A stop may be taken up to this much driving time before its legal limit. */
  breakFlexMin: number;
  restFlexMin: number;
};

export const DEFAULT_TIMING_MODEL: TimingModel = {
  version: 1,
  driver: { drivenTodaySec: 0, continuousSec: 0 },
  margin: { baseMin: 5, perDrivingHourMin: 3, maxMin: 30 },
  breakFlexMin: 60,
  restFlexMin: 60,
};

export type PlannedStop = {
  kind: "break" | "rest";
  /** Driving seconds since departure at which the stop starts. */
  atDrivingSec: number;
  durationSec: number;
  /** Expected wall-clock start (epoch ms). */
  startMs: number;
};

export type RouteTiming = {
  model: TimingModel;
  departMs: number;
  /** Pure driving seconds since departure at each point. */
  drivingSec: number[];
  expectedMs: number[];
  earliestMs: number[];
  latestMs: number[];
  stops: PlannedStop[];
  /** Expected arrival at the last point, and its latest bound. */
  arrivalMs: number;
  arrivalLatestMs: number;
};

export function validTimingModel(m: unknown): m is TimingModel {
  const x = m as TimingModel;
  return (
    !!x &&
    x.version === 1 &&
    !!x.driver &&
    Number.isFinite(x.driver.drivenTodaySec) &&
    x.driver.drivenTodaySec >= 0 &&
    (x.driver.continuousSec === undefined ||
      (Number.isFinite(x.driver.continuousSec) &&
        x.driver.continuousSec >= 0)) &&
    !!x.margin &&
    [
      x.margin.baseMin,
      x.margin.perDrivingHourMin,
      x.margin.maxMin,
      x.breakFlexMin,
      x.restFlexMin,
    ].every((v) => Number.isFinite(v) && v >= 0)
  );
}

/** Mandatory stops along `totalDrivingSec`, placed at the latest legal point. */
const marginSec = (m: TimingModel, drivingSec: number) =>
  Math.min(
    m.margin.maxMin,
    m.margin.baseMin + (m.margin.perDrivingHourMin * drivingSec) / 3600,
  ) * 60;

/** Build the timeline for a route (pure driving times from the provider's leg durations). */
export function buildRouteTiming(
  points: [number, number][],
  legPointCounts: number[],
  legDurationSec: number[],
  departMs: number,
  model: TimingModel = DEFAULT_TIMING_MODEL,
): RouteTiming {
  if (!validTimingModel(model))
    throw new RangeError("Invalid route timing model");
  const pure = estimatePointTimes(
    points,
    legPointCounts,
    legDurationSec,
    departMs,
  );
  const drivingSec = pure.map((t) => (t - departMs) / 1000);
  const total = legDurationSec.reduce((sum, sec) => sum + sec, 0);
  const raw = planStops(total, model.driver);
  let acc = 0;
  const stops: PlannedStop[] = raw.map((s) => {
    const startMs = departMs + (s.atDrivingSec + acc) * 1000;
    acc += s.durationSec;
    return { ...s, startMs };
  });
  const n = drivingSec.length;
  const expectedMs = new Array<number>(n);
  const earliestMs = new Array<number>(n);
  const latestMs = new Array<number>(n);
  let si = 0; // stops strictly before the current point
  let stopSec = 0;
  for (let i = 0; i < n; i++) {
    const d = drivingSec[i]!;
    while (si < stops.length && stops[si]!.atDrivingSec < d) {
      stopSec += stops[si]!.durationSec;
      si++;
    }
    const exp = departMs + (d + stopSec) * 1000;
    const m = marginSec(model, d);
    const next = stops[si];
    const flex = next
      ? (next.kind === "break" ? model.breakFlexMin : model.restFlexMin) * 60
      : 0;
    // The next stop could be taken early — before reaching this point.
    const early = next && next.atDrivingSec - d <= flex ? next.durationSec : 0;
    expectedMs[i] = exp;
    earliestMs[i] = exp - m * 1000;
    latestMs[i] = exp + (m + early) * 1000;
  }
  const arrivalMs =
    departMs +
    (total +
      stops
        .filter((s) => s.atDrivingSec < total)
        .reduce((sum, s) => sum + s.durationSec, 0)) *
      1000;
  return {
    model: structuredClone(model),
    departMs,
    drivingSec,
    expectedMs,
    earliestMs,
    latestMs,
    stops,
    arrivalMs,
    arrivalLatestMs: n
      ? latestMs[n - 1]!
      : arrivalMs + marginSec(model, total) * 1000,
  };
}

/** Value at a fractional point position (linear between points). */
function at(arr: number[], pos: number): number {
  if (!arr.length || !Number.isFinite(pos))
    throw new RangeError("Passage position requires route timing geometry");
  const clamped = Math.max(0, Math.min(arr.length - 1, pos));
  const i = Math.floor(clamped);
  const j = Math.min(arr.length - 1, i + 1);
  const f = clamped - i;
  return arr[i]! + (arr[j]! - arr[i]!) * (j === i ? 0 : f);
}

/** Interpolate driving distance/time first; mandatory stops are discrete, never smeared over a segment. */
export function routeTimingAtPosition(t: RouteTiming, pos: number) {
  const drivingSec = at(t.drivingSec, pos);
  const before = t.stops.filter((s) => s.atDrivingSec < drivingSec);
  const next = t.stops.find((s) => s.atDrivingSec >= drivingSec);
  const flex = next
    ? (next.kind === "break" ? t.model.breakFlexMin : t.model.restFlexMin) * 60
    : 0;
  const early =
    next && next.atDrivingSec - drivingSec <= flex ? next.durationSec : 0;
  const expectedMs =
    t.departMs +
    (drivingSec + before.reduce((sum, s) => sum + s.durationSec, 0)) * 1000;
  const marginMs = marginSec(t.model, drivingSec) * 1000;
  return {
    drivingSec,
    expectedMs,
    earliestMs: expectedMs - marginMs,
    latestMs: expectedMs + marginMs + early * 1000,
  };
}

export type PassageWindow = {
  /** Expected passage over [fromPos, toPos]. */
  expectedFromMs: number;
  expectedToMs: number;
  /** Bounds of possible passage. */
  earliestMs: number;
  latestMs: number;
  /** Shift range applied to the expected interval (≤ 0 and ≥ 0). */
  minShiftMs: number;
  maxShiftMs: number;
  breaksBefore: PlannedStop[];
  uncertaintySources: string[];
};

const hm = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60
    ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`
    : `${m} min`;
};

/** Passage window over a stretch of the route, with the reasons for its width. */
export function getPassageWindow(
  t: RouteTiming,
  fromPos: number,
  toPos: number,
): PassageWindow {
  const first = Math.min(fromPos, toPos),
    last = Math.max(fromPos, toPos);
  const a = routeTimingAtPosition(t, first),
    b = routeTimingAtPosition(t, last);
  const eA = a.expectedMs,
    eB = b.expectedMs;
  const loA = a.earliestMs,
    loB = b.earliestMs;
  const hiA = a.latestMs,
    hiB = b.latestMs;
  const minShiftMs = Math.min(0, loA - eA, loB - eB);
  // An interval can straddle a pause whose early-stop flexibility is larger than
  // either endpoint's uncertainty (notably daily rest followed by a break).
  const interiorStops = t.stops.filter(
    (s) => s.atDrivingSec >= a.drivingSec && s.atDrivingSec <= b.drivingSec,
  );
  const maxShiftMs = Math.max(
    0,
    hiA - eA,
    hiB - eB,
    ...interiorStops.map(
      (s) => (marginSec(t.model, s.atDrivingSec) + s.durationSec) * 1000,
    ),
  );
  const dA = a.drivingSec;
  const before = t.stops.filter((s) => s.atDrivingSec < dA);
  const sources: string[] = [];
  const m = marginSec(t.model, dA);
  sources.push(
    `margem de ETA ±${Math.round(m / 60)} min (${t.model.margin.baseMin} min + ${t.model.margin.perDrivingHourMin} min por hora de condução, máx. ${t.model.margin.maxMin} min) após ${hm(dA)} de condução`,
  );
  if (before.length) {
    const today = t.model.driver.drivenTodaySec;
    sources.push(
      `${before.map((s) => (s.kind === "break" ? "pausa de 45 min" : "descanso diário de 11 h")).join(" + ")} planeada(s) antes deste ponto` +
        (today > 0
          ? ` (o motorista já conduziu ${hm(today)} hoje antes da partida)`
          : ""),
    );
  } else sources.push("nenhuma pausa obrigatória antes deste ponto");
  const next = t.stops.find((s) => s.atDrivingSec >= dA);
  // Late side wider than the ETA margin at the END of the stretch ⇒ the next stop may be taken early.
  const mEnd = marginSec(t.model, b.drivingSec);
  if (next && maxShiftMs > (mEnd + 30) * 1000) {
    sources.push(
      next.kind === "break"
        ? `a pausa de 45 min obrigatória após ${hm(next.atDrivingSec)} de condução pode ser feita antes deste ponto`
        : `o descanso diário obrigatório após ${hm(next.atDrivingSec)} de condução pode ser feito antes deste ponto`,
    );
  }
  return {
    expectedFromMs: eA,
    expectedToMs: eB,
    earliestMs: Math.min(loA, loB),
    latestMs: Math.max(
      hiA,
      hiB,
      ...interiorStops.map(
        (s) =>
          s.startMs +
          (marginSec(t.model, s.atDrivingSec) + s.durationSec) * 1000,
      ),
    ),
    minShiftMs,
    maxShiftMs,
    breaksBefore: before,
    uncertaintySources: sources,
  };
}

/**
 * The ONE way to build a route's evaluation input: expected times include planned stops,
 * and the timeline travels with it. Used live, when persisting and when re-evaluating.
 * `model` undefined ⇒ legacy input (pure driving times, global tolerance) for old records.
 */
export function routeTimingInput(
  points: [number, number][],
  legPointCounts: number[],
  legDurationSec: number[],
  departMs: number,
  model?: TimingModel,
): {
  points: [number, number][];
  pointTimesMs: number[];
  timesAreEstimates: true;
  tripWindowMs: [number, number];
  timing?: RouteTiming;
} {
  // Keep the legacy evaluation boundary: an absent departure becomes an evaluation error,
  // rather than crashing the caller before the evaluator can report UNKNOWN.
  if (!Number.isFinite(departMs))
    return {
      points,
      pointTimesMs: points.map(() => Number.NaN),
      timesAreEstimates: true,
      tripWindowMs: [departMs, departMs],
    };
  try {
    if (!model) {
      const pointTimesMs = estimatePointTimes(
        points,
        legPointCounts,
        legDurationSec,
        departMs,
      );
      const total = legDurationSec.reduce((a, b) => a + b, 0);
      return {
        points,
        pointTimesMs,
        timesAreEstimates: true,
        tripWindowMs: [departMs, departMs + total * 1000],
      };
    }
    const timing = buildRouteTiming(
      points,
      legPointCounts,
      legDurationSec,
      departMs,
      model,
    );
    return {
      points,
      pointTimesMs: timing.expectedMs,
      timesAreEstimates: true,
      tripWindowMs: [departMs, timing.arrivalLatestMs],
      timing,
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      points,
      pointTimesMs: points.map(() => Number.NaN),
      timesAreEstimates: true,
      tripWindowMs: [departMs, Number.NaN],
    };
  }
}
