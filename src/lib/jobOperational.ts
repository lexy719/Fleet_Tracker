import type { Job, JobStatus } from "../data/types";

/** Trabalhos que contam como "em curso" na viatura (alinhado com mapa + dispatch). */
export const OPERATIONAL_ON_TRUCK: readonly JobStatus[] = ["assigned", "loading", "in_transit"];

const OP_ORDER: Partial<Record<JobStatus, number>> = {
  in_transit: 0,
  loading: 1,
  assigned: 2,
};

export function jobIsOperationalOnTruck(j: Job): boolean {
  return !!j.assignedTruckId && (OPERATIONAL_ON_TRUCK as readonly string[]).includes(j.status);
}

export function operationalJobsForTruck(jobs: Job[], truckId: string): Job[] {
  return jobs.filter((j) => j.assignedTruckId === truckId && jobIsOperationalOnTruck(j));
}

/** Prioridade: em trânsito → carga → atribuído; desempate por id. */
export function sortOperationalJobs(list: Job[]): Job[] {
  return [...list].sort((a, b) => {
    const da = OP_ORDER[a.status] ?? 9;
    const db = OP_ORDER[b.status] ?? 9;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
}

export function operationalJobsForTruckSorted(jobs: Job[], truckId: string): Job[] {
  return sortOperationalJobs(operationalJobsForTruck(jobs, truckId));
}

export function primaryOperationalJob(jobs: Job[], truckId: string): Job | undefined {
  const sorted = operationalJobsForTruckSorted(jobs, truckId);
  return sorted[0];
}

export function countOperationalJobsOnTruck(jobs: Job[], truckId: string): number {
  return operationalJobsForTruck(jobs, truckId).length;
}
