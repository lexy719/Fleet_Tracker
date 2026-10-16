import type { OpsSnapshot } from "../repositories/operationalStore";
import type { RegulationDataset } from "../regulations/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import {
  canonicalJson,
  buildDecisionInputs,
  inputsFingerprint,
} from "../regulations/decisionInputs";
import { buildRouteStops } from "../regulations/fleetFacts";
import {
  evaluateCompliance,
  DEFAULT_EVALUATE_OPTIONS,
} from "../regulations/evaluate";
import { buildExecutionTimeline } from "../domain/operational/executionTimeline";
import { operationalRouteAlternatives } from "../domain/operational/routeAlternatives";
import {
  unknown,
  assumed,
  type OperationalValue,
} from "../domain/operational/values";
import {
  initialFleetState,
  driverPlanningSpecification,
  truckPlanningSpecification,
  trailerPlanningSpecification,
} from "../domain/planning/state";
import { movementFactsFor } from "../domain/planning/transportFacts";
import type { FleetState } from "../domain/planning/types";
import type { OperationalPlanProposal } from "../domain/operational/planRevisions";

/** Read-only integration boundary. Inputs are supplied by the existing application owner.
 * No UI state, global singleton, provider call or persistence write is introduced here.
 * Callers may retain a query object only as long as its snapshot/dataset remain current.
 */
export function createOperationalQueries(
  snapshotInput: OpsSnapshot,
  datasetInput: RegulationDataset,
  nowMs: number,
) {
  const snapshot = structuredClone(snapshotInput),
    dataset = structuredClone(datasetInput);
  const jobById = new Map(snapshot.jobs.map((j) => [j.id, j]));
  function getResourceAssignment(jobId: string) {
    const job = jobById.get(jobId);
    if (!job)
      return {
        status: "UNAVAILABLE" as const,
        assignment: null,
        issues: ["JOB_MISSING"],
      };
    const saved = job.operationalPlan?.execution.assignment;
    const assignment = saved ?? {
      truckId: job.assignedTruckId,
      driverId: job.assignedDriverId,
      trailerId: job.assignedTrailerId,
    };
    const issues: string[] = [];
    if (
      saved &&
      (saved.truckId !== job.assignedTruckId ||
        saved.driverId !== job.assignedDriverId ||
        (saved.trailerId ?? null) !== (job.assignedTrailerId ?? null))
    )
      issues.push("ASSIGNMENT_PROJECTION_STALE");
    if (
      !assignment.truckId ||
      !snapshot.trucks.some((t) => t.id === assignment.truckId)
    )
      issues.push("TRUCK_MISSING");
    if (
      !assignment.driverId ||
      !snapshot.drivers.some((d) => d.id === assignment.driverId)
    )
      issues.push("DRIVER_MISSING");
    if (
      assignment.trailerId &&
      !snapshot.trailers.some((t) => t.id === assignment.trailerId)
    )
      issues.push("TRAILER_MISSING");
    return {
      status: issues.length
        ? ("REVIEW_REQUIRED" as const)
        : ("CURRENT" as const),
      assignment: { ...assignment },
      issues,
    };
  }
  function getOperationalTimeline(jobId: string) {
    const job = jobById.get(jobId),
      op = job?.operationalPlan;
    if (!job || !op)
      return {
        status: "UNAVAILABLE" as const,
        timeline: null,
        issues: [job ? "EXECUTION_MISSING" : "JOB_MISSING"],
      };
    const assignment = getResourceAssignment(jobId),
      issues = [...assignment.issues];
    const truck = snapshot.trucks.find(
      (t) => t.id === op.execution.assignment.truckId,
    );
    const driver = snapshot.drivers.find(
      (d) => d.id === op.execution.assignment.driverId,
    );
    const trailer = snapshot.trailers.find(
      (t) => t.id === op.execution.assignment.trailerId,
    );
    if (
      !truck ||
      canonicalJson(truckPlanningSpecification(truck)) !==
        canonicalJson(op.truckSpecification)
    )
      issues.push("TRUCK_SPECIFICATION_CHANGED");
    if (
      !driver ||
      canonicalJson(driverPlanningSpecification(driver)) !==
        canonicalJson(op.driverSpecification)
    )
      issues.push("DRIVER_SPECIFICATION_CHANGED");
    if (
      op.execution.assignment.trailerId &&
      (!trailer ||
        canonicalJson(trailerPlanningSpecification(trailer)) !==
          canonicalJson(op.trailerSpecification))
    )
      issues.push("TRAILER_SPECIFICATION_CHANGED");
    if (job.planStatus === "REPLAN_REQUIRED") issues.push("REPLAN_REQUIRED");
    const firstLoaded = op.execution.movements.find((m) => m.kind === "LOADED");
    if (
      firstLoaded &&
      Date.parse(job.plannedDepartureAt ?? "") !== firstLoaded.departMs
    )
      issues.push("DEPARTURE_CHANGED");
    for (const rc of op.compliance) {
      if (
        !rc.inputFingerprint ||
        inputsFingerprint(
          buildDecisionInputs({
            job,
            truck: truck ?? null,
            departAtIso: rc.route.departAtIso,
            routePoints: rc.route.polyline,
            datasetVersion: dataset.version,
          }),
        ) !== rc.inputFingerprint
      )
        issues.push("DEMAND_OR_ROUTE_CHANGED");
    }
    if (issues.length)
      return {
        status: "STALE" as const,
        timeline: null,
        issues: [...new Set(issues)],
      };
    const timeline = buildExecutionTimeline(job, op.execution);
    return {
      status: timeline.status,
      timeline:
        timeline.status === "UNAVAILABLE" ? null : structuredClone(timeline),
      issues: timeline.issues.map((i) => i.code),
    };
  }
  function getRouteAlternatives(
    jobId: string,
    candidates: RoutePlanOption[] = [],
    movementIndex?: number,
  ) {
    const job = jobById.get(jobId),
      read = getOperationalTimeline(jobId);
    if (!job || !read.timeline)
      return {
        status: "UNAVAILABLE" as const,
        alternatives: [],
        issues: read.issues,
      };
    // Alternatives belong to one physical movement; never imply segment choices are whole-job routes.
    const index =
      movementIndex ??
      job.operationalPlan!.execution.movements.findIndex(
        (m) => m.kind === "LOADED",
      );
    const movement = job.operationalPlan!.execution.movements[index];
    const truck = snapshot.trucks.find(
      (t) => t.id === job.operationalPlan!.execution.assignment.truckId,
    );
    if (!movement || !truck)
      return {
        status: "UNAVAILABLE" as const,
        alternatives: [],
        issues: ["MOVEMENT_OR_RESOURCE_MISSING"],
      };
    const trailer = snapshot.trailers.find(
      (t) => t.id === job.operationalPlan!.execution.assignment.trailerId,
    );
    const alternatives = operationalRouteAlternatives(
      candidates.length ? candidates : [movement.route],
      {
        departMs: movement.departMs,
        timingModel: movement.timingModel,
        driverKnown: job.operationalPlan!.execution.drivingAtStart.known,
        dataset,
        facts: movementFactsFor(job, truck, trailer, movement.kind),
        stops:
          movement.kind === "EMPTY" ? [] : buildRouteStops(job, dataset.areas),
        nowMs,
      },
    );
    return {
      status: "AVAILABLE" as const,
      movementIndex: index,
      alternatives: structuredClone(alternatives),
      issues: [],
    };
  }
  function getRestrictionImpact(jobId: string, restrictionId: string) {
    if (!dataset.regulations.some((r) => r.id === restrictionId))
      return {
        status: "UNKNOWN" as const,
        reason: "RESTRICTION_MISSING",
        movements: [],
      };
    const job = jobById.get(jobId),
      read = getOperationalTimeline(jobId);
    if (!job || !read.timeline)
      return {
        status: "UNKNOWN" as const,
        reason: read.issues.join(","),
        movements: [],
      };
    const truck = snapshot.trucks.find(
      (t) => t.id === job.operationalPlan!.execution.assignment.truckId,
    )!;
    const trailer = snapshot.trailers.find(
      (t) => t.id === job.operationalPlan!.execution.assignment.trailerId,
    );
    const selectedDataset = {
      ...dataset,
      regulations: dataset.regulations.filter((r) => r.id === restrictionId),
    };
    const movements = read.timeline.movements.map(({ index, timeline }) => {
      const m = job.operationalPlan!.execution.movements[index];
      const report = evaluateCompliance(
        selectedDataset,
        {
          route: timeline.routeInput,
          facts: movementFactsFor(job, truck, trailer, m.kind),
          stops: m.kind === "EMPTY" ? [] : buildRouteStops(job, dataset.areas),
          routeRoadNumbers: m.route.roadNumbers,
        },
        DEFAULT_EVALUATE_OPTIONS,
        new Date(nowMs),
      );
      return { index, report };
    });
    return {
      status: movements.some((m) => m.report.status === "ROUTE_AFFECTED")
        ? ("FAIL" as const)
        : movements.some((m) =>
              ["POTENTIALLY_AFFECTED", "EVALUATION_ERROR"].includes(
                m.report.status,
              ),
            )
          ? ("UNKNOWN" as const)
          : ("PASS" as const),
      movements,
    };
  }
  function getResourceFutureState(initialState?: Partial<FleetState>) {
    const state = initialFleetState({
      ...snapshot,
      dataset,
      nowMs,
      horizonEndMs: nowMs + 7 * 86400_000,
      initialState,
      route: async () => [],
    });
    return Object.fromEntries(
      (["trucks", "drivers", "trailers"] as const).map((kind) => [
        kind,
        Object.fromEntries(
          Object.entries(state[kind]).map(([id, s]) => [
            id,
            {
              availableAt: s.blocked
                ? unknown<number>(s.blocked)
                : {
                    status: "KNOWN" as const,
                    value: s.availableAt,
                    source: "calculated" as const,
                  },
              position: futurePosition(s),
              driving:
                !s.blocked && s.driving?.known
                  ? {
                      status: "KNOWN" as const,
                      value: { ...s.driving },
                      source: "calculated" as const,
                    }
                  : unknown(s.blocked ?? "Driver baseline unavailable"),
              blocked: s.blocked,
              nextAssignments: snapshot.jobs
                .filter(
                  (j) =>
                    j.operationalPlan &&
                    j.operationalPlan.execution.endMs > nowMs &&
                    (kind === "trucks"
                      ? j.assignedTruckId === id
                      : kind === "drivers"
                        ? j.assignedDriverId === id
                        : j.assignedTrailerId === id),
                )
                .map((j) => ({
                  jobId: j.id,
                  startMs: j.operationalPlan!.execution.startMs,
                  endMs: j.operationalPlan!.execution.endMs,
                }))
                .sort((a, b) => a.startMs - b.startMs),
            },
          ]),
        ),
      ]),
    );
  }
  function futurePosition(
    s: FleetState["trucks"][string],
  ): OperationalValue<[number, number]> {
    if (s.blocked || !s.position)
      return unknown(s.blocked ?? "Position not recorded");
    const point: [number, number] = [...s.position.point];
    if (s.position.source.startsWith("CONFIRMED_JOB:"))
      return assumed(point, "Planned endpoint; not observed telemetry");
    if (s.position.source === "DEMO_SIMULATED")
      return { status: "KNOWN", value: point, source: "simulated" };
    if (s.position.source.toLowerCase() === "manual")
      return { status: "KNOWN", value: point, source: "manual" };
    return assumed(
      point,
      `Position source requires validation: ${s.position.source}`,
    );
  }
  return {
    getResourceAssignment,
    getOperationalTimeline,
    getRouteAlternatives,
    getRestrictionImpact,
    getResourceFutureState,
    getPlanConsequences: (proposal: OperationalPlanProposal) =>
      structuredClone(proposal.consequences),
  };
}
