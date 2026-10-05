import type { Job } from "../data/types";

export type Moment = { key: string; at: string; kind: "pickup" | "delivery" | "deadline"; place: string; job: Job };

const DONE: Job["status"][] = ["delivered", "invoiced", "cancelled"];

/**
 * «Próximas horas»: planned pickups / deliveries (window start, else window end) and
 * delivery deadlines within the next `hours`. Planned times only — no positions, no ETAs.
 */
export function upcomingMoments(jobs: Job[], now: Date, hours: number, limit = 14): Moment[] {
  const from = now.getTime();
  const until = from + hours * 3_600_000;
  const out: Moment[] = [];
  const inRange = (iso: string | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= from && t <= until;
  };
  for (const j of jobs) {
    if (DONE.includes(j.status)) continue;
    for (const s of j.stops) {
      if (s.completed || s.type === "stop") continue;
      const at = s.windowStartAt ?? s.windowEndAt;
      if (inRange(at)) out.push({ key: `${j.id}:${s.id}`, at: at!, kind: s.type === "pickup" ? "pickup" : "delivery", place: s.city || s.clientName || "—", job: j });
    }
    const lastDelivery = [...j.stops].filter((s) => s.type === "delivery").sort((a, b) => b.sequence - a.sequence)[0];
    const deliveryPlanned = lastDelivery && (lastDelivery.windowEndAt ?? lastDelivery.windowStartAt) === j.deliveryDeadline;
    if (inRange(j.deliveryDeadline) && !deliveryPlanned && !lastDelivery?.completed) out.push({ key: `${j.id}:deadline`, at: j.deliveryDeadline, kind: "deadline", place: lastDelivery?.city || "—", job: j });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key)).slice(0, limit);
}
