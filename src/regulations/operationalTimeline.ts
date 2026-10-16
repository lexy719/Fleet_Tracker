import type { RoutePlanOption } from "../tomtom/planRoutes";
import {
  buildRouteTiming,
  DEFAULT_TIMING_MODEL,
  type TimingModel,
} from "./timeline";

/** Provider travelTime is already traffic-aware: never add trafficDelay a second time. */
export function operationalTimeline(
  route: RoutePlanOption,
  departMs: number,
  hoursToday = 0,
  model?: TimingModel,
) {
  const timingModel = model ?? {
    ...DEFAULT_TIMING_MODEL,
    driver: { drivenTodaySec: hoursToday * 3600, continuousSec: 0 },
  };
  const drivingSec = route.durationSec;
  // Summary and rounded leg durations may differ. Use the provider total everywhere.
  if (!Number.isFinite(drivingSec) || drivingSec < 0)
    throw new RangeError("Invalid provider driving duration");
  const legTotal = route.legDurationSec.reduce((sum, sec) => sum + sec, 0);
  const validLegs =
    route.legDurationSec.length === route.legPointCounts.length &&
    route.legDurationSec.every((sec) => Number.isFinite(sec) && sec >= 0) &&
    route.legPointCounts.every((n) => Number.isInteger(n) && n > 0) &&
    route.legPointCounts.reduce((sum, n) => sum + n, 0) ===
      route.polyline.length &&
    legTotal > 0;
  const legDurationSec = validLegs
    ? route.legDurationSec.map((sec) => (sec * drivingSec) / legTotal)
    : [drivingSec];
  const legPointCounts = validLegs
    ? route.legPointCounts
    : route.polyline.length
      ? [route.polyline.length]
      : [];
  const metadataIssues = validLegs ? [] : ["ROUTE_LEG_TIMING_ASSUMED"];
  const timing = buildRouteTiming(
    route.polyline,
    legPointCounts,
    legDurationSec,
    departMs,
    timingModel,
  );
  const stops = timing.stops;
  const elapsedAt = (sec: number) =>
    sec +
    stops
      .filter((s) => s.atDrivingSec < sec)
      .reduce((sum, s) => sum + s.durationSec, 0);
  const elapsedSec = elapsedAt(drivingSec);
  const arrivalMs = departMs + elapsedSec * 1000;
  let accumulated = 0;
  const stopArrivalMs = [
    departMs,
    ...legDurationSec.map((sec) => {
      accumulated += sec;
      return departMs + elapsedAt(accumulated) * 1000;
    }),
  ];
  return {
    version: 1 as const,
    departMs,
    drivingSec,
    elapsedSec,
    arrivalMs,
    arrivalAtIso: Number.isFinite(arrivalMs)
      ? new Date(arrivalMs).toISOString()
      : undefined,
    breakCount: stops.filter((s) => s.kind === "break").length,
    restCount: stops.filter((s) => s.kind === "rest").length,
    drivingDays: 1 + stops.filter((s) => s.kind === "rest").length,
    stops,
    stopArrivalMs,
    timing,
    legDurationSec,
    legPointCounts,
    metadataIssues,
    routeInput: {
      points: route.polyline,
      pointTimesMs: timing.expectedMs,
      timesAreEstimates: true as const,
      tripWindowMs: [departMs, timing.arrivalLatestMs] as [number, number],
      timing,
    },
  };
}
