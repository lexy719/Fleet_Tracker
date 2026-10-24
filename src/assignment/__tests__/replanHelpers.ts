import { appendLoad, initialState, returnHome, type CrewState } from "../crewSchedule";
import type { Instance, Solution } from "../model";

/** Recorded activity timeline of each crew's week, plus when it left for each load. */
function timelines(inst: Instance, sol: Solution) {
  const byId = new Map(inst.loads.map((l) => [l.id, l]));
  return new Map(inst.crews.map((c) => {
    const ids = sol.routes.find((r) => r.crewId === c.id)?.loadIds ?? [];
    let s: CrewState | null = initialState(c, true);
    const leave = new Map<string, number>();
    for (const id of ids) {
      if (!s) break;
      leave.set(id, s.t);
      s = appendLoad(s, byId.get(id)!, inst.travel, c);
    }
    s = s && returnHome(s, c, inst.travel);
    return [c.id, { activities: s?.activities ?? null, leave }] as const;
  }));
}

/**
 * What a replan changed in the past: for every crew, the driving and the loading/unloading before
 * `nowMs` (or before its truck stopped, or before it left for a load that got stranded) must be the
 * same, minute for minute. Idle time is not compared: a crew idle at home has no activities in the
 * old plan and a wait in the new one.
 */
export function pastChanges(oldInst: Instance, oldSol: Solution, newInst: Instance, newSol: Solution, nowMs: number): string[] {
  const before = timelines(oldInst, oldSol), after = timelines(newInst, newSol);
  const kept = new Set(newInst.loads.map((l) => l.id));
  const out: string[] = [];
  for (const c of newInst.crews) {
    const a = before.get(c.id)!, b = after.get(c.id)!;
    if (!a.activities) continue; // not in the old plan: it had no past to keep
    if (!b.activities) {
      out.push(`${c.id}: semana inviável`);
      continue;
    }
    let cut = Math.min(nowMs, c.outOfServiceFromMs ?? Infinity);
    for (const [id, t] of a.leave) if (!kept.has(id) && t < nowMs) cut = Math.min(cut, t); // stranded or cancelled after leaving
    // An activity under way at the cut is compared up to the cut (a delay splits it there).
    const upTo = (xs: NonNullable<typeof a.activities>) => xs.filter((x) => x.startMs < cut && (x.kind === "DRIVE" || x.kind === "WORK")).map((x) => ({ ...x, endMs: Math.min(x.endMs, cut) }));
    const pa = upTo(a.activities), pb = upTo(b.activities);
    if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push(`${c.id}: o passado mudou`);
  }
  return out;
}
