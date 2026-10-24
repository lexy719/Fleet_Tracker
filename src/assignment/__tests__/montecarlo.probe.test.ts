import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { bragancaInstance } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { dispatcherPlan } from "../greedy";
import { solveWeek } from "../solver";

/**
 * Many weeks per size: v2 against the nearest-crew dispatcher, plus one very large week for runtime.
 *   MC=1 MC_OUT=<file.json> npx vitest run src/assignment/__tests__/montecarlo.probe.test.ts
 */
it.skipIf(!process.env.MC)("v2 vs dispatcher over many weeks", () => {
  const rows: unknown[] = [];
  for (const [size, crews, seeds, iterations] of [["S", 10, 30, 500], ["M", 30, 15, 500]] as const)
    for (let seed = 1; seed <= seeds; seed++) {
      const inst = bragancaInstance({ name: `${size}-${seed}`, crews, loadsPerCrew: 4.5, seed: 5000 + seed * 13 + crews });
      const d = scorePlan("despachante", inst, dispatcherPlan(inst, "nearest"), 0);
      const t0 = performance.now();
      const v = scorePlan("v2", inst, solveWeek(inst, { iterations }), performance.now() - t0);
      rows.push({ size, seed, loads: inst.loads.length, dLoads: d.assigned, vLoads: v.assigned, dEmptyPct: d.emptyPct, vEmptyPct: v.emptyPct,
        dMargin: d.marginEur, vMargin: v.marginEur, vMs: v.runtimeMs, violations: Object.keys(v.violations).length + v.infeasibleRoutes });
    }
  // Stress: 300 crews, 1 350 loads, construction + 100 iterations.
  const big = bragancaInstance({ name: "XL", crews: 300, loadsPerCrew: 4.5, seed: 4242 });
  const d = scorePlan("despachante", big, dispatcherPlan(big, "nearest"), 0);
  const t0 = performance.now();
  const v = scorePlan("v2", big, solveWeek(big, { iterations: 100, timeLimitMs: 60_000 }), performance.now() - t0);
  rows.push({ size: "XL", seed: 4242, loads: big.loads.length, dLoads: d.assigned, vLoads: v.assigned, dEmptyPct: d.emptyPct, vEmptyPct: v.emptyPct,
    dMargin: d.marginEur, vMargin: v.marginEur, vMs: v.runtimeMs, violations: Object.keys(v.violations).length + v.infeasibleRoutes });
  writeFileSync(process.env.MC_OUT ?? "mc.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
