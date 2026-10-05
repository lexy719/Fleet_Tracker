import type { Job, JobStatus, SlaStatus } from "../../data/types";
import { deriveSla } from "../../domain/jobs/sla";
import { isoToLocalDate, localWeekStart, isIsoInstant } from "../../domain/time";
import type { Tone } from "../status";

/*
 * Work presentation model — pure functions (tested). Groups map the real lifecycle;
 * nothing here changes state: board drops only compute the REQUESTED status, the domain
 * lifecycle decides.
 */

export type WorkGroup = "all" | "attention" | "unassigned" | "planned" | "active" | "completed" | "cancelled";

export const WORK_GROUPS: { value: WorkGroup; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "attention", label: "Atenção" },
  { value: "unassigned", label: "Por atribuir" },
  { value: "planned", label: "Planeados" },
  { value: "active", label: "Em curso" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

const GROUP_STATUSES: Record<Exclude<WorkGroup, "all" | "attention">, JobStatus[]> = {
  unassigned: ["backlog"],
  planned: ["queued", "assigned"],
  active: ["loading", "in_transit"],
  completed: ["delivered", "invoiced"],
  cancelled: ["cancelled"],
};

export type ResolveRefs = { truck: (id: string) => boolean; driver: (id: string) => boolean; trailer: (id: string) => boolean };

export type AttentionReason = { kind: "replan" | "sla_breached" | "sla_risk" | "unresolved" | "pickup_soon_unassigned"; label: string; tone: Tone };

const OPEN: JobStatus[] = ["backlog", "queued", "assigned", "loading", "in_transit"];

export function isOpen(j: Job): boolean {
  return OPEN.includes(j.status);
}

/** Why a job needs the dispatcher (most severe first). */
export function attentionReasons(j: Job, now: Date, refs?: ResolveRefs): AttentionReason[] {
  if (!isOpen(j)) return [];
  const out: AttentionReason[] = [];
  const sla: SlaStatus = deriveSla(j, now);
  if (sla === "breached") out.push({ kind: "sla_breached", label: "Prazo de entrega ultrapassado", tone: "danger" });
  if (refs) {
    if ((j.assignedTruckId && !refs.truck(j.assignedTruckId)) || (j.assignedDriverId && !refs.driver(j.assignedDriverId)) || (j.assignedTrailerId && !refs.trailer(j.assignedTrailerId)))
      out.push({ kind: "unresolved", label: "Recurso atribuído não existe", tone: "danger" });
  }
  if (j.planStatus === "REPLAN_REQUIRED") out.push({ kind: "replan", label: "Rota tem de ser replaneada", tone: "warn" });
  if (sla === "at_risk") out.push({ kind: "sla_risk", label: "Janela de entrega em risco", tone: "warn" });
  if (j.status === "backlog" && sla === "on_track") {
    const pickup = Date.parse(firstStop(j)?.windowStartAt ?? j.pickupDeadline);
    if (Number.isFinite(pickup) && pickup - now.getTime() < 24 * 3_600_000) out.push({ kind: "pickup_soon_unassigned", label: "Recolha nas próximas 24 h sem recursos", tone: "warn" });
  }
  return out;
}

export function inGroup(j: Job, g: WorkGroup, now: Date, refs?: ResolveRefs): boolean {
  if (g === "all") return true;
  if (g === "attention") return attentionReasons(j, now, refs).length > 0;
  return GROUP_STATUSES[g].includes(j.status);
}

export function groupCounts(jobs: Job[], now: Date, refs?: ResolveRefs): Record<WorkGroup, number> {
  const c: Record<WorkGroup, number> = { all: jobs.length, attention: 0, unassigned: 0, planned: 0, active: 0, completed: 0, cancelled: 0 };
  for (const j of jobs) {
    for (const [g, sts] of Object.entries(GROUP_STATUSES) as [keyof typeof GROUP_STATUSES, JobStatus[]][]) if (sts.includes(j.status)) c[g]++;
    if (attentionReasons(j, now, refs).length) c.attention++;
  }
  return c;
}

/* ─── Filters ─── */

export type DateScope = "any" | "today" | "tomorrow" | "week" | "overdue";

export type WorkFilters = {
  q: string;
  date: DateScope;
  customer?: string;
  origin?: string;
  destination?: string;
  truckId?: string;
  trailerId?: string;
  driverId?: string;
  replanOnly?: boolean;
};

export const EMPTY_FILTERS: WorkFilters = { q: "", date: "any" };

export function activeFilterCount(f: WorkFilters): number {
  return [f.date !== "any", !!f.customer, !!f.origin, !!f.destination, !!f.truckId, !!f.trailerId, !!f.driverId, !!f.replanOnly].filter(Boolean).length;
}

export function firstStop(j: Job) {
  return j.stops.reduce<Job["stops"][number] | undefined>((a, s) => (!a || s.sequence < a.sequence ? s : a), undefined);
}
export function lastStop(j: Job) {
  return j.stops.reduce<Job["stops"][number] | undefined>((a, s) => (!a || s.sequence > a.sequence ? s : a), undefined);
}

/** Reference instant used for date scoping and sorting: first pickup window (dated), else pickup deadline. */
export function jobAnchor(j: Job): number {
  const s = firstStop(j);
  const t = Date.parse(s?.windowStartAt ?? s?.windowEndAt ?? j.pickupDeadline);
  return Number.isFinite(t) ? t : Date.parse(j.createdAt);
}

function matchesDate(j: Job, scope: DateScope, now: Date): boolean {
  if (scope === "any") return true;
  const a = jobAnchor(j);
  if (!Number.isFinite(a)) return false;
  if (scope === "overdue") return isOpen(j) && Date.parse(j.deliveryDeadline) < now.getTime();
  const day = isoToLocalDate(a);
  const today = isoToLocalDate(now.getTime());
  if (scope === "today") return day === today;
  if (scope === "tomorrow") return day === isoToLocalDate(now.getTime() + 86_400_000);
  return localWeekStart(a) === localWeekStart(now.getTime());
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function matchesFilters(j: Job, f: WorkFilters, now: Date): boolean {
  if (f.q.trim()) {
    const q = norm(f.q.trim());
    const hay = norm([j.jobNumber, j.reference, j.client, ...j.stops.map((s) => `${s.city} ${s.clientName}`)].join(" "));
    if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  if (!matchesDate(j, f.date, now)) return false;
  if (f.customer && j.client !== f.customer) return false;
  if (f.origin && firstStop(j)?.city !== f.origin) return false;
  if (f.destination && lastStop(j)?.city !== f.destination) return false;
  if (f.truckId && j.assignedTruckId !== f.truckId) return false;
  if (f.trailerId && j.assignedTrailerId !== f.trailerId) return false;
  if (f.driverId && j.assignedDriverId !== f.driverId) return false;
  if (f.replanOnly && j.planStatus !== "REPLAN_REQUIRED") return false;
  return true;
}

/** Open work first by pickup time; finished work most recent first. */
export function sortWork(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const oa = isOpen(a) ? 0 : 1;
    const ob = isOpen(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return oa === 0 ? jobAnchor(a) - jobAnchor(b) : jobAnchor(b) - jobAnchor(a);
  });
}

/* ─── Board ─── */

export type BoardColumn = "unassigned" | "planned" | "active" | "completed";
export const BOARD_COLUMNS: { value: BoardColumn; label: string }[] = [
  { value: "unassigned", label: "Por atribuir" },
  { value: "planned", label: "Planeados" },
  { value: "active", label: "Em curso" },
  { value: "completed", label: "Concluídos" },
];

export function boardColumnOf(j: Job): BoardColumn | null {
  if (j.status === "backlog") return "unassigned";
  if (j.status === "queued" || j.status === "assigned") return "planned";
  if (j.status === "loading" || j.status === "in_transit") return "active";
  if (j.status === "delivered" || j.status === "invoiced") return "completed";
  return null;
}

/**
 * The status a drop REQUESTS (one lifecycle step in the column's direction).
 * Returns null when the drop is a no-op. The lifecycle service validates it.
 */
export function requestedStatusForDrop(j: Job, col: BoardColumn): JobStatus | null {
  if (boardColumnOf(j) === col) return null;
  switch (col) {
    case "unassigned":
      return "backlog";
    case "planned":
      return "assigned";
    case "active":
      return j.status === "loading" ? "in_transit" : "loading";
    case "completed":
      return j.status === "delivered" ? "invoiced" : "delivered";
  }
}

/* ─── Deadline countdown (time-to-next-commitment) ─── */

export type Countdown = { kind: "pickup" | "delivery"; iso: string; minutes: number; label: string; tone: Tone };

/**
 * The next dated commitment of an open job: the pickup deadline until goods are on board,
 * then the delivery deadline. Derived from recorded deadlines — never from a live ETA.
 */
export function nextCountdown(j: Job, now: Date): Countdown | null {
  if (!isOpen(j)) return null;
  const kind: Countdown["kind"] = j.status === "in_transit" ? "delivery" : "pickup";
  const recorded = kind === "pickup" ? j.pickupDeadline : j.deliveryDeadline;
  const dated = (value: string | undefined): value is string => !!value && isIsoInstant(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value);
  const stop = [...j.stops].sort((a,b) => a.sequence - b.sequence).find((s) => s.type === kind && !s.completed);
  // Legacy deadline strings may lack a timezone while the stop has an explicit dated window.
  const iso = dated(recorded) ? recorded : dated(stop?.windowEndAt) ? stop.windowEndAt : null;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const minutes = Math.round((t - now.getTime()) / 60_000);
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${String(abs % 60).padStart(2, "0")}` : ""}` : `${Math.floor(abs / 1440)} d ${Math.floor((abs % 1440) / 60)} h`;
  const what = kind === "pickup" ? "recolha" : "entrega";
  if (minutes < 0) return { kind, iso, minutes, label: `${what} atrasada ${span}`, tone: "danger" };
  return { kind, iso, minutes, label: `${what} em ${span}`, tone: minutes < 120 ? "danger" : minutes < 360 ? "warn" : "neutral" };
}

/** Date-section key for list grouping (open work by pickup day; finished work in one section). */
export function sectionOf(j: Job): string {
  return isOpen(j) ? `d:${isoToLocalDate(jobAnchor(j))}` : "done";
}
