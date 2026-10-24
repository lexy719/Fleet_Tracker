import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { BENCH_SIZES, bragancaInstance } from "../bench/bragancaInstance";
import { dispatcherPlan } from "../greedy";
import { scorePlan, type PlanScore } from "../bench/evaluate";
import { legacyPlan } from "../bench/legacyPlanner";
import { solveWeek } from "../solver";
import { appendLoad, initialState, returnHome } from "../crewSchedule";

/**
 * Assignment benchmark on the Bragança weeks (S/M/L). Opt-in, prints a table:
 *   BENCH=1 npx vitest run src/assignment/__tests__/bench.probe.test.ts
 * BENCH_LEGACY=1 also runs the current planner (slow: S only). BENCH_OUT=<file.json> saves the rows.
 */
it.skipIf(!process.env.BENCH)("assignment benchmark", async () => {
  const rows: (PlanScore & { note?: string })[] = [];
  for (const size of BENCH_SIZES) {
    const inst = bragancaInstance(size);
    // Upper bound: loads that no crew could do even alone in its week (cabotage counted as allowed).
    const doable = inst.loads.filter((l) => inst.crews.some((c) => {
      const s0 = { ...initialState(c), inSpainAfterInternational: true };
      const s1 = appendLoad(s0, l, inst.travel, c);
      return !!s1 && !!returnHome(s1, c, inst.travel);
    })).length;
    rows.push({ method: "limite: cargas possíveis sozinhas", instance: inst.name, assigned: doable, loads: inst.loads.length } as PlanScore);
    for (const rule of ["first_free", "nearest"] as const) {
      const t0 = performance.now();
      const sol = dispatcherPlan(inst, rule);
      rows.push(scorePlan(rule === "nearest" ? "despachante: mais perto" : "despachante: primeiro livre", inst, sol, performance.now() - t0));
    }
    for (const iterations of [0, Number(process.env.BENCH_ITER ?? 2000)]) {
      const t0 = performance.now();
      const sol = solveWeek(inst, { iterations, timeLimitMs: Number(process.env.BENCH_MS ?? 30_000) });
      rows.push(scorePlan(iterations ? `v2: inserção + ruin & recreate (${iterations})` : "v2: só inserção por arrependimento", inst, sol, performance.now() - t0));
    }
    if (process.env.BENCH_LEGACY && size.name === "S") {
      const t0 = performance.now();
      const { solution, mixedCrews, truncated } = await legacyPlan(inst);
      rows.push({ ...scorePlan("planeador atual (planFleet)", inst, solution, performance.now() - t0), note: `equipas trocadas ${mixedCrews}, cortado ${truncated}` });
    }
  }
  const pad = (s: unknown, n: number) => String(s).padEnd(n);
  console.log(["instância", "método", "atribuídas", "vazio %", "km vazios", "margem €", "rotas inviáveis", "infrações", "tempo"].join(" | "));
  for (const r of rows)
    console.log([pad(r.instance, 34), pad(r.method, 28), `${r.assigned}/${r.loads}`, r.emptyPct, r.emptyKm, r.marginEur, r.infeasibleRoutes,
      JSON.stringify(r.violations), `${(r.runtimeMs / 1000).toFixed(2)} s`, r.note ?? ""].join(" | "));
  if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(rows, null, 1));
}, 3_600_000);
