import { describe, expect, it } from "vitest";
import { BENCH_WEEK_START, HUBS } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { dispatcherPlan } from "../greedy";
import { syntheticTravel, type Crew, type Instance, type Load } from "../model";
import { planObjective, solveWeek } from "../solver";

/*
 * Random weeks, some with broken data, to try to break the search. Invariants on every plan:
 * no crash, each load at most once, every week feasible and legal, never worse than the
 * dispatcher it starts from, same plan for the same seed. FUZZ_N=<n> runs more weeks.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const H = 3_600_000, D = 24 * H, W = BENCH_WEEK_START;

function randomWeek(seed: number): Instance {
  const r = rng(seed), travel = syntheticTravel();
  const place = () => (r() < 0.85 ? HUBS[Math.floor(r() * HUBS.length)]! : { name: "ponto", at: [36.5 + r() * 7, -9.3 + r() * 6.5] as [number, number], country: r() < 0.5 ? "PT" as const : "ES" as const });
  const crews: Crew[] = Array.from({ length: Math.floor(r() * 12) }, (_, i) => {
    const home = place();
    const tired = r() < 0.2;
    return { id: `E${i}`, truckId: `T${i}`, driverId: `M${i}`, trailerId: `R${i}`, equipment: r() < 0.25 ? "REEFER" : "CURTAIN", homeName: home.name, home: home.at,
      start: r() < 0.8 ? home.at : place().at, availableFromMs: W + Math.floor(r() * 60) * H, homeByMs: W + (3 + r() * 3) * D,
      driving: tired ? { dayDriveSec: r() * 9 * 3600, continuousDriveSec: r() * 4.5 * 3600, weekDriveSec: r() * 56 * 3600, previousWeekDriveSec: r() * 34 * 3600 }
        : { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 0, previousWeekDriveSec: 0 } };
  });
  const loads: Load[] = Array.from({ length: Math.floor(r() * 50) }, (_, i) => {
    const a = place(), b = place();
    const ps = W + Math.floor(r() * 130) * H, pe = ps + Math.floor(r() * 12 - 1) * H; // sometimes inverted
    const ds = ps + Math.floor(r() * 30) * H;
    const broken = r() < 0.05;
    return { id: `C${i}`, fromName: a.name, toName: b.name, from: broken ? [NaN, b.at[1]] : a.at, to: b.at, fromCountry: a.country, toCountry: b.country,
      pickupStartMs: ps, pickupEndMs: pe, deliveryStartMs: ds, deliveryEndMs: ds + Math.floor(r() * 40 - 2) * H,
      pickupServiceSec: Math.floor(r() * 3) * 1800, deliveryServiceSec: Math.floor(r() * 3) * 1800, equipment: r() < 0.25 ? "REEFER" : "CURTAIN",
      weightKg: 20_000, rateEur: r() < 0.03 ? -100 : Math.round(150 + 1.3 * travel(a.at, b.at).km * (0.5 + r())) };
  });
  return { name: `fuzz-${seed}`, weekStartMs: W, crews, loads, travel, costEurPerKm: 0.5 + r() * 0.6 };
}

describe("fuzz: random weeks cannot break the search", () => {
  const n = Number(process.env.FUZZ_N ?? 40);
  it(`${n} random weeks keep every invariant`, () => {
    for (let seed = 1; seed <= n; seed++) {
      const inst = randomWeek(seed);
      const sol = solveWeek(inst, { iterations: 60, seed });
      const ids = [...sol.routes.flatMap((x) => x.loadIds), ...sol.unassigned].sort();
      expect(ids, inst.name).toEqual(inst.loads.map((l) => l.id).sort());
      const score = scorePlan("v2", inst, sol, 0);
      expect(score.infeasibleRoutes, inst.name).toBe(0);
      expect(score.violations, inst.name).toEqual({});
      expect(planObjective(inst, sol), inst.name).toBeLessThanOrEqual(planObjective(inst, dispatcherPlan(inst, "nearest")) + 1e-6);
      expect(solveWeek(inst, { iterations: 60, seed }), inst.name).toEqual(sol);
    }
  }, 600_000);
});
