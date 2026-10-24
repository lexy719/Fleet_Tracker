// Batch planning — the whole open workload planned in small batches so each engine run keeps
// its own route-request budget (planningRouter: 64 per run). Same engine and commands as
// Expedição: planFleet → savePlanningRecommendation → confirmOperationalRecommendation.
//
// Preview: batch k is planned on top of batch k-1's projected fleet state (futureState), so
//          the office sees ONE combined plan without anything being written.
// Confirm: batch 1 is confirmed as planned. Every later batch is re-planned on the now-real
//          data (confirmation refuses plans made before the data changed) and confirmed only
//          if it matches what was approved; otherwise the run stops for review.
import { planFleet } from "../domain/planning/planner";
import type { JobExecution, OperationalPlan, PlanningConstraint, PlanningRequest, PlanningResult } from "../domain/planning/types";
import type { OperationsService } from "../application/operations";
import type { RegulationDataset } from "../regulations/types";

export const BATCH_SIZE = 3;
const START_TOLERANCE_MS = 10 * 60_000;

export type Batch = { jobIds: string[]; result: PlanningResult; recommendationId: string };
export type BatchPreview = {
  batches: Batch[];
  /** Executions of every batch's recommended plan, in batch order. */
  executions: JobExecution[];
  trips: { assignment: JobExecution["assignment"]; jobIds: string[] }[];
  unassignedJobIds: string[];
  diagnostics: PlanningResult["diagnostics"];
  metrics: { loadedKm: number; emptyKm: number; totalDrivingSec: number; restSec: number; generalizedCostEur: number; providerFuelTollEur: number };
  reviewRequired: boolean;
  truncatedBatches: number;
};

type MakeRequest = (scope: string[], initialState: PlanningRequest["initialState"] | undefined) => PlanningRequest;

/** Earliest pickup first, so earlier work claims resources first (as an office would). */
export function orderForBatches(jobs: { id: string; stops: { sequence: number; windowStartAt?: string; scheduledTime: string }[] }[]): string[] {
  const key = (j: (typeof jobs)[number]) => {
    const first = [...j.stops].sort((a, b) => a.sequence - b.sequence)[0];
    return first?.windowStartAt ? Date.parse(first.windowStartAt) : Number.MAX_SAFE_INTEGER;
  };
  return [...jobs].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id)).map((j) => j.id);
}

export async function previewBatches(args: {
  scope: string[];
  makeRequest: MakeRequest;
  service: OperationsService;
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
}): Promise<BatchPreview> {
  const chunks: string[][] = [];
  for (let i = 0; i < args.scope.length; i += BATCH_SIZE) chunks.push(args.scope.slice(i, i + BATCH_SIZE));
  const batches: Batch[] = [];
  let state: PlanningRequest["initialState"] | undefined;
  const plan = async (jobIds: string[]) => {
    const result = await planFleet({ ...args.makeRequest(jobIds, state), signal: args.signal, yieldControl: () => new Promise((r) => setTimeout(r, 0)) });
    if (args.signal.aborted) throw new DOMException("aborted", "AbortError");
    const saved = await args.service.savePlanningRecommendation(result);
    if (!saved.ok) throw new Error(saved.errors.join("; "));
    batches.push({ jobIds, result, recommendationId: saved.value.id });
    if (result.recommended) state = result.recommended.futureState;
    return result;
  };
  const total = chunks.length + 1;
  for (const [i, c] of chunks.entries()) {
    args.onProgress(i, total);
    await plan(c);
  }
  // One retry pass for jobs left out only because a batch's search budget ran out.
  const retry = batches.filter((b) => b.result.search.truncated).flatMap((b) => b.result.unassignedJobIds);
  if (retry.length) {
    args.onProgress(chunks.length, total);
    await plan(retry);
  }
  args.onProgress(total, total);
  return combine(batches);
}

function combine(batches: Batch[]): BatchPreview {
  const plans = batches.map((b) => b.result.recommended).filter((p): p is OperationalPlan => !!p);
  const executions = plans.flatMap((p) => p.executions);
  const planned = new Set(executions.map((e) => e.jobId));
  const trips = new Map<string, BatchPreview["trips"][number]>();
  for (const p of plans)
    for (const t of p.trips) {
      const k = `${t.assignment.truckId}/${t.assignment.driverId}/${t.assignment.trailerId ?? ""}`;
      const cur = trips.get(k);
      if (cur) cur.jobIds.push(...t.jobIds);
      else trips.set(k, { assignment: t.assignment, jobIds: [...t.jobIds] });
    }
  const sum = (f: (p: OperationalPlan) => number) => plans.reduce((a, p) => a + f(p), 0);
  return {
    batches,
    executions,
    trips: [...trips.values()],
    unassignedJobIds: [...new Set(batches.flatMap((b) => b.result.unassignedJobIds))].filter((id) => !planned.has(id)),
    diagnostics: batches.flatMap((b) => b.result.diagnostics),
    metrics: {
      loadedKm: sum((p) => p.metrics.loadedKm),
      emptyKm: sum((p) => p.metrics.emptyKm),
      totalDrivingSec: sum((p) => p.metrics.totalDrivingSec),
      restSec: sum((p) => p.metrics.restSec),
      generalizedCostEur: sum((p) => p.metrics.generalizedCostEur),
      providerFuelTollEur: sum((p) => p.metrics.providerFuelTollEur),
    },
    reviewRequired: plans.some((p) => p.status === "REVIEW_REQUIRED"),
    truncatedBatches: batches.filter((b) => b.result.search.truncated).length,
  };
}

/** Same jobs, same truck/driver/trailer, starts within tolerance → what the office approved. */
function sameAsApproved(approved: JobExecution[], fresh: OperationalPlan | null): boolean {
  if (!fresh) return approved.length === 0;
  if (fresh.executions.length !== approved.length) return false;
  return approved.every((a) => {
    const f = fresh.executions.find((e) => e.jobId === a.jobId);
    return (
      !!f &&
      f.assignment.truckId === a.assignment.truckId &&
      f.assignment.driverId === a.assignment.driverId &&
      (f.assignment.trailerId ?? "") === (a.assignment.trailerId ?? "") &&
      Math.abs(f.startMs - a.startMs) <= START_TOLERANCE_MS
    );
  });
}

export type ConfirmOutcome = { confirmed: number; stoppedAt: number | null; reason: string | null };

export async function confirmBatches(args: {
  preview: BatchPreview;
  service: OperationsService;
  dataset: RegulationDataset;
  acknowledge: boolean;
  /** A fresh request on the current (real) data for these jobs. */
  makeRequest: (scope: string[]) => PlanningRequest;
  onProgress: (done: number, total: number) => void;
}): Promise<ConfirmOutcome> {
  const work = args.preview.batches.filter((b) => b.result.recommended?.executions.length);
  let confirmed = 0;
  for (const [i, b] of work.entries()) {
    args.onProgress(i, work.length);
    let recommendationId = b.recommendationId;
    let planId = b.result.recommended!.id;
    if (i > 0) {
      // The data changed with the previous confirmation: plan this batch again on it.
      const approved = b.result.recommended!.executions;
      const jobIds = approved.map((e) => e.jobId);
      const fresh = await planFleet({ ...args.makeRequest(jobIds), yieldControl: () => new Promise((r) => setTimeout(r, 0)) });
      if (!sameAsApproved(approved, fresh.recommended))
        return { confirmed, stoppedAt: i, reason: "Depois de confirmar os lotes anteriores, o motor propõe outra combinação para este lote. Reveja e planeie de novo." };
      const saved = await args.service.savePlanningRecommendation(fresh);
      if (!saved.ok) return { confirmed, stoppedAt: i, reason: saved.errors.join("; ") };
      recommendationId = saved.value.id;
      planId = fresh.recommended!.id;
    }
    const r = await args.service.confirmOperationalRecommendation(recommendationId, planId, args.dataset, args.acknowledge);
    if (!r.ok) return { confirmed, stoppedAt: i, reason: r.errors.join("; ") };
    confirmed += r.value.selected.executions.length;
  }
  args.onProgress(work.length, work.length);
  return { confirmed, stoppedAt: null, reason: null };
}

export type { PlanningConstraint };
