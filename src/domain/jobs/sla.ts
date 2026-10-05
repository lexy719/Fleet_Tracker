import type { Job, SlaStatus } from "../../data/types";

/*
 * Deadline status DERIVED from the job's dated deadlines and the current time (no ETA
 * model yet — Phase 7 adds planned-vs-actual). Never stored as a free-standing flag.
 */

const RISK_WINDOW_MS = 2 * 3_600_000;

export function deriveSla(job: Job, now: Date): SlaStatus {
  if (job.status === "delivered" || job.status === "invoiced" || job.status === "cancelled") return "on_track";
  const deadline = Date.parse(job.deliveryDeadline);
  if (!Number.isFinite(deadline)) return "on_track";
  const t = now.getTime();
  if (t > deadline) return "breached";
  // Not yet on the road and the delivery deadline is close.
  if (deadline - t < RISK_WINDOW_MS && job.status !== "in_transit") return "at_risk";
  const pickup = Date.parse(job.pickupDeadline);
  if (Number.isFinite(pickup) && t > pickup && ["backlog", "queued", "assigned"].includes(job.status)) return "at_risk";
  return "on_track";
}
