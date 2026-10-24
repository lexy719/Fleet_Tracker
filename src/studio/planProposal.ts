// The engine's proposal for "O dia": the open transports organised by driver (fewer empty km, more work
// per driver) — the same engine, request and batches as Expedição's automatic planning (AutoPlanPanel).
// It runs by itself when the day is shown and there is work to place; the result is kept for the session
// (keyed by the open transports), so going back and forth does not run it again. Nothing is assigned
// until the office accepts it (confirmBatches, the same confirmation as Expedição).
import { useEffect, useState } from "react";
import { planningRouter } from "../application/planningRouter";
import { useRoadEvents } from "../context/RoadEventsContext";
import { useFuel } from "../context/FuelContext";
import { getTomTomKey } from "../tomtom/config";
import type { PlanningRequest } from "../domain/planning/types";
import { confirmBatches, orderForBatches, previewBatches, type BatchPreview, type ConfirmOutcome } from "./batchPlanning";
import { mergeDiagnostics } from "./planReasons";
import { W } from "./world/active";
import { isoToLocal, localToIso } from "../domain/time";

export type Proposal =
  | { phase: "idle" }
  | { phase: "planning"; done: number; total: number; jobs: number }
  | { phase: "ready"; preview: BatchPreview; fromMs: number; jobs: number }
  | { phase: "confirming"; preview: BatchPreview; fromMs: number; jobs: number; done: number; total: number }
  | { phase: "confirmed"; outcome: ConfirmOutcome }
  | { phase: "error"; message: string };

// The run lives outside the component: it is not cancelled when the day is closed or remounted
// (React dev mounts twice); it finishes, and whoever shows the day next reads its result.
let cache: { key: string; value: Proposal } | null = null;
const listeners = new Set<(v: Proposal) => void>();
/** The last acceptance, shown for a while even after the engine starts on what is left. */
let lastAccepted: { n: number; at: number } | null = null;
export const recentlyAccepted = () => (lastAccepted && Date.now() - lastAccepted.at < 12_000 ? lastAccepted.n : 0);
const publish = (key: string, v: Proposal) => {
  cache = { key, value: v };
  listeners.forEach((f) => f(v));
};

export function usePlanProposal(active: boolean) {
  const ops = W().ops;
  const { dataset } = useRoadEvents();
  const { intelligence: fuel, ready: fuelReady } = useFuel();
  const backlog = ops ? ops.service.getState().jobs.filter((j) => j.status === "backlog") : [];
  const key = backlog.map((j) => `${j.id}:${j.revision ?? 0}`).join("|");
  const [state, setState] = useState<Proposal>(() => (cache?.key === key ? cache.value : { phase: "idle" }));
  const set = (v: Proposal) => publish(key, v);
  useEffect(() => {
    const f = (v: Proposal) => setState(v);
    listeners.add(f);
    if (cache?.key === key) setState(cache.value);
    return () => {
      listeners.delete(f);
    };
  }, [key]);

  const request = (jobIds: string[], fromMs: number, initialState?: PlanningRequest["initialState"]): PlanningRequest => {
    const now = Date.now();
    return {
      ...ops!.service.getState(),
      scopeJobIds: jobIds,
      nowMs: now,
      earliestStartMs: fromMs,
      horizonEndMs: Math.max(fromMs, now) + 6 * 86400_000,
      dataset,
      constraints: [],
      route: planningRouter(getTomTomKey() ?? "", dataset, undefined, undefined, fuel).route,
      ...(initialState ? { initialState } : {}),
    };
  };

  useEffect(() => {
    // Wait for the fuel data the router prices with (as Expedição, which runs on a click after load).
    if (!active || !fuelReady || !ops || !backlog.length || (cache?.key === key && cache.value.phase !== "idle")) return;
    const controller = new AbortController(); // never aborted from here: the run completes and is cached
    // Same earliest departure as Expedição: in 10 minutes, on the Lisbon minute.
    const fromMs = Date.parse(localToIso(isoToLocal(new Date(Date.now() + 10 * 60_000).toISOString()))!);
    const ordered = orderForBatches(backlog);
    set({ phase: "planning", done: 0, total: Math.ceil(ordered.length / 3), jobs: ordered.length });
    previewBatches({
      scope: ordered,
      makeRequest: (jobIds, initialState) => request(jobIds, fromMs, initialState),
      service: ops.service,
      signal: controller.signal,
      onProgress: (done, total) => set({ phase: "planning", done, total, jobs: ordered.length }),
    })
      .then((preview) => set({ phase: "ready", preview, fromMs, jobs: ordered.length }))
      .catch((e) => set({ phase: "error", message: e instanceof Error ? e.message : String(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, fuelReady]);

  /** Accept the proposal: the same batch confirmation as Expedição (re-planned on the real data). */
  const accept = async () => {
    if (state.phase !== "ready" || !ops) return;
    const { preview, fromMs, jobs } = state;
    set({ phase: "confirming", preview, fromMs, jobs, done: 0, total: preview.batches.length });
    try {
      const outcome = await confirmBatches({
        preview,
        service: ops.service,
        dataset,
        acknowledge: true,
        makeRequest: (jobIds) => request(jobIds, fromMs),
        onProgress: (done, total) => set({ phase: "confirming", preview, fromMs, jobs, done, total }),
      });
      if (outcome.confirmed) lastAccepted = { n: outcome.confirmed, at: Date.now() };
      set({ phase: "confirmed", outcome });
    } catch (e) {
      set({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return { state, accept, reasons: state.phase === "ready" || state.phase === "confirming" ? mergeDiagnostics(state.preview.diagnostics).slice(0, 3) : [] };
}
