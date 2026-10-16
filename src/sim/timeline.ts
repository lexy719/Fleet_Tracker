import type { Job } from "../data/types";
import type { JobExecution, PlanningMovement } from "../domain/planning/types";
import type { Activity } from "../legal/driverLegality";
import { planStops, type DriverState } from "../ops/drivingStops";

/*
 * Driver activity timeline from planner executions — what the tachograph would record.
 * Driving is split by the planner's own break/rest stops; loading/unloading is WORK;
 * waiting for a time window is classified by `WaitPolicy` (the planner itself treats any
 * idle ≥ 45 min as a break, which is exactly what the legal audit must challenge).
 */

export type WaitPolicy = {
  /**
   * How a dock wait between 15 min and 9 h is recorded. "AVAILABLE" (default, conservative):
   * known waiting time — neither a break nor rest. "BREAK": the driver is free and records rest.
   */
  midWait: "AVAILABLE" | "BREAK";
};
export const DEFAULT_WAIT_POLICY: WaitPolicy = { midWait: "AVAILABLE" };

const MIN = 60_000;

function waitActivities(startMs: number, endMs: number, p: WaitPolicy): Activity[] {
  const len = endMs - startMs;
  if (len <= 0) return [];
  // ≥ 9 h stationary: daily rest in the cab. < 15 min: availability (too short for any break).
  const kind = len >= 9 * 60 * MIN ? "REST" : len < 15 * MIN ? "AVAILABLE" : p.midWait;
  return [{ kind, startMs, endMs, note: "espera" }];
}

/** Driving segments of one movement, interrupted by the planner's breaks/rests. */
export function movementActivities(m: PlanningMovement): Activity[] {
  const stops = (m.evaluationInput.route.timing?.stops ?? []).filter((s) => s.atDrivingSec < m.route.durationSec);
  return drivingWithStops(m.departMs, m.route.durationSec, stops.map((s) => ({ ...s })), m.kind === "EMPTY" ? "vazio" : "carregado");
}

export function drivingWithStops(departMs: number, drivingSec: number, stops: { kind: "break" | "rest"; atDrivingSec: number; durationSec: number }[], note: string): Activity[] {
  const out: Activity[] = [];
  let t = departMs;
  let driven = 0;
  for (const s of stops) {
    const seg = (s.atDrivingSec - driven) * 1000;
    if (seg > 0) out.push({ kind: "DRIVE", startMs: t, endMs: t + seg, note });
    t += seg;
    driven = s.atDrivingSec;
    out.push({ kind: s.kind === "rest" ? "REST" : "BREAK", startMs: t, endMs: t + s.durationSec * 1000, note: s.kind === "rest" ? "descanso diário" : "pausa 45 min" });
    t += s.durationSec * 1000;
  }
  const rest = (drivingSec - driven) * 1000;
  if (rest > 0) out.push({ kind: "DRIVE", startMs: t, endMs: t + rest, note });
  return out;
}

/** Full activity timeline of a sequence of executions. */
export function executionsTimeline(executions: JobExecution[], jobs: Job[], p: WaitPolicy = DEFAULT_WAIT_POLICY): Activity[] {
  const out: Activity[] = [];
  for (const e of executions) {
    const job = jobs.find((j) => j.id === e.jobId)!;
    const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
    const service = (i: number) => (job.operationalRequirements?.serviceSecByStop?.[stops[i]!.id] ?? 0) * 1000;
    const empty = e.movements.find((m) => m.kind === "EMPTY");
    const loaded = e.movements.filter((m) => m.kind === "LOADED");
    let t = e.startMs;
    if (empty) {
      out.push(...movementActivities(empty));
      t = Math.max(t, out.at(-1)?.endMs ?? t);
    }
    // Pickup: wait for the window, then load (service ends when the loaded leg departs).
    for (let i = 0; i < loaded.length; i++) {
      const m = loaded[i]!;
      const serviceStart = m.departMs - service(i);
      out.push(...waitActivities(t, serviceStart, p));
      if (service(i) > 0) out.push({ kind: "WORK", startMs: serviceStart, endMs: m.departMs, note: i === 0 ? "carga" : "paragem" });
      out.push(...movementActivities(m));
      t = out.at(-1)!.endMs;
    }
    // Delivery: wait for the window, then unload, ending at the execution end.
    const last = service(stops.length - 1);
    out.push(...waitActivities(t, e.endMs - last, p));
    if (last > 0) out.push({ kind: "WORK", startMs: e.endMs - last, endMs: e.endMs, note: "descarga" });
  }
  return out;
}

/** Empty drive home with the breaks/rest the driver's state requires. */
export function homeLegActivities(departMs: number, drivingSec: number, driver: DriverState): Activity[] {
  if (drivingSec <= 0) return [];
  return drivingWithStops(departMs, drivingSec, planStops(drivingSec, driver), "regresso a casa");
}
