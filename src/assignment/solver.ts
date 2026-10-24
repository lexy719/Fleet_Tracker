import { haversineM } from "../regulations/geometry";
import { compileConstraints, failText } from "./constraints";
import { appendLoad, appendLoadWhy, initialState, returnHome, returnHomeWhy, type CrewState, type FailDetail } from "./crewSchedule";
import { weekCostEur } from "./costs";
import { dispatcherPlan } from "./greedy";
import type { Crew, FailCode, Instance, Load, Pin, Solution, Why } from "./model";

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
 * cheapest along the way, see costs.ts) − revenue + a penalty per load left undone (a much larger one
 * for a mandatory load) + a cost per load that changes crew against a base plan (replanning).
 * Deterministic for a given seed and iteration count; the time limit only cuts it short.
 *
 * Dispatcher pins and loads already under way (constraints.ts) form a fixed skeleton per crew: the
 * search never takes those loads out and only inserts others around them, so pins hold by
 * construction. A mandatory load still undone at the end gets a last repair (take optional loads
 * out of a crew's week; or move one other mandatory load to another crew). Every undone load
 * comes out with the reason.
 */

export type SolveOptions = {
  seed?: number;
  /** Ruin & recreate iterations (0 = construction only). */
  iterations?: number;
  timeLimitMs?: number;
  /** € lost per load left undone, on top of its revenue. */
  unassignedPenaltyEur?: number;
  /** € lost per mandatory load left undone, on top of that: larger than anything optional loads can earn. */
  mandatoryPenaltyEur?: number;
  /** Dispatcher pins: never broken; those that cannot hold are reported. */
  pins?: Pin[];
  /** Plan to start from and stay close to (replanning). */
  base?: Solution;
  /** € per load that ends up with another crew than in `base`, or undone. */
  changePenaltyEur?: number;
  /** Remove only loads around these (replanning: the new load, the delayed crew's loads…). */
  focus?: string[];
  /** Accept slightly worse plans now and then (simulated annealing); off = only improvements. */
  anneal?: boolean;
  /** Last polish, off by default: give crews that drive home empty a long way a load that ends near home (see backhaulPolish). */
  backhaul?: boolean;
};
export const DEFAULT_SOLVE = { seed: 1, iterations: 1000, timeLimitMs: 30_000, unassignedPenaltyEur: 1000, mandatoryPenaltyEur: 100_000, changePenaltyEur: 0, anneal: true, backhaul: false };

export type ObjectiveOptions = { mandatoryPenaltyEur?: number; base?: Solution; changePenaltyEur?: number };

/**
 * The value the search minimises, for any plan: € cost per km − revenue + penalty per undone load
 * (+ the mandatory penalty) + change cost against `base` (another crew, or undone).
 * Every crew counts, idle ones too: a crew that starts away from home still drives back (a crew
 * that cannot even get home in time is left out of the plan).
 */
export function planObjective(inst: Instance, sol: Solution, unassignedPenaltyEur = DEFAULT_SOLVE.unassignedPenaltyEur, extra: ObjectiveOptions = {}): number {
  const byId = new Map(inst.loads.map((l) => [l.id, l]));
  const loadsOf = new Map(sol.routes.map((r) => [r.crewId, r.loadIds]));
  const baseCrew = baseCrewOf(extra.base);
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
    for (const id of ids) if (baseCrew.has(id) && baseCrew.get(id) !== crew.id) total += extra.changePenaltyEur ?? 0;
  }
  const done = new Set(sol.routes.flatMap((r) => r.loadIds));
  for (const l of inst.loads)
    if (!done.has(l.id)) total += l.rateEur + unassignedPenaltyEur + (l.mandatory ? extra.mandatoryPenaltyEur ?? DEFAULT_SOLVE.mandatoryPenaltyEur : 0) + (baseCrew.has(l.id) ? extra.changePenaltyEur ?? 0 : 0);
  return total;
}

function baseCrewOf(base?: Solution): Map<string, string> {
  return new Map((base?.routes ?? []).flatMap((r) => r.loadIds.map((id) => [id, r.crewId] as const)));
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
  const pins = opt.pins ?? [];
  const cons = compileConstraints(inst, pins);
  const locked = (l: Load) => cons.lockedCrew.has(l.id);
  const minPos = (crew: Crew) => cons.frozenCount.get(crew.id) ?? 0;
  const baseCrew = baseCrewOf(opt.base);
  const changeCost = (crew: Crew, s: CrewState) => {
    if (!opt.changePenaltyEur || !baseCrew.size) return 0;
    let c = 0;
    for (const id of s.loadIds) if (baseCrew.has(id) && baseCrew.get(id) !== crew.id) c += opt.changePenaltyEur;
    return c;
  };
  const routeCost = (crew: Crew, s: CrewState) => weekCostEur(inst, crew, s) + changeCost(crew, s);
  const softPenalty = (l: Load) => l.rateEur + opt.unassignedPenaltyEur;
  // A load the base plan gave to a crew and that ends up undone is a change too.
  const dropCost = (l: Load) => (baseCrew.has(l.id) ? opt.changePenaltyEur : 0);
  const penalty = (l: Load) => softPenalty(l) + (l.mandatory ? opt.mandatoryPenaltyEur : 0) + dropCost(l);
  /** May the search put `load` in `crew`'s week? (Locked loads are never moved, so never "put".) */
  const allowed = (crew: Crew, load: Load) => load.equipment === crew.equipment && !cons.excluded.has(load.id) && !locked(load) && !cons.forbidden.get(crew.id)?.has(load.id);

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
  function bestInsertion(route: Route, load: Load, fromPos = 0): { delta: number; pos: number } | null {
    if (!allowed(route.crew, load)) return null;
    let best: { delta: number; pos: number } | null = null;
    for (let pos = Math.max(fromPos, minPos(route.crew)); pos <= route.loads.length; pos++) {
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

  /** Takes optional loads out of a week (locked loads stay); a week that breaks without them sheds more. */
  function shed(crew: Crew, keep: Load[], removed: Load[]): Route {
    let built = build(crew, keep);
    while (!built) {
      // Cabotage that needed the trip into Spain goes first, then from the end of the week.
      let drop = -1;
      for (let i = keep.length - 1; i >= 0 && drop < 0; i--) if (!locked(keep[i]!) && keep[i]!.fromCountry === "ES" && keep[i]!.toCountry === "ES") drop = i;
      for (let i = keep.length - 1; i >= 0 && drop < 0; i--) if (!locked(keep[i]!)) drop = i;
      if (drop < 0) break;
      removed.push(...keep.splice(drop, 1));
      built = build(crew, keep);
    }
    return built ?? build(crew, cons.skeleton.get(crew.id) ?? [])!;
  }

  /** Removes loads (never locked ones). */
  function ruin(routes: Route[], remove: Set<string>): { routes: Route[]; removed: Load[] } {
    const removed: Load[] = [];
    const out = routes.map((r) => {
      if (!r.loads.some((l) => remove.has(l.id) && !locked(l))) return r;
      const keep = r.loads.filter((l) => {
        if (remove.has(l.id) && !locked(l)) { removed.push(l); return false; }
        return true;
      });
      return shed(r.crew, keep, removed);
    });
    return { routes: out, removed };
  }

  // Phase 1: every crew starts from its skeleton (pinned and running loads).
  let routes = inst.crews.map((c) => build(c, cons.skeleton.get(c.id) ?? [])).filter((r): r is Route => !!r);
  const inRoutes = new Set(routes.map((r) => r.crew.id));
  for (const [crewId, sk] of cons.skeleton) if (!inRoutes.has(crewId) && sk.length) throw new Error(`solveWeek: skeleton of ${crewId} is infeasible`);
  const plannable = inst.loads.filter((l) => !locked(l) && !cons.excluded.has(l.id));
  let undone: Load[];
  if (opt.base) {
    // Replanning: start from the current plan, keep what still fits, put the rest back by regret.
    const open: Load[] = [];
    const byId = new Map(plannable.map((l) => [l.id, l]));
    const placed = new Set<string>();
    const baseLoads = new Map(opt.base.routes.map((r) => [r.crewId, r.loadIds]));
    routes = routes.map((r) => {
      const sk = cons.skeleton.get(r.crew.id) ?? [];
      const skIds = new Set(sk.map((l) => l.id));
      const ids = baseLoads.get(r.crew.id) ?? [];
      const free = ids.map((id) => byId.get(id)).filter((l): l is Load => !!l && allowed(r.crew, l));
      for (const l of free) placed.add(l.id);
      const baseSk = ids.filter((id) => skIds.has(id));
      let route: Route;
      if (baseSk.length === sk.length && baseSk.every((id, i) => id === sk[i]!.id)) {
        // The pinned loads are already in the base in the right order: keep the base order.
        const freeSet = new Set(free);
        const keep = ids.map((id) => sk.find((l) => l.id === id) ?? byId.get(id)).filter((l): l is Load => !!l && (skIds.has(l.id) || freeSet.has(l)));
        route = repair(r.crew, keep, open);
      } else {
        route = r;
        for (const l of free) {
          const ins = bestInsertion(route, l);
          if (!ins) { open.push(l); continue; }
          const loads = [...route.loads];
          loads.splice(ins.pos, 0, l);
          route = build(route.crew, loads)!;
        }
      }
      return route;
    });
    for (const l of plannable) if (!placed.has(l.id)) open.push(l);
    undone = recreate(routes, open.sort((a, b) => a.pickupStartMs - b.pickupStartMs || a.id.localeCompare(b.id)), 0);
  } else {
    undone = recreate(routes, [...plannable].sort((a, b) => a.pickupStartMs - b.pickupStartMs), 0);
  }
  let cost = total(routes, undone);
  if (!opt.base && !pins.length && !inst.crews.some((c) => c.replan)) {
    const greedy = dispatcherPlan(inst, "nearest");
    const byId = new Map(inst.loads.map((l) => [l.id, l]));
    // Same crews as the search (a crew that cannot even get home in time is left out).
    const gLoads = new Map(greedy.routes.map((r) => [r.crewId, r.loadIds.map((id) => byId.get(id)!)]));
    const gRoutes = routes.map((r) => build(r.crew, gLoads.get(r.crew.id) ?? [])!);
    const gUndone = greedy.unassigned.map((id) => byId.get(id)!).filter((l) => !cons.excluded.has(l.id));
    const gCost = total(gRoutes, gUndone);
    if (gCost < cost) [routes, undone, cost] = [gRoutes, gUndone, gCost];
  }

  /** The week with `loads` in this order; when it breaks, take out the unlocked load whose removal costs least, until it works. */
  function repair(crew: Crew, loads: Load[], removed: Load[]): Route {
    const keep = [...loads];
    let built = build(crew, keep);
    while (!built) {
      let pick: { i: number; r: Route } | null = null;
      keep.forEach((l, i) => {
        if (locked(l)) return;
        const r = build(crew, [...keep.slice(0, i), ...keep.slice(i + 1)]);
        if (r && (!pick || r.cost - penalty(l) < pick.r.cost - penalty(keep[pick.i]!))) pick = { i, r };
      });
      const p = pick as { i: number; r: Route } | null;
      if (p) {
        removed.push(keep[p.i]!);
        return p.r;
      }
      // No single removal is enough: drop from the end and try again.
      let last = keep.length - 1;
      while (last >= 0 && locked(keep[last]!)) last--;
      if (last < 0) break;
      removed.push(...keep.splice(last, 1));
      built = build(crew, keep);
    }
    return built ?? shed(crew, keep, removed);
  }
  let best = { routes, undone, cost };

  // Phase 2: ruin & recreate.
  const all = inst.loads;
  const byIdAll = new Map(all.map((l) => [l.id, l]));
  const focus = (opt.focus ?? []).map((id) => byIdAll.get(id)).filter((l): l is Load => !!l);
  const relatedness = (a: Load, b: Load) =>
    haversineM(a.from, b.from) / 1000 + haversineM(a.to, b.to) / 1000 + Math.abs(a.pickupStartMs - b.pickupStartMs) / 3_600_000 * 20;
  // Temperature from the plan's value without the mandatory surcharge (it would make it huge).
  const softTotal = routes.reduce((s, r) => s + r.cost, 0) + undone.reduce((s, l) => s + softPenalty(l), 0);
  const T0 = opt.anneal ? Math.max(1, Math.abs(softTotal) * 0.002) : 0;
  for (let it = 0; it < opt.iterations; it++) {
    if (performance.now() - started > opt.timeLimitMs) break;
    const assigned = routes.flatMap((r) => r.loads).filter((l) => !locked(l));
    if (!assigned.length) break;
    const k = focus.length
      ? Math.max(2, Math.min(8, Math.round(2 + 6 * random())))
      : Math.max(2, Math.min(40, Math.round(all.length * (0.05 + 0.25 * random()))));
    const remove = new Set<string>();
    const mode = random();
    if (focus.length) {
      // Replanning: only around what changed (a focus load and its neighbours in space and time), so unrelated crews keep their week.
      const seed = focus[Math.floor(random() * focus.length)]!;
      for (const l of [...assigned].sort((a, b) => relatedness(seed, a) - relatedness(seed, b)).slice(0, k)) remove.add(l.id);
    } else if (mode < 0.4) {
      // Related: a seed load and its neighbours in space and time.
      const seed = assigned[Math.floor(random() * assigned.length)]!;
      for (const l of [...assigned].sort((a, b) => relatedness(seed, a) - relatedness(seed, b)).slice(0, k)) remove.add(l.id);
    } else if (mode < 0.6) {
      // A couple of whole weeks.
      const used = routes.filter((r) => r.loads.some((l) => !locked(l)));
      for (let n = 0; n < 2 && used.length; n++) for (const l of used.splice(Math.floor(random() * used.length), 1)[0]!.loads) remove.add(l.id);
    } else if (mode < 0.8) {
      // Worst placed: biggest saving when taken out.
      const gains = routes.flatMap((r) => r.loads.flatMap((l, i) => {
        if (locked(l)) return [];
        const without = build(r.crew, [...r.loads.slice(0, i), ...r.loads.slice(i + 1)]);
        return [{ id: l.id, gain: without ? r.cost - without.cost : -Infinity }];
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

  // Phase 3: a mandatory load still undone gets one more try, harder than the search's.
  ({ routes, undone } = best);
  // Moving one mandatory load can open room for another that failed before: repeat while it helps.
  for (let pass = 0, left = undone.filter((l) => l.mandatory).length; pass < 3 && left; pass++) {
    ({ routes, undone } = forceMandatory(routes, undone));
    const now = undone.filter((l) => l.mandatory).length;
    if (now === left) break;
    left = now;
  }

  /**
   * For each undone mandatory load: (1) put it in a crew's week after taking one, or else all, of
   * that week's optional loads out (they go back wherever they fit); (2) failing that, move one
   * non-locked mandatory load out of a crew's week to another crew to make room. Keeps the cheapest
   * way found.
   */
  function forceMandatory(routes0: Route[], undone0: Load[]): { routes: Route[]; undone: Load[] } {
    let cur = { routes: routes0, undone: undone0 };
    const stripped = (r: Route, drop?: Load) => r.loads.filter((l) => l !== drop && (locked(l) || l.mandatory));
    for (const m of [...undone0].filter((l) => l.mandatory).sort((a, b) => a.pickupStartMs - b.pickupStartMs)) {
      if (!cur.undone.includes(m)) continue;
      let found: { routes: Route[]; undone: Load[]; cost: number } | null = null;
      const consider = (cand: Route[], freed: Load[]) => {
        const left = greedyRecreate(cand, [...freed, ...cur.undone.filter((l) => l !== m)]);
        const c = total(cand, left);
        if (!found || c < found.cost) found = { routes: cand, undone: left, cost: c };
      };
      // (1) One optional load out of one week (keeps, e.g., the delivery into Spain a cabotage load needs).
      cur.routes.forEach((r, ri) => {
        if (!allowed(r.crew, m)) return;
        for (const o of r.loads.filter((l) => !locked(l) && !l.mandatory)) {
          const keep = r.loads.filter((l) => l !== o);
          const base = build(r.crew, keep);
          const ins = base && bestInsertion(base, m);
          if (!ins) continue;
          const cand = [...cur.routes];
          cand[ri] = build(r.crew, [...keep.slice(0, ins.pos), m, ...keep.slice(ins.pos)])!;
          consider(cand, [o]);
        }
      });
      // (1b) All optional loads out of one week.
      if (!found) cur.routes.forEach((r, ri) => {
        if (!allowed(r.crew, m)) return;
        const keep = stripped(r);
        const base = build(r.crew, keep);
        const ins = base && bestInsertion(base, m);
        if (!ins) return;
        const cand = [...cur.routes];
        cand[ri] = build(r.crew, [...keep.slice(0, ins.pos), m, ...keep.slice(ins.pos)])!;
        consider(cand, r.loads.filter((l) => !keep.includes(l)));
      });
      // (2) Move one other mandatory load to another crew (both weeks without their optional loads).
      if (!found) {
        cur.routes.forEach((r, ri) => {
          if (found || !allowed(r.crew, m)) return;
          for (const m2 of r.loads.filter((l) => l.mandatory && !locked(l))) {
            const keep = stripped(r, m2);
            const base = build(r.crew, keep);
            const ins = base && bestInsertion(base, m);
            if (!ins) continue;
            const cand = [...cur.routes];
            cand[ri] = build(r.crew, [...keep.slice(0, ins.pos), m, ...keep.slice(ins.pos)])!;
            for (let rj = 0; rj < cand.length && !found; rj++) {
              if (rj === ri || !allowed(cand[rj]!.crew, m2)) continue;
              const keep2 = stripped(cand[rj]!);
              const base2 = build(cand[rj]!.crew, keep2);
              const ins2 = base2 && bestInsertion(base2, m2);
              if (!ins2) continue;
              const cand2 = [...cand];
              cand2[rj] = build(cand[rj]!.crew, [...keep2.slice(0, ins2.pos), m2, ...keep2.slice(ins2.pos)])!;
              consider(cand2, [...r.loads.filter((l) => !keep.includes(l) && l !== m2), ...cur.routes[rj]!.loads.filter((l) => !keep2.includes(l))]);
            }
            if (found) break;
          }
        });
      }
      const f = found as { routes: Route[]; undone: Load[]; cost: number } | null;
      if (f && f.undone.filter((l) => l.mandatory).length < cur.undone.filter((l) => l.mandatory).length) cur = { routes: f.routes, undone: f.undone };
    }
    return cur;
  }

  // A last cheap pass: anything that now fits and pays goes in.
  undone = greedyRecreate(routes, undone);
  // Replanning keeps its changes small: no polish there.
  if (opt.backhaul && !opt.base) routes = backhaulPolish(routes);

  /**
   * Backhaul polish. The drive home empty at the end of the week is 40–60 % of the empty km. For each
   * crew that drives home more than 100 km empty, try (a) taking from another crew a load that ends
   * nearer its home and doing it at the end of its week, (b) swapping their last loads, or (c) doing
   * an undone load that ends near home instead of its last load (which moves to another crew, or is
   * left: then one load is swapped for another, never fewer done, mandatory only for mandatory).
   * A move is kept only when the margin goes up AND the crews involved drive home empty less.
   * (c) can make the search's objective worse (a better-paid spot load is left for a cheaper one),
   * which is why the polish is off by default: that trade is the dispatcher's call.
   */
  function backhaulPolish(rs: Route[]): Route[] {
    rs = [...rs];
    const homeKm = (r: Route) => {
      const l = r.final.legs.at(-1);
      return l && !l.loaded && l.to === r.crew.home ? l.km : 0;
    };
    const lastPos = (r: Route) => r.prefix[r.loads.length]!.pos;
    for (let pass = 0, moved = true; pass < 3 && moved; pass++) {
      moved = false;
      const order = rs.map((_, i) => i).filter((i) => homeKm(rs[i]!) > 100).sort((a, b) => homeKm(rs[b]!) - homeKm(rs[a]!) || a - b);
      for (const ai of order) {
        const A = rs[ai]!;
        if (homeKm(A) <= 100) continue;
        const nowKm = haversineM(lastPos(A), A.crew.home) / 1000;
        const aLast = A.loads.length > minPos(A.crew) && !locked(A.loads.at(-1)!) ? A.loads.at(-1)! : null;
        const aShort = aLast ? build(A.crew, A.loads.slice(0, -1)) : null;
        let best: { bi: number; A: Route; B: Route; gain: number } | null = null;
        rs.forEach((B, bi) => {
          if (bi === ai) return;
          B.loads.forEach((l, j) => {
            if (locked(l) || !allowed(A.crew, l) || haversineM(l.to, A.crew.home) / 1000 > nowKm - 50) return;
            const bWithout = build(B.crew, [...B.loads.slice(0, j), ...B.loads.slice(j + 1)]);
            if (!bWithout) return;
            const tryPair = (newA: Route | null, newB: Route | null) => {
              if (!newA || !newB) return;
              const gain = A.cost + B.cost - newA.cost - newB.cost;
              if (gain > 1e-6 && homeKm(newA) + homeKm(newB) < homeKm(A) + homeKm(B) - 1e-6 && (!best || gain > best.gain)) best = { bi, A: newA, B: newB, gain };
            };
            // (a) A takes l near the end of its week.
            const ins = bestInsertion(A, l, A.loads.length - 1);
            if (ins) tryPair(build(A.crew, [...A.loads.slice(0, ins.pos), l, ...A.loads.slice(ins.pos)]), bWithout);
            // (b) A takes l instead of its last load, which goes to B.
            if (aLast && aShort && allowed(B.crew, aLast)) {
              const insA = bestInsertion(aShort, l, aShort.loads.length);
              const insB = bestInsertion(bWithout, aLast);
              if (insA && insB)
                tryPair(build(A.crew, [...aShort.loads, l]), build(B.crew, [...bWithout.loads.slice(0, insB.pos), aLast, ...bWithout.loads.slice(insB.pos)]));
            }
          });
        });
        // (c) A takes an undone load that ends near home instead of its last load, which goes to another crew or is left.
        let swap: { A: Route; bi: number; B: Route | null; u: Load; gain: number } | null = null;
        if (aLast && aShort)
          for (const u of undone) {
            if (!allowed(A.crew, u) || u.mandatory !== aLast.mandatory || haversineM(u.to, A.crew.home) / 1000 > nowKm - 50) continue;
            const ins = bestInsertion(aShort, u, aShort.loads.length);
            if (!ins) continue;
            const newA = build(A.crew, [...aShort.loads, u])!;
            const options: [number, Route | null][] = [[-1, null]];
            rs.forEach((B, bi) => {
              const insB = bi !== ai && bestInsertion(B, aLast);
              if (insB) options.push([bi, build(B.crew, [...B.loads.slice(0, insB.pos), aLast, ...B.loads.slice(insB.pos)])]);
            });
            for (const [bi, newB] of options) {
              const B = bi >= 0 ? rs[bi]! : null;
              const gain = A.cost + (B?.cost ?? 0) - newA.cost - (newB?.cost ?? 0); // margin gained
              const home = homeKm(A) + (B ? homeKm(B) : 0) - homeKm(newA) - (newB ? homeKm(newB) : 0);
              // Judged on margin, not on the search's objective: leaving a better-paid spot load undone for one
              // that brings the crew home is worse for the objective (it weighs undone loads by what they pay).
              if (gain > 1e-6 && home > 1e-6 && (!swap || gain > swap.gain)) swap = { A: newA, bi, B: newB, u, gain };
            }
          }
        const b = best as { bi: number; A: Route; B: Route; gain: number } | null;
        const c = swap as { A: Route; bi: number; B: Route | null; u: Load; gain: number } | null;
        if (c && (!b || c.gain > b.gain)) {
          rs[ai] = c.A;
          if (c.B) rs[c.bi] = c.B;
          else undone = [...undone, aLast!];
          undone = undone.filter((l) => l !== c.u);
          moved = true;
        } else if (b) {
          rs[ai] = b.A;
          rs[b.bi] = b.B;
          moved = true;
        }
      }
    }
    return rs;
  }

  /** Why `load` is undone, from the plan as it stands. */
  function explain(load: Load): Why {
    if (cons.excluded.has(load.id)) return cons.excluded.get(load.id)!;
    if (!routes.some((r) => r.crew.equipment === load.equipment)) return { code: "EQUIPMENT", text: `nenhuma equipa tem reboque de ${load.equipment === "REEFER" ? "frio" : "lona"}` };
    const candidates = routes.filter((r) => allowed(r.crew, load));
    if (!candidates.length) return { code: "FORBIDDEN", text: "o despachante proibiu-a a todas as equipas com o reboque certo" };
    const crews: Partial<Record<FailCode, number>> = {};
    let detail: { f: FailDetail & { code: FailCode }; crewId: string } | null = null;
    let room: { crewId: string; blockers: string[] } | null = null, worth: { delta: number; crewId: string } | null = null, noRoom = false;
    for (const r of candidates) {
      const here = bestInsertion(r, load);
      if (here) {
        if (!worth || here.delta < worth.delta) worth = { delta: here.delta, crewId: r.crew.id };
        continue;
      }
      const fixed = r.loads.filter((l) => locked(l) || l.mandatory);
      const withFixed = build(r.crew, fixed);
      if (withFixed && bestInsertion(withFixed, load)) { noRoom = true; continue; }
      const sk = build(r.crew, r.loads.filter(locked));
      if (sk && bestInsertion(sk, load)) {
        if (!room) room = { crewId: r.crew.id, blockers: fixed.filter((l) => !locked(l)).map((l) => l.id) };
        continue;
      }
      // Not even with only its locked loads: the reason at the natural slot (the last place still before the window closes).
      const base = sk ?? build(r.crew, [])!;
      let pos = minPos(r.crew);
      while (pos < base.loads.length && base.prefix[pos + 1]!.t <= load.pickupEndMs) pos++;
      const why: FailDetail = {};
      let s = appendLoadWhy(base.prefix[pos]!, load, inst.travel, r.crew, why);
      for (let j = pos; typeof s !== "string" && j < base.loads.length; j++) s = appendLoadWhy(s, base.loads[j]!, inst.travel, r.crew, why);
      if (typeof s !== "string") s = returnHomeWhy(s, r.crew, inst.travel, why);
      const code: FailCode = typeof s === "string" ? s : "PICKUP_LATE";
      crews[code] = (crews[code] ?? 0) + 1;
      if (!detail || (crews[code] ?? 0) > (crews[detail.f.code] ?? 0)) detail = { f: { ...why, code }, crewId: r.crew.id };
    }
    if (worth) return { code: "NOT_WORTH", text: `fazê-la custa mais do que paga: no melhor sítio (${worth.crewId}) acrescenta ${Math.round(worth.delta + load.rateEur)} € de custos e paga ${Math.round(load.rateEur)} €` };
    if (noRoom) return { code: load.mandatory ? "CONFLICT" : "NO_ROOM", text: "só cabia tirando outras cargas que pagam mais" };
    if (room) return { code: "CONFLICT", text: `só cabe na semana de ${room.crewId} tirando-lhe ${room.blockers.length ? room.blockers.join(", ") : "cargas fixadas"} (obrigatórias${room.blockers.length ? "" : " ou fixadas"}), e não há outra forma` };
    const d = detail as { f: FailDetail & { code: FailCode }; crewId: string };
    const summary = Object.entries(crews).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${CODE_SHORT[c as FailCode]}`).join(", ");
    // Cabotage is the one reason more loads could cure (a delivery into Spain before it): say so.
    const head = d.f.code === "CABOTAGE" ? "nenhuma equipa tem, no plano, uma entrega internacional em Espanha antes dela" : "nenhuma equipa a pode fazer";
    return { code: d.f.code, text: `${head} (${summary}); por exemplo ${d.crewId}: ${failText(d.f, load)}`, crews };
  }

  const undoneIds = [...undone.map((l) => l.id), ...[...cons.excluded.keys()].filter((id) => byIdAll.has(id) && !locked(byIdAll.get(id)!))];
  const why: Record<string, Why> = {};
  for (const id of undoneIds) why[id] = explain(byIdAll.get(id)!);
  return {
    routes: routes.map((r) => ({ crewId: r.crew.id, loadIds: r.loads.map((l) => l.id) })),
    unassigned: undoneIds,
    why,
    ...(cons.issues.length ? { pinIssues: cons.issues } : {}),
  };
}

/** Short plural forms for the summary of why no crew can do a load. */
const CODE_SHORT: Record<FailCode, string> = {
  INVALID_DATA: "com dados inválidos",
  EQUIPMENT: "com o reboque errado",
  CABOTAGE: "em cabotagem não permitida",
  PICKUP_LATE: "chegam tarde à recolha",
  DELIVERY_LATE: "chegam tarde à descarga",
  WEEK_DRIVE: "passam das 56 h de condução",
  FORTNIGHT_DRIVE: "passam das 90 h em duas semanas",
  WEEK_WORK: "passam das 60 h de trabalho",
  NOT_HOME: "não voltam a casa a tempo",
  OUT_OF_SERVICE: "com o camião parado",
};
