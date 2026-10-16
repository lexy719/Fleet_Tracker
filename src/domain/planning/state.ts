import type { Driver, Job, Trailer, Truck } from "../../data/types";
import { driverHoursForPlanning } from "../drivers/drivers";
import {
  canonicalJson,
  hashString,
  buildDecisionInputs,
  inputsFingerprint,
} from "../../regulations/decisionInputs";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { evaluateCompliance } from "../../regulations/evaluate";
import { buildRouteStops } from "../../regulations/fleetFacts";
import { DEFAULT_TIMING_MODEL } from "../../regulations/timeline";
import { idleDriving } from "./drivingState";
export {
  advanceDriving,
  advanceDrivingByStops,
  idleDriving,
} from "./drivingState";
import { buildExecutionTimeline } from "../operational/executionTimeline";
import { movementFactsFor } from "./transportFacts";
import type { FleetState, PlanningRequest, PlanningMovement } from "./types";

export function truckPlanningSpecification(t: Partial<Truck>) {
  return {
    id: t.id,
    vehicleType: t.vehicleType,
    bodyType: t.bodyType,
    payloadKg: t.payloadKg,
    palletCapacity: t.palletCapacity,
    grossVehicleWeightKg: t.grossVehicleWeightKg,
    kerbWeightKg: t.kerbWeightKg,
    axleCount: t.axleCount,
    axleCountScope: t.axleCountScope,
    maxAxleWeightKg: t.maxAxleWeightKg,
    routingPresetId: t.routingPresetId,
    availability: t.availability,
    archivedAt: t.archivedAt,
    firstAxleHeightM: t.firstAxleHeightM,
    ownerCategory: t.ownerCategory,
    adrEquipped: t.adrEquipped,
    lengthM: t.lengthM,
    widthM: t.widthM,
    heightM: t.heightM,
  };
}
export function trailerPlanningSpecification(t: Trailer) {
  return {
    id: t.id,
    type: t.type,
    heightM: t.heightM,
    widthM: t.widthM,
    lengthM: t.lengthM,
    axleCount: t.axleCount,
    payloadKg: t.payloadKg,
    palletCapacity: t.palletCapacity,
    capabilities: t.capabilities,
    tareKg: t.tareKg,
    maxGrossWeightKg: t.maxGrossWeightKg,
    availability: t.availability,
    archivedAt: t.archivedAt,
  };
}
export function driverPlanningSpecification(d: Driver) {
  return {
    id: d.id,
    licence: d.licence,
    cpc: d.cpc,
    adr: d.adr,
    tachoCardExpiresOn: d.tachoCardExpiresOn,
    hours: d.hours,
    availability: d.availability,
    archivedAt: d.archivedAt,
  };
}

export function inventoryFingerprint(
  jobs: Job[],
  trucks: Truck[],
  drivers: Driver[],
  trailers: Trailer[],
): string {
  const sorted = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(
    canonicalJson({
      jobs: sorted(jobs),
      drivers: sorted(drivers),
      trailers: sorted(trailers),
      trucks: sorted(trucks).map((t) => ({
        id: t.id,
        updatedAt: t.updatedAt,
        archivedAt: t.archivedAt,
        vehicleType: t.vehicleType,
        availability: t.availability,
        bodyType: t.bodyType,
        payloadKg: t.payloadKg,
        palletCapacity: t.palletCapacity,
        grossVehicleWeightKg: t.grossVehicleWeightKg,
        kerbWeightKg: t.kerbWeightKg,
        axleCount: t.axleCount,
        axleCountScope: t.axleCountScope,
        maxAxleWeightKg: t.maxAxleWeightKg,
        firstAxleHeightM: t.firstAxleHeightM,
        ownerCategory: t.ownerCategory,
        adrEquipped: t.adrEquipped,
        lengthM: t.lengthM,
        widthM: t.widthM,
        heightM: t.heightM,
        routingPresetId: t.routingPresetId,
        demoTelemetry: t.demoTelemetry,
      })),
    }),
  );
}

export function jobPhase(
  j: Job,
): "EXECUTED" | "IN_PROGRESS" | "COMMITTED" | "PLANNED" | "UNASSIGNED" {
  if (["delivered", "invoiced", "cancelled"].includes(j.status))
    return "EXECUTED";
  if (["loading", "in_transit"].includes(j.status)) return "IN_PROGRESS";
  if (j.planStatus === "PLANNED" || ["assigned", "queued"].includes(j.status))
    return "COMMITTED";
  return j.assignedTruckId ? "PLANNED" : "UNASSIGNED";
}

/** Conservative scheduling boundary: extend after the last commitment, never replace it. */
export function initialFleetState(r: PlanningRequest): FleetState {
  const state: FleetState = { trucks: {}, drivers: {}, trailers: {} };
  for (const t of r.trucks)
    state.trucks[t.id] = {
      availableAt: r.nowMs,
      ...(t.demoTelemetry
        ? {
            position: {
              point: [t.demoTelemetry.lat, t.demoTelemetry.lng],
              source: "DEMO_SIMULATED",
            },
          }
        : {}),
      ...r.initialState?.trucks?.[t.id],
    };
  for (const t of r.trailers)
    state.trailers[t.id] = {
      availableAt: r.nowMs,
      ...r.initialState?.trailers?.[t.id],
    };
  for (const d of r.drivers) {
    const h = driverHoursForPlanning(d, r.nowMs);
    state.drivers[d.id] = {
      availableAt: r.nowMs,
      driving: {
        drivenTodaySec: h.hoursToday * 3600,
        continuousSec: h.todayKnown
          ? d.hours?.currentSpellMin === undefined
            ? undefined
            : d.hours.currentSpellMin * 60
          : undefined,
        weekSec: h.hoursWeek * 3600,
        known:
          h.todayKnown && h.weekKnown && d.hours?.currentSpellMin !== undefined,
      },
      ...r.initialState?.drivers?.[d.id],
    };
  }
  for (const group of Object.values(state))
    for (const s of Object.values(group)) {
      if (
        s.position &&
        (!s.position.point.every(Number.isFinite) ||
          Math.abs(s.position.point[0]) > 90 ||
          Math.abs(s.position.point[1]) > 180)
      ) {
        delete s.position;
        s.blocked = "RESOURCE_POSITION_INVALID";
      }
      if (!Number.isFinite(s.availableAt))
        s.blocked = "RESOURCE_AVAILABILITY_INVALID";
    }
  const committed = r.jobs
    .filter((j) => ["COMMITTED", "IN_PROGRESS"].includes(jobPhase(j)))
    .sort(
      (a, b) =>
        Date.parse(
          a.plannedDepartureAt ?? a.routeCompliance?.route.departAtIso ?? "",
        ) -
        Date.parse(
          b.plannedDepartureAt ?? b.routeCompliance?.route.departAtIso ?? "",
        ),
    );
  for (const j of committed) {
    const rc = j.routeCompliance,
      op = j.operationalPlan?.execution;
    const last = [...j.stops].sort((a, b) => a.sequence - b.sequence).at(-1);
    const end =
      op?.endMs ??
      Date.parse(rc?.route.arrivalAtIso ?? j.planDecision?.arrivalAt ?? "");
    const start =
      op?.startMs ??
      Date.parse(rc?.route.departAtIso ?? j.plannedDepartureAt ?? "");
    const members: [keyof FleetState, string | undefined][] = [
      ["trucks", j.assignedTruckId],
      ["drivers", j.assignedDriverId],
      ["trailers", j.assignedTrailerId],
    ];
    let commitmentBlock =
      j.planStatus === "REPLAN_REQUIRED"
        ? "COMMITMENT_REPLAN_REQUIRED"
        : undefined;
    if (j.operationalPlan) {
      const truck = r.trucks.find((t) => t.id === j.assignedTruckId),
        driver = r.drivers.find((d) => d.id === j.assignedDriverId),
        trailer = r.trailers.find((t) => t.id === j.assignedTrailerId);
      if (
        !truck ||
        !driver ||
        canonicalJson(truckPlanningSpecification(truck)) !==
          canonicalJson(j.operationalPlan.truckSpecification) ||
        canonicalJson(driverPlanningSpecification(driver)) !==
          canonicalJson(j.operationalPlan.driverSpecification) ||
        (j.assignedTrailerId &&
          (!trailer ||
            canonicalJson(trailerPlanningSpecification(trailer)) !==
              canonicalJson(j.operationalPlan.trailerSpecification)))
      )
        commitmentBlock = "COMMITTED_RESOURCE_SPECIFICATION_CHANGED";
      for (const rc of j.operationalPlan.compliance) {
        const current = buildDecisionInputs({
          job: j,
          truck: truck ?? null,
          departAtIso: rc.route.departAtIso,
          routePoints: rc.route.polyline,
          datasetVersion: r.dataset.version,
        });
        if (
          !rc.inputFingerprint ||
          inputsFingerprint(current) !== rc.inputFingerprint
        )
          commitmentBlock = "COMMITTED_DEMAND_CHANGED";
      }
      const replay = buildExecutionTimeline(j, j.operationalPlan.execution);
      if (
        replay.status === "UNAVAILABLE" ||
        replay.legalDriving === "FAIL" ||
        replay.stops.some((s) => s.window === "FAIL")
      )
        commitmentBlock = "COMMITTED_EXECUTION_CHANGED";
      for (const [
        index,
        movement,
      ] of j.operationalPlan.execution.movements.entries()) {
        const input = {
            ...movement.evaluationInput,
            ...(replay.movements[index]
              ? { route: replay.movements[index].timeline.routeInput }
              : {}),
            ...(truck
              ? { facts: movementFactsFor(j, truck, trailer, movement.kind) }
              : {}),
            stops:
              movement.kind === "EMPTY"
                ? []
                : buildRouteStops(j, r.dataset.areas),
          },
          report = evaluateCompliance(
            r.dataset,
            input,
            {
              timeToleranceMin: 15,
              sampleStepMin: 5,
              timing: movement.timingModel,
            },
            new Date(r.nowMs),
          );
        if (
          report.status === "ROUTE_AFFECTED" ||
          report.status === "EVALUATION_ERROR" ||
          report.status === "POTENTIALLY_AFFECTED"
        )
          commitmentBlock = "COMMITTED_ROUTE_REQUIRES_REVIEW";
      }
    }
    for (const [kind, id] of members) {
      if (!id || !state[kind][id]) continue;
      const s = state[kind][id];
      if (commitmentBlock) {
        s.blocked = `${commitmentBlock}:${j.id}`;
        continue;
      }
      if (
        !last ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end < start
      ) {
        s.blocked = `COMMITMENT_WITHOUT_REPRODUCIBLE_TIMELINE:${j.id}`;
        continue;
      }
      if (end <= r.nowMs) {
        s.blocked = `OVERDUE_UNFINISHED_COMMITMENT:${j.id}`;
        continue;
      }
      // Distinct confirmed commitments must themselves be coherent before extending them.
      if (s.availableAt > Math.max(r.nowMs, start)) {
        s.blocked = `OVERLAPPING_COMMITMENTS:${j.id}`;
        continue;
      }
      const previousAvailability = s.availableAt;
      s.availableAt = end;
      s.position = {
        point: [last.lat, last.lng],
        source: `CONFIRMED_JOB:${j.id}`,
      };
      if (kind === "drivers" && s.driving) {
        if (start < r.nowMs) {
          // Remaining driving is unknowable without execution/tachograph evidence.
          // Never fabricate a fresh daily allowance at the expected destination.
          s.blocked = `IN_PROGRESS_REMAINING_HOURS_UNKNOWN:${j.id}`;
        } else if (op) {
          // Inter-movement gaps include active cargo service: they are NOT all rest.
          // Reuse the exact carried state only while its starting baseline is still valid.
          const expectedStart = idleDriving(
            s.driving,
            (start - previousAvailability) / 1000,
          );
          if (!op.drivingAtStart || !op.drivingAfter)
            s.blocked = `COMMITTED_DRIVING_STATE_NOT_REPRODUCIBLE:${j.id}`;
          else if (
            canonicalJson(expectedStart) !== canonicalJson(op.drivingAtStart)
          )
            s.blocked = `COMMITTED_DRIVING_BASELINE_CHANGED:${j.id}`;
          else s.driving = structuredClone(op.drivingAfter);
        } else if (rc) {
          const model = rc.evaluationOptions?.timing ?? DEFAULT_TIMING_MODEL;
          const duration = rc.route.durationSec;
          const stops = operationalTimeline(
            {
              polyline: rc.route.polyline,
              legPointCounts: rc.route.legPointCounts,
              legDurationSec: rc.route.legDurationSec,
              durationSec: duration,
            } as PlanningMovement["route"],
            start,
            0,
            model,
          ).stops;
          const rest = stops.filter((x) => x.kind === "rest").at(-1),
            stop = stops.at(-1);
          s.driving = {
            weekSec: s.driving.weekSec + duration,
            drivenTodaySec: rest
              ? duration - rest.atDrivingSec
              : model.driver.drivenTodaySec + duration,
            continuousSec: stop
              ? duration - stop.atDrivingSec
              : (model.driver.continuousSec ?? 0) + duration,
            known: s.driving.known,
          };
        } else s.driving = { ...s.driving, known: false };
      }
    }
  }
  return state;
}
