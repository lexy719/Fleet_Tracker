import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import { jobs as seedJobs } from "../data/mockData";
import type { Job, JobStatus, JobStop } from "../data/types";
import { sortQueuedJobsByAnchor } from "../lib/driverQueueOrder";
import { resolveAssignmentMode } from "../lib/truckJobConstraints";

/* ─── Status machine ────────────────────────────────────
   Valid forward transitions — no skipping allowed.      */
export const STATUS_LABELS: Record<JobStatus, string> = {
  backlog:    "Por expedir",
  queued:     "Na fila",
  assigned:   "Motorista a caminho",
  loading:    "A carregar",
  in_transit: "Em viagem",
  delivered:  "Entregue",
  invoiced:   "Faturado",
  cancelled:  "Cancelado",
};

const NEXT_STATUS: Partial<Record<JobStatus, JobStatus>> = {
  backlog:    "assigned",
  assigned:   "loading",
  loading:    "in_transit",
  in_transit: "delivered",
  delivered:  "invoiced",
};

const CTA_LABEL: Partial<Record<JobStatus, string>> = {
  backlog:    "Atribuir viatura e motorista",
  queued:     "Na fila — aguarda vez",
  assigned:   "Confirmar início de carga",
  loading:    "Confirmar saída",
  in_transit: "Confirmar entrega",
  delivered:  "Emitir fatura",
};

export function getNextStatus(s: JobStatus): JobStatus | null {
  return NEXT_STATUS[s] ?? null;
}

export function getCtaLabel(s: JobStatus): string {
  return CTA_LABEL[s] ?? "Avançar";
}

/* ─── Actions ─────────────────────────────────────────── */
export type JobAction =
  | { type: "ASSIGN";         jobId: string; truckId: string; driverId: string }
  | { type: "ADVANCE";        jobId: string }
  | { type: "COMPLETE_STOP";  jobId: string; stopId: string }
  | { type: "UNCOMPLETE_STOP"; jobId: string; stopId: string }
  | { type: "CREATE";         job: Job }
  | { type: "CANCEL";         jobId: string }
  /** Remove assignment (volta a «Por atribuir»); liberta viatura + motorista no quadro. */
  | { type: "UNASSIGN";       jobId: string }
  | { type: "UPDATE_NOTES";   jobId: string; notes: string }
  | {
      type: "PLAN_ROUTE";
      jobId: string; truckId: string; driverId: string;
      km: number; durationMin: number; costEur: number;
    }
  /** Force any status (used by Kanban DnD). Moving to «backlog» clears assignment. */
  | { type: "FORCE_STATUS"; jobId: string; targetStatus: JobStatus };

const UNASSIGNABLE: ReadonlySet<Job["status"]> = new Set(["assigned", "queued", "loading"]);

/** Trabalhos onde se pode remover a atribuição (volta ao backlog). */
export function canUnassignJob(j: Job): boolean {
  return UNASSIGNABLE.has(j.status);
}

function promoteNextQueuedAfterDelivered(jobs: Job[], deliveredJobId: string): Job[] {
  const delivered = jobs.find((j) => j.id === deliveredJobId);
  if (!delivered?.assignedDriverId || !delivered.assignedTruckId) return jobs;

  const queued = jobs.filter(
    (j) =>
      j.status === "queued" &&
      j.assignedDriverId === delivered.assignedDriverId &&
      j.assignedTruckId === delivered.assignedTruckId,
  );
  if (queued.length === 0) return jobs;

  const sorted = sortQueuedJobsByAnchor(queued, delivered);
  const next = sorted[0];
  if (!next) return jobs;

  return jobs.map((j) =>
    j.id === next.id ? { ...j, status: "assigned" as const, queuedAt: undefined } : j,
  );
}

/* ─── Reducer ─────────────────────────────────────────── */
function reducer(jobs: Job[], action: JobAction): Job[] {
  switch (action.type) {
    case "ASSIGN": {
      const mode = resolveAssignmentMode(jobs, action.jobId, action.truckId, action.driverId);
      if (mode === null) return jobs;
      const now = new Date().toISOString();
      return jobs.map((j) =>
        j.id === action.jobId
          ? {
              ...j,
              status:           mode === "queued" ? "queued" : "assigned",
              assignedTruckId:  action.truckId,
              assignedDriverId: action.driverId,
              slaStatus:        j.slaStatus,
              queuedAt:         mode === "queued" ? now : undefined,
            }
          : j,
      );
    }

    case "ADVANCE": {
      const job = jobs.find((j) => j.id === action.jobId);
      if (!job) return jobs;
      const next = getNextStatus(job.status);
      if (!next) return jobs;
      let updated = jobs.map((j) =>
        j.id === action.jobId ? { ...j, status: next } : j,
      );
      if (next === "delivered") {
        updated = promoteNextQueuedAfterDelivered(updated, action.jobId);
      }
      return updated;
    }

    case "COMPLETE_STOP":
      return jobs.map((j) =>
        j.id === action.jobId
          ? {
              ...j,
              stops: j.stops.map((s: JobStop) =>
                s.id === action.stopId
                  ? {
                      ...s,
                      completed:  true,
                      actualTime: new Date().toTimeString().slice(0, 5),
                    }
                  : s,
              ),
            }
          : j,
      );

    case "UNCOMPLETE_STOP":
      return jobs.map((j) =>
        j.id === action.jobId
          ? {
              ...j,
              stops: j.stops.map((s: JobStop) =>
                s.id === action.stopId
                  ? { ...s, completed: false, actualTime: undefined }
                  : s,
              ),
            }
          : j,
      );

    case "CREATE":
      return [action.job, ...jobs];

    case "CANCEL":
      return jobs.map((j) =>
        j.id === action.jobId ? { ...j, status: "cancelled" } : j,
      );

    case "UNASSIGN": {
      const job = jobs.find((j) => j.id === action.jobId);
      if (!job || !UNASSIGNABLE.has(job.status)) return jobs;
      return jobs.map((j) => {
        if (j.id !== action.jobId) return j;
        const resetStops =
          job.status === "loading"
            ? j.stops.map((s) => ({ ...s, completed: false, actualTime: undefined }))
            : j.stops;
        return {
          ...j,
          status: "backlog",
          assignedTruckId: undefined,
          assignedDriverId: undefined,
          plannedKm: undefined,
          plannedDurationMin: undefined,
          plannedCostEur: undefined,
          queuedAt: undefined,
          stops: resetStops,
        };
      });
    }

    case "UPDATE_NOTES":
      return jobs.map((j) =>
        j.id === action.jobId ? { ...j, notes: action.notes } : j,
      );

    case "PLAN_ROUTE": {
      const mode = resolveAssignmentMode(jobs, action.jobId, action.truckId, action.driverId);
      if (mode === null) return jobs;
      const now = new Date().toISOString();
      return jobs.map((j) => {
        if (j.id !== action.jobId) return j;
        const isBacklog = j.status === "backlog";
        const nextStatus = isBacklog ? (mode === "queued" ? "queued" : "assigned") : j.status;
        const nextQueuedAt =
          isBacklog && mode === "queued"
            ? now
            : isBacklog && mode === "assigned"
              ? undefined
              : j.queuedAt;
        return {
          ...j,
          status: nextStatus,
          assignedTruckId: action.truckId,
          assignedDriverId: action.driverId,
          plannedKm: action.km,
          plannedDurationMin: action.durationMin,
          plannedCostEur: action.costEur,
          queuedAt: nextQueuedAt,
        };
      });
    }

    case "FORCE_STATUS": {
      const job = jobs.find((j) => j.id === action.jobId);
      if (!job) return jobs;
      if (job.status === "invoiced" || job.status === "cancelled") return jobs;
      if (action.targetStatus === job.status) return jobs;
      /* Moving back to backlog — wipe assignment so truck/driver are freed */
      if (action.targetStatus === "backlog") {
        return jobs.map((j) =>
          j.id !== action.jobId ? j : {
            ...j,
            status: "backlog",
            assignedTruckId:   undefined,
            assignedDriverId:  undefined,
            plannedKm:         undefined,
            plannedDurationMin: undefined,
            plannedCostEur:    undefined,
            queuedAt:          undefined,
            stops: j.stops.map((s) => ({ ...s, completed: false, actualTime: undefined })),
          },
        );
      }
      let updated = jobs.map((j) =>
        j.id !== action.jobId ? j : { ...j, status: action.targetStatus },
      );
      if (action.targetStatus === "delivered") {
        updated = promoteNextQueuedAfterDelivered(updated, action.jobId);
      }
      return updated;
    }

    default:
      return jobs;
  }
}

/* ─── Context ─────────────────────────────────────────── */
type JobsCtx = {
  jobs:            Job[];
  dispatch:        (action: JobAction) => void;
  assignJob:       (jobId: string, truckId: string, driverId: string) => void;
  advanceJob:      (jobId: string) => void;
  completeStop:    (jobId: string, stopId: string) => void;
  uncompleteStop:  (jobId: string, stopId: string) => void;
  cancelJob:       (jobId: string) => void;
  unassignJob:     (jobId: string) => void;
  createJob:       (job: Job) => void;
  updateNotes:     (jobId: string, notes: string) => void;
  getJob:          (jobId: string) => Job | undefined;
  planRoute:       (jobId: string, truckId: string, driverId: string, km: number, durationMin: number, costEur: number) => void;
  forceJobStatus:  (jobId: string, targetStatus: JobStatus) => void;
};

const JobsContext = createContext<JobsCtx | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, dispatch] = useReducer(reducer, undefined, () => {
    try {
      const stored = localStorage.getItem("fleet-jobs-v3");
      if (stored) return JSON.parse(stored) as Job[];
    } catch { /* ignore */ }
    return structuredClone(seedJobs);
  });

  useEffect(() => {
    try { localStorage.setItem("fleet-jobs-v3", JSON.stringify(jobs)); } catch { /* quota */ }
  }, [jobs]);

  const assignJob     = useCallback((jobId: string, truckId: string, driverId: string) => dispatch({ type: "ASSIGN", jobId, truckId, driverId }), []);
  const advanceJob    = useCallback((jobId: string) => dispatch({ type: "ADVANCE", jobId }), []);
  const completeStop  = useCallback((jobId: string, stopId: string) => dispatch({ type: "COMPLETE_STOP", jobId, stopId }), []);
  const uncompleteStop = useCallback((jobId: string, stopId: string) => dispatch({ type: "UNCOMPLETE_STOP", jobId, stopId }), []);
  const cancelJob     = useCallback((jobId: string) => dispatch({ type: "CANCEL", jobId }), []);
  const unassignJob   = useCallback((jobId: string) => dispatch({ type: "UNASSIGN", jobId }), []);
  const createJob     = useCallback((job: Job) => dispatch({ type: "CREATE", job }), []);
  const updateNotes   = useCallback((jobId: string, notes: string) => dispatch({ type: "UPDATE_NOTES", jobId, notes }), []);
  const getJob        = useCallback((jobId: string) => jobs.find((j) => j.id === jobId), [jobs]);
  const planRoute     = useCallback(
    (jobId: string, truckId: string, driverId: string, km: number, durationMin: number, costEur: number) =>
      dispatch({ type: "PLAN_ROUTE", jobId, truckId, driverId, km, durationMin, costEur }),
    [],
  );
  const forceJobStatus = useCallback(
    (jobId: string, targetStatus: JobStatus) => dispatch({ type: "FORCE_STATUS", jobId, targetStatus }),
    [],
  );

  return (
    <JobsContext.Provider
      value={{ jobs, dispatch, assignJob, advanceJob, completeStop, uncompleteStop, cancelJob, unassignJob, createJob, updateNotes, getJob, planRoute, forceJobStatus }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used inside <JobsProvider>");
  return ctx;
}
