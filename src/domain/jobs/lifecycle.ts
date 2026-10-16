import type { Driver, Job, JobStatus, PlanDecisionSummary, Trailer, Truck } from "../../data/types";
import type { RouteComplianceRecord } from "../../regulations/types";
import { sortQueuedJobsByAnchor } from "../../lib/driverQueueOrder";
import { fail, makeEvent, ok, type EventSource, type OperationalEvent, type Result } from "../events";
import { isoToClock } from "../time";

/*
 * THE job lifecycle. Every status change in FleetOS goes through this module — the job
 * detail sheet, the Kanban, the dispatch queue and system promotions alike. There is no
 * "force status" path.
 *
 *   backlog ──(assign: planner)──▶ assigned | queued
 *   queued  ──(system promotion)──▶ assigned
 *   assigned ─▶ loading ─▶ in_transit ─▶ delivered ─▶ invoiced
 *   queued | assigned | loading ─(unassign)─▶ backlog
 *   any non-final ─(cancel, reason required)─▶ cancelled
 */

export const STATUS_LABELS: Record<JobStatus, string> = {
  backlog: "Por atribuir",
  queued: "Na fila",
  assigned: "Atribuído",
  loading: "A carregar",
  in_transit: "Em viagem",
  delivered: "Entregue",
  invoiced: "Faturado",
  cancelled: "Cancelado",
};

const FINAL: readonly JobStatus[] = ["invoiced", "cancelled"];
const UNASSIGNABLE: readonly JobStatus[] = ["queued", "assigned", "loading"];

/** The forward step a user can request from each status (UI call-to-action). */
const FORWARD: Partial<Record<JobStatus, { to: JobStatus; label: string }>> = {
  assigned: { to: "loading", label: "Confirmar início de carga" },
  loading: { to: "in_transit", label: "Confirmar saída" },
  in_transit: { to: "delivered", label: "Confirmar entrega" },
  delivered: { to: "invoiced", label: "Marcar como faturado" },
};

export function forwardStep(s: JobStatus): { to: JobStatus; label: string } | null {
  return FORWARD[s] ?? null;
}

export type ResourceIndex = {
  trucks: ReadonlyMap<string, Truck>;
  drivers: ReadonlyMap<string, Driver>;
  trailers: ReadonlyMap<string, Trailer>;
};

export type LifecycleCtx = { now: Date; resources: ResourceIndex; source?: EventSource };

/** Why a job's assigned resources are not usable for execution (missing / archived). */
export function resourceProblems(job: Job, r: ResourceIndex): string[] {
  const p: string[] = [];
  if (!job.assignedTruckId) p.push("sem viatura atribuída");
  else if (!r.trucks.get(job.assignedTruckId)) p.push(`viatura ${job.assignedTruckId} não existe (referência não resolvida)`);
  else if (r.trucks.get(job.assignedTruckId)!.archivedAt) p.push("a viatura atribuída está arquivada");
  if (!job.assignedDriverId) p.push("sem motorista atribuído");
  else if (!r.drivers.get(job.assignedDriverId)) p.push(`motorista ${job.assignedDriverId} não existe (referência não resolvida)`);
  else if (r.drivers.get(job.assignedDriverId)!.archivedAt) p.push("o motorista atribuído está arquivado");
  if (job.assignedTrailerId) {
    const t = r.trailers.get(job.assignedTrailerId);
    if (!t) p.push(`reboque ${job.assignedTrailerId} não existe (referência não resolvida)`);
    else if (t.archivedAt) p.push("o reboque atribuído está arquivado");
  }
  return p;
}

/** Reasons a requested status change is not allowed (empty = allowed). */
export function transitionBlockers(job: Job, to: JobStatus, ctx: LifecycleCtx, reason?: string): string[] {
  const from = job.status;
  if (from === to) return [`o trabalho já está «${STATUS_LABELS[to]}»`];
  if (FINAL.includes(from)) return [`um trabalho «${STATUS_LABELS[from]}» não pode mudar de estado`];
  if (to === "cancelled") {
    if (from === "delivered") return ["um trabalho entregue não pode ser cancelado"];
    return (reason ?? "").trim().length < 3 ? ["indique o motivo do cancelamento"] : [];
  }
  if (to === "backlog") return UNASSIGNABLE.includes(from) ? [] : [`não é possível voltar a «Por expedir» a partir de «${STATUS_LABELS[from]}»`];
  if (to === "assigned" || to === "queued") {
    if (from === "backlog") return ["atribua viatura, motorista e rota no planeador da Expedição"];
    if (from === "queued" && to === "assigned") return ["um trabalho em fila avança automaticamente quando o trabalho anterior da mesma viatura é entregue"];
    return [`transição não permitida: «${STATUS_LABELS[from]}» → «${STATUS_LABELS[to]}»`];
  }
  const step = FORWARD[from];
  if (!step || step.to !== to) return [`transição não permitida: «${STATUS_LABELS[from]}» → «${STATUS_LABELS[to]}» (sem saltar etapas)`];
  const p: string[] = [];
  if (to === "loading" || to === "in_transit") {
    p.push(...resourceProblems(job, ctx.resources));
    if (job.planStatus !== "PLANNED") p.push(job.planStatus === "REPLAN_REQUIRED" ? "a rota tem de ser replaneada (dados alterados após a confirmação)" : "sem rota confirmada");
  }
  if (to === "in_transit") {
    const pending = job.stops.filter((s) => s.type === "pickup" && !s.completed);
    if (pending.length) p.push(`recolha por concluir (${pending.map((s) => s.city || s.address).join(", ")})`);
  }
  if (to === "delivered") {
    const pending = job.stops.filter((s) => s.type !== "pickup" && !s.completed);
    if (pending.length) p.push(`${pending.length} paragem(ns) de entrega/intermédia(s) por concluir`);
  }
  return p;
}

function statusEvent(job: Job, to: JobStatus, at: string, source: EventSource, reason?: string): OperationalEvent {
  return makeEvent({ entityType: "job", entityId: job.id, type: to === "cancelled" ? "JOB_CANCELLED" : "STATUS_CHANGED", at, source, fromStatus: job.status, toStatus: to, ...(reason ? { reason } : {}) });
}

function bump(job: Job, at: string): Pick<Job, "revision" | "updatedAt"> {
  return { revision: job.revision + 1, updatedAt: at };
}

/** Clears assignment + plan (plan kept in history). */
function unassigned(job: Job, at: string): Job {
  return {
    ...job,
    status: "backlog",
    assignedTruckId: undefined,
    assignedDriverId: undefined,
    assignedTrailerId: undefined,
    queuedAt: undefined,
    plannedKm: undefined,
    plannedDurationMin: undefined,
    plannedCostEur: undefined,
    ...(job.routeCompliance ? { routeComplianceHistory: [...(job.routeComplianceHistory ?? []), job.routeCompliance].slice(-10) } : {}),
    routeCompliance: undefined,
    operationalPlan: undefined,
    planStatus: "UNPLANNED",
    // Loading is undone: completed pickups are reopened.
    stops: job.status === "loading" ? job.stops.map((s) => ({ ...s, completed: false, completedAt: undefined, actualTime: undefined })) : job.stops,
    ...bump(job, at),
  };
}

/**
 * Apply a status change. Returns the updated job(s) (a delivery can promote the next
 * queued job of the same truck/driver line) and the events to append.
 */
export function transitionJob(jobs: Job[], jobId: string, to: JobStatus, ctx: LifecycleCtx & { reason?: string }): Result<{ jobs: Job[]; events: OperationalEvent[] }> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return fail("trabalho não encontrado");
  const blockers = transitionBlockers(job, to, ctx, ctx.reason);
  if(job.operationalPlan&&(to==="loading"||to==="in_transit")&&jobs.some(j=>j.id!==job.id&&["loading","in_transit"].includes(j.status)&&(j.assignedTruckId===job.assignedTruckId||j.assignedDriverId===job.assignedDriverId||job.assignedTrailerId&&j.assignedTrailerId===job.assignedTrailerId)))blockers.push("um recurso do plano ainda está em execução noutro trabalho");
  if (blockers.length) return fail(...blockers);
  const at = ctx.now.toISOString();
  const source = ctx.source ?? "LOCAL_USER";
  let next: Job;
  const events: OperationalEvent[] = [statusEvent(job, to, at, source, ctx.reason?.trim())];
  if (to === "backlog") {
    next = unassigned(job, at);
    events.push(makeEvent({ entityType: "job", entityId: job.id, type: "ASSIGNMENT_CHANGED", at, source, data: { truckId: null, driverId: null, trailerId: null, previous: { truckId: job.assignedTruckId, driverId: job.assignedDriverId, trailerId: job.assignedTrailerId } } }));
  } else if (to === "cancelled") {
    next = { ...job, status: "cancelled", cancelReason: ctx.reason!.trim(), queuedAt: undefined, ...bump(job, at) };
  } else {
    next = { ...job, status: to, ...bump(job, at) };
  }
  let out = jobs.map((j) => (j.id === jobId ? next : j));
  if (to === "delivered" || to === "cancelled") {
    const promoted = promoteNextQueued(out, next, at);
    out = promoted.jobs;
    events.push(...promoted.events);
  }
  return ok({ jobs: out, events });
}

/** When a line's active job ends, the closest queued job of the same truck+driver becomes «assigned». */
export function promoteNextQueued(jobs: Job[], ended: Job, at: string): { jobs: Job[]; events: OperationalEvent[] } {
  const plannedQueue=jobs.filter(j=>j.status==="queued"&&j.operationalPlan&&(j.assignedTruckId===ended.assignedTruckId||j.assignedDriverId===ended.assignedDriverId||ended.assignedTrailerId&&j.assignedTrailerId===ended.assignedTrailerId)).sort((a,b)=>a.operationalPlan!.execution.startMs-b.operationalPlan!.execution.startMs||a.id.localeCompare(b.id));
  if(plannedQueue.length){
    let out=jobs;const events:OperationalEvent[]=[];
    for(const candidate of plannedQueue){
      if(out.some(j=>j.id!==candidate.id&&["assigned","loading","in_transit"].includes(j.status)&&(j.assignedTruckId===candidate.assignedTruckId||j.assignedDriverId===candidate.assignedDriverId||candidate.assignedTrailerId&&j.assignedTrailerId===candidate.assignedTrailerId)))continue;
      out=out.map(j=>j.id===candidate.id?{...j,status:"assigned",queuedAt:undefined,...bump(j,at)}:j);
      events.push(makeEvent({entityType:"job",entityId:candidate.id,type:"STATUS_CHANGED",at,source:"SYSTEM",fromStatus:"queued",toStatus:"assigned",reason:`sequência operacional confirmada após ${ended.jobNumber}`}));
    }
    return {jobs:out,events};
  }
  if (!ended.assignedTruckId || !ended.assignedDriverId) return { jobs, events: [] };
  const stillActive = jobs.some((j) => j.id !== ended.id && j.assignedTruckId === ended.assignedTruckId && ["assigned", "loading", "in_transit"].includes(j.status));
  if (stillActive) return { jobs, events: [] };
  const queued = jobs.filter((j) => j.status === "queued" && j.assignedTruckId === ended.assignedTruckId && j.assignedDriverId === ended.assignedDriverId);
  const nextJob = sortQueuedJobsByAnchor(queued, ended)[0];
  if (!nextJob) return { jobs, events: [] };
  const promoted: Job = { ...nextJob, status: "assigned", queuedAt: undefined, ...bump(nextJob, at) };
  return {
    jobs: jobs.map((j) => (j.id === promoted.id ? promoted : j)),
    events: [makeEvent({ entityType: "job", entityId: promoted.id, type: "STATUS_CHANGED", at, source: "SYSTEM", fromStatus: "queued", toStatus: "assigned", reason: `trabalho anterior ${ended.jobNumber} terminou` })],
  };
}

/* ─── Assignment + route plan (planner confirmation) ─── */

export type PlanConfirmation = {
  truckId: string;
  driverId: string;
  trailerId?: string;
  mode: "assigned" | "queued";
  km: number;
  durationMin: number;
  costEur: number;
  compliance?: RouteComplianceRecord;
  decision?: PlanDecisionSummary;
};

export const PLANNABLE_STATUSES: readonly JobStatus[] = ["backlog", "queued", "assigned"];

export function confirmPlan(jobs: Job[], jobId: string, p: PlanConfirmation, ctx: LifecycleCtx): Result<{ jobs: Job[]; events: OperationalEvent[] }> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return fail("trabalho não encontrado");
  if (!PLANNABLE_STATUSES.includes(job.status)) return fail(`não é possível replanear um trabalho «${STATUS_LABELS[job.status]}»`);
  const at = ctx.now.toISOString();
  const source = ctx.source ?? "LOCAL_USER";
  const probe: Job = { ...job, assignedTruckId: p.truckId, assignedDriverId: p.driverId, ...(p.trailerId ? { assignedTrailerId: p.trailerId } : { assignedTrailerId: undefined }) };
  const problems = resourceProblems(probe, ctx.resources);
  if (problems.length) return fail(...problems);
  const status: JobStatus = job.status === "backlog" ? p.mode : job.status;
  const next: Job = {
    ...probe,
    status,
    queuedAt: status === "queued" ? (job.queuedAt ?? at) : undefined,
    plannedKm: p.km,
    plannedDurationMin: p.durationMin,
    plannedCostEur: p.costEur,
    ...(job.routeCompliance ? { routeComplianceHistory: [...(job.routeComplianceHistory ?? []), job.routeCompliance].slice(-10) } : {}),
    routeCompliance: p.compliance,
    operationalPlan: undefined,
    planDecision: p.decision,
    planStatus: "PLANNED",
    planInvalidation: undefined,
    ...bump(job, at),
  };
  const events: OperationalEvent[] = [];
  if (job.assignedTruckId !== p.truckId || job.assignedDriverId !== p.driverId || (job.assignedTrailerId ?? null) !== (p.trailerId ?? null)) {
    events.push(makeEvent({ entityType: "job", entityId: job.id, type: "ASSIGNMENT_CHANGED", at, source, data: { truckId: p.truckId, driverId: p.driverId, trailerId: p.trailerId ?? null, previous: { truckId: job.assignedTruckId ?? null, driverId: job.assignedDriverId ?? null, trailerId: job.assignedTrailerId ?? null } } }));
  }
  events.push(makeEvent({ entityType: "job", entityId: job.id, type: "ROUTE_PLANNED", at, source, data: { km: p.km, durationMin: p.durationMin, costEur: p.costEur, datasetVersion: p.compliance?.report.datasetVersion ?? null, replanned: job.planStatus !== "UNPLANNED" } }));
  if (status !== job.status) events.push(statusEvent(job, status, at, source));
  return ok({ jobs: jobs.map((j) => (j.id === jobId ? next : j)), events });
}

/* ─── Stops ─── */

export function setStopCompleted(job: Job, stopId: string, completed: boolean, ctx: { now: Date; source?: EventSource }): Result<{ job: Job; events: OperationalEvent[] }> {
  const stop = job.stops.find((s) => s.id === stopId);
  if (!stop) return fail("paragem não encontrada");
  if (stop.completed === completed) return fail(completed ? "a paragem já está concluída" : "a paragem não está concluída");
  if (stop.type === "pickup" && !["loading", "in_transit"].includes(job.status)) return fail("uma recolha só pode ser concluída durante a carga ou a viagem");
  if (stop.type !== "pickup" && job.status !== "in_transit") return fail("entregas e paragens intermédias só podem ser concluídas em viagem");
  if (!completed && stop.type === "pickup" && job.status === "in_transit") return fail("não é possível reabrir uma recolha depois da saída");
  const at = ctx.now.toISOString();
  const next: Job = {
    ...job,
    stops: job.stops.map((s) => (s.id === stopId ? (completed ? { ...s, completed: true, completedAt: at, actualTime: isoToClock(at) } : { ...s, completed: false, completedAt: undefined, actualTime: undefined }) : s)),
    ...bump(job, at),
  };
  return ok({ job: next, events: [makeEvent({ entityType: "job", entityId: job.id, type: "STOP_UPDATED", at, source: ctx.source ?? "LOCAL_USER", data: { stopId, completed, sequence: stop.sequence } })] });
}

export function updateNotes(job: Job, notes: string, now: Date): { job: Job; events: OperationalEvent[] } {
  const at = now.toISOString();
  return {
    job: { ...job, notes: notes.trim() || undefined, ...bump(job, at) },
    events: [makeEvent({ entityType: "job", entityId: job.id, type: "NOTES_UPDATED", at, source: "LOCAL_USER" })],
  };
}
