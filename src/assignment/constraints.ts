import { weekCostEur } from "./costs";
import { appendLoadWhy, initialState, lisbonOffsetMs, returnHomeWhy, scheduleRouteWhy, type CrewState, type FailDetail } from "./crewSchedule";
import type { Crew, FailCode, Instance, Load, Pin, PinIssue, Solution, Why } from "./model";

/*
 * The dispatcher's pins, turned into what the search needs:
 *
 * - a skeleton per crew: the loads that must stay with it (already under way when replanning, then
 *   pinned ones), in an order that is feasible and respects every "in this order" pin; the search
 *   never takes them out and only inserts other loads around them, so pins hold by construction;
 * - the forbidden (crew, load) pairs;
 * - the pins that cannot hold, with the reason: a contradiction (one load pinned to two crews, pinned
 *   and forbidden, orders that make a cycle), a load already under way with another crew, or a week
 *   that does not work (a window, the driving limits, home by Saturday). Their loads are left undone,
 *   never quietly given to another crew.
 *
 * `checkPins` re-checks a finished plan against the pins, independently of how it was built.
 */

const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "qua 14:20", Lisbon time. */
export function fmtTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "?";
  const d = new Date(ms + lisbonOffsetMs(ms));
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** One failed step, in Portuguese, for the dispatcher. */
export function failText(f: FailDetail & { code: FailCode }, load?: Load): string {
  switch (f.code) {
    case "INVALID_DATA": return "dados da carga inválidos (janelas, coordenadas ou preço)";
    case "EQUIPMENT": return `reboque errado (a carga precisa de ${load?.equipment === "REEFER" ? "frio" : "lona"})`;
    case "CABOTAGE": return "seria cabotagem sem uma entrega internacional antes, ou mais de 3 na semana";
    case "PICKUP_LATE": return `chega tarde à recolha (${fmtTime(f.atMs)}; a janela fecha ${fmtTime(f.limitMs)})`;
    case "DELIVERY_LATE": return `chega tarde à descarga (${fmtTime(f.atMs)}; a janela fecha ${fmtTime(f.limitMs)})`;
    case "WEEK_DRIVE": return "passa das 56 h de condução na semana";
    case "FORTNIGHT_DRIVE": return "passa das 90 h de condução em duas semanas";
    case "WEEK_WORK": return "passa das 60 h de trabalho na semana";
    case "NOT_HOME": return `não chega a casa a tempo do descanso semanal (${fmtTime(f.atMs)}; limite ${fmtTime(f.limitMs)})`;
    case "OUT_OF_SERVICE": return `o camião está parado a partir de ${fmtTime(f.limitMs)}`;
  }
}

export type Compiled = {
  /** Per crew: loads that must stay with it, in order (under way first). */
  skeleton: Map<string, Load[]>;
  /** Load → the crew it is locked to (every skeleton load). */
  lockedCrew: Map<string, string>;
  /** Per crew: how many skeleton loads are already under way (nothing goes before them). */
  frozenCount: Map<string, number>;
  /** Crew → loads it must not do. */
  forbidden: Map<string, Set<string>>;
  /** Loads the search must not plan, and why (pins that cannot hold). */
  excluded: Map<string, Why>;
  issues: PinIssue[];
};

const pinLoads = (p: Pin) => (p.kind === "sequence" ? p.loadIds : [p.loadId]);
const pinKey = (p: Pin) => JSON.stringify(p);

/** Most orders tried per crew when looking for a feasible order of its pinned loads. */
const ORDER_SEARCH_NODES = 20_000;

export function compileConstraints(inst: Instance, pins: Pin[] = []): Compiled {
  const loadById = new Map(inst.loads.map((l) => [l.id, l]));
  const crewById = new Map(inst.crews.map((c) => [c.id, c]));
  const frozenOf = new Map<string, string>();
  for (const c of inst.crews) for (const id of c.replan?.frozenLoadIds ?? []) frozenOf.set(id, c.id);

  const issues: PinIssue[] = [];
  const excluded = new Map<string, Why>();
  const issue = (pin: Pin, loadIds: string[], code: PinIssue["code"], text: string, exclude: boolean) => {
    issues.push({ pin, loadIds, code, text });
    if (exclude) for (const id of loadIds) if (!excluded.has(id) && !frozenOf.has(id)) excluded.set(id, { code, text });
  };

  const forbidden = new Map<string, Set<string>>();
  for (const p of pins) {
    if (p.kind !== "forbid") continue;
    if (!crewById.has(p.crewId) || !loadById.has(p.loadId)) {
      issue(p, [p.loadId], "PIN_UNKNOWN", `a fixação fala de ${crewById.has(p.crewId) ? `uma carga que não existe (${p.loadId})` : `uma equipa que não existe (${p.crewId})`}`, false);
      continue;
    }
    if (frozenOf.get(p.loadId) === p.crewId) issue(p, [p.loadId], "ALREADY_RUNNING", `${p.loadId} já está a ser feita por ${p.crewId}`, false);
    if (!forbidden.has(p.crewId)) forbidden.set(p.crewId, new Set());
    forbidden.get(p.crewId)!.add(p.loadId);
  }

  // Wanted crew of every assigned / sequenced load, and contradictions between pins.
  const wanted = new Map<string, { crewId: string; pins: Pin[] }>();
  for (const p of pins) {
    if (p.kind === "forbid") continue;
    if (!crewById.has(p.crewId)) {
      issue(p, pinLoads(p), "PIN_UNKNOWN", `a fixação fala de uma equipa que não existe (${p.crewId})`, false);
      continue;
    }
    for (const id of pinLoads(p)) {
      if (!loadById.has(id)) {
        issue(p, [id], "PIN_UNKNOWN", `a fixação fala de uma carga que não existe (${id})`, false);
        continue;
      }
      const running = frozenOf.get(id);
      if (running && running !== p.crewId) {
        issue(p, [id], "ALREADY_RUNNING", `${id} já está a ser feita por ${running}`, false);
        continue;
      }
      if (forbidden.get(p.crewId)?.has(id)) {
        issue(p, [id], "PIN_CONTRADICTION", `${id} está fixada a ${p.crewId} e proibida a ${p.crewId}`, true);
        continue;
      }
      const w = wanted.get(id);
      if (w && w.crewId !== p.crewId) {
        const text = `${id} está fixada a duas equipas (${w.crewId} e ${p.crewId})`;
        for (const q of [...w.pins, p]) issue(q, [id], "PIN_CONTRADICTION", text, true);
        continue;
      }
      if (w) w.pins.push(p);
      else wanted.set(id, { crewId: p.crewId, pins: [p] });
    }
  }

  const skeleton = new Map<string, Load[]>();
  const lockedCrew = new Map<string, string>();
  const frozenCount = new Map<string, number>();
  for (const crew of inst.crews) {
    const frozen = (crew.replan?.frozenLoadIds ?? []).map((id) => loadById.get(id)).filter((l): l is Load => !!l);
    const seqPins = pins.filter((p): p is Extract<Pin, { kind: "sequence" }> => p.kind === "sequence" && p.crewId === crew.id);
    const frozenIdx = new Map(frozen.map((l, i) => [l.id, i]));
    // A sequence that puts a load before one already under way cannot hold for that load.
    for (const p of seqPins) {
      let lastFrozen = -1;
      p.loadIds.forEach((id, i) => { if (frozenIdx.has(id)) lastFrozen = i; });
      const before = (lastFrozen < 0 ? [] : p.loadIds.slice(0, lastFrozen)).filter((id) => !frozenIdx.has(id) && wanted.get(id)?.crewId === crew.id && !excluded.has(id));
      if (before.length) issue(p, before, "ALREADY_RUNNING", `${before.join(", ")} já não pode vir antes de ${p.loadIds[lastFrozen]}, que já está a ser feita`, true);
      const fz = p.loadIds.filter((id) => frozenIdx.has(id));
      for (let i = 1; i < fz.length; i++)
        if (frozenIdx.get(fz[i]!)! < frozenIdx.get(fz[i - 1]!)!) issue(p, [fz[i]!], "ALREADY_RUNNING", `${fz[i - 1]} e ${fz[i]} já foram feitas pela ordem contrária`, false);
    }
    let nodes = [...wanted].filter(([id, w]) => w.crewId === crew.id && !frozenIdx.has(id) && !excluded.has(id)).map(([id]) => loadById.get(id)!);

    // Order constraints among the free pinned loads; a cycle is a contradiction.
    const edges = (alive: Set<string>) => {
      const preds = new Map<string, Set<string>>([...alive].map((id) => [id, new Set<string>()]));
      for (const p of seqPins) {
        const ids = p.loadIds.filter((id) => alive.has(id));
        for (let i = 1; i < ids.length; i++) if (ids[i] !== ids[i - 1]) preds.get(ids[i]!)!.add(ids[i - 1]!);
      }
      return preds;
    };
    {
      const preds = edges(new Set(nodes.map((l) => l.id)));
      const placed = new Set<string>();
      for (let grew = true; grew; ) {
        grew = false;
        for (const [id, ps] of preds) if (!placed.has(id) && [...ps].every((x) => placed.has(x))) { placed.add(id); grew = true; }
      }
      const cyc = nodes.filter((l) => !placed.has(l.id)).map((l) => l.id);
      if (cyc.length) {
        const text = `as ordens fixadas para ${crew.id} fazem um ciclo (${cyc.join(", ")})`;
        for (const p of seqPins) if (p.loadIds.some((id) => cyc.includes(id))) issue(p, cyc.filter((id) => p.loadIds.includes(id)), "PIN_CONTRADICTION", text, true);
        nodes = nodes.filter((l) => placed.has(l.id));
      }
    }

    const start = frozenStart(inst, crew, frozen);
    let order: Load[] | null = null;
    while (nodes.length) {
      order = bestOrder(inst, crew, start, nodes, edges(new Set(nodes.map((l) => l.id))));
      if (order) break;
      // No order works: take out the load where the natural order (by pickup) first fails, and say why.
      const natural = topoByPickup(nodes, edges(new Set(nodes.map((l) => l.id))));
      const r = scheduleRouteWhy(crew, [...frozen, ...natural], inst.travel);
      if ("state" in r) { order = natural; break; } // cannot happen (bestOrder would have found it)
      const culprit = natural[Math.max(0, Math.min(natural.length - 1, r.index - frozen.length))]!;
      const text = `${crew.id} não consegue fazer ${culprit.id}: ${failText(r.fail, loadById.get(r.fail.loadId ?? "") ?? culprit)}`;
      for (const p of wanted.get(culprit.id)!.pins) issue(p, [culprit.id], r.fail.code, text, true);
      nodes = nodes.filter((l) => l !== culprit);
    }
    const sk = [...frozen, ...(order ?? [])];
    if (frozen.length && !("state" in scheduleRouteWhy(crew, sk, inst.travel))) throw new Error(`compileConstraints: the week of ${crew.id} under way is already infeasible`);
    if (sk.length) skeleton.set(crew.id, sk);
    for (const l of sk) lockedCrew.set(l.id, crew.id);
    frozenCount.set(crew.id, frozen.length);
  }
  // Every pin that wants a load left out (for whatever reason) gets that reason, not only the pin that tripped it.
  const reported = new Set(issues.flatMap((i) => i.loadIds.map((id) => `${pinKey(i.pin)}|${id}`)));
  for (const p of pins) {
    if (p.kind === "forbid") continue;
    for (const id of pinLoads(p)) {
      const why = excluded.get(id);
      if (why && !reported.has(`${pinKey(p)}|${id}`)) {
        issues.push({ pin: p, loadIds: [id], code: why.code, text: why.text });
        reported.add(`${pinKey(p)}|${id}`);
      }
    }
  }
  return { skeleton, lockedCrew, frozenCount, forbidden, excluded, issues };
}

/** State after the loads already under way (or null when they no longer fit). */
function frozenStart(inst: Instance, crew: Crew, frozen: Load[]): CrewState | null {
  let s: CrewState | null = initialState(crew);
  for (const l of frozen) {
    const n = appendLoadWhy(s, l, inst.travel, crew);
    s = typeof n === "string" ? null : n;
    if (!s) break;
  }
  return s;
}

/** Loads in an order that respects `preds`, earliest pickup first. */
function topoByPickup(nodes: Load[], preds: Map<string, Set<string>>): Load[] {
  const out: Load[] = [], placed = new Set<string>();
  const left = [...nodes].sort((a, b) => a.pickupStartMs - b.pickupStartMs || a.id.localeCompare(b.id));
  while (left.length) {
    const i = left.findIndex((l) => [...preds.get(l.id)!].every((p) => placed.has(p)));
    const [l] = left.splice(i < 0 ? 0 : i, 1);
    out.push(l!);
    placed.add(l!.id);
  }
  return out;
}

/** Cheapest feasible order of `nodes` after `start` (respecting `preds`), by depth-first search with a node budget. */
function bestOrder(inst: Instance, crew: Crew, start: CrewState | null, nodes: Load[], preds: Map<string, Set<string>>): Load[] | null {
  if (!start) return null;
  let best: { cost: number; order: Load[] } | null = null;
  let budget = ORDER_SEARCH_NODES;
  const used = new Set<string>(), order: Load[] = [];
  const sorted = [...nodes].sort((a, b) => a.pickupStartMs - b.pickupStartMs || a.id.localeCompare(b.id));
  const dfs = (s: CrewState) => {
    if (budget-- <= 0) return;
    if (order.length === nodes.length) {
      const home = returnHomeWhy(s, crew, inst.travel);
      if (typeof home === "string") return;
      const cost = weekCostEur(inst, crew, home);
      if (!best || cost < best.cost - 1e-9) best = { cost, order: [...order] };
      return;
    }
    for (const l of sorted) {
      if (used.has(l.id) || ![...preds.get(l.id)!].every((p) => used.has(p))) continue;
      const next = appendLoadWhy(s, l, inst.travel, crew);
      if (typeof next === "string") continue;
      used.add(l.id);
      order.push(l);
      dfs(next);
      order.pop();
      used.delete(l.id);
    }
  };
  dfs(start);
  return (best as { order: Load[] } | null)?.order ?? null;
}

/**
 * Pins broken by a plan. A pin counts as kept when the plan does what it says, or when it is reported
 * in `sol.pinIssues` and its load is undone (or already under way with the crew named in the report).
 * A pin that names a crew or load that does not exist only has to be reported.
 * Loads under way when replanning must stay first in their crew's week, in the same order.
 */
export function checkPins(inst: Instance, sol: Solution, pins: Pin[] = []): string[] {
  const crewOf = new Map<string, string>(), posOf = new Map<string, number>();
  for (const r of sol.routes) r.loadIds.forEach((id, i) => { crewOf.set(id, r.crewId); posOf.set(id, i); });
  const reported = new Set((sol.pinIssues ?? []).flatMap((i) => i.loadIds.map((id) => `${pinKey(i.pin)}|${id}`)));
  const running = new Map<string, string>();
  for (const c of inst.crews) for (const id of c.replan?.frozenLoadIds ?? []) running.set(id, c.id);
  const out: string[] = [];
  const excused = (p: Pin, id: string) => reported.has(`${pinKey(p)}|${id}`) && (!crewOf.has(id) || crewOf.get(id) === running.get(id));
  const crewIds = new Set(inst.crews.map((c) => c.id)), loadIds = new Set(inst.loads.map((l) => l.id));
  for (const p of pins) {
    // A pin naming a crew or load that does not exist is void, but must be reported.
    const unknown = pinLoads(p).filter((id) => !crewIds.has(p.crewId) || !loadIds.has(id));
    for (const id of unknown) if (!reported.has(`${pinKey(p)}|${id}`)) out.push(`a fixação ${pinKey(p)} fala de algo que não existe e não foi reportada`);
    if (!crewIds.has(p.crewId)) continue;
    if (p.kind === "forbid") {
      if (crewOf.get(p.loadId) === p.crewId && !excused(p, p.loadId)) out.push(`${p.loadId} está com ${p.crewId}, que a não pode fazer`);
      continue;
    }
    let last = -1;
    for (const id of pinLoads(p)) {
      if (!loadIds.has(id)) continue;
      if (crewOf.get(id) !== p.crewId) {
        if (!excused(p, id)) out.push(`${id} devia estar com ${p.crewId} e está ${crewOf.has(id) ? `com ${crewOf.get(id)}` : "por fazer"} sem explicação`);
        continue;
      }
      if (p.kind === "sequence") {
        if (posOf.get(id)! < last && !excused(p, id)) out.push(`${id} saiu da ordem fixada para ${p.crewId}`);
        last = Math.max(last, posOf.get(id)!);
      }
    }
  }
  for (const c of inst.crews) {
    const frozen = c.replan?.frozenLoadIds ?? [];
    const ids = sol.routes.find((r) => r.crewId === c.id)?.loadIds ?? [];
    if (frozen.some((id, i) => ids[i] !== id)) out.push(`o que ${c.id} já fez ou tem em curso mudou`);
  }
  return out;
}
