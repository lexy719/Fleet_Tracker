import { describe, expect, it } from "vitest";
import { BENCH_SIZES, bragancaInstance } from "./bench/bragancaInstance";
import { scorePlan } from "./bench/evaluate";
import { dispatcherPlan } from "./greedy";
import { solveWeek } from "./solver";

describe("weekly assignment v2 on the small Bragança week", () => {
  const inst = bragancaInstance(BENCH_SIZES[0]!);
  const dispatcher = scorePlan("despachante", inst, dispatcherPlan(inst, "nearest"), 0);
  const solution = solveWeek(inst, { iterations: 200 });
  const v2 = scorePlan("v2", inst, solution, 0);

  it("every load is either in exactly one crew's week or left undone", () => {
    const ids = [...solution.routes.flatMap((r) => r.loadIds), ...solution.unassigned].sort();
    expect(ids).toEqual(inst.loads.map((l) => l.id).sort());
  });

  it("all weeks are feasible and legal under the independent audit", () => {
    expect(v2.infeasibleRoutes).toBe(0);
    expect(v2.violations).toEqual({});
  });

  it("does at least as many loads as the nearest-crew dispatcher, with a better margin and fewer empty km", () => {
    expect(v2.assigned).toBeGreaterThanOrEqual(dispatcher.assigned);
    expect(v2.marginEur).toBeGreaterThan(dispatcher.marginEur);
    expect(v2.emptyKm).toBeLessThan(dispatcher.emptyKm);
  });

  it("is deterministic for a seed", () => {
    expect(solveWeek(inst, { iterations: 200 })).toEqual(solution);
  });
});
