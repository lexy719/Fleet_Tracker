import { appendLoad, initialState, returnHome, type CrewState } from "./crewSchedule";
import type { Instance, Solution } from "./model";

/*
 * What a dispatcher does by hand, as a baseline: take loads in pickup order and give each one to a
 * compatible crew that can still do it legally and be home by Saturday — the nearest one
 * ("nearest") or the one free soonest ("first free"). No look-ahead, no reshuffling.
 */

export function dispatcherPlan(inst: Instance, rule: "nearest" | "first_free"): Solution {
  const states = new Map<string, CrewState>(inst.crews.map((c) => [c.id, initialState(c)]));
  const unassigned: string[] = [];
  const loads = [...inst.loads].sort((a, b) => a.pickupStartMs - b.pickupStartMs || a.id.localeCompare(b.id));
  for (const load of loads) {
    let best: { crewId: string; next: CrewState; key: number } | null = null;
    for (const crew of inst.crews) {
      const s = states.get(crew.id)!;
      const next = appendLoad(s, load, inst.travel, crew);
      if (!next || !returnHome(next, crew, inst.travel)) continue;
      const key = rule === "nearest" ? next.emptyKm - s.emptyKm : s.t;
      if (!best || key < best.key || (key === best.key && crew.id < best.crewId)) best = { crewId: crew.id, next, key };
    }
    if (best) states.set(best.crewId, best.next);
    else unassigned.push(load.id);
  }
  return {
    routes: inst.crews.map((c) => ({ crewId: c.id, loadIds: states.get(c.id)!.loadIds })),
    unassigned,
  };
}
