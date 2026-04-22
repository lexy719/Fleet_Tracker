import type { Job } from "../data/types";
import { OPERATIONAL_ON_TRUCK, operationalJobsForTruckSorted, sortOperationalJobs } from "./jobOperational";

function isOperationalDeliveryAssigned(j: Job): boolean {
  return (
    !!j.assignedDriverId &&
    (OPERATIONAL_ON_TRUCK as readonly string[]).includes(j.status)
  );
}

/**
 * Operational jobs on this truck **excluding** the job being assigned (so re-planning the same job is allowed).
 */
export function blockingOperationalJobsOnTruck(jobs: Job[], jobId: string, truckId: string): Job[] {
  return operationalJobsForTruckSorted(jobs, truckId).filter((j) => j.id !== jobId);
}

/** True if this truck has no other operational work (assigned/loading/in_transit) besides `jobId`. */
export function isTruckAvailableForJobAssignment(jobs: Job[], jobId: string, truckId: string): boolean {
  return blockingOperationalJobsOnTruck(jobs, jobId, truckId).length === 0;
}

export function truckAssignmentBlockedMessage(jobs: Job[], jobId: string, truckId: string): string | null {
  const block = blockingOperationalJobsOnTruck(jobs, jobId, truckId)[0];
  if (!block) return null;
  return `Esta viatura já está no trabalho ${block.id} (em curso). Termine ou cancele esse trabalho antes de atribuir outro à mesma viatura.`;
}

/**
 * Operational deliveries for this driver (atribuído / carga / trânsito), excluding the job being edited.
 */
export function blockingOperationalJobsForDriver(jobs: Job[], jobId: string, driverId: string): Job[] {
  return sortOperationalJobs(
    jobs.filter(
      (j) =>
        j.id !== jobId &&
        j.assignedDriverId === driverId &&
        isOperationalDeliveryAssigned(j),
    ),
  );
}

export function isDriverAvailableForJobAssignment(jobs: Job[], jobId: string, driverId: string): boolean {
  return blockingOperationalJobsForDriver(jobs, jobId, driverId).length === 0;
}

export function driverAssignmentBlockedMessage(jobs: Job[], jobId: string, driverId: string): string | null {
  const block = blockingOperationalJobsForDriver(jobs, jobId, driverId)[0];
  if (!block) return null;
  return `Este motorista já está no trabalho ${block.id} (em curso). Termine ou cancele antes de atribuir outra entrega.`;
}

/**
 * True if the chosen truck matches the operational job already on that unit (same driver line), so we can queue.
 */
export function isTruckCompatibleForAssignment(jobs: Job[], jobId: string, truckId: string, driverId: string): boolean {
  const blockers = blockingOperationalJobsOnTruck(jobs, jobId, truckId);
  if (blockers.length === 0) return true;
  return blockers.every((b) => b.assignedDriverId === driverId);
}

/**
 * True if the chosen driver matches the operational job they are already running (same truck line), so we can queue.
 */
export function isDriverCompatibleForAssignment(jobs: Job[], jobId: string, truckId: string, driverId: string): boolean {
  const blockers = blockingOperationalJobsForDriver(jobs, jobId, driverId);
  if (blockers.length === 0) return true;
  return blockers.every((b) => b.assignedTruckId === truckId);
}

export function truckLineIncompatibleMessage(
  jobs: Job[],
  jobId: string,
  truckId: string,
  driverId: string,
): string | null {
  if (isTruckCompatibleForAssignment(jobs, jobId, truckId, driverId)) return null;
  const block = blockingOperationalJobsOnTruck(jobs, jobId, truckId)[0];
  if (!block) return null;
  return `A viatura está no trabalho ${block.id} com outro motorista. Para agendar a seguir, use a mesma viatura e o mesmo motorista.`;
}

export function driverLineIncompatibleMessage(
  jobs: Job[],
  jobId: string,
  truckId: string,
  driverId: string,
): string | null {
  if (isDriverCompatibleForAssignment(jobs, jobId, truckId, driverId)) return null;
  const block = blockingOperationalJobsForDriver(jobs, jobId, driverId)[0];
  if (!block) return null;
  return `Este motorista está no trabalho ${block.id} com outra viatura. Para fila, alinhe viatura e motorista ao trabalho em curso.`;
}

export type AssignmentMode = "assigned" | "queued";

/**
 * `assigned` — first operational job on this truck/driver line.
 * `queued` — driver or truck already has an operational job; this one waits (same truck + driver as that job).
 * `null` — invalid (e.g. wrong truck for a busy driver).
 */
export function resolveAssignmentMode(
  jobs: Job[],
  jobId: string,
  truckId: string,
  driverId: string,
): AssignmentMode | null {
  if (!isTruckCompatibleForAssignment(jobs, jobId, truckId, driverId)) return null;
  if (!isDriverCompatibleForAssignment(jobs, jobId, truckId, driverId)) return null;
  const truckFree = isTruckAvailableForJobAssignment(jobs, jobId, truckId);
  const driverFree = isDriverAvailableForJobAssignment(jobs, jobId, driverId);
  if (truckFree && driverFree) return "assigned";
  return "queued";
}

/** True if this truck + driver pair is valid (operational now or queued behind the same line). */
export function isAssignmentAllowed(jobs: Job[], jobId: string, truckId: string, driverId: string): boolean {
  return resolveAssignmentMode(jobs, jobId, truckId, driverId) !== null;
}
