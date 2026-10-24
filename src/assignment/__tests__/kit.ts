import { expect } from "vitest";
import { BENCH_WEEK_START } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { checkPins } from "../constraints";
import { syntheticTravel, type Crew, type Instance, type LatLng, type Load, type Pin, type Solution } from "../model";

/* Small hand-built weeks for the trap tests: places, crews, loads, and the invariants every plan must keep. */

export const H = 3_600_000, D = 24 * H, W = BENCH_WEEK_START; // Monday 2 Nov 2026, 06:00 Lisbon
export const P: Record<string, LatLng> = {
  Braganca: [41.806, -6.757], Mirandela: [41.485, -7.181], Porto: [41.185, -8.7], Madrid: [40.424, -3.561], Zamora: [41.5, -5.75],
  Valladolid: [41.652, -4.725], Burgos: [42.344, -3.697], Leon: [42.599, -5.567], Sevilla: [37.389, -5.985], Vigo: [42.241, -8.721],
  Zaragoza: [41.626, -0.962],
};
const ES = new Set(["Madrid", "Zamora", "Valladolid", "Burgos", "Leon", "Sevilla", "Vigo", "Zaragoza"]);
export const travel = syntheticTravel();

export function crew(id: string, home: string, over: Partial<Crew> = {}): Crew {
  return { id, truckId: `T-${id}`, driverId: `M-${id}`, trailerId: `R-${id}`, equipment: "CURTAIN", homeName: home, home: P[home]!, start: P[home]!,
    availableFromMs: W, homeByMs: W + 5 * D + 8 * H, driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 0, previousWeekDriveSec: 0 }, ...over };
}
/** Pickup window [fromH, toH] hours after Monday 06:00; delivery open until two days later. */
export function load(id: string, from: string, to: string, fromH: number, toH: number, over: Partial<Load> = {}): Load {
  return { id, fromName: from, toName: to, from: P[from]!, to: P[to]!, fromCountry: ES.has(from) ? "ES" : "PT", toCountry: ES.has(to) ? "ES" : "PT",
    pickupStartMs: W + fromH * H, pickupEndMs: W + toH * H, deliveryStartMs: W + fromH * H, deliveryEndMs: W + (toH + 48) * H,
    pickupServiceSec: 3600, deliveryServiceSec: 3600, equipment: "CURTAIN", weightKg: 20_000, rateEur: Math.round(150 + 1.3 * travel(P[from]!, P[to]!).km), ...over };
}
export const week = (crews: Crew[], loads: Load[]): Instance => ({ name: "armadilha", weekStartMs: W, crews, loads, travel, costEurPerKm: 0.77 });
export const done = (s: Solution) => s.routes.flatMap((r) => r.loadIds);
export const routeOf = (s: Solution, crewId: string) => s.routes.find((r) => r.crewId === crewId)?.loadIds ?? [];

/** Invariants every returned plan must keep: each load once, every week feasible and legal, pins kept, every undone load explained. */
export function checkPlan(inst: Instance, sol: Solution, pins: Pin[] = []) {
  const ids = [...done(sol), ...sol.unassigned].sort();
  expect(ids).toEqual(inst.loads.map((l) => l.id).sort());
  const score = scorePlan("v2", inst, sol, 0);
  expect(score.infeasibleRoutes).toBe(0);
  expect(score.violations).toEqual({});
  expect(checkPins(inst, sol, pins)).toEqual([]);
  for (const id of sol.unassigned) expect(sol.why?.[id]?.text, `porquê ${id}`).toBeTruthy();
}
