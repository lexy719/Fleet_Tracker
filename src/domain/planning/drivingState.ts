import type { ResourceState, PlanningMovement } from "./types";
import type { DrivingStop } from "../../ops/drivingStops";
import { DAILY_REST_SEC, BREAK_DURATION_SEC } from "../../ops/drivingLimits";
import { operationalTimeline } from "../../regulations/operationalTimeline";

export function advanceDriving(
  s: NonNullable<ResourceState["driving"]>,
  m: PlanningMovement,
) {
  return advanceDrivingByStops(
    s,
    m.route.durationSec,
    operationalTimeline(m.route, m.departMs, 0, m.timingModel).stops,
  );
}

/** Reuse the stops from the canonical movement timeline. */
export function advanceDrivingByStops(
  s: NonNullable<ResourceState["driving"]>,
  drivingSec: number,
  stops: DrivingStop[],
): NonNullable<ResourceState["driving"]> {
  const beforeArrival = stops.filter((x) => x.atDrivingSec < drivingSec);
  const lastRest = beforeArrival.filter((x) => x.kind === "rest").at(-1),
    lastStop = beforeArrival.at(-1);
  return {
    known: s.known,
    weekSec: s.weekSec + drivingSec,
    drivenTodaySec: lastRest
      ? drivingSec - lastRest.atDrivingSec
      : s.drivenTodaySec + drivingSec,
    continuousSec: lastStop
      ? drivingSec - lastStop.atDrivingSec
      : (s.continuousSec ?? 0) + drivingSec,
  };
}

/** Only stationary idle can qualify as rest. Service is active work. Midnight does not reset driving. */
export function idleDriving(
  s: NonNullable<ResourceState["driving"]>,
  gapSec: number,
) {
  return gapSec >= DAILY_REST_SEC
    ? { ...s, drivenTodaySec: 0, continuousSec: 0 }
    : gapSec >= BREAK_DURATION_SEC
      ? { ...s, continuousSec: 0 }
      : s;
}
