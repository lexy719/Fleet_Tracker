import { BREAK_DURATION_SEC, DAILY_REST_SEC, MAX_CONTINUOUS_SEC, MAX_DAILY_SEC } from "./drivingLimits";
export type DriverState = {
  /** Driving already done today before departure. */
  drivenTodaySec: number;
  /**
   * Continuous driving since the last qualifying break. Unknown ⇒ the driver is assumed to
   * have taken each break due today at the latest legal moment (so it is ≤ 4h30 and
   * consistent with `drivenTodaySec`).
   */
  continuousSec?: number;
};


export type DrivingStop = { kind: "break" | "rest"; atDrivingSec: number; durationSec: number };
export function planStops(totalDrivingSec: number, driver: DriverState): DrivingStop[] {
  if (!Number.isFinite(totalDrivingSec) || totalDrivingSec < 0 ||
      !Number.isFinite(driver.drivenTodaySec) || driver.drivenTodaySec < 0 ||
      (driver.continuousSec !== undefined && (!Number.isFinite(driver.continuousSec) || driver.continuousSec < 0))) {
    throw new RangeError("Invalid driving duration or driver baseline");
  }
  const stops: DrivingStop[] = [];
  let driven = 0;
  let today = Math.max(0, driver.drivenTodaySec);
  let continuous =
    driver.continuousSec !== undefined
      ? Math.min(MAX_CONTINUOUS_SEC, Math.max(0, driver.continuousSec))
      : today % MAX_CONTINUOUS_SEC === 0 && today > 0
        ? MAX_CONTINUOUS_SEC
        : today % MAX_CONTINUOUS_SEC;
  // Guard against pathological inputs (e.g. already over the daily limit).
  for (let guard = 0; driven < totalDrivingSec; guard++) {
    if (guard >= 1000) throw new RangeError("Driving horizon exceeds supported stop schedule");
    const tillBreak = MAX_CONTINUOUS_SEC - continuous;
    const tillRest = MAX_DAILY_SEC - today;
    if (tillRest <= 0) {
      stops.push({ kind: "rest", atDrivingSec: driven, durationSec: DAILY_REST_SEC });
      today = 0;
      continuous = 0;
      continue;
    }
    if (tillBreak <= 0) {
      stops.push({ kind: "break", atDrivingSec: driven, durationSec: BREAK_DURATION_SEC });
      continuous = 0;
      continue;
    }
    const step = Math.min(totalDrivingSec - driven, tillBreak, tillRest);
    driven += step;
    continuous += step;
    today += step;
    if (driven >= totalDrivingSec) break;
    if (today >= MAX_DAILY_SEC) {
      stops.push({ kind: "rest", atDrivingSec: driven, durationSec: DAILY_REST_SEC });
      today = 0;
      continuous = 0;
    } else if (continuous >= MAX_CONTINUOUS_SEC) {
      stops.push({ kind: "break", atDrivingSec: driven, durationSec: BREAK_DURATION_SEC });
      continuous = 0;
    }
  }
  return stops;
}

