import type { JobStop } from "../data/types";

/** Minimal shape shared by legacy and current jobs. */
type StoredJobLike = { id: string; isDemo?: boolean; plannedDepartureAt?: string; stops: Pick<JobStop, "id" | "windowStartAt" | "windowEndAt">[] };

/**
 * Controlled migration of jobs persisted in localStorage ("fleet-jobs-v3", pre-Phase 5).
 * Used once by the operational bootstrap before converting to the current record shape.
 *
 * - Entries that are not job-shaped are dropped (logged) instead of crashing the app.
 * - DEMO jobs (isDemo) may receive fields added to the seed later (dated windows,
 *   planned departure) — only when absent, copied verbatim from the seed.
 * - Non-demo jobs are never reinterpreted: a legacy clock-only window stays legacy
 *   (Road Intelligence reports it as not assessable).
 * - Demo jobs missing from storage are appended once.
 */
export function migrateStoredJobs<J extends StoredJobLike>(raw: unknown, seed: readonly J[]): J[] {
  if (!Array.isArray(raw)) return structuredClone([...seed]);
  const jobs: J[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || typeof (entry as J).id !== "string" || !Array.isArray((entry as J).stops)) {
      console.warn("[jobsStorage] dropping malformed stored job", entry);
      continue;
    }
    const job = entry as J;
    const seedJob = job.isDemo ? seed.find((s) => s.id === job.id && s.isDemo) : undefined;
    if (!seedJob) {
      jobs.push(job);
      continue;
    }
    jobs.push({
      ...job,
      plannedDepartureAt: job.plannedDepartureAt ?? seedJob.plannedDepartureAt,
      stops: job.stops.map((st) => {
        const ss = seedJob.stops.find((x) => x.id === st.id);
        return ss ? { ...st, windowStartAt: st.windowStartAt ?? ss.windowStartAt, windowEndAt: st.windowEndAt ?? ss.windowEndAt } : st;
      }),
    });
  }
  const missingDemo = seed.filter((j) => j.isDemo && !jobs.some((p) => p.id === j.id));
  return missingDemo.length > 0 ? [...jobs, ...structuredClone(missingDemo)] : jobs;
}
