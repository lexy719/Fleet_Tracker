import type { Driver, Job, Trailer, Truck } from "../data/types";

/*
 * Referential integrity. A job reference to a truck/driver/trailer that no longer exists is
 * PRESERVED and reported — never silently dropped or rewritten. Hard deletion of a resource
 * that any job references is refused; archive instead.
 */

export type UnresolvedRef = { jobId: string; jobNumber: string; kind: "truck" | "driver" | "trailer"; refId: string };

export function unresolvedReferences(jobs: Job[], trucks: Truck[], drivers: Driver[], trailers: Trailer[]): UnresolvedRef[] {
  const t = new Set(trucks.map((x) => x.id));
  const d = new Set(drivers.map((x) => x.id));
  const r = new Set(trailers.map((x) => x.id));
  const out: UnresolvedRef[] = [];
  for (const j of jobs) {
    if (j.assignedTruckId && !t.has(j.assignedTruckId)) out.push({ jobId: j.id, jobNumber: j.jobNumber, kind: "truck", refId: j.assignedTruckId });
    if (j.assignedDriverId && !d.has(j.assignedDriverId)) out.push({ jobId: j.id, jobNumber: j.jobNumber, kind: "driver", refId: j.assignedDriverId });
    if (j.assignedTrailerId && !r.has(j.assignedTrailerId)) out.push({ jobId: j.id, jobNumber: j.jobNumber, kind: "trailer", refId: j.assignedTrailerId });
  }
  return out;
}

export function jobsReferencing(jobs: Job[], kind: "truck" | "driver" | "trailer", id: string): Job[] {
  const key = kind === "truck" ? "assignedTruckId" : kind === "driver" ? "assignedDriverId" : "assignedTrailerId";
  return jobs.filter((j) => j[key] === id);
}

const LIVE = ["queued", "assigned", "loading", "in_transit"];

/** Reasons archiving is refused: a resource on a live job must be released first. */
export function archiveBlockers(jobs: Job[], kind: "truck" | "driver" | "trailer", id: string): string[] {
  const live = jobsReferencing(jobs, kind, id).filter((j) => LIVE.includes(j.status));
  return live.length ? [`Em uso em ${live.length} trabalho(s) ativo(s): ${live.map((j) => j.jobNumber).join(", ")}. Desatribua ou conclua-os primeiro.`] : [];
}

/** Reasons hard deletion is refused (any job reference at all, including history). */
export function deleteBlockers(jobs: Job[], kind: "truck" | "driver" | "trailer", id: string): string[] {
  const refs = jobsReferencing(jobs, kind, id);
  return refs.length ? [`Referenciado por ${refs.length} trabalho(s) (${refs.slice(0, 5).map((j) => j.jobNumber).join(", ")}${refs.length > 5 ? "…" : ""}). Arquive em vez de eliminar.`] : [];
}
