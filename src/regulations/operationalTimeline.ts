import type { RoutePlanOption } from "../tomtom/planRoutes";
import { buildRouteTiming, DEFAULT_TIMING_MODEL, planStops, type TimingModel } from "./timeline";

/** Provider travelTime is already traffic-aware: never add trafficDelay a second time. */
export function operationalTimeline(route: RoutePlanOption, departMs: number, hoursToday = 0, model?: TimingModel) {
  const timingModel = model ?? { ...DEFAULT_TIMING_MODEL, driver: { drivenTodaySec: hoursToday * 3600, continuousSec: 0 } };
  const drivingSec = route.durationSec;
  // Summary and rounded leg durations may differ. Use the provider total everywhere.
  const legTotal = route.legDurationSec.reduce((sum, sec) => sum + sec, 0);
  const legDurationSec = legTotal > 0 && Number.isFinite(legTotal)
    ? route.legDurationSec.map((sec) => sec * drivingSec / legTotal) : [drivingSec];
  const stops = planStops(drivingSec, timingModel.driver);
  const elapsedAt = (sec: number) => sec + stops.filter((s) => s.atDrivingSec < sec).reduce((sum, s) => sum + s.durationSec, 0);
  const elapsedSec = elapsedAt(drivingSec);
  const arrivalMs = departMs + elapsedSec * 1000;
  let accumulated = 0;
  const stopArrivalMs = [departMs, ...legDurationSec.map((sec) => {
    accumulated += sec;
    return departMs + elapsedAt(accumulated) * 1000;
  })];
  const timing = buildRouteTiming(route.polyline, route.legPointCounts, legDurationSec, departMs, timingModel);
  return {
    version: 1 as const, departMs, drivingSec, elapsedSec, arrivalMs,
    arrivalAtIso: Number.isFinite(arrivalMs) ? new Date(arrivalMs).toISOString() : undefined,
    breakCount: stops.filter((s) => s.kind === "break").length,
    restCount: stops.filter((s) => s.kind === "rest").length,
    drivingDays: 1 + stops.filter((s) => s.kind === "rest").length,
    stops, stopArrivalMs, timing, legDurationSec,
    routeInput: { points: route.polyline, pointTimesMs: timing.expectedMs, timesAreEstimates: true as const, tripWindowMs: [departMs, timing.arrivalLatestMs] as [number, number], timing },
  };
}
