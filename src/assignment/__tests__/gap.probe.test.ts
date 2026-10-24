import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { bragancaInstance } from "../bench/bragancaInstance";
import { exactPlan } from "../bench/exact";
import { dispatcherPlan } from "../greedy";
import { planObjective, solveWeek } from "../solver";

/**
 * Distance to the optimum on small weeks (exact by enumeration). Opt-in:
 *   GAP=1 npx vitest run src/assignment/__tests__/gap.probe.test.ts   (GAP_OUT=<file.json> saves rows)
 */
it.skipIf(!process.env.GAP)("optimality gap on small weeks", () => {
  const rows: unknown[] = [];
  for (const [crews, perCrew] of [[2, 4], [3, 3], [4, 2.5]] as const)
    for (let seed = 1; seed <= 20; seed++) {
      const inst = bragancaInstance({ name: `XS-${crews}x${perCrew}-${seed}`, crews, loadsPerCrew: perCrew, seed: 1000 + seed * 7 + crews });
      const t0 = performance.now();
      const opt = exactPlan(inst);
      const tExact = performance.now() - t0;
      const t1 = performance.now();
      const v2 = solveWeek(inst, { iterations: 300 });
      const tV2 = performance.now() - t1;
      const disp = dispatcherPlan(inst, "nearest");
      const done = (s: { routes: { loadIds: string[] }[] }) => s.routes.reduce((a, r) => a + r.loadIds.length, 0);
      rows.push({ instance: inst.name, loads: inst.loads.length, optimum: Math.round(opt.objective), v2: Math.round(planObjective(inst, v2)), dispatcher: Math.round(planObjective(inst, disp)),
        optLoads: done(opt), v2Loads: done(v2), dispLoads: done(disp), exactMs: Math.round(tExact), v2Ms: Math.round(tV2) });
    }
  if (process.env.GAP_OUT) writeFileSync(process.env.GAP_OUT, JSON.stringify(rows, null, 1));
}, 3_600_000);
