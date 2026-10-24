import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { BENCH_SIZES, HUBS, bragancaInstance } from "../bench/bragancaInstance";
import { scorePlan } from "../bench/evaluate";
import { onRealRoads, realRoadTravel } from "../bench/realRoads";
import { dispatcherPlan } from "../greedy";
import { syntheticTravel } from "../model";
import { solveWeek } from "../solver";

/**
 * Real roads (our engine's truck times): how wrong is the synthetic road model, does a plan made on
 * it survive real times, and how do v2 and the dispatcher compare when both plan on real roads.
 *   REAL=1 REAL_OUT=<file.json> npx vitest run src/assignment/__tests__/realroads.probe.test.ts
 * v2 is also run with its optional backhaul polish ("+ retorno", `backhaul: true`); REAL_MC=<n> adds
 * n more generated S and M weeks (other seeds) with the same comparison.
 */
it.skipIf(!process.env.REAL)("assignment on real roads", () => {
  const syn = syntheticTravel();
  const ratios = HUBS.flatMap((a) => HUBS.filter((b) => b !== a).map((b) => ({ km: realRoadTravel(a.at, b.at).km / syn(a.at, b.at).km, h: realRoadTravel(a.at, b.at).sec / syn(a.at, b.at).sec })));
  const rows: unknown[] = [{ ratios: { kmMin: Math.min(...ratios.map((r) => r.km)), kmMax: Math.max(...ratios.map((r) => r.km)), kmMean: ratios.reduce((s, r) => s + r.km, 0) / ratios.length,
    hMin: Math.min(...ratios.map((r) => r.h)), hMax: Math.max(...ratios.map((r) => r.h)), hMean: ratios.reduce((s, r) => s + r.h, 0) / ratios.length } }];
  for (const size of BENCH_SIZES) {
    const synthetic = bragancaInstance(size), real = onRealRoads(synthetic);
    // A plan made on the synthetic model, re-timed on real roads.
    const planned = solveWeek(synthetic);
    const survived = scorePlan("v2 (plano sintético) em estradas reais", real, planned, 0);
    const t0 = performance.now();
    const v2 = scorePlan("v2 em estradas reais", real, solveWeek(real), performance.now() - t0);
    const disp = scorePlan("despachante em estradas reais", real, dispatcherPlan(real, "nearest"), 0);
    const t1 = performance.now();
    const back = scorePlan("v2 + retorno em estradas reais", real, solveWeek(real, { backhaul: true }), performance.now() - t1);
    rows.push(survived, disp, v2, back);
  }
  for (let i = 1; i <= Number(process.env.REAL_MC ?? 0); i++)
    for (const size of BENCH_SIZES.slice(0, 2)) {
      const real = onRealRoads(bragancaInstance({ ...size, seed: size.seed + 100 * i }));
      rows.push({ mc: i, ...scorePlan("v2 em estradas reais", real, solveWeek(real), 0) }, { mc: i, ...scorePlan("v2 + retorno em estradas reais", real, solveWeek(real, { backhaul: true }), 0) });
    }
  writeFileSync(process.env.REAL_OUT ?? "real.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
