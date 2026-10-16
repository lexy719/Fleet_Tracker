import type { Job } from "../../data/types";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import { haversineM } from "../../regulations/geometry";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { validTimingModel } from "../../regulations/timeline";
import type { JobExecution, PlanningMovement } from "../planning/types";
import { advanceDrivingByStops, idleDriving } from "../planning/drivingState";
import {
  assumed,
  calculated,
  instantMs,
  unknown,
  type OperationalValue,
  type OperationalIssue,
  type Feasibility,
} from "./values";

export type TimelineActivity = {
  kind: "drive" | "break" | "rest" | "wait" | "service";
  startMs: number;
  endMs: number;
  movementIndex?: number;
  stopId?: string;
};
export type OperationalStopTime = {
  stopId: string;
  sequence: number;
  arrival: OperationalValue<number>;
  serviceStart: OperationalValue<number>;
  departure: OperationalValue<number>;
  serviceDurationSec: OperationalValue<number>;
  deliveryMarginSec: OperationalValue<number>;
  window: Feasibility;
};
export type ExecutionTimeline = {
  jobId: string;
  inputFingerprint: string;
  status: "READY" | "REVIEW_REQUIRED" | "UNAVAILABLE";
  issues: OperationalIssue[];
  activities: TimelineActivity[];
  stops: OperationalStopTime[];
  movements: {
    index: number;
    kind: PlanningMovement["kind"];
    routeId: string;
    timeline: ReturnType<typeof operationalTimeline>;
  }[];
  end: OperationalValue<number>;
  legalDriving: Feasibility;
  driverAfter: JobExecution["drivingAfter"] | null;
};

/** Demand projection: no notes, display SLA, saved ETAs or resource telemetry masquerading as execution. */
export function operationalDemand(job: Job) {
  return {
    id: job.id,
    cargo: job.cargo,
    cargoType: job.cargoType,
    totalWeightKg: job.totalWeightKg,
    totalPallets: job.totalPallets,
    adrClass: job.adrClass,
    adrUnNumber: job.adrUnNumber,
    tempTargetC: job.tempTargetC,
    recordedFacts: job.recordedFacts,
    operationalRequirements: job.operationalRequirements,
    plannedDepartureAt: job.plannedDepartureAt,
    stops: [...job.stops]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        type: s.type,
        lat: s.lat,
        lng: s.lng,
        municipality: s.municipality,
        windowStartAt: s.windowStartAt,
        windowEndAt: s.windowEndAt,
        scheduledTime: s.scheduledTime,
        windowEnd: s.windowEnd,
        weightKg: s.weightKg,
        pallets: s.pallets,
      })),
  };
}

/** Replay the production execution using the same movement timing and idle policy as the 5.6E planner. */
export function buildExecutionTimeline(
  job: Job,
  execution: JobExecution,
): ExecutionTimeline {
  const issues: OperationalIssue[] = [];
  const result: ExecutionTimeline = {
    jobId: job.id,
    inputFingerprint: hashString(
      canonicalJson({ demand: operationalDemand(job), execution }),
    ),
    status: "UNAVAILABLE",
    issues,
    activities: [],
    stops: [],
    movements: [],
    end: unknown("Execution unavailable"),
    legalDriving: "UNKNOWN",
    driverAfter: null,
  };
  const stopList = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const unavailable = (code: string): ExecutionTimeline => {
    issues.push({ code });
    // Do not expose a partially constructed timeline as consumable operational truth.
    return {
      ...result,
      status: "UNAVAILABLE",
      activities: [],
      stops: [],
      movements: [],
      end: unknown(code),
      driverAfter: null,
    };
  };
  if (
    execution.jobId !== job.id ||
    !stopList.length ||
    !Number.isFinite(execution.startMs) ||
    !Number.isFinite(execution.pickupMs)
  )
    return unavailable("EXECUTION_INPUT_INVALID");
  if (
    new Set(stopList.map((s) => s.id)).size !== stopList.length ||
    new Set(stopList.map((s) => s.sequence)).size !== stopList.length ||
    stopList.some(
      (s) =>
        !Number.isInteger(s.sequence) ||
        !Number.isFinite(s.lat) ||
        !Number.isFinite(s.lng) ||
        Math.abs(s.lat) > 90 ||
        Math.abs(s.lng) > 180,
    )
  )
    return unavailable("STOP_ORDER_OR_POSITION_INVALID");
  let driving = structuredClone(execution.drivingAtStart);
  if (
    !driving ||
    ![
      driving.drivenTodaySec,
      driving.weekSec,
      driving.continuousSec ?? 0,
    ].every((v) => Number.isFinite(v) && v >= 0)
  )
    return unavailable("DRIVING_BASELINE_INVALID");
  if (!driving.known || driving.continuousSec === undefined)
    issues.push({ code: "DRIVING_BASELINE_UNKNOWN" });
  let at = execution.startMs,
    index = 0,
    uncertain = !driving.known || driving.continuousSec === undefined;
  const baselineKnown = !uncertain;
  const time = (value: number): OperationalValue<number> =>
    uncertain
      ? assumed(value, "Upstream timing inputs require validation")
      : calculated(value);
  function movement(m: PlanningMovement): boolean {
    if (
      !validTimingModel(m.timingModel) ||
      m.departMs !== at ||
      !m.route.polyline.length ||
      m.route.polyline.length < 2 ||
      !Number.isFinite(m.route.durationSec) ||
      m.route.error ||
      [m.route.distanceM, m.route.fuelCostEur, m.route.tollCostEur].some(
        (v) => !Number.isFinite(v) || v < 0,
      ) ||
      m.route.durationSec <= 0 ||
      (m.route.departAtIso && instantMs(m.route.departAtIso) !== m.departMs)
    )
      return false;
    if (
      canonicalJson(m.timingModel.driver) !==
        canonicalJson({
          drivenTodaySec: driving.drivenTodaySec,
          continuousSec: driving.continuousSec,
        }) ||
      canonicalJson(m.drivingBefore) !== canonicalJson(m.timingModel.driver)
    )
      return false;
    let timeline: ReturnType<typeof operationalTimeline>;
    try {
      timeline = operationalTimeline(m.route, m.departMs, 0, m.timingModel);
    } catch {
      return false;
    }
    if (timeline.metadataIssues.length) {
      issues.push(
        ...timeline.metadataIssues.map((code) => ({
          code,
          movementIndex: index,
        })),
      );
      uncertain = true;
    }
    if (
      Math.abs(Math.ceil(timeline.arrivalMs) - m.arrivalMs) > 1 ||
      Math.abs(timeline.elapsedSec - m.elapsedSec) > 0.001
    )
      return false;
    for (const kind of ["break", "rest"] as const) {
      const seconds = timeline.stops
        .filter((s) => s.kind === kind && s.atDrivingSec < m.route.durationSec)
        .reduce((sum, s) => sum + s.durationSec, 0);
      if (
        Math.abs(seconds - (kind === "break" ? m.breakSec : m.restSec)) > 0.001
      )
        return false;
    }
    let cursor = m.departMs;
    for (const pause of timeline.stops) {
      if (pause.startMs > cursor)
        result.activities.push({
          kind: "drive",
          startMs: cursor,
          endMs: pause.startMs,
          movementIndex: index,
        });
      result.activities.push({
        kind: pause.kind,
        startMs: pause.startMs,
        endMs: pause.startMs + pause.durationSec * 1000,
        movementIndex: index,
      });
      cursor = pause.startMs + pause.durationSec * 1000;
    }
    if (timeline.arrivalMs > cursor)
      result.activities.push({
        kind: "drive",
        startMs: cursor,
        endMs: timeline.arrivalMs,
        movementIndex: index,
      });
    result.movements.push({
      index,
      kind: m.kind,
      routeId: m.route.id,
      timeline,
    });
    driving = advanceDrivingByStops(
      driving,
      m.route.durationSec,
      timeline.stops,
    );
    at = Math.ceil(timeline.arrivalMs);
    index++;
    return true;
  }
  if (execution.movements[0]?.kind === "EMPTY") {
    const empty = execution.movements[0];
    if (!movement(empty)) return unavailable("MOVEMENT_TIMING_INVALID");
    const end = empty.route.polyline.at(-1)!;
    if (haversineM(end, [stopList[0].lat, stopList[0].lng]) > 100)
      return unavailable("EMPTY_ROUTE_DESTINATION_MISMATCH");
  }
  for (let i = 0; i < stopList.length; i++) {
    const stop = stopList[i];
    const windowStart = instantMs(stop.windowStartAt),
      windowEnd = instantMs(stop.windowEndAt);
    if (
      (stop.windowStartAt && windowStart === null) ||
      (stop.windowEndAt && windowEnd === null) ||
      (windowStart !== null && windowEnd !== null && windowEnd < windowStart)
    )
      return unavailable("STOP_WINDOW_INVALID");
    const plannedDeparture = instantMs(job.plannedDepartureAt);
    if (job.plannedDepartureAt && plannedDeparture === null)
      return unavailable("DEPARTURE_WITHOUT_OFFSET");
    const arrival = at;
    // After confirmation Job.plannedDepartureAt projects the loaded departure, not loading start.
    // The physical execution owns pickup time; applying that compatibility field again doubles service.
    const start = Math.max(
      at,
      windowStart ?? at,
      i === 0 ? execution.pickupMs : at,
    );
    const service = job.operationalRequirements?.serviceSecByStop?.[stop.id];
    if (service !== undefined && (!Number.isFinite(service) || service < 0))
      return unavailable("SERVICE_DURATION_INVALID");
    if (service === undefined) {
      issues.push({ code: "SERVICE_DURATION_UNKNOWN", stopId: stop.id });
      uncertain = true;
    }
    if (windowStart === null || windowEnd === null)
      issues.push({ code: "STOP_WINDOW_UNKNOWN", stopId: stop.id });
    const margin =
      windowEnd === null
        ? unknown<number>("Dated closing window missing")
        : time((windowEnd - start) / 1000);
    const window: Feasibility =
      windowEnd !== null && start > windowEnd
        ? "FAIL"
        : windowStart === null || windowEnd === null || uncertain
          ? "UNKNOWN"
          : "PASS";
    if (window === "FAIL")
      issues.push({ code: "STOP_WINDOW_MISSED", stopId: stop.id });
    if (start > at)
      result.activities.push({
        kind: "wait",
        startMs: at,
        endMs: start,
        stopId: stop.id,
      });
    driving = idleDriving(driving, (start - at) / 1000);
    at = Math.ceil(start + (service ?? 0) * 1000);
    if (at > start)
      result.activities.push({
        kind: "service",
        startMs: start,
        endMs: at,
        stopId: stop.id,
      });
    result.stops.push({
      stopId: stop.id,
      sequence: stop.sequence,
      arrival: time(arrival),
      serviceStart: time(start),
      departure: time(at),
      serviceDurationSec:
        service === undefined
          ? unknown("Service duration not recorded")
          : calculated(service),
      deliveryMarginSec: margin,
      window,
    });
    if (i < stopList.length - 1) {
      const next = stopList[i + 1];
      if (haversineM([stop.lat, stop.lng], [next.lat, next.lng]) < 1) continue;
      const m = execution.movements[index];
      if (
        !m ||
        m.kind !== "LOADED" ||
        !m.route.polyline.length ||
        haversineM(m.route.polyline[0], [stop.lat, stop.lng]) > 100 ||
        haversineM(m.route.polyline.at(-1)!, [next.lat, next.lng]) > 100 ||
        !movement(m)
      )
        return unavailable("LOADED_ROUTE_OR_TIMING_MISMATCH");
    }
  }
  if (
    index !== execution.movements.length ||
    at !== execution.endMs ||
    canonicalJson(driving) !== canonicalJson(execution.drivingAfter)
  )
    return unavailable("EXECUTION_END_OR_DRIVER_STATE_MISMATCH");
  const activitySec = (kind: TimelineActivity["kind"]) =>
    result.activities
      .filter((a) => a.kind === kind)
      .reduce((sum, a) => sum + (a.endMs - a.startMs) / 1000, 0);
  if (
    Math.abs(activitySec("wait") - execution.waitsSec) > 0.01 ||
    Math.abs(activitySec("service") - execution.serviceSec) > 0.01
  )
    return unavailable("EXECUTION_ACTIVITY_TOTALS_MISMATCH");
  result.end = time(at);
  result.driverAfter = driving;
  result.legalDriving =
    driving.weekSec > 56 * 3600
      ? "FAIL"
      : baselineKnown && driving.known && driving.continuousSec !== undefined
        ? "PASS"
        : "UNKNOWN";
  if (result.legalDriving === "FAIL")
    issues.push({ code: "WEEKLY_DRIVING_EXCEEDED" });
  result.status = issues.length ? "REVIEW_REQUIRED" : "READY";
  return result;
}
