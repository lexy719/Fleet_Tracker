import { fmtTime, failText } from "./constraints";
import { appendLoad, initialState, returnHome, scheduleRouteWhy, type CrewState } from "./crewSchedule";
import type { Crew, Delay, Instance, Load, Pin, Solution } from "./model";
import { solveWeek, type SolveOptions } from "./solver";

/*
 * Replanning a week that is already running, from the current plan, at `nowMs`:
 *
 * - What already happened stays: for each crew, the loads it has finished, the one it is doing and
 *   the one it is already driving to (its previous delivery ended before now) are frozen at the
 *   front of its week, in the same order; nothing new starts before now. A crew that had already
 *   left for home, or for a load it then loses (cancelled, or no longer reachable in time), finishes
 *   that trip before anything new (safe side: no diverting half-way).
 * - Events: a new load; a load cancelled; a crew delayed X hours from now; a truck out of service
 *   from a moment on (the load on board, if any, is stranded and reported: trailer swaps are not
 *   modelled).
 * - When an event makes the frozen part itself impossible, the plan says so instead of hiding it:
 *   a delivery that will be late (its window is widened and the expected time reported), a crew
 *   home after its limit, a load it can no longer reach in time (released to the others).
 * - The search starts from the current plan and pays `changePenaltyEur` for every load that changes
 *   crew (or is dropped), so it changes as little as it can; it only removes loads around what
 *   changed and only accepts improvements.
 */

export type ReplanEvent =
  | { kind: "newLoad"; load: Load }
  | { kind: "cancel"; loadId: string }
  | { kind: "delay"; crewId: string; hours: number; as?: Delay["as"] }
  /** Out of service from `fromMs` (default: now). */
  | { kind: "breakdown"; crewId: string; fromMs?: number };

export type ReplanOptions = Omit<SolveOptions, "base" | "focus"> & { pins?: Pin[] };
export const DEFAULT_REPLAN = { changePenaltyEur: 300, iterations: 400, timeLimitMs: 2_000, anneal: false };

export type ReplanNote = {
  code: "LATE_DELIVERY" | "LATE_HOME" | "RELEASED" | "STRANDED" | "CANCEL_RUNNING" | "OUT_OF_HOURS";
  crewId: string;
  loadId?: string;
  /** For the dispatcher, in Portuguese. */
  text: string;
};

export type Stability = {
  /** Loads of the current plan now with another crew, or undone (`to` null). */
  moved: { loadId: string; from: string; to: string | null }[];
  /** Loads undone (or new) in the current plan and done now. */
  newlyDone: string[];
  /** Crews whose week (loads or their order) changed. */
  crewsTouched: string[];
};

export type ReplanResult = {
  /** The week as it is now: events applied, frozen loads, widened windows. Score and audit against this. */
  instance: Instance;
  plan: Solution;
  frozen: Record<string, string[]>;
  notes: ReplanNote[];
  /** Loads on board a truck that stopped: out of the plan, need a rescue. */
  stranded: string[];
  stability: Stability;
  runtimeMs: number;
};

const H = 3_600_000;

export function replan(inst: Instance, current: Solution, nowMs: number, events: ReplanEvent[], options: ReplanOptions = {}): ReplanResult {
  const t0 = performance.now();
  const opt = { ...DEFAULT_REPLAN, ...options };
  const notes: ReplanNote[] = [];
  const loads = new Map(inst.loads.map((l) => [l.id, l]));
  for (const e of events) {
    if (e.kind !== "newLoad") continue;
    if (loads.has(e.load.id)) throw new Error(`replan: load ${e.load.id} already exists`);
    loads.set(e.load.id, e.load);
  }
  const cancelled = new Set(events.flatMap((e) => (e.kind === "cancel" && loads.has(e.loadId) ? [e.loadId] : [])));
  const crewsById = new Map(inst.crews.map((c) => [c.id, c]));
  for (const e of events) if ((e.kind === "delay" || e.kind === "breakdown") && !crewsById.has(e.crewId)) throw new Error(`replan: unknown crew ${e.crewId}`);
  const routeOf = new Map(current.routes.map((r) => [r.crewId, r.loadIds]));
  const stranded: string[] = [];
  const frozen: Record<string, string[]> = {};
  const crews: Crew[] = [];

  for (const old of inst.crews) {
    // When each load of the current plan starts (the crew leaves for it) and when its loading starts.
    const ids = routeOf.get(old.id) ?? [];
    const timeline = timeRoute(inst, old, ids.map((id) => inst.loads.find((l) => l.id === id)!));
    if (!timeline.feasible) {
      // Not in the current plan (e.g. it could not even get home in time): nothing under way, nothing to keep.
      crews.push({ ...old, replan: { fromMs: nowMs, frozenLoadIds: [] } });
      continue;
    }
    let fz = ids.slice(0, timeline.filter((t) => t.leaveMs < nowMs).length);
    /** Where the crew was already heading after the frozen loads: a load it left for and lost, or home. */
    const tripUnderWay = (): NonNullable<Crew["replan"]>["thenTo"] => {
      const next = timeline[fz.length];
      if (fz.length < ids.length) {
        const l = inst.loads.find((x) => x.id === ids[fz.length])!;
        return next && next.leaveMs < nowMs ? { at: l.from, note: `vazio para ${l.fromName}` } : undefined;
      }
      return timeline.homeLeaveMs < nowMs ? { at: crew.home, note: `regresso a ${crew.homeName}` } : undefined;
    };
    const crew: Crew = { ...old };
    for (const e of events) {
      if (e.kind === "delay" && e.crewId === crew.id) crew.delays = [...(crew.delays ?? []), { atMs: nowMs, sec: e.hours * 3600, as: e.as ?? "driving" }];
      if (e.kind === "breakdown" && e.crewId === crew.id) crew.outOfServiceFromMs = e.fromMs ?? nowMs;
    }
    const loadedBy = (id: string, ms: number) => (timeline[ids.indexOf(id)]?.loadingMs ?? Infinity) < ms;
    // Cancelling a load already on the truck cannot undo it; one only driven to is simply dropped.
    for (const id of fz.filter((x) => cancelled.has(x))) {
      if (loadedBy(id, nowMs)) {
        cancelled.delete(id);
        notes.push({ code: "CANCEL_RUNNING", crewId: crew.id, loadId: id, text: `${id} já foi carregada por ${crew.id}: fica no plano; tratar o cancelamento à mão` });
      } else fz = fz.filter((x) => x !== id);
    }
    // Fix the part under way until it works with the events, and say what that costs.
    const late: { id: string; endMs: number }[] = [];
    for (let guard = 0; ; guard++) {
      if (guard > 2 * ids.length + 4) throw new Error(`replan: cannot settle the week under way of ${crew.id}`);
      const thenTo = tripUnderWay();
      crew.replan = { fromMs: nowMs, frozenLoadIds: fz, ...(thenTo ? { thenTo } : {}) };
      const r = scheduleRouteWhy(crew, fz.map((id) => loads.get(id)!), inst.travel, true);
      if ("state" in r) {
        for (const { id, endMs } of late) {
          const at = r.state.activities!.find((a) => a.note === `descarga ${id}`)?.startMs;
          notes.push({ code: "LATE_DELIVERY", crewId: crew.id, loadId: id, text: `${id} vai chegar depois da janela: ${fmtTime(at)} (fecha ${fmtTime(endMs)}); avisar o cliente` });
        }
        break;
      }
      const { fail, index } = r;
      if (index === fz.length) {
        if (fail.code === "NOT_HOME") {
          notes.push({ code: "LATE_HOME", crewId: crew.id, text: `${crew.id} só chega a casa ${fmtTime(fail.atMs)} (limite ${fmtTime(crew.homeByMs)})` });
          crew.homeByMs = Math.ceil(fail.atMs! / 60_000) * 60_000;
        } else {
          notes.push({ code: "OUT_OF_HOURS", crewId: crew.id, text: `${crew.id} fica sem horas para voltar a casa (${failText(fail)}): descanso semanal fora, tratar à mão` });
          crew.outOfServiceFromMs = Math.max(nowMs, r.fail.atMs ?? nowMs);
        }
        continue;
      }
      const id = fz[index]!, load = loads.get(id)!;
      const stopMs = crew.outOfServiceFromMs ?? nowMs;
      const out = fail.code === "OUT_OF_SERVICE";
      if (fail.code === "DELIVERY_LATE") {
        late.push({ id, endMs: load.deliveryEndMs });
        loads.set(id, { ...load, deliveryEndMs: Math.max(load.deliveryEndMs, inst.weekStartMs + 14 * 24 * H) });
      } else if (loadedBy(id, out ? Math.min(nowMs, stopMs) : nowMs)) {
        // On the truck and it cannot be finished: out of the plan, needs a rescue.
        stranded.push(id);
        loads.delete(id);
        fz = fz.slice(0, index);
        notes.push({ code: "STRANDED", crewId: crew.id, loadId: id, text: `${id} está no camião de ${crew.id}, que ${out ? "está parado" : `não a pode acabar (${failText(fail, load)})`}: precisa de resgate (troca de reboque, à mão)` });
        if (!out) crew.outOfServiceFromMs = nowMs;
      } else {
        fz = fz.slice(0, index);
        notes.push({ code: "RELEASED", crewId: crew.id, loadId: id, text: `${crew.id} já não consegue fazer ${id} (${failText(fail, load)}): volta a ser atribuída` });
      }
    }
    if (fz.length) frozen[crew.id] = fz;
    crews.push(crew);
  }
  for (const id of cancelled) loads.delete(id);

  const instance: Instance = { ...inst, name: `${inst.name} — replaneada ${fmtTime(nowMs)}`, crews, loads: [...loads.values()] };
  const gone = (id: string) => cancelled.has(id) || stranded.includes(id);
  const base: Solution = {
    routes: current.routes.map((r) => ({ crewId: r.crewId, loadIds: r.loadIds.filter((id) => !gone(id)) })),
    unassigned: current.unassigned.filter((id) => !gone(id)),
  };
  // Where to look: the new loads, what was released or stranded, the weeks of the crews hit.
  const hit = new Set(events.flatMap((e) => (e.kind === "delay" || e.kind === "breakdown" ? [e.crewId] : [])));
  for (const r of current.routes) if (r.loadIds.some((id) => cancelled.has(id))) hit.add(r.crewId);
  const focus = new Set<string>(events.flatMap((e) => (e.kind === "newLoad" ? [e.load.id] : [])));
  for (const n of notes) if (n.loadId && loads.has(n.loadId)) focus.add(n.loadId);
  for (const r of base.routes) if (hit.has(r.crewId)) for (const id of r.loadIds) if (!frozen[r.crewId]?.includes(id)) focus.add(id);

  // Nothing changed around any load: keep the plan (only what no longer fits is put back).
  const plan = solveWeek(instance, { ...opt, base, focus: [...focus], ...(focus.size ? {} : { iterations: 0 }) });
  return { instance, plan, frozen, notes, stranded, stability: stability(base, plan), runtimeMs: performance.now() - t0 };
}

/**
 * When the crew leaves for each load of its route (end of the previous one) and when loading starts;
 * when it leaves for home (Infinity when already there); whether the week works at all.
 */
function timeRoute(inst: Instance, crew: Crew, loads: Load[]): { leaveMs: number; loadingMs: number }[] & { homeLeaveMs: number; feasible: boolean } {
  const out: { leaveMs: number; loadingMs: number }[] = [];
  let s: CrewState | null = initialState(crew, true);
  for (const l of loads) {
    if (!s) break;
    const leaveMs: number = s.t, seen = s.activities!.length;
    s = appendLoad(s, l, inst.travel, crew);
    // The goods are on board from the start of loading (or of the loaded leg, or of unloading, when loading takes no time).
    const notes = new Set([`carga ${l.id}`, `${l.fromName} → ${l.toName}`, `descarga ${l.id}`]);
    const step = s?.activities!.slice(seen) ?? [];
    out.push({ leaveMs, loadingMs: s ? step.find((a) => notes.has(a.note ?? ""))?.startMs ?? s.t : Infinity });
  }
  const feasible = !!s && !!returnHome(s, crew, inst.travel);
  const away = feasible && inst.travel(s!.pos, crew.home).km > 0.05 && crew.outOfServiceFromMs === undefined;
  return Object.assign(out, { homeLeaveMs: away ? s!.t : Infinity, feasible });
}

/** What changed between two plans of the same week (loads gone from the week are ignored). */
export function stability(before: Solution, after: Solution): Stability {
  const crewAfter = new Map(after.routes.flatMap((r) => r.loadIds.map((id) => [id, r.crewId] as const)));
  const doneBefore = new Set(before.routes.flatMap((r) => r.loadIds));
  const moved: Stability["moved"] = [];
  for (const r of before.routes) for (const id of r.loadIds) if (crewAfter.get(id) !== r.crewId) moved.push({ loadId: id, from: r.crewId, to: crewAfter.get(id) ?? null });
  const newlyDone = [...crewAfter.keys()].filter((id) => !doneBefore.has(id));
  const beforeOf = new Map(before.routes.map((r) => [r.crewId, r.loadIds.join(",")]));
  const crewIds = new Set([...before.routes.map((r) => r.crewId), ...after.routes.map((r) => r.crewId)]);
  const afterOf = new Map(after.routes.map((r) => [r.crewId, r.loadIds.join(",")]));
  const crewsTouched = [...crewIds].filter((c) => (beforeOf.get(c) ?? "") !== (afterOf.get(c) ?? ""));
  return { moved, newlyDone, crewsTouched };
}
