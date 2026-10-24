import { validateDriverTimeline, type RuleCode } from "../../legal/driverLegality";
import { fuelPlan, weekCostEur } from "../costs";
import { scheduleRoute } from "../crewSchedule";
import type { Instance, Solution } from "../model";

/*
 * Scores a plan the same way for every method: re-times each crew's week from scratch (with the
 * activity timeline recorded), prices it with the instance's cost model and audits it with the
 * independent legality checker. Idle crews count too (a crew away from home still drives back).
 */

export type PlanScore = {
  method: string;
  instance: string;
  assigned: number;
  loads: number;
  crewsUsed: number;
  loadedKm: number;
  emptyKm: number;
  emptyPct: number;
  revenueEur: number;
  costEur: number;
  marginEur: number;
  driveH: number;
  /** With a fuel model: litres bought and what they cost (smart refuelling), and the naive alternative. */
  fuelL?: number;
  fuelEur?: number;
  fuelEurPerL?: number;
  naiveFuelEur?: number;
  /** Routes that could not be re-timed (window missed, limits, not home in time). */
  infeasibleRoutes: number;
  /** Legal audit of every crew's week (Reg. 561/2006, Dir. 2002/15). */
  violations: Partial<Record<RuleCode, number>>;
  runtimeMs: number;
};

export function scorePlan(method: string, inst: Instance, sol: Solution, runtimeMs: number): PlanScore {
  const byId = new Map(inst.loads.map((l) => [l.id, l]));
  const loadsOf = new Map(sol.routes.map((r) => [r.crewId, r.loadIds]));
  for (const r of sol.routes) if (!inst.crews.some((c) => c.id === r.crewId)) throw new Error(`Unknown crew ${r.crewId}`);
  const seen = new Set<string>();
  for (const id of sol.routes.flatMap((r) => r.loadIds)) {
    if (seen.has(id)) throw new Error(`Load ${id} assigned twice`);
    seen.add(id);
  }
  let loadedKm = 0, emptyKm = 0, revenueEur = 0, costEur = 0, driveSec = 0, infeasibleRoutes = 0, assigned = 0, crewsUsed = 0;
  let fuelL = 0, fuelEur = 0, naiveFuelEur = 0;
  const violations: PlanScore["violations"] = {};
  for (const crew of inst.crews) {
    const ids = loadsOf.get(crew.id) ?? [];
    const s = scheduleRoute(crew, ids.map((id) => byId.get(id)!), inst.travel, true);
    if (!s) {
      if (ids.length) infeasibleRoutes++;
      continue;
    }
    if (ids.length) crewsUsed++;
    assigned += ids.length;
    loadedKm += s.loadedKm;
    emptyKm += s.emptyKm;
    revenueEur += s.revenueEur;
    costEur += weekCostEur(inst, crew, s) + s.revenueEur;
    driveSec += s.driveSec;
    if (inst.fuel) {
      const smart = fuelPlan(inst.fuel, crew, s);
      fuelL += smart.litresBought;
      fuelEur += smart.costEur;
      naiveFuelEur += fuelPlan(inst.fuel, crew, s, "naive").costEur;
    }
    if (!ids.length) continue;
    const report = validateDriverTimeline(s.activities!, { afterWeeklyRestEndMs: crew.availableFromMs });
    for (const v of report.violations) violations[v.rule] = (violations[v.rule] ?? 0) + 1;
  }
  return {
    method,
    instance: inst.name,
    assigned,
    loads: inst.loads.length,
    crewsUsed,
    loadedKm: Math.round(loadedKm),
    emptyKm: Math.round(emptyKm),
    emptyPct: +((100 * emptyKm) / Math.max(1, loadedKm + emptyKm)).toFixed(1),
    revenueEur: Math.round(revenueEur),
    costEur: Math.round(costEur),
    marginEur: Math.round(revenueEur - costEur),
    driveH: +(driveSec / 3600).toFixed(1),
    ...(inst.fuel ? { fuelL: Math.round(fuelL), fuelEur: Math.round(fuelEur), fuelEurPerL: +(fuelEur / Math.max(1, fuelL)).toFixed(3), naiveFuelEur: Math.round(naiveFuelEur) } : {}),
    infeasibleRoutes,
    violations,
    runtimeMs: Math.round(runtimeMs),
  };
}
