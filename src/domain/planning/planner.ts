import type { Job, Trailer } from "../../data/types";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import { buildRouteStops } from "../../regulations/fleetFacts";
import {
  DEFAULT_EVALUATE_OPTIONS,
  evaluateCompliance,
} from "../../regulations/evaluate";
import { haversineM } from "../../regulations/geometry";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { DEFAULT_TIMING_MODEL } from "../../regulations/timeline";
import { evaluateEuDrivingRules } from "../../ops/euDrivingRules";
import { driverQualifications } from "../drivers/drivers";
import { assignmentReasons, tupleKey } from "./feasibility";
import { movementFactsFor as factsFor } from "./transportFacts";
import {
  advanceDrivingByStops,
  idleDriving,
  initialFleetState,
  inventoryFingerprint,
  jobPhase,
} from "./state";
import { comparePlans, operationallyDominates, planMetrics } from "./economics";
import {
  DEFAULT_ECONOMICS,
  DEFAULT_SEARCH,
  type Assignment,
  type JobExecution,
  type OperationalPlan,
  type PlanningMovement,
  type PlanningReason,
  type PlanningRequest,
  type PlanningResult,
  type ResourceState,
} from "./types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";

type Extension = {
  job: Job;
  assignment: Assignment;
  at: number;
  warnings: PlanningReason[];
  lowerDistance: number;
};
type PartialExecution = {
  execution: JobExecution;
  driving: NonNullable<ResourceState["driving"]>;
  at: number;
};

export async function planFleet(
  request: PlanningRequest,
): Promise<PlanningResult> {
  const r = request,
    policy = { ...DEFAULT_SEARCH, ...r.search },
    economics = r.economics ?? DEFAULT_ECONOMICS;
  if (
    !Number.isFinite(r.nowMs) ||
    !Number.isFinite(r.horizonEndMs) ||
    r.horizonEndMs <= r.nowMs
  )
    throw new Error("Invalid planning horizon");
  if (
    r.earliestStartMs !== undefined &&
    (!Number.isFinite(r.earliestStartMs) ||
      r.earliestStartMs < r.nowMs ||
      r.earliestStartMs >= r.horizonEndMs)
  )
    throw new Error("Invalid earliest departure");
  if (
    Object.values(policy).some((v) => !Number.isInteger(v) || v < 1) ||
    Object.values(economics).some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error("Invalid planning/search economics policy");
  const allJobs = [...r.jobs].sort((a, b) => a.id.localeCompare(b.id)),
    jobs = allJobs.filter(
      (j) =>
        ["UNASSIGNED", "PLANNED"].includes(jobPhase(j)) &&
        j.status === "backlog" &&
        (!r.scopeJobIds || r.scopeJobIds.includes(j.id)),
    );
  const constraints = new Map((r.constraints ?? []).map((c) => [c.jobId, c]));
  if (constraints.size !== (r.constraints ?? []).length)
    throw new Error("Duplicate override for job");
  const diagnosticMap = new Map<
    string,
    { reason: PlanningReason; count: number }
  >();
  const note = (reason: PlanningReason) => {
    const key = canonicalJson(reason),
      old = diagnosticMap.get(key);
    if (old) old.count++;
    else diagnosticMap.set(key, { reason, count: 1 });
  };
  const search: PlanningResult["search"] = {
    routeRequests: 0,
    cacheHits: 0,
    evaluatedExtensions: 0,
    cheapRejected: 0,
    truncated: false,
    globallyOptimal: false,
  };
  const fingerprint = hashString(
    canonicalJson({
      inventory: inventoryFingerprint(r.jobs, r.trucks, r.drivers, r.trailers),
      state: r.initialState,
      scope: r.scopeJobIds,
      now: r.nowMs,
      earliestStart: r.earliestStartMs,
      horizon: r.horizonEndMs,
      dataset: r.dataset.version,
      constraints: r.constraints,
      economics,
      policy,
    }),
  );
  const initial: OperationalPlan = {
    schemaVersion: 1,
    id: `plan-${fingerprint}`,
    inputFingerprint: fingerprint,
    inventoryFingerprint: inventoryFingerprint(
      r.jobs,
      r.trucks,
      r.drivers,
      r.trailers,
    ),
    createdAt: new Date(r.nowMs).toISOString(),
    datasetVersion: r.dataset.version,
    economics,
    executions: [],
    trips: [],
    planningInputs: {
      nowMs: r.nowMs,
      earliestStartMs: r.earliestStartMs,
      horizonEndMs: r.horizonEndMs,
      scopeJobIds: r.scopeJobIds,
      constraints: structuredClone(r.constraints ?? []),
      initialState: initialFleetState(r),
      search: policy,
    },
    futureState: initialFleetState(r),
    metrics: planMetrics([], jobs, economics),
    reasons: [],
    status: "FEASIBLE",
  };
  const memo = new Map<string, Promise<RoutePlanOption[]>>();
  const route = async (
    job: Job,
    assignment: Assignment,
    kind: PlanningMovement["kind"],
    from: [number, number],
    to: [number, number],
    at: number,
    driving: NonNullable<ResourceState["driving"]>,
  ) => {
    const truck = r.trucks.find((t) => t.id === assignment.truckId)!,
      trailer = r.trailers.find((t) => t.id === assignment.trailerId);
    const facts = factsFor(job, truck, trailer, kind),
      timing = {
        ...DEFAULT_TIMING_MODEL,
        driver: {
          drivenTodaySec: driving.drivenTodaySec,
          continuousSec: driving.continuousSec,
        },
      };
    // Request-scoped only: no persisted or cross-input timing cache can survive invalidation.
    const evaluated = new Map<
      string,
      {
        timeline: ReturnType<typeof operationalTimeline>;
        report: ReturnType<typeof evaluateCompliance>;
      }
    >();
    const evaluation = (o: RoutePlanOption) => {
      const evaluationKey = canonicalJson({
        points: o.polyline,
        durationSec: o.durationSec,
        legDurationSec: o.legDurationSec,
        legPointCounts: o.legPointCounts,
        roadNumbers: o.roadNumbers,
      });
      const hit = evaluated.get(evaluationKey);
      if (hit) return hit;
      const timeline = operationalTimeline(o, at, 0, timing);
      const report = evaluateCompliance(
        r.dataset,
        {
          route: timeline.routeInput,
          facts,
          stops: kind === "EMPTY" ? [] : buildRouteStops(job, r.dataset.areas),
          routeRoadNumbers: o.roadNumbers,
        },
        { ...DEFAULT_EVALUATE_OPTIONS, sampleStepMin: 5, timing },
        new Date(r.nowMs),
      );
      const value = { timeline, report };
      evaluated.set(evaluationKey, value);
      return value;
    };
    const evaluate = (o: RoutePlanOption) => evaluation(o).report;
    const key = canonicalJson({
      jobId: job.id,
      from,
      to,
      at,
      kind,
      truck,
      trailer,
      facts,
      driving,
      dataset: r.dataset.version,
    });
    let promise = memo.get(key);
    if (promise) search.cacheHits++;
    else {
      if (search.routeRequests >= policy.maxRouteRequests) {
        search.truncated = true;
        note({ code: "ROUTING_BUDGET_REACHED" });
        return [];
      }
      search.routeRequests++;
      promise = r.route({
        job,
        truck,
        trailer,
        kind,
        from,
        to,
        departMs: at,
        evaluate,
      });
      memo.set(key, promise);
    }
    let options: RoutePlanOption[];
    try {
      options = await promise;
    } catch (e) {
      note({
        code: "PROVIDER_ERROR",
        jobId: job.id,
        data: { message: e instanceof Error ? e.message : String(e) },
      });
      return [];
    }
    const valid: PlanningMovement[] = [];
    for (const o of options) {
      if (
        o.error ||
        o.polyline.length < 2 ||
        [o.durationSec, o.distanceM, o.fuelCostEur, o.tollCostEur].some(
          (v) => !Number.isFinite(v) || v < 0,
        ) ||
        o.durationSec === 0
      ) {
        note({ code: "INVALID_PROVIDER_ROUTE", jobId: job.id });
        continue;
      }
      if (o.departAtIso && Date.parse(o.departAtIso) !== at) {
        note({ code: "STALE_PROVIDER_DEPARTURE", jobId: job.id });
        continue;
      }
      if (
        evaluateEuDrivingRules(
          [o.durationSec],
          driving.drivenTodaySec / 3600,
          driving.weekSec / 3600,
        ).some((x) => x.severity === "critical")
      ) {
        note({
          code: "LEGAL_DRIVING_INFEASIBLE",
          jobId: job.id,
          resourceId: assignment.driverId,
        });
        continue;
      }
      let timeline: ReturnType<typeof operationalTimeline>,
        report: ReturnType<typeof evaluateCompliance>;
      try {
        ({ timeline, report } = evaluation(o));
      } catch {
        note({ code: "INVALID_PROVIDER_TIMING", jobId: job.id });
        continue;
      }
      // An inferred leg partition cannot be confirmed as a provider timing result.
      if (timeline.metadataIssues.length) {
        note({ code: "INVALID_PROVIDER_LEG_TIMING", jobId: job.id });
        continue;
      }
      if (
        report.status === "ROUTE_AFFECTED" ||
        report.status === "EVALUATION_ERROR"
      ) {
        note({
          code: "MANDATORY_ROUTE_REJECTED",
          jobId: job.id,
          resourceId: truck.id,
          data: {
            regulationIds: report.results
              .filter((x) => x.outcome === "APPLIES" && x.effect !== "advisory")
              .map((x) => x.regulationId),
          },
        });
        continue;
      }
      // ISO provider timestamps have millisecond precision; round availability upwards once.
      valid.push({
        kind,
        route: o,
        departMs: at,
        arrivalMs: Math.ceil(timeline.arrivalMs),
        elapsedSec: timeline.elapsedSec,
        drivingBefore: timing.driver,
        timingModel: timing,
        report,
        evaluationInput: {
          route: timeline.routeInput,
          facts,
          stops: kind === "EMPTY" ? [] : buildRouteStops(job, r.dataset.areas),
          routeRoadNumbers: o.roadNumbers,
        },
        restSec: timeline.stops
          .filter((x) => x.kind === "rest" && x.atDrivingSec < o.durationSec)
          .reduce((s, x) => s + x.durationSec, 0),
        breakSec: timeline.stops
          .filter((x) => x.kind === "break" && x.atDrivingSec < o.durationSec)
          .reduce((s, x) => s + x.durationSec, 0),
      });
    }
    return valid
      .sort(
        (a, b) =>
          a.route.fuelCostEur +
            a.route.tollCostEur +
            (a.elapsedSec / 3600) * economics.opportunityEurPerHour -
            (b.route.fuelCostEur +
              b.route.tollCostEur +
              (b.elapsedSec / 3600) * economics.opportunityEurPerHour) ||
          a.route.id.localeCompare(b.route.id),
      )
      .slice(0, policy.maxAlternatives);
  };

  function extensions(plan: OperationalPlan): Extension[] {
    const buckets: Extension[][] = [];
    for (const job of jobs) {
      if (plan.executions.some((e) => e.jobId === job.id)) continue;
      const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence),
        first = stops[0];
      if (
        stops.length < 2 ||
        stops[0]?.type !== "pickup" ||
        stops.at(-1)?.type !== "delivery" ||
        stops.some(
          (s) =>
            !Number.isFinite(s.lat) ||
            !Number.isFinite(s.lng) ||
            Math.abs(s.lat) > 90 ||
            Math.abs(s.lng) > 180,
        )
      ) {
        note({ code: "JOB_GEOMETRY_OR_STOP_ORDER_INVALID", jobId: job.id });
        continue;
      }
      const constraint = constraints.get(job.id),
        bucket: Extension[] = [];
      if (
        stops.some(
          (stop) =>
            (stop.windowStartAt &&
              !Number.isFinite(Date.parse(stop.windowStartAt))) ||
            (stop.windowEndAt &&
              !Number.isFinite(Date.parse(stop.windowEndAt))),
        )
      ) {
        note({ code: "INVALID_DATED_WINDOW", jobId: job.id });
        continue;
      }
      if (
        constraint?.afterJobId &&
        !r.jobs.some((j) => j.id === constraint.afterJobId)
      ) {
        note({ code: "OVERRIDE_REFERENCE_MISSING", jobId: job.id });
        continue;
      }
      const predecessor = constraint?.afterJobId
        ? plan.executions.find((e) => e.jobId === constraint.afterJobId)
        : undefined;
      if (
        constraint?.afterJobId &&
        !predecessor &&
        jobs.some((j) => j.id === constraint.afterJobId)
      )
        continue;
      for (const truck of [...r.trucks].sort((a, b) =>
        a.id.localeCompare(b.id),
      ))
        for (const driver of [...r.drivers].sort((a, b) =>
          a.id.localeCompare(b.id),
        ))
          for (const trailer of [undefined, ...r.trailers] as (
            | Trailer
            | undefined
          )[]) {
            const assignment: Assignment = {
              truckId: truck.id,
              driverId: driver.id,
              ...(trailer ? { trailerId: trailer.id } : {}),
            };
            if (
              predecessor &&
              tupleKey(predecessor.assignment) !== tupleKey(assignment)
            )
              continue;
            const committedPredecessor =
              constraint?.afterJobId && !predecessor
                ? r.jobs.find((j) => j.id === constraint.afterJobId)
                : undefined;
            if (
              committedPredecessor &&
              (committedPredecessor.assignedTruckId !== truck.id ||
                committedPredecessor.assignedDriverId !== driver.id ||
                (committedPredecessor.assignedTrailerId ?? undefined) !==
                  trailer?.id)
            )
              continue;
            const last = plan.executions
              .filter(
                (e) =>
                  e.assignment.truckId === truck.id ||
                  e.assignment.driverId === driver.id ||
                  (trailer && e.assignment.trailerId === trailer.id),
              )
              .at(-1);
            if (predecessor && last?.jobId !== predecessor.jobId) continue;
            const nextLock =
              last &&
              jobs.find(
                (j) =>
                  constraints.get(j.id)?.afterJobId === last.jobId &&
                  !plan.executions.some((e) => e.jobId === j.id),
              );
            if (nextLock && nextLock.id !== job.id) continue;
            const ts = plan.futureState.trucks[truck.id],
              ds = plan.futureState.drivers[driver.id],
              trs = trailer ? plan.futureState.trailers[trailer.id] : undefined;
            const at = Math.max(
              r.nowMs,
              r.earliestStartMs ?? r.nowMs,
              ts?.availableAt ?? r.nowMs,
              ds?.availableAt ?? r.nowMs,
              trs?.availableAt ?? r.nowMs,
            );
            const checks = assignmentReasons(
              job,
              truck,
              driver,
              trailer,
              plan.futureState,
              at,
              constraint,
            );
            if (checks.blockers.length) {
              search.cheapRejected++;
              checks.blockers.forEach(note);
              continue;
            }
            if (
              (first.windowEndAt && at > Date.parse(first.windowEndAt)) ||
              at >= r.horizonEndMs
            ) {
              search.cheapRejected++;
              note({ code: "PICKUP_OR_HORIZON_INFEASIBLE", jobId: job.id });
              continue;
            }
            const position = ts.position!,
              lowerDistance = haversineM(position.point, [
                first.lat,
                first.lng,
              ]);
            bucket.push({
              job,
              assignment,
              at,
              warnings: checks.warnings,
              lowerDistance,
            });
            const waitStart = Math.max(
              at,
              Date.parse(first.windowStartAt ?? job.plannedDepartureAt ?? ""),
            );
            if (Number.isFinite(waitStart) && waitStart > at)
              bucket.push({
                job,
                assignment,
                at: waitStart,
                warnings: checks.warnings,
                lowerDistance,
              });
          }
      bucket.sort(
        (a, b) =>
          a.lowerDistance - b.lowerDistance ||
          a.at - b.at ||
          tupleKey(a.assignment).localeCompare(tupleKey(b.assignment)),
      );
      if (bucket.length) buckets.push(bucket);
    }
    buckets.sort(
      (a, b) =>
        Date.parse(a[0].job.stops[0]?.windowEndAt ?? "9999-01-01") -
          Date.parse(b[0].job.stops[0]?.windowEndAt ?? "9999-01-01") ||
        a[0].lowerDistance - b[0].lowerDistance ||
        a[0].job.id.localeCompare(b[0].job.id),
    );
    const out: Extension[] = [];
    for (
      let i = 0;
      out.length < policy.extensionsPerState &&
      buckets.some((b) => i < b.length);
      i++
    )
      for (const b of buckets) {
        if (out.length >= policy.extensionsPerState) break;
        if (b[i]) out.push(b[i]);
      }
    if (buckets.reduce((s, b) => s + b.length, 0) > out.length) {
      search.truncated = true;
      note({ code: "SEARCH_SHORTLIST_LIMIT" });
    }
    return out;
  }

  async function extend(
    plan: OperationalPlan,
    x: Extension,
  ): Promise<OperationalPlan[]> {
    search.evaluatedExtensions++;
    const { job, assignment } = x,
      stops = [...job.stops].sort((a, b) => a.sequence - b.sequence),
      state = plan.futureState;
    const baseline = state.drivers[assignment.driverId].driving ?? {
      drivenTodaySec: 0,
      weekSec: 0,
      known: false,
    };
    const driving = idleDriving(
      baseline,
      (x.at - state.drivers[assignment.driverId].availableAt) / 1000,
    );
    const execution: JobExecution = {
      jobId: job.id,
      jobRevision: job.revision,
      assignment,
      startMs: x.at,
      pickupMs: x.at,
      endMs: x.at,
      movements: [],
      waitsSec: 0,
      serviceSec: 0,
      drivingAtStart: structuredClone(driving),
      drivingAfter: structuredClone(driving),
      reasons: [
        ...x.warnings,
        { code: "RESOURCE_CAPACITY_AND_EQUIPMENT_COMPATIBLE", jobId: job.id },
        {
          code: "RESOURCE_ORIGIN",
          jobId: job.id,
          resourceId: assignment.truckId,
          data: { source: state.trucks[assignment.truckId].position!.source },
        },
      ],
    };
    if (constraints.has(job.id))
      execution.reasons.push({ code: "OVERRIDE_APPLIED", jobId: job.id });
    if (driving.drivenTodaySec !== baseline.drivenTodaySec)
      execution.reasons.push({
        code: "DAILY_REST_PLANNED_BEFORE_DEPARTURE",
        jobId: job.id,
      });
    let partial: PartialExecution[] = [{ execution, driving, at: x.at }];
    const origin = state.trucks[assignment.truckId].position!.point,
      first: [number, number] = [stops[0].lat, stops[0].lng];
    if (haversineM(origin, first) > 1) {
      const options = await route(
        job,
        assignment,
        "EMPTY",
        origin,
        first,
        x.at,
        driving,
      );
      partial = options.map((m) => ({
        execution: {
          ...execution,
          movements: [m],
          reasons: [
            ...execution.reasons,
            ...(m.report.status === "POTENTIALLY_AFFECTED"
              ? [
                  {
                    code: "EMPTY_MOVEMENT_APPLICABILITY_UNKNOWN",
                    jobId: job.id,
                  },
                ]
              : []),
          ],
        },
        driving: advanceDrivingByStops(
          driving,
          m.route.durationSec,
          m.evaluationInput.route.timing!.stops,
        ),
        at: m.arrivalMs,
      }));
    }
    for (let i = 0; i < stops.length && partial.length; i++) {
      const stop = stops[i],
        next: PartialExecution[] = [];
      for (const p of partial) {
        const start = Math.max(
          p.at,
          Date.parse(stop.windowStartAt ?? "") || p.at,
          i === 0 ? Date.parse(job.plannedDepartureAt ?? "") || p.at : p.at,
        );
        const end = stop.windowEndAt ? Date.parse(stop.windowEndAt) : undefined;
        if (
          !Number.isFinite(start) ||
          (end !== undefined && (!Number.isFinite(end) || start > end))
        ) {
          note({
            code: "STOP_WINDOW_MISSED",
            jobId: job.id,
            data: { stopId: stop.id },
          });
          continue;
        }
        const wait = (start - p.at) / 1000,
          service =
            job.operationalRequirements?.serviceSecByStop?.[stop.id] ?? 0;
        if (!Number.isFinite(service) || service < 0) {
          note({ code: "INVALID_SERVICE_DURATION", jobId: job.id });
          continue;
        }
        const d = idleDriving(p.driving, wait),
          e: JobExecution = {
            ...p.execution,
            reasons: [...p.execution.reasons],
            waitsSec: p.execution.waitsSec + wait,
            serviceSec: p.execution.serviceSec + service,
            pickupMs: i === 0 ? start : p.execution.pickupMs,
            endMs: Math.ceil(start + service * 1000),
          };
        if (
          job.operationalRequirements?.serviceSecByStop?.[stop.id] === undefined
        )
          e.reasons.push({
            code: "SERVICE_DURATION_UNKNOWN",
            jobId: job.id,
            data: { stopId: stop.id },
          });
        if (
          !stop.windowStartAt &&
          !stop.windowEndAt &&
          (stop.scheduledTime || stop.windowEnd)
        )
          e.reasons.push({
            code: "STOP_WINDOW_DATE_UNKNOWN",
            jobId: job.id,
            data: { stopId: stop.id },
          });
        if (wait >= 11 * 3600)
          e.reasons.push({
            code: "DAILY_REST_PLANNED_DURING_IDLE",
            jobId: job.id,
          });
        if (i === stops.length - 1) {
          next.push({ execution: e, driving: d, at: e.endMs });
          continue;
        }
        const to: [number, number] = [stops[i + 1].lat, stops[i + 1].lng],
          from: [number, number] = [stop.lat, stop.lng];
        if (haversineM(from, to) < 1) {
          next.push({ execution: e, driving: d, at: e.endMs });
          continue;
        }
        for (const m of await route(
          job,
          assignment,
          "LOADED",
          from,
          to,
          e.endMs,
          d,
        )) {
          const reasons = [...e.reasons];
          if (m.report.status === "POTENTIALLY_AFFECTED")
            reasons.push({
              code: "BASE_OR_LEGAL_APPLICABILITY_UNKNOWN",
              jobId: job.id,
              data: {
                regulationIds: m.report.results
                  .filter((rr) => rr.outcome === "UNKNOWN")
                  .map((rr) => rr.regulationId),
              },
            });
          if (
            m.route.tollDataQuality === "estimated" ||
            m.route.tollDataQuality === "mixed" ||
            m.route.tollDataQuality === "unpriced_sections"
          )
            reasons.push({
              code: "COST_ESTIMATE_OR_UNPRICED_COMPONENT",
              jobId: job.id,
            });
          if (
            stops[i + 1].windowEndAt &&
            m.evaluationInput.route.timing &&
            m.evaluationInput.route.timing.arrivalLatestMs >
              Date.parse(stops[i + 1].windowEndAt!)
          )
            reasons.push({ code: "ETA_MARGIN_AT_RISK", jobId: job.id });
          next.push({
            execution: { ...e, movements: [...e.movements, m], reasons },
            driving: advanceDrivingByStops(
              d,
              m.route.durationSec,
              m.evaluationInput.route.timing!.stops,
            ),
            at: m.arrivalMs,
          });
        }
      }
      partial = next
        .sort(
          (a, b) =>
            a.at - b.at ||
            a.execution.movements.reduce(
              (s, m) => s + m.route.fuelCostEur + m.route.tollCostEur,
              0,
            ) -
              b.execution.movements.reduce(
                (s, m) => s + m.route.fuelCostEur + m.route.tollCostEur,
                0,
              ),
        )
        .slice(0, policy.maxAlternatives);
    }
    return partial.flatMap((p) => {
      if (
        p.at > r.horizonEndMs ||
        !p.execution.movements.some((m) => m.kind === "LOADED")
      ) {
        note({ code: "HORIZON_OR_LOADED_ROUTE_UNAVAILABLE", jobId: job.id });
        return [];
      }
      const driver = r.drivers.find((d) => d.id === assignment.driverId)!;
      if (
        driverQualifications(driver, new Date(p.at)).some(
          (q) =>
            q.state === "EXPIRED" &&
            (q.kind !== "adr" || job.cargoType === "hazmat" || !!job.adrClass),
        )
      ) {
        note({
          code: "QUALIFICATION_EXPIRES_BEFORE_COMPLETION",
          jobId: job.id,
        });
        return [];
      }
      const last = stops.at(-1)!,
        futureState = structuredClone(state),
        position = {
          point: [last.lat, last.lng] as [number, number],
          source: `PLANNED_JOB:${job.id}`,
        };
      futureState.trucks[assignment.truckId] = { availableAt: p.at, position };
      futureState.drivers[assignment.driverId] = {
        availableAt: p.at,
        position,
        driving: p.driving,
      };
      if (assignment.trailerId)
        futureState.trailers[assignment.trailerId] = {
          availableAt: p.at,
          position,
        };
      const e = {
          ...p.execution,
          endMs: p.at,
          drivingAfter: structuredClone(p.driving),
          reasons: [
            ...p.execution.reasons,
            {
              code: "TIMELINE_AND_KNOWN_RESTRICTIONS_EVALUATED",
              jobId: job.id,
              data: {
                driverId: assignment.driverId,
                truckId: assignment.truckId,
                datasetVersion: r.dataset.version,
              },
            },
          ],
        },
        executions = [...plan.executions, e];
      const trips: OperationalPlan["trips"] = [];
      for (const entry of executions) {
        let trip = trips.find(
          (t) => tupleKey(t.assignment) === tupleKey(entry.assignment),
        );
        if (!trip) {
          trip = { assignment: entry.assignment, jobIds: [] };
          trips.push(trip);
        }
        trip.jobIds.push(entry.jobId);
      }
      return [
        {
          ...plan,
          id: `plan-${fingerprint}-${hashString(canonicalJson(executions.map((v) => [v.jobId, v.assignment, v.startMs, v.movements.map((m) => m.route.id)])))}`,
          executions,
          trips,
          futureState,
          metrics: planMetrics(executions, jobs, economics),
          status: executions.some(
            (ex) =>
              ex.reasons.some((reason) =>
                /UNKNOWN|UNCONFIRMED|UNVERIFIED|AT_RISK/.test(reason.code),
              ) ||
              ex.movements.some(
                (m) => m.report.status === "POTENTIALLY_AFFECTED",
              ),
          )
            ? ("REVIEW_REQUIRED" as const)
            : ("FEASIBLE" as const),
        },
      ];
    });
  }

  /** Optimistic remaining coverage, before cost: a cheap prefix must not strand a
   * pickup that another sequence can still serve. No provider calls, travel-time
   * promises or assumed relocations; ignoring colocation makes this an upper bound.
   * This only ranks the bounded beam, never certifies remaining route feasibility.
   */
  function potentialCoverage(plan: OperationalPlan): number {
    let possible = plan.executions.length;
    for (const job of jobs) {
      if (plan.executions.some((e) => e.jobId === job.id)) continue;
      const first = [...job.stops].sort((a, b) => a.sequence - b.sequence)[0];
      const deadline = first?.windowEndAt
        ? Date.parse(first.windowEndAt)
        : r.horizonEndMs;
      const constraint = constraints.get(job.id);
      let canServe = false;
      for (const truck of r.trucks) {
        for (const driver of r.drivers) {
          for (const trailer of [undefined, ...r.trailers]) {
            const at = Math.max(
              r.nowMs,
              r.earliestStartMs ?? r.nowMs,
              plan.futureState.trucks[truck.id]?.availableAt ?? r.nowMs,
              plan.futureState.drivers[driver.id]?.availableAt ?? r.nowMs,
              trailer
                ? (plan.futureState.trailers[trailer.id]?.availableAt ??
                    r.nowMs)
                : r.nowMs,
            );
            if (at > deadline || at >= r.horizonEndMs) continue;
            const checks = assignmentReasons(
              job,
              truck,
              driver,
              trailer,
              plan.futureState,
              at,
              constraint,
            );
            if (checks.blockers.some((b) => b.code !== "RESOURCE_NOT_AT_TRUCK"))
              continue;
            canServe = true;
            break;
          }
          if (canServe) break;
        }
        if (canServe) break;
      }
      if (canServe) possible++;
    }
    return possible;
  }

  let beam = [initial];
  const completed: OperationalPlan[] = [];
  for (let depth = 0; depth < jobs.length; depth++) {
    const next: OperationalPlan[] = [];
    for (const p of beam) {
      await r.yieldControl?.();
      if (r.signal?.aborted)
        throw new DOMException("Planning cancelled", "AbortError");
      const candidates = extensions(p);
      let expanded = false;
      for (const x of candidates) {
        await r.yieldControl?.();
        if (r.signal?.aborted)
          throw new DOMException("Planning cancelled", "AbortError");
        const plans = await extend(p, x);
        next.push(...plans);
        if (plans.length) expanded = true;
        if (search.routeRequests >= policy.maxRouteRequests) break;
      }
      if (!expanded && p.executions.length) completed.push(p);
    }
    if (!next.length) break;
    const unique = [...new Map(next.map((p) => [p.id, p])).values()];
    const potential = new Map(unique.map((p) => [p.id, potentialCoverage(p)]));
    unique.sort(
      (a, b) =>
        potential.get(b.id)! - potential.get(a.id)! || comparePlans(a, b),
    );
    if (unique.length > policy.beamWidth) {
      search.truncated = true;
      note({
        code: "BEAM_LIMIT",
        data: { discarded: unique.length - policy.beamWidth },
      });
    }
    beam = unique.slice(0, policy.beamWidth);
    completed.push(...beam);
  }
  const ranked = [
    ...new Map(
      completed.filter((p) => p.executions.length).map((p) => [p.id, p]),
    ).values(),
  ].sort(comparePlans);
  const best = ranked[0] ?? null;
  const comparable = ranked.filter(
    (p) => best && p.executions.length === best.executions.length,
  );
  const alternatives: OperationalPlan[] = [];
  const uncertaintySignature = (p: OperationalPlan) =>
    canonicalJson(
      p.executions
        .map((e) => ({
          jobId: e.jobId,
          reasons: e.reasons
            .filter((v) =>
              /UNKNOWN|UNCONFIRMED|UNVERIFIED|UNCERTAIN|AT_RISK/.test(v.code),
            )
            .map((v) => v.code)
            .sort(),
          legal: e.movements
            .flatMap((m) =>
              m.report.results
                .filter(
                  (v) => v.effect !== "advisory" && v.outcome === "UNKNOWN",
                )
                .map((v) => v.regulationId),
            )
            .sort(),
        }))
        .sort((a, b) => a.jobId.localeCompare(b.jobId)),
    );
  const immaterial = (a: OperationalPlan, b: OperationalPlan) =>
    uncertaintySignature(a) === uncertaintySignature(b) &&
    Math.abs(a.metrics.generalizedCostEur - b.metrics.generalizedCostEur) < 5 &&
    Math.abs(a.metrics.directCostEur - b.metrics.directCostEur) < 5 &&
    Math.abs(a.metrics.emptyKm - b.metrics.emptyKm) < 1 &&
    Math.abs(
      a.metrics.totalDrivingSec +
        a.metrics.restSec +
        a.metrics.breakSec +
        a.metrics.waitingSec +
        a.metrics.serviceSec -
        b.metrics.totalDrivingSec -
        b.metrics.restSec -
        b.metrics.breakSec -
        b.metrics.waitingSec -
        b.metrics.serviceSec,
    ) < 300 &&
    Math.abs(
      Math.max(...a.executions.map((e) => e.endMs)) -
        Math.max(...b.executions.map((e) => e.endMs)),
    ) < 300 &&
    a.status === b.status;
  for (const p of comparable) {
    if (p === best) continue;
    if (alternatives.length >= policy.maxAlternatives - 1) break;
    if (comparable.some((a) => a !== p && operationallyDominates(a, p))) {
      note({ code: "OPERATIONALLY_DOMINATED", data: { planId: p.id } });
      continue;
    }
    if (best && [best, ...alternatives].some((a) => immaterial(a, p))) {
      note({ code: "IMMATERIAL_RESOURCE_PERMUTATION", data: { planId: p.id } });
      continue;
    }
    alternatives.push({
      ...p,
      reasons: [...p.reasons, { code: "MATERIAL_FLEET_PLAN_TRADEOFF" }],
    });
    if (alternatives.length >= policy.maxAlternatives - 1) break;
  }
  if (best)
    best.reasons = [
      ...best.reasons,
      {
        code: "PREFERRED_SERVED_DEMAND_AND_DATA_CONFIDENCE_THEN_COST",
        data: {
          servedJobs: best.executions.length,
          emptyKm: best.metrics.emptyKm,
          generalizedCostEur: best.metrics.generalizedCostEur,
        },
      },
      { code: "BOUNDED_SEARCH_NOT_GLOBAL_OPTIMUM" },
      { code: "COVERAGE_PARTIAL_UNLESS_SEPARATELY_VERIFIED" },
      ...(best.metrics.revenueEur === null
        ? [{ code: "REVENUE_UNKNOWN_NO_PROFIT_CLAIM" }]
        : []),
    ];
  for (const c of r.constraints ?? [])
    if (
      !r.jobs.some((j) => j.id === c.jobId) ||
      !jobs.some((j) => j.id === c.jobId)
    )
      note({ code: "OVERRIDE_OUTSIDE_MUTABLE_SCOPE", jobId: c.jobId });
  return {
    recommended: best,
    alternatives,
    unassignedJobIds: jobs
      .filter((j) => !best?.executions.some((e) => e.jobId === j.id))
      .map((j) => j.id),
    diagnostics: [...diagnosticMap.values()],
    search,
  };
}
