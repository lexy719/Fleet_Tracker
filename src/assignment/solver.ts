import { haversineM } from "../regulations/geometry";
import { appendLoad, initialState, returnHome, type CrewState } from "./crewSchedule";
import { weekCostEur } from "./costs";
import { dispatcherPlan } from "./greedy";
import type { Crew, Instance, Load, Solution } from "./model";

/*
 * Weekly load assignment, v2. Crews keep their truck, driver and trailer. Two phases:
 *
 * 1. Regret insertion: every open load is priced at its best and second-best place in any crew's
 *    week (any position, not only the end, home trip included); the load that loses most by
 *    waiting goes in first.
 * 2. Ruin & recreate (large neighbourhood search): remove a group of related loads (near in space
 *    and time, one crew's week, the worst-placed, or random) and put them back, by regret insertion
 *    with noise or one by one in random order;
 *    keep the new plan if it is better, or now and then if slightly worse (simulated annealing).
 *
 * Objective (€, minimised): the week's running cost (per km, or wear + diesel bought where it is
 * cheapest along the way, see costs.ts) − revenue + a penalty per load left undone.
 * Deterministic for a given seed and iteration count; the time limit only cuts it short.
 */

export type SolveOptions = {
  seed?: number;
  /** Ruin & recreate iterations (0 = construction only). */
  iterations?: number;
  timeLimitMs?: number;
  /** € lost per load left undone, on top of its revenue. */
  unassignedPenaltyEur?: number;
};
export const DEFAULT_SOLVE: Required<SolveOptions> = { seed: 1, iterations: 1000, timeLimitMs: 30_000, unassignedPenaltyEur: 1000 };

/**
 * The value the search minimises, for any plan: € cost per km − revenue + penalty per undone load.
 * Every crew counts, idle ones too: a crew that starts away from home still drives back (a crew
 * that cannot even get home in time is left out of the plan).
 */
export function planObjective(inst: Instance, sol: Solution, unassignedPenaltyEur = DEFAULT_SOLVE.unassignedPenaltyEur): number {
  const byId = new Map(inst.loads.map((l) => [l.id, l]));
  const loadsOf = new Map(sol.routes.map((r) => [r.crewId, r.loadIds]));
  let total = 0;
  for (const crew of inst.crews) {
    const ids = loadsOf.get(crew.id) ?? [];
    let s: CrewState | null = initialState(crew);
    for (const id of ids) s = s && appendLoad(s, byId.get(id)!, inst.travel, crew);
    s = s && returnHome(s, crew, inst.travel);
    if (!s) {
      if (ids.length) return Infinity;
      continue;
    }
    total += weekCostEur(inst, crew, s);
  }
  const done = new Set(sol.routes.flatMap((r) => r.loadIds));
  for (const l of inst.loads) if (!done.has(l.id)) total += l.rateEur + unassignedPenaltyEur;
  return total;
}

type Route = { crew: Crew; loads: Load[]; prefix: CrewState[]; final: CrewState; cost: number };

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

export function solveWeek(inst: Instance, options: SolveOptions = {}): Solution {
  const opt = { ...DEFAULT_SOLVE, ...options };
  const random = rng(opt.seed);
  const started = performance.now();
  const routeCost = (crew: Crew, s: CrewState) => weekCostEur(inst, crew, s);
  const penalty = (l: Load) => l.rateEur + opt.unassignedPenaltyEur;

  /** Re-times a crew's week; null when any step (or the trip home) fails. */
  function build(crew: Crew, loads: Load[]): Route | null {
    const prefix = [initialState(crew)];
    for (const l of loads) {
      const next = appendLoad(prefix.at(-1)!, l, inst.travel, crew);
      if (!next) return null;
      prefix.push(next);
    }
    const final = returnHome(prefix.at(-1)!, crew, inst.travel);
    return final ? { crew, loads, prefix, final, cost: routeCost(crew, final) } : null;
  }

  /** Cheapest place for `load` in `route`: extra cost and position, or null. */
  function bestInsertion(route: Route, load: Load): { delta: number; pos: number } | null {
    if (load.equipment !== route.crew.equipment) return null;
    let best: { delta: number; pos: number } | null = null;
    for (let pos = 0; pos <= route.loads.length; pos++) {
      const before = route.prefix[pos]!;
      // Already past the pickup window at this point of the week: later positions are later still.
      if (before.t > load.pickupEndMs) break;
      // Cheap checks before re-timing the rest of the week: can it reach the pickup, and the next load after?
      if (before.t + inst.travel(before.pos, load.from).sec * 1000 > load.pickupEndMs) continue;
      const next = route.loads[pos];
      if (next && load.deliveryStartMs + (load.deliveryServiceSec + inst.travel(load.to, next.from).sec) * 1000 > next.pickupEndMs) continue;
      let s: CrewState | null = appendLoad(before, load, inst.travel, route.crew);
      for (let j = pos; s && j < route.loads.length; j++) s = appendLoad(s, route.loads[j]!, inst.travel, route.crew);
      if (s) s = returnHome(s, route.crew, inst.travel);
      if (!s) continue;
      const delta = routeCost(route.crew, s) - route.cost;
      if (!best || delta < best.delta) best = { delta, pos };
    }
    return best;
  }

  /** Puts `open` loads in by regret-2 insertion; returns those that fit nowhere. */
  function recreate(routes: Route[], open: Load[], noise: number): Load[] {
    const pending = new Set(open);
    const dropped: Load[] = [];
    // best[loadId][routeIndex]
    const table = new Map<string, ({ delta: number; pos: number } | null)[]>();
    const price = (l: Load, ri: number) => bestInsertion(routes[ri]!, l);
    for (const l of pending) table.set(l.id, routes.map((_, ri) => price(l, ri)));
    while (pending.size) {
      let pick: { load: Load; ri: number; pos: number; regret: number; delta: number } | null = null;
      for (const l of pending) {
        const row = table.get(l.id)!;
        let b1 = Infinity, b2 = Infinity, bi = -1;
        row.forEach((c, ri) => {
          if (!c) return;
          if (c.delta < b1) { b2 = b1; b1 = c.delta; bi = ri; }
          else if (c.delta < b2) b2 = c.delta;
        });
        if (bi < 0) continue;
        // Undone load costs its penalty: that is the "second best" when only one crew can take it.
        const regret = Math.min(b2, penalty(l)) - b1 + noise * random() * Math.abs(b1);
        if (!pick || regret > pick.regret || (regret === pick.regret && l.id < pick.load.id))
          pick = { load: l, ri: bi, pos: row[bi]!.pos, regret, delta: b1 };
      }
      if (!pick) break;
      if (pick.delta >= penalty(pick.load)) {
        // Cheaper to leave it undone than to make any crew do it.
        dropped.push(pick.load);
        pending.delete(pick.load);
        table.delete(pick.load.id);
        continue;
      }
      const r = routes[pick.ri]!;
      const loads = [...r.loads];
      loads.splice(pick.pos, 0, pick.load);
      routes[pick.ri] = build(r.crew, loads)!;
      pending.delete(pick.load);
      table.delete(pick.load.id);
      for (const l of pending) table.get(l.id)![pick.ri] = price(l, pick.ri);
    }
    return [...dropped, ...pending];
  }

  function shuffled<T>(xs: T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** Puts `open` loads in one by one, in the given order, each at its cheapest place. */
  function greedyRecreate(routes: Route[], open: Load[]): Load[] {
    const left: Load[] = [];
    for (const l of open) {
      let pick: { ri: number; pos: number; delta: number } | null = null;
      routes.forEach((r, ri) => {
        const c = bestInsertion(r, l);
        if (c && (!pick || c.delta < pick.delta)) pick = { ri, ...c };
      });
      const p = pick as { ri: number; pos: number; delta: number } | null;
      if (!p || p.delta >= penalty(l)) {
        left.push(l);
        continue;
      }
      const loads = [...routes[p.ri]!.loads];
      loads.splice(p.pos, 0, l);
      routes[p.ri] = build(routes[p.ri]!.crew, loads)!;
    }
    return left;
  }

  const total = (routes: Route[], undone: Load[]) => routes.reduce((s, r) => s + r.cost, 0) + undone.reduce((s, l) => s + penalty(l), 0);

  /** Removes loads; a week that breaks without them (e.g. cabotage that needed the trip into Spain) sheds more. */
  function ruin(routes: Route[], remove: Set<string>): { routes: Route[]; removed: Load[] } {
    const removed: Load[] = [];
    const out = routes.map((r) => {
      if (!r.loads.some((l) => remove.has(l.id))) return r;
      const keep = r.loads.filter((l) => {
        if (remove.has(l.id)) { removed.push(l); return false; }
        return true;
      });
      let built = build(r.crew, keep);
      while (!built && keep.length) {
        let drop = -1;
        for (let i = keep.length - 1; i >= 0 && drop < 0; i--) if (keep[i]!.fromCountry === "ES" && keep[i]!.toCountry === "ES") drop = i;
        removed.push(...keep.splice(drop >= 0 ? drop : keep.length - 1, 1));
        built = build(r.crew, keep);
      }
      return built ?? build(r.crew, [])!;
    });
    return { routes: out, removed };
  }

  // Phase 1: everyone starts with an empty week; regret insertion fills it.
  let routes = inst.crews.map((c) => build(c, [])).filter((r): r is Route => !!r);
  let undone = recreate(routes, [...inst.loads].sort((a, b) => a.pickupStartMs - b.pickupStartMs), 0);
  let cost = total(routes, undone);
  {
    const greedy = dispatcherPlan(inst, "nearest");
    const byId = new Map(inst.loads.map((l) => [l.id, l]));
    // Same crews as the search (a crew that cannot even get home in time is left out).
    const gLoads = new Map(greedy.routes.map((r) => [r.crewId, r.loadIds.map((id) => byId.get(id)!)]));
    const gRoutes = routes.map((r) => build(r.crew, gLoads.get(r.crew.id) ?? [])!);
    const gUndone = greedy.unassigned.map((id) => byId.get(id)!);
    const gCost = total(gRoutes, gUndone);
    if (gCost < cost) [routes, undone, cost] = [gRoutes, gUndone, gCost];
  }
  let best = { routes, undone, cost };

  // Phase 2: ruin & recreate.
  const all = inst.loads;
  const relatedness = (a: Load, b: Load) =>
    haversineM(a.from, b.from) / 1000 + haversineM(a.to, b.to) / 1000 + Math.abs(a.pickupStartMs - b.pickupStartMs) / 3_600_000 * 20;
  const T0 = Math.max(1, Math.abs(cost) * 0.002);
  for (let it = 0; it < opt.iterations; it++) {
    if (performance.now() - started > opt.timeLimitMs) break;
    const assigned = routes.flatMap((r) => r.loads);
    if (!assigned.length) break;
    const k = Math.max(2, Math.min(40, Math.round(all.length * (0.05 + 0.25 * random()))));
    const remove = new Set<string>();
    const mode = random();
    if (mode < 0.4) {
      // Related: a seed load and its neighbours in space and time.
      const seed = assigned[Math.floor(random() * assigned.length)]!;
      for (const l of [...assigned].sort((a, b) => relatedness(seed, a) - relatedness(seed, b)).slice(0, k)) remove.add(l.id);
    } else if (mode < 0.6) {
      // A couple of whole weeks.
      const used = routes.filter((r) => r.loads.length);
      for (let n = 0; n < 2 && used.length; n++) for (const l of used.splice(Math.floor(random() * used.length), 1)[0]!.loads) remove.add(l.id);
    } else if (mode < 0.8) {
      // Worst placed: biggest saving when taken out.
      const gains = routes.flatMap((r) => r.loads.map((l, i) => {
        const without = build(r.crew, [...r.loads.slice(0, i), ...r.loads.slice(i + 1)]);
        return { id: l.id, gain: without ? r.cost - without.cost : -Infinity };
      }));
      gains.sort((a, b) => b.gain - a.gain);
      for (const g of gains.slice(0, k)) remove.add(g.id);
    } else {
      for (let n = 0; n < k; n++) remove.add(assigned[Math.floor(random() * assigned.length)]!.id);
    }
    const ruined = ruin(routes, remove);
    const candRoutes = ruined.routes;
    // Two ways to rebuild, so the search does not repeat the same greedy choices.
    const open = shuffled([...ruined.removed, ...undone]);
    const candUndone = random() < 0.5 ? recreate(candRoutes, open, 0.1 + 0.4 * random()) : greedyRecreate(candRoutes, open);
    const candCost = total(candRoutes, candUndone);
    const temp = T0 * (1 - it / opt.iterations);
    if (candCost < cost || (temp > 0 && random() < Math.exp((cost - candCost) / temp))) {
      routes = candRoutes;
      undone = candUndone;
      cost = candCost;
      if (cost < best.cost - 1e-6) best = { routes, undone, cost };
    }
  }
  return {
    routes: best.routes.map((r) => ({ crewId: r.crew.id, loadIds: r.loads.map((l) => l.id) })),
    unassigned: best.undone.map((l) => l.id),
  };
}
