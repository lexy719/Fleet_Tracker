import type { Job } from "../../data/types";
import type {
  Economics,
  JobExecution,
  OperationalPlan,
  PlanMetrics,
  PlanningReason,
} from "./types";

export function planMetrics(
  executions: JobExecution[],
  jobs: Job[],
  policy: Economics,
): PlanMetrics {
  const movements = executions.flatMap((e) => e.movements);
  const sum = (f: (m: (typeof movements)[number]) => number) =>
    movements.reduce((s, m) => s + f(m), 0);
  const loadedKm = sum((m) =>
      m.kind === "LOADED" ? m.route.distanceM / 1000 : 0,
    ),
    emptyKm = sum((m) => (m.kind === "EMPTY" ? m.route.distanceM / 1000 : 0));
  const loadedDrivingSec = sum((m) =>
      m.kind === "LOADED" ? m.route.durationSec : 0,
    ),
    emptyDrivingSec = sum((m) =>
      m.kind === "EMPTY" ? m.route.durationSec : 0,
    );
  const providerFuelTollEur = sum(
    (m) => m.route.fuelCostEur + m.route.tollCostEur,
  );
  const waitingSec = executions.reduce((s, e) => s + e.waitsSec, 0),
    serviceSec = executions.reduce((s, e) => s + e.serviceSec, 0),
    restSec = sum((m) => m.restSec),
    breakSec = sum((m) => m.breakSec);
  const nonFuelEur = (loadedKm + emptyKm) * policy.nonFuelEurPerKm;
  const directCostEur = providerFuelTollEur + nonFuelEur;
  const opportunityCostEur =
    ((loadedDrivingSec +
      emptyDrivingSec +
      waitingSec +
      serviceSec +
      restSec +
      breakSec) /
      3600) *
    policy.opportunityEurPerHour;
  const prices = executions.map(
    (e) => jobs.find((j) => j.id === e.jobId)?.rateEur,
  );
  const revenueEur = prices.every(
    (p) => p !== undefined && Number.isFinite(p) && p > 0,
  )
    ? prices.reduce<number>((s, p) => s + p!, 0)
    : null;
  return {
    loadedKm,
    emptyKm,
    totalKm: loadedKm + emptyKm,
    loadedDrivingSec,
    emptyDrivingSec,
    totalDrivingSec: loadedDrivingSec + emptyDrivingSec,
    waitingSec,
    serviceSec,
    restSec,
    breakSec,
    providerFuelTollEur,
    nonFuelEur,
    directCostEur,
    opportunityCostEur,
    generalizedCostEur: directCostEur + opportunityCostEur,
    revenueEur,
    contributionBeforeUnpricedCostsEur:
      revenueEur === null ? null : revenueEur - directCostEur,
  };
}

const uncertainty = (p: OperationalPlan) =>
  p.executions.reduce(
    (s, e) =>
      s +
      e.reasons.filter((r) =>
        /UNKNOWN|UNCONFIRMED|UNVERIFIED|UNCERTAIN|AT_RISK/.test(r.code),
      ).length,
    0,
  );
/** Demand served first; no claimed contribution margin where revenue/cost components are unknown. */
export function comparePlans(a: OperationalPlan, b: OperationalPlan): number {
  return (
    b.executions.length - a.executions.length ||
    uncertainty(a) - uncertainty(b) ||
    a.metrics.generalizedCostEur -
      b.metrics.generalizedCostEur +
      (b.metrics.revenueEur !== null && a.metrics.revenueEur !== null
        ? b.metrics.revenueEur - a.metrics.revenueEur
        : 0) ||
    a.metrics.emptyKm - b.metrics.emptyKm ||
    Math.max(0, ...a.executions.map((e) => e.endMs)) -
      Math.max(0, ...b.executions.map((e) => e.endMs)) ||
    a.id.localeCompare(b.id)
  );
}

/** Full horizon comparison, rather than a duration cutoff on isolated routes. */
export function operationallyDominates(
  a: OperationalPlan,
  b: OperationalPlan,
): boolean {
  const ids = new Set(a.executions.map((e) => e.jobId));
  return (
    b.executions.every((e) => ids.has(e.jobId)) &&
    uncertainty(a) <= uncertainty(b) &&
    a.metrics.generalizedCostEur <= b.metrics.generalizedCostEur &&
    a.metrics.emptyKm <= b.metrics.emptyKm &&
    (a.executions.length > b.executions.length ||
      a.metrics.generalizedCostEur < b.metrics.generalizedCostEur ||
      a.metrics.emptyKm < b.metrics.emptyKm)
  );
}

export function overrideImpact(
  normal: OperationalPlan | null,
  constrained: OperationalPlan | null,
): PlanningReason[] {
  if (!constrained) return [{ code: "OVERRIDE_INFEASIBLE" }];
  if (!normal)
    return [{ code: "OVERRIDE_APPLIED_WITHOUT_COMPARABLE_BASELINE" }];
  return [
    {
      code: "OVERRIDE_IMPACT",
      data: {
        additionalGeneralizedCostEur:
          constrained.metrics.generalizedCostEur -
          normal.metrics.generalizedCostEur,
        additionalEmptyKm: constrained.metrics.emptyKm - normal.metrics.emptyKm,
        additionalResourceHours:
          (constrained.metrics.totalDrivingSec +
            constrained.metrics.waitingSec +
            constrained.metrics.restSec +
            constrained.metrics.breakSec -
            normal.metrics.totalDrivingSec -
            normal.metrics.waitingSec -
            normal.metrics.restSec -
            normal.metrics.breakSec) /
          3600,
        jobsLost: normal.executions.length - constrained.executions.length,
      },
    },
  ];
}
