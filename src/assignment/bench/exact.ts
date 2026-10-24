import { appendLoad, initialState, returnHome, type CrewState } from "../crewSchedule";
import { weekCostEur } from "../costs";
import type { Instance, Solution } from "../model";
import { DEFAULT_SOLVE } from "../solver";

/*
 * Exact optimum for small weeks (≤ ~12 loads), on the same timing model and objective as the
 * search: every feasible order of every subset of loads for each crew (depth-first, cut as soon as
 * a prefix fails), then the best way to split the loads between crews (subset DP). Exponential:
 * only for measuring how far the search is from the best possible plan.
 */

export function exactPlan(inst: Instance, unassignedPenaltyEur = DEFAULT_SOLVE.unassignedPenaltyEur): Solution & { objective: number } {
  const n = inst.loads.length;
  if (n > 14) throw new Error("exactPlan: too many loads");

  // best[c][mask] = cheapest feasible week of crew c doing exactly the loads in mask.
  const best = inst.crews.map((crew) => {
    const table = new Map<number, { cost: number; order: number[] }>([[0, { cost: 0, order: [] }]]);
    const dfs = (s: CrewState, mask: number, order: number[]) => {
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) continue;
        const next = appendLoad(s, inst.loads[i]!, inst.travel, crew);
        if (!next) continue;
        const m = mask | (1 << i), o = [...order, i];
        const home = returnHome(next, crew, inst.travel);
        if (home) {
          const c = weekCostEur(inst, crew, home), old = table.get(m);
          if (!old || c < old.cost) table.set(m, { cost: c, order: o });
        }
        dfs(next, m, o);
      }
    };
    dfs(initialState(crew), 0, []);
    return table;
  });

  // dp over crews: covered mask → cheapest total and the subset each crew takes.
  let dp = new Map<number, { cost: number; picks: number[] }>([[0, { cost: 0, picks: [] }]]);
  for (const table of best) {
    const next = new Map<number, { cost: number; picks: number[] }>();
    for (const [m, v] of dp)
      for (const [s, w] of table) {
        if (m & s) continue;
        const key = m | s, c = v.cost + w.cost, old = next.get(key);
        if (!old || c < old.cost) next.set(key, { cost: c, picks: [...v.picks, s] });
      }
    dp = next;
  }
  let answer = { objective: Infinity, mask: 0, picks: [] as number[] };
  for (const [m, v] of dp) {
    let pen = 0;
    for (let i = 0; i < n; i++) if (!(m & (1 << i))) pen += inst.loads[i]!.rateEur + unassignedPenaltyEur;
    if (v.cost + pen < answer.objective) answer = { objective: v.cost + pen, mask: m, picks: v.picks };
  }
  return {
    objective: answer.objective,
    routes: inst.crews.map((c, ci) => ({ crewId: c.id, loadIds: best[ci]!.get(answer.picks[ci] ?? 0)!.order.map((i) => inst.loads[i]!.id) })),
    unassigned: inst.loads.filter((_, i) => !(answer.mask & (1 << i))).map((l) => l.id),
  };
}
