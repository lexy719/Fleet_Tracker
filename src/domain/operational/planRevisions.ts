import type { Job } from "../../data/types";
import type { OperationalPlan } from "../planning/types";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import type { RegulationDataset } from "../../regulations/types";
import {
  evaluateCompliance,
  DEFAULT_EVALUATE_OPTIONS,
} from "../../regulations/evaluate";
import { inventoryFingerprint, idleDriving } from "../planning/state";
import { haversineM } from "../../regulations/geometry";
import { assignmentReasons } from "../planning/feasibility";
import { planMetrics } from "../planning/economics";
import { movementFactsFor } from "../planning/transportFacts";
import { buildRouteStops } from "../../regulations/fleetFacts";
import { fail, ok, type Result } from "../events";
import { buildExecutionTimeline, operationalDemand } from "./executionTimeline";
import {
  compareOperationalPlans,
  type PlanConsequences,
} from "./planComparison";
import type { OperationalResources } from "./invalidation";

export type RevisionContext = OperationalResources & {
  /** Live accepted inventory; never replace these records with a pending edit. */
  jobs: Job[];
  /** Optional demand overrides for existing jobs, retaining their live revision. */
  proposedJobs?: Job[];
  dataset: RegulationDataset;
  nowMs: number;
};
export type OperationalPlanRevision = {
  schemaVersion: 1;
  revision: number;
  parentFingerprint: string | null;
  contentFingerprint: string;
  plan: OperationalPlan;
  demandSnapshots: Job[];
  createdAt: string;
};
export type OperationalPlanProposal = {
  schemaVersion: 1;
  status: "PROPOSED";
  previous: OperationalPlanRevision | null;
  proposed: OperationalPlanRevision;
  inventoryFingerprint: string;
  datasetVersion: string;
  requiresUncertaintyAcknowledgement: boolean;
  consequences: PlanConsequences | null;
};

function proposedDemand(
  context: RevisionContext,
  overrides: Job[],
): Result<Job[]> {
  if (
    new Set(overrides.map((j) => j.id)).size !== overrides.length ||
    overrides.some(
      (j) =>
        !context.jobs.some(
          (current) => current.id === j.id && current.revision === j.revision,
        ),
    )
  )
    return fail("PROPOSED_DEMAND_REVISION_INVALID");
  const byId = new Map(overrides.map((j) => [j.id, j]));
  return ok(context.jobs.map((j) => byId.get(j.id) ?? j));
}

/** Ignore saved derived metrics, ids and presentation strings when deciding whether a plan changed. */
export function operationalPlanFingerprint(
  plan: OperationalPlan,
  jobs: Job[],
): string {
  return hashString(
    canonicalJson({
      datasetVersion: plan.datasetVersion,
      economics: plan.economics,
      planningInputs: plan.planningInputs,
      demand: jobs
        .filter((j) => plan.executions.some((e) => e.jobId === j.id))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(operationalDemand),
      executions: plan.executions
        .map((e) => ({
          jobId: e.jobId,
          assignment: e.assignment,
          startMs: e.startMs,
          pickupMs: e.pickupMs,
          endMs: e.endMs,
          drivingAtStart: e.drivingAtStart,
          drivingAfter: e.drivingAfter,
          waitsSec: e.waitsSec,
          serviceSec: e.serviceSec,
          movements: e.movements.map((m) => ({
            kind: m.kind,
            departMs: m.departMs,
            arrivalMs: m.arrivalMs,
            timingModel: m.timingModel,
            route: {
              points: m.route.polyline,
              distanceM: m.route.distanceM,
              durationSec: m.route.durationSec,
              legPointCounts: m.route.legPointCounts,
              legDurationSec: m.route.legDurationSec,
              fuelConsumptionL: m.route.fuelConsumptionL,
              fuelCostEur: m.route.fuelCostEur,
              tollCostEur: m.route.tollCostEur,
              tollDataQuality: m.route.tollDataQuality,
              routing: m.route.routing,
            },
          })),
        }))
        .sort((a, b) => a.jobId.localeCompare(b.jobId)),
    }),
  );
}

function validatePlan(
  plan: OperationalPlan,
  context: RevisionContext,
): Result<{ review: boolean; plan: OperationalPlan }> {
  if (
    !Number.isFinite(context.nowMs) ||
    !plan.executions.length ||
    new Set(plan.executions.map((e) => e.jobId)).size !== plan.executions.length
  )
    return fail("INVALID_PLAN_EXECUTIONS");
  let review = false;
  const validatedPlan = structuredClone(plan);
  const work = [...validatedPlan.executions].sort(
    (a, b) => a.startMs - b.startMs || a.jobId.localeCompare(b.jobId),
  );
  const states = structuredClone(plan.planningInputs.initialState);
  for (const e of work) {
    const job = context.jobs.find((j) => j.id === e.jobId),
      truck = context.trucks.find((t) => t.id === e.assignment.truckId),
      driver = context.drivers.find((d) => d.id === e.assignment.driverId),
      trailer = context.trailers.find((t) => t.id === e.assignment.trailerId);
    if (!job || !truck || !driver || (e.assignment.trailerId && !trailer))
      return fail("MISSING_JOB_OR_RESOURCE");
    for (const committed of context.jobs) {
      if (
        work.some((x) => x.jobId === committed.id) ||
        !["assigned", "queued", "loading", "in_transit"].includes(
          committed.status,
        )
      )
        continue;
      if (
        committed.assignedTruckId !== e.assignment.truckId &&
        committed.assignedDriverId !== e.assignment.driverId &&
        (!e.assignment.trailerId ||
          committed.assignedTrailerId !== e.assignment.trailerId)
      )
        continue;
      const start =
        committed.operationalPlan?.execution.startMs ??
        Date.parse(committed.plannedDepartureAt ?? "");
      const end =
        committed.operationalPlan?.execution.endMs ??
        Date.parse(committed.routeCompliance?.route.arrivalAtIso ?? "");
      if (!Number.isFinite(start) || !Number.isFinite(end))
        return fail("EXISTING_COMMITMENT_WITHOUT_TIMELINE");
      if (e.startMs < end && start < e.endMs)
        return fail("EXISTING_COMMITMENT_OVERLAP");
    }
    if (
      job.revision !== e.jobRevision &&
      (!job.operationalPlan ||
        job.operationalPlan.execution.jobRevision !== e.jobRevision)
    )
      return fail("JOB_REVISION_CHANGED");
    const crew = [
      states.trucks[truck.id],
      states.drivers[driver.id],
      ...(trailer ? [states.trailers[trailer.id]] : []),
    ];
    if (
      crew.some(
        (s) =>
          !s || !Number.isFinite(s.availableAt) || s.availableAt > e.startMs,
      )
    )
      return fail("RESOURCE_NOT_AVAILABLE_AT_DEPARTURE");
    const driverState = states.drivers[driver.id];
    if (
      !driverState.driving ||
      canonicalJson(
        idleDriving(
          driverState.driving,
          (e.startMs - driverState.availableAt) / 1000,
        ),
      ) !== canonicalJson(e.drivingAtStart)
    )
      return fail("RESOURCE_DRIVING_CHAIN_CHANGED");
    const origin =
      e.movements[0]?.kind === "EMPTY"
        ? e.movements[0].route.polyline[0]
        : [...job.stops].sort((a, b) => a.sequence - b.sequence)[0];
    const originPoint = Array.isArray(origin)
      ? origin
      : ([origin?.lat, origin?.lng] as [number, number]);
    if (
      !origin ||
      !states.trucks[truck.id].position ||
      haversineM(states.trucks[truck.id].position!.point, originPoint) > 100
    )
      return fail("RESOURCE_ROUTE_ORIGIN_MISMATCH");
    const checks = assignmentReasons(
      job,
      truck,
      driver,
      trailer,
      states,
      e.startMs,
    );
    if (checks.blockers.length)
      return fail(...checks.blockers.map((b) => b.code));
    review ||= checks.warnings.length > 0;
    const timeline = buildExecutionTimeline(job, e);
    if (timeline.status === "UNAVAILABLE")
      return fail(...timeline.issues.map((i) => i.code));
    if (
      timeline.legalDriving === "FAIL" ||
      timeline.stops.some((s) => s.window === "FAIL")
    )
      return fail("PLAN_TIMING_INFEASIBLE");
    if (
      e.startMs < context.nowMs ||
      e.endMs > plan.planningInputs.horizonEndMs ||
      !Number.isFinite(plan.planningInputs.horizonEndMs)
    )
      return fail("PLAN_HORIZON_INVALID");
    review ||=
      timeline.status !== "READY" || timeline.legalDriving === "UNKNOWN";
    if (e.movements.some((m) => !m.route.routing)) {
      review = true;
      if (!e.reasons.some((r) => r.code === "ROUTE_PROVENANCE_UNKNOWN"))
        e.reasons.push({ code: "ROUTE_PROVENANCE_UNKNOWN", jobId: e.jobId });
    }
    review ||= e.movements.some(
      (m) => m.route.tollDataQuality === "unpriced_sections",
    );
    for (const { index, timeline: movementTimeline } of timeline.movements) {
      const m = e.movements[index];
      const report = evaluateCompliance(
        context.dataset,
        {
          route: movementTimeline.routeInput,
          facts: movementFactsFor(job, truck, trailer, m.kind),
          stops:
            m.kind === "EMPTY"
              ? []
              : buildRouteStops(job, context.dataset.areas),
          routeRoadNumbers: m.route.roadNumbers,
        },
        DEFAULT_EVALUATE_OPTIONS,
        new Date(context.nowMs),
      );
      if (
        report.status === "ROUTE_AFFECTED" ||
        report.status === "EVALUATION_ERROR"
      )
        return fail("PLAN_RESTRICTION_INFEASIBLE");
      review ||= report.status === "POTENTIALLY_AFFECTED";
      // Proposed consequences and the accepted snapshot consume the fresh evaluation.
      m.report = report;
      m.evaluationInput = {
        route: movementTimeline.routeInput,
        facts: movementFactsFor(job, truck, trailer, m.kind),
        stops:
          m.kind === "EMPTY" ? [] : buildRouteStops(job, context.dataset.areas),
        routeRoadNumbers: m.route.roadNumbers,
      };
    }
    if (
      work.some(
        (other) =>
          other !== e &&
          (other.assignment.truckId === e.assignment.truckId ||
            other.assignment.driverId === e.assignment.driverId ||
            (!!e.assignment.trailerId &&
              other.assignment.trailerId === e.assignment.trailerId)) &&
          e.startMs < other.endMs &&
          other.startMs < e.endMs,
      )
    )
      return fail("RESOURCE_ASSIGNMENT_OVERLAP");
    const last = [...job.stops].sort((a, b) => a.sequence - b.sequence).at(-1)!;
    const position = {
      point: [last.lat, last.lng] as [number, number],
      source: `PROPOSED_JOB:${job.id}`,
    };
    states.trucks[truck.id] = { availableAt: e.endMs, position };
    states.drivers[driver.id] = {
      availableAt: e.endMs,
      position,
      driving: e.drivingAfter,
    };
    if (trailer)
      states.trailers[trailer.id] = { availableAt: e.endMs, position };
  }
  validatedPlan.status = review ? "REVIEW_REQUIRED" : "FEASIBLE";
  validatedPlan.futureState = states;
  validatedPlan.metrics = planMetrics(
    validatedPlan.executions,
    context.jobs,
    validatedPlan.economics,
  );
  const trips = new Map<string, OperationalPlan["trips"][number]>();
  for (const e of work) {
    const key = canonicalJson(e.assignment);
    const trip = trips.get(key) ?? {
      assignment: { ...e.assignment },
      jobIds: [],
    };
    trip.jobIds.push(e.jobId);
    trips.set(key, trip);
  }
  validatedPlan.trips = [...trips.values()];
  return ok({ review, plan: validatedPlan });
}

export function proposeOperationalPlanRevision(
  previous: OperationalPlanRevision | null,
  plan: OperationalPlan,
  context: RevisionContext,
): Result<OperationalPlanProposal> {
  if (
    previous &&
    previous.contentFingerprint !==
      operationalPlanFingerprint(previous.plan, previous.demandSnapshots)
  )
    return fail("PREVIOUS_REVISION_MUTATED");
  if (plan.datasetVersion !== context.dataset.version)
    return fail("DATASET_CHANGED");
  const demand = proposedDemand(context, context.proposedJobs ?? []);
  if (!demand.ok) return demand;
  const targetContext = { ...context, jobs: demand.value };
  if (
    plan.inventoryFingerprint !==
    inventoryFingerprint(
      targetContext.jobs,
      context.trucks,
      context.drivers,
      context.trailers,
    )
  )
    return fail("PLAN_INPUTS_CHANGED");
  const validated = validatePlan(plan, targetContext);
  if (!validated.ok) return validated;
  const demandSnapshots = structuredClone(
    targetContext.jobs.filter((j) =>
      plan.executions.some((e) => e.jobId === j.id),
    ),
  );
  const fingerprint = operationalPlanFingerprint(plan, demandSnapshots);
  if (previous?.contentFingerprint === fingerprint)
    return fail("NO_OPERATIONAL_CHANGE");
  const proposed: OperationalPlanRevision = {
    schemaVersion: 1,
    revision: (previous?.revision ?? 0) + 1,
    parentFingerprint: previous?.contentFingerprint ?? null,
    contentFingerprint: fingerprint,
    plan: validated.value.plan,
    demandSnapshots,
    createdAt: new Date(context.nowMs).toISOString(),
  };
  return ok({
    schemaVersion: 1,
    status: "PROPOSED",
    previous: previous ? structuredClone(previous) : null,
    proposed,
    inventoryFingerprint: inventoryFingerprint(
      context.jobs,
      context.trucks,
      context.drivers,
      context.trailers,
    ),
    datasetVersion: context.dataset.version,
    requiresUncertaintyAcknowledgement: validated.value.review,
    consequences: previous
      ? compareOperationalPlans(
          previous.plan,
          validated.value.plan,
          demandSnapshots,
          previous.demandSnapshots,
        )
      : null,
  });
}

/** Final domain acceptance, suitable for an application transaction. Does not perform a UI/store write. */
export function acceptOperationalPlanRevision(
  proposal: OperationalPlanProposal,
  current: OperationalPlanRevision | null,
  context: RevisionContext,
  acknowledgeUncertainty = false,
): Result<OperationalPlanRevision> {
  if (
    current &&
    current.contentFingerprint !==
      operationalPlanFingerprint(current.plan, current.demandSnapshots)
  )
    return fail("CURRENT_REVISION_MUTATED");
  if (
    (current?.revision ?? 0) !== (proposal.previous?.revision ?? 0) ||
    (current?.contentFingerprint ?? null) !==
      proposal.proposed.parentFingerprint
  )
    return fail("PLAN_REVISION_CONFLICT");
  if (
    proposal.proposed.revision !== (current?.revision ?? 0) + 1 ||
    proposal.proposed.contentFingerprint !==
      operationalPlanFingerprint(
        proposal.proposed.plan,
        proposal.proposed.demandSnapshots,
      )
  )
    return fail("PROPOSAL_MUTATED");
  if (
    proposal.inventoryFingerprint !==
      inventoryFingerprint(
        context.jobs,
        context.trucks,
        context.drivers,
        context.trailers,
      ) ||
    proposal.datasetVersion !== context.dataset.version
  )
    return fail("PROPOSAL_INPUTS_CHANGED");
  // Source inventory remains the concurrency guard. Pending demand is taken only
  // from the fingerprint-checked proposal, never from a caller's replacement job.
  const demand = proposedDemand(context, proposal.proposed.demandSnapshots);
  if (!demand.ok) return demand;
  const validated = validatePlan(proposal.proposed.plan, {
    ...context,
    jobs: demand.value,
  });
  if (!validated.ok) return validated;
  if (validated.value.review && !acknowledgeUncertainty)
    return fail("UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED");
  return ok({
    ...structuredClone(proposal.proposed),
    plan: validated.value.plan,
  });
}
