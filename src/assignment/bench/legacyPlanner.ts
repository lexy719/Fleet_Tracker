import type { Driver, Job, Trailer, Truck } from "../../data/types";
import { createTrailer } from "../../domain/fleet/trailers";
import { fixturePosition, planningDriver, planningJob, planningTruck } from "../../domain/planning/fixtures";
import { planFleet } from "../../domain/planning/planner";
import type { PlanningRequest } from "../../domain/planning/types";
import { REGULATION_DATASET } from "../../regulations/repository";
import { iberianSyntheticRouter } from "../../sim/weekSimulation";
import type { Instance, Solution } from "../model";

/** Runs the current planner (planFleet) on a benchmark week, with the same synthetic roads. */
export async function legacyPlan(inst: Instance, search?: PlanningRequest["search"]): Promise<{ solution: Solution; mixedCrews: number; truncated: boolean }> {
  const trucks: Truck[] = [], drivers: Driver[] = [], trailers: Trailer[] = [];
  const initialState: NonNullable<PlanningRequest["initialState"]> = { trucks: {}, drivers: {}, trailers: {} };
  for (const c of inst.crews) {
    trucks.push({ ...planningTruck(c.truckId), vehicleType: "TRACTOR", axleCountScope: "POWER_UNIT", bodyType: undefined });
    drivers.push(planningDriver(c.driverId, inst.weekStartMs));
    const t = createTrailer({ plate: c.trailerId, type: c.equipment === "REEFER" ? "REFRIGERATED" : "CURTAINSIDER", availability: "AVAILABLE", payloadKg: 27_000, palletCapacity: 33, axleCount: 3, heightM: 4, lengthM: 13.6, widthM: 2.55,
      capabilities: { adrSuitable: false, ...(c.equipment === "REEFER" ? { refrigerated: true, tempMinC: -20, tempMaxC: 10 } : {}) } }, { id: c.trailerId, now: new Date(inst.weekStartMs), others: [] });
    if (!t.ok) throw new Error(t.errors.join("; "));
    trailers.push(t.value.trailer);
    const pos = fixturePosition(c.start);
    initialState.trucks![c.truckId] = { availableAt: c.availableFromMs, position: pos };
    initialState.drivers![c.driverId] = { availableAt: c.availableFromMs, position: pos, driving: { drivenTodaySec: 0, continuousSec: 0, weekSec: 0, known: true } };
    initialState.trailers![c.trailerId] = { availableAt: c.availableFromMs, position: pos };
  }
  const jobs: Job[] = inst.loads.map((l) => {
    const j = planningJob(l.id, l.from, l.to, inst.weekStartMs, l.equipment === "REEFER" ? "refrigerated" : "dry", l.weightKg);
    j.rateEur = l.rateEur;
    j.stops[0]!.windowStartAt = new Date(l.pickupStartMs).toISOString();
    j.stops[0]!.windowEndAt = new Date(l.pickupEndMs).toISOString();
    j.stops[1]!.windowStartAt = new Date(l.deliveryStartMs).toISOString();
    j.stops[1]!.windowEndAt = new Date(l.deliveryEndMs).toISOString();
    if (l.equipment === "REEFER") j.tempTargetC = { min: 0, max: 5 };
    j.operationalRequirements = { trailerRequired: true, trailerTypes: [l.equipment === "REEFER" ? "REFRIGERATED" : "CURTAINSIDER"],
      serviceSecByStop: { [j.stops[0]!.id]: l.pickupServiceSec, [j.stops[1]!.id]: l.deliveryServiceSec } };
    return j;
  });
  const res = await planFleet({ jobs, trucks, drivers, trailers, initialState, nowMs: inst.weekStartMs, horizonEndMs: inst.weekStartMs + 5 * 86400_000 + 8 * 3600_000,
    dataset: REGULATION_DATASET, route: iberianSyntheticRouter(), ...(search ? { search } : {}) });
  const byTruck = new Map<string, string[]>();
  let mixedCrews = 0;
  for (const e of res.recommended?.executions ?? []) {
    const crew = inst.crews.find((c) => c.truckId === e.assignment.truckId)!;
    if (crew.driverId !== e.assignment.driverId || crew.trailerId !== e.assignment.trailerId) mixedCrews++;
    byTruck.set(crew.id, [...(byTruck.get(crew.id) ?? []), e.jobId]);
  }
  return {
    solution: { routes: [...byTruck.entries()].map(([crewId, loadIds]) => ({ crewId, loadIds })), unassigned: res.unassignedJobIds },
    mixedCrews,
    truncated: res.search.truncated,
  };
}
