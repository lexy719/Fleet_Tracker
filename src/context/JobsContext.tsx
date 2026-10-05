import { useCallback, useMemo } from "react";
import type { Job } from "../data/types";
import { STATUS_LABELS } from "../domain/jobs/lifecycle";
import { useOperations } from "./OperationsContext";

/*
 * Jobs read/write hook — a thin adapter over the OperationsService. All status changes go
 * through the lifecycle service (`transition`); there is no force-status path.
 */

export { STATUS_LABELS };

const UNASSIGNABLE: ReadonlySet<Job["status"]> = new Set(["assigned", "queued", "loading"]);

/** Jobs whose assignment can be removed (back to «Por expedir»). */
export function canUnassignJob(j: Job): boolean {
  return UNASSIGNABLE.has(j.status);
}

export function useJobs() {
  const { state, service } = useOperations();
  const jobs = state.jobs;
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const getJob = useCallback((id: string) => byId.get(id), [byId]);
  return useMemo(
    () => ({
      jobs,
      getJob,
      createJob: service.createJob.bind(service),
      editJob: service.editJob.bind(service),
      transition: service.transition.bind(service),
      unassignJob: (id: string) => service.transition(id, "backlog"),
      cancelJob: (id: string, reason: string) => service.transition(id, "cancelled", reason),
      confirmPlan: service.confirmPlan.bind(service),
      setStopCompleted: service.setStopCompleted.bind(service),
      updateNotes: service.updateNotes.bind(service),
      listEvents: service.listEvents.bind(service),
    }),
    [jobs, getJob, service],
  );
}
