import type { Job } from "../../data/types";
import type { OperationalPlan, JobExecution } from "../planning/types";
import { canonicalJson } from "../../regulations/decisionInputs";
import type { Tri } from "../../regulations/types";
import { buildExecutionTimeline } from "./executionTimeline";
import { type Feasibility, type OperationalValue } from "./values";

export type NumericConsequence = {
  before: number | null;
  after: number | null;
  delta: number | null;
};
const delta = (
  before: number | null,
  after: number | null,
): NumericConsequence => ({
  before,
  after,
  delta: before === null || after === null ? null : after - before,
});
const value = (v: OperationalValue<number> | undefined) =>
  v && v.status !== "UNKNOWN" ? v.value : null;
const sum = (
  p: OperationalPlan,
  f: (m: JobExecution["movements"][number]) => number | null,
): number | null => {
  const values = p.executions.flatMap((e) => e.movements).map(f);
  return values.every((v) => v !== null && Number.isFinite(v) && v >= 0)
    ? values.reduce<number>((s, v) => s + v!, 0)
    : null;
};
const toll = (m: JobExecution["movements"][number]) =>
  m.route.tollDataQuality === "unpriced_sections" ? null : m.route.tollCostEur;

function legal(e: JobExecution | undefined, job: Job | undefined): Feasibility {
  if (!e || !job) return "UNKNOWN";
  const timeline = buildExecutionTimeline(job, e);
  return timeline.status === "UNAVAILABLE" ? "UNKNOWN" : timeline.legalDriving;
}
function restrictionMap(e: JobExecution | undefined): Map<string, Tri> {
  const result = new Map<string, Tri>();
  for (const m of e?.movements ?? [])
    for (const r of m.report.results) {
      const key = r.regulationId,
        previous = result.get(key);
      // A restriction may be traversed on several movements; retain the strongest result.
      result.set(
        key,
        previous === "APPLIES" || r.outcome === "APPLIES"
          ? "APPLIES"
          : previous === "UNKNOWN" || r.outcome === "UNKNOWN"
            ? "UNKNOWN"
            : "DOES_NOT_APPLY",
      );
    }
  return result;
}

/** Structured consequences; never use independently stored totals/ETA labels as comparison inputs. */
export function compareOperationalPlans(
  before: OperationalPlan,
  after: OperationalPlan,
  jobs: Job[],
  previousJobs: Job[] = jobs,
) {
  const ids = [
    ...new Set([...before.executions, ...after.executions].map((e) => e.jobId)),
  ].sort();
  const byJob = (p: OperationalPlan, id: string) =>
    p.executions.find((e) => e.jobId === id);
  const timing = ids.map((jobId) => {
    const a = byJob(before, jobId),
      b = byJob(after, jobId);
    const aj = previousJobs.find((j) => j.id === jobId),
      bj = jobs.find((j) => j.id === jobId);
    const at = a && aj ? buildExecutionTimeline(aj, a) : null,
      bt = b && bj ? buildExecutionTimeline(bj, b) : null;
    const stopIds = [
      ...new Set(
        [...(at?.stops ?? []), ...(bt?.stops ?? [])].map((s) => s.stopId),
      ),
    ].sort();
    return {
      jobId,
      departureMs: delta(a?.startMs ?? null, b?.startMs ?? null),
      arrivalMs: delta(value(at?.end), value(bt?.end)),
      beforeStatus: at?.status ?? "UNAVAILABLE",
      afterStatus: bt?.status ?? "UNAVAILABLE",
      deliveryMarginsSec: stopIds.map((stopId) => ({
        stopId,
        ...delta(
          value(at?.stops.find((s) => s.stopId === stopId)?.deliveryMarginSec),
          value(bt?.stops.find((s) => s.stopId === stopId)?.deliveryMarginSec),
        ),
      })),
    };
  });
  const assignments = ids.map((jobId) => {
    const a = byJob(before, jobId)?.assignment ?? null,
      b = byJob(after, jobId)?.assignment ?? null;
    return {
      jobId,
      before: a ? { ...a } : null,
      after: b ? { ...b } : null,
      changed: canonicalJson(a) !== canonicalJson(b),
    };
  });
  const restrictions = ids.flatMap((jobId) => {
    const a = restrictionMap(byJob(before, jobId)),
      b = restrictionMap(byJob(after, jobId));
    return [...new Set([...a.keys(), ...b.keys()])]
      .sort()
      .map((regulationId) => ({
        jobId,
        regulationId,
        before: a.get(regulationId) ?? "UNKNOWN",
        after: b.get(regulationId) ?? "UNKNOWN",
      }));
  });
  return {
    timing,
    assignments,
    restrictions,
    distance: {
      totalM: delta(
        sum(before, (m) => m.route.distanceM),
        sum(after, (m) => m.route.distanceM),
      ),
      emptyM: delta(
        sum(before, (m) => (m.kind === "EMPTY" ? m.route.distanceM : 0)),
        sum(after, (m) => (m.kind === "EMPTY" ? m.route.distanceM : 0)),
      ),
    },
    cost: {
      tollEur: delta(sum(before, toll), sum(after, toll)),
      fuelEur: delta(
        sum(before, (m) => m.route.fuelCostEur),
        sum(after, (m) => m.route.fuelCostEur),
      ),
      includesAssumptions: [before, after].some((p) =>
        p.executions.some((e) =>
          e.movements.some(
            (m) =>
              !["priced", "none"].includes(m.route.tollDataQuality) ||
              m.route.fuelConsumptionL === undefined,
          ),
        ),
      ),
    },
    compliance: ids.map((jobId) => ({
      jobId,
      before: legal(
        byJob(before, jobId),
        previousJobs.find((j) => j.id === jobId),
      ),
      after: legal(
        byJob(after, jobId),
        jobs.find((j) => j.id === jobId),
      ),
    })),
    demand: {
      addedJobIds: ids.filter((id) => !byJob(before, id)),
      removedJobIds: ids.filter((id) => !byJob(after, id)),
    },
  };
}
export type PlanConsequences = ReturnType<typeof compareOperationalPlans>;
