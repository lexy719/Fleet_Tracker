import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { BENCH_SIZES, bragancaInstance } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { onRealRoads, withRealFuel } from "../bench/realRoads";
import { dispatcherPlan } from "../greedy";
import type { Instance, Travel } from "../model";
import { solveWeek } from "../solver";
import { withSlack } from "../travelMatrix";

/**
 * A) Slack: plans made on engine times with 0–20 % slack, then driven on "real days" where every
 *    leg varies (log-normal ±12 %, 1 in 10 legs +30 % for traffic or works). How many weeks break?
 * B) Fuel: real pump prices (DGEG/MITECO). Gain of smart refuelling alone, and of an assignment
 *    that knows where each crew will refuel.
 *   FUEL=1 FUEL_OUT=<file.json> npx vitest run src/assignment/__tests__/fuelslack.probe.test.ts
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
/** A "real day": each pair gets its own fixed multiplier, drawn once per seed. */
function realDay(travel: Travel, seed: number): Travel {
  const r = rng(seed), memo = new Map<string, number>();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return (a, b) => {
    const k = `${a}|${b}`;
    let m = memo.get(k);
    if (m === undefined) {
      m = Math.min(1.6, Math.max(0.85, Math.exp(0.12 * gauss()))) * (r() < 0.1 ? 1.3 : 1);
      memo.set(k, m);
    }
    const l = travel(a, b);
    return { km: l.km, sec: l.sec * m };
  };
}

it.skipIf(!process.env.FUEL)("slack and fuel on real roads", () => {
  const rows: unknown[] = [];
  for (const size of BENCH_SIZES.slice(0, 2)) {
    const real = withRealFuel(onRealRoads(bragancaInstance(size)));
    for (const slack of [0, 0.05, 0.1, 0.15, 0.2]) {
      const planned = solveWeek({ ...real, travel: withSlack(real.travel, slack, 10) }, { iterations: 300 });
      let broken = 0, lostLoads = 0;
      for (let day = 1; day <= 10; day++) {
        const s = scorePlan("x", { ...real, travel: realDay(real.travel, day * 31 + size.seed) }, planned, 0);
        broken += s.infeasibleRoutes;
        lostLoads += planned.routes.reduce((a, r) => a + r.loadIds.length, 0) - s.assigned;
      }
      const plain = scorePlan(`folga ${slack * 100}%`, real, planned, 0);
      rows.push({ exp: "A", size: size.name, slack, assigned: plain.assigned, loads: plain.loads, marginEur: plain.marginEur, brokenWeeksPer10Days: broken, lostLoadsPer10Days: lostLoads });
    }
  }
  const SLACK = 0.1;
  for (const size of BENCH_SIZES) {
    const real = withRealFuel(onRealRoads(bragancaInstance(size)));
    const plan = (inst: Instance) => solveWeek({ ...inst, travel: withSlack(inst.travel, SLACK, 10) }, { iterations: 1000 });
    const disp = dispatcherPlan({ ...real, travel: withSlack(real.travel, SLACK, 10) }, "nearest");
    const blind = plan({ ...real, fuel: undefined, costEurPerKm: 0.82 });
    const aware = plan(real);
    for (const [method, sol] of [["despachante", disp], ["v2 sem saber do gasóleo (€/km fixo)", blind], ["v2 a saber onde abastece", aware]] as const) {
      const s = scorePlan(method, real, sol, 0);
      rows.push({ exp: "B", size: size.name, method, assigned: s.assigned, loads: s.loads, emptyPct: s.emptyPct, marginEur: s.marginEur, fuelL: s.fuelL, fuelEur: s.fuelEur, fuelEurPerL: s.fuelEurPerL, naiveFuelEur: s.naiveFuelEur, violations: s.violations, infeasible: s.infeasibleRoutes });
    }
  }
  writeFileSync(process.env.FUEL_OUT ?? "fuel.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
