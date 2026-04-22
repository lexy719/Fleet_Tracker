import type { Job, JobStop } from "../data/types";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Last delivery stop by sequence (fallback: last stop overall). */
export function getFinalDeliveryStop(job: Job): JobStop | undefined {
  const deliveries = job.stops.filter((s) => s.type === "delivery");
  const pool = deliveries.length > 0 ? deliveries : job.stops;
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => a.sequence - b.sequence).at(-1);
}

/** First pickup by sequence (fallback: first stop overall). */
export function getFirstPickupStop(job: Job): JobStop | undefined {
  const pickups = job.stops.filter((s) => s.type === "pickup");
  const pool = pickups.length > 0 ? pickups : job.stops;
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => a.sequence - b.sequence)[0];
}

/** Distance from anchor job’s final drop to a candidate job’s first pickup (km). */
export function distanceKmAnchorToPickup(anchorJob: Job, candidateJob: Job): number {
  const fin = getFinalDeliveryStop(anchorJob);
  const pickup = getFirstPickupStop(candidateJob);
  if (!fin || !pickup) return Number.POSITIVE_INFINITY;
  return haversineKm(fin.lat, fin.lng, pickup.lat, pickup.lng);
}

/**
 * Queued jobs for the same driver/truck line, ordered for promotion:
 * closest pickup to the anchor job’s final destination first, then earlier assignment (`queuedAt`).
 */
export function sortQueuedJobsByAnchor(queuedJobs: Job[], anchorJob: Job): Job[] {
  return [...queuedJobs].sort((a, b) => {
    const da = distanceKmAnchorToPickup(anchorJob, a);
    const db = distanceKmAnchorToPickup(anchorJob, b);
    if (da !== db) return da - db;
    const ta = a.queuedAt ?? "";
    const tb = b.queuedAt ?? "";
    return ta.localeCompare(tb);
  });
}
