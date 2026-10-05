import type { Job } from "../data/types";

/**
 * Dispatch queue = decisions still to make: jobs never planned, and plans invalidated by an
 * edit. Planned, running and finished work lives in Trabalhos, not here.
 */
export function dispatchQueue(jobs: Job[]): { toPlan: Job[]; replan: Job[] } {
  return {
    toPlan: jobs.filter((j) => j.status === "backlog" && j.planStatus !== "REPLAN_REQUIRED"),
    replan: jobs.filter((j) => j.planStatus === "REPLAN_REQUIRED" && ["backlog", "queued", "assigned"].includes(j.status)),
  };
}
