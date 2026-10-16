import type { RouteTiming } from "../../regulations/timeline";
import { routeTimingAtPosition, planStops } from "../../regulations/timeline";
import { haversineM } from "../../regulations/geometry";
import { type Feasibility, type OperationalValue } from "./values";

export type OperationalStopCandidate = {
  id: string;
  routePosition: number;
  detourOutSec: number;
  detourReturnSec: number;
  detourM: number;
  detourOutM: number;
  /** Active service excludes the qualifying break/rest, scheduled separately below. */
  serviceSec: number;
  compatible: Feasibility;
  costEur?: number;
};
export type StopPlanningInput = {
  timing: RouteTiming;
  progress: OperationalValue<number>;
  driverKnown: boolean;
  routePoints: [number, number][];
  rangeM: OperationalValue<number>;
  routeDistanceM: number;
  deliveryClosingMs?: number;
  candidates: OperationalStopCandidate[];
};
export type StopExplanation = { code: string; value?: number };
export type ExplainedStop = {
  id: string;
  eligibility: Feasibility;
  reasons: StopExplanation[];
  arrivalMs: number | null;
  legalMarginSec: number | null;
  deliveryMarginSec: number | null;
  detourM: number;
};

/** A transparent ranking of inputs; this does not invent stations, detour routes, fuel or positions. */
export function planOperationalStops(input: StopPlanningInput): {
  recommendedId: string | null;
  candidates: ExplainedStop[];
} {
  const n = input.timing.drivingSec.length;
  const progress =
    input.progress.status === "KNOWN" ? input.progress.value : null;
  const progressValid =
    progress !== null &&
    Number.isFinite(progress) &&
    progress >= 0 &&
    progress <= n - 1;
  const geometryValid =
    input.routePoints.length === n &&
    input.routePoints.every(
      ([lat, lng]) =>
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180,
    );
  const distanceAt: number[] = [0];
  if (geometryValid)
    for (let i = 1; i < n; i++)
      distanceAt.push(
        distanceAt[i - 1] +
          haversineM(input.routePoints[i - 1], input.routePoints[i]),
      );
  const distance = (pos: number) => {
    const i = Math.floor(pos),
      next = Math.min(n - 1, i + 1);
    return distanceAt[i] + (distanceAt[next] - distanceAt[i]) * (pos - i);
  };
  const explained = input.candidates.map((candidate) => {
    const reasons: StopExplanation[] = [];
    let fail = false,
      uncertain = false;
    const mark = (
      code: string,
      severity: "FAIL" | "UNKNOWN" | "INFO",
      value?: number,
    ) => {
      reasons.push({ code, ...(value === undefined ? {} : { value }) });
      fail ||= severity === "FAIL";
      uncertain ||= severity === "UNKNOWN";
    };
    const valid =
      [
        candidate.routePosition,
        candidate.detourOutSec,
        candidate.detourReturnSec,
        candidate.detourM,
        candidate.detourOutM,
        candidate.serviceSec,
      ].every((v) => Number.isFinite(v) && v >= 0) &&
      candidate.routePosition <= n - 1 &&
      candidate.detourOutM <= candidate.detourM;
    if (!valid || n < 2 || !geometryValid)
      return {
        id: candidate.id,
        eligibility: "UNKNOWN" as const,
        reasons: [{ code: "CANDIDATE_OR_GEOMETRY_INVALID" }],
        arrivalMs: null,
        legalMarginSec: null,
        deliveryMarginSec: null,
        detourM: candidate.detourM,
      };
    if (!progressValid) mark("ROUTE_PROGRESS_UNKNOWN", "UNKNOWN");
    if (!input.driverKnown) mark("DRIVING_BASELINE_UNKNOWN", "UNKNOWN");
    if (candidate.compatible === "FAIL") mark("VEHICLE_INCOMPATIBLE", "FAIL");
    else if (candidate.compatible === "UNKNOWN")
      mark("VEHICLE_COMPATIBILITY_UNKNOWN", "UNKNOWN");
    else mark("VEHICLE_COMPATIBLE", "INFO");
    const at = routeTimingAtPosition(input.timing, candidate.routePosition);
    const current = progressValid
      ? routeTimingAtPosition(input.timing, progress!).drivingSec
      : null;
    if (current !== null && candidate.routePosition < progress!)
      mark("STOP_ALREADY_PASSED", "FAIL");
    const nextPause =
      current === null
        ? undefined
        : planStops(
            Math.max(
              input.timing.drivingSec.at(-1)!,
              at.drivingSec + candidate.detourOutSec,
              current + 9 * 3600,
            ) + 1,
            input.timing.model.driver,
          ).find((s) => s.atDrivingSec >= current);
    const legalMarginSec = nextPause
      ? nextPause.atDrivingSec - at.drivingSec - candidate.detourOutSec
      : null;
    if (legalMarginSec !== null)
      mark(
        legalMarginSec >= 0
          ? "REACHABLE_BEFORE_LEGAL_STOP"
          : "LEGAL_STOP_LIMIT_MISSED",
        legalMarginSec >= 0 ? "INFO" : "FAIL",
        legalMarginSec,
      );
    // Replace the NEXT mandatory pause at this candidate and reschedule the rest
    // of the journey. A detour/early break can add later pauses; subtracting a
    // flat detour from the original ETA would miss those costs.
    const totalDriving = input.timing.drivingSec.at(-1)!;
    const priorStops = input.timing.stops.filter(
      (s) => s.atDrivingSec < at.drivingSec,
    );
    const priorRest = priorStops.filter((s) => s.kind === "rest").at(-1);
    const toCandidate = at.drivingSec + candidate.detourOutSec;
    const arrivalMs =
      input.timing.departMs +
      (toCandidate + priorStops.reduce((sum, s) => sum + s.durationSec, 0)) *
        1000;
    const drivenToday = priorRest
      ? toCandidate - priorRest.atDrivingSec
      : input.timing.model.driver.drivenTodaySec + toCandidate;
    const remaining =
      Math.max(0, totalDriving - at.drivingSec) + candidate.detourReturnSec;
    const afterPause = {
      drivenTodaySec: nextPause?.kind === "rest" ? 0 : drivenToday,
      continuousSec: 0,
    };
    const remainingStops = planStops(remaining, afterPause);
    const futurePauseSec = remainingStops
      .filter((s) => s.atDrivingSec < remaining)
      .reduce((sum, s) => sum + s.durationSec, 0);
    const finishMs =
      arrivalMs +
      ((nextPause?.durationSec ?? 0) +
        candidate.serviceSec +
        remaining +
        futurePauseSec) *
        1000;
    const marginMs =
      Math.min(
        input.timing.model.margin.maxMin,
        input.timing.model.margin.baseMin +
          (input.timing.model.margin.perDrivingHourMin *
            (totalDriving +
              candidate.detourOutSec +
              candidate.detourReturnSec)) /
            3600,
      ) * 60000;
    const endPause = remainingStops.find((s) => s.atDrivingSec === remaining);
    const latestFinishMs =
      finishMs + marginMs + (endPause?.durationSec ?? 0) * 1000;
    const deliveryMarginSec =
      input.deliveryClosingMs === undefined ||
      !Number.isFinite(input.deliveryClosingMs)
        ? null
        : (input.deliveryClosingMs - latestFinishMs) / 1000;
    if (deliveryMarginSec === null) mark("DELIVERY_WINDOW_UNKNOWN", "UNKNOWN");
    else
      mark(
        deliveryMarginSec >= 0
          ? "DELIVERY_WINDOW_PRESERVED"
          : "DELIVERY_WINDOW_MISSED",
        deliveryMarginSec >= 0 ? "INFO" : "FAIL",
        deliveryMarginSec,
      );
    if (
      input.rangeM.status !== "KNOWN" ||
      !Number.isFinite(input.rangeM.value) ||
      input.rangeM.value < 0 ||
      current === null ||
      !Number.isFinite(input.routeDistanceM) ||
      input.routeDistanceM < 0
    )
      mark("FUEL_RANGE_OR_PROGRESS_UNKNOWN", "UNKNOWN");
    else {
      const geometryM = distanceAt.at(-1)!;
      if (geometryM === 0 && input.routeDistanceM > 0)
        mark("ROUTE_DISTANCE_POSITION_UNKNOWN", "UNKNOWN");
      const factor =
        geometryM > 0 ? Math.max(1, input.routeDistanceM / geometryM) : 1;
      const reachM =
        Math.max(0, distance(candidate.routePosition) - distance(progress!)) *
          factor +
        candidate.detourOutM;
      mark(
        reachM <= input.rangeM.value
          ? "FUEL_RANGE_SUFFICIENT"
          : "FUEL_RANGE_EXCEEDED",
        reachM <= input.rangeM.value ? "INFO" : "FAIL",
        reachM,
      );
    }
    mark("DETOUR_METRES", "INFO", candidate.detourM);
    return {
      id: candidate.id,
      eligibility: fail
        ? ("FAIL" as const)
        : uncertain
          ? ("UNKNOWN" as const)
          : ("PASS" as const),
      reasons,
      arrivalMs,
      legalMarginSec,
      deliveryMarginSec,
      detourM: candidate.detourM,
    };
  });
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const feasible = explained
    .filter((c) => c.eligibility === "PASS")
    .sort(
      (a, b) =>
        a.detourM - b.detourM ||
        (byId.get(a.id)?.costEur ?? Infinity) -
          (byId.get(b.id)?.costEur ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  return { recommendedId: feasible[0]?.id ?? null, candidates: explained };
}
