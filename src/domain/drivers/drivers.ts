import type { Driver, DriverAvailability, DriverHoursBaseline, DriverOperationalState, Job } from "../../data/types";
import { fail, makeEvent, ok, type OperationalEvent, type Result } from "../events";
import { isIsoInstant, isLocalDate, isoToLocal, isoToLocalDate, localWeekStart } from "../time";

/*
 * Driver domain. Manual availability is set by people; ASSIGNED / ON_JOB are derived from
 * jobs. Qualifications are explicit (categories + validity dates). The driving-time
 * baseline is manually entered and timestamped — FleetOS never presents it as live.
 */

export const LICENCE_CATEGORIES = ["B", "BE", "C1", "C1E", "C", "CE", "D1", "D1E", "D", "DE"] as const;

export const DRIVER_AVAILABILITY_LABEL: Record<DriverAvailability, string> = {
  AVAILABLE: "Disponível",
  OFF_DUTY: "Fora de serviço",
  LEAVE: "Ausente (férias/baixa)",
  UNAVAILABLE: "Indisponível",
};

export const DRIVER_STATE_LABEL: Record<DriverOperationalState, string> = {
  ...DRIVER_AVAILABILITY_LABEL,
  ASSIGNED: "Atribuído",
  ON_JOB: "Em trabalho",
  ARCHIVED: "Arquivado",
};

export type DriverDraft = Omit<Driver, "id" | "createdAt" | "updatedAt" | "archivedAt" | "isDemo" | "demoMetrics">;

/** EU 561: 10 h daily maximum (extended) and 56 h weekly. Values above are recorded but flagged. */
const MAX_PLAUSIBLE_DAY_MIN = 15 * 60;
const MAX_PLAUSIBLE_WEEK_MIN = 90 * 60;

export function validateBaseline(b: DriverHoursBaseline, now: Date): string[] {
  const e: string[] = [];
  if (!Number.isFinite(b.drivenTodayMin) || b.drivenTodayMin < 0 || b.drivenTodayMin > MAX_PLAUSIBLE_DAY_MIN) e.push("Condução hoje: valor inválido.");
  if (!Number.isFinite(b.drivenWeekMin) || b.drivenWeekMin < 0 || b.drivenWeekMin > MAX_PLAUSIBLE_WEEK_MIN) e.push("Condução esta semana: valor inválido.");
  if (b.drivenTodayMin > b.drivenWeekMin) e.push("A condução de hoje não pode exceder a da semana.");
  if (b.currentSpellMin !== undefined && (!Number.isFinite(b.currentSpellMin) || b.currentSpellMin < 0 || b.currentSpellMin > b.drivenTodayMin)) e.push("Condução desde a última pausa: tem de estar entre 0 e a condução de hoje.");
  if (!isIsoInstant(b.recordedAt)) e.push("Base de horas: data/hora de registo inválida.");
  else if (Date.parse(b.recordedAt) > now.getTime() + 5 * 60_000) e.push("Base de horas: registo no futuro.");
  if (b.dutyStartedAt !== undefined && !isIsoInstant(b.dutyStartedAt)) e.push("Início de serviço inválido.");
  return e;
}

export function validateDriver(d: DriverDraft, now: Date, others: Driver[] = [], selfId?: string): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Nome obrigatório.");
  if (d.employeeNumber?.trim() && others.some((x) => x.id !== selfId && !x.archivedAt && x.employeeNumber?.trim() === d.employeeNumber!.trim())) e.push("Já existe um motorista ativo com este número.");
  const bad = d.licence.categories.filter((c) => !(LICENCE_CATEGORIES as readonly string[]).includes(c));
  if (bad.length) e.push(`Categorias de carta desconhecidas: ${bad.join(", ")}.`);
  for (const [label, v] of [["Validade da carta", d.licence.expiresOn], ["Validade do CAM/CPC", d.cpc.expiresOn], ["Validade ADR", d.adr.expiresOn], ["Validade do cartão de tacógrafo", d.tachoCardExpiresOn]] as const) {
    if (v !== undefined && !isLocalDate(v)) e.push(`${label}: data inválida (AAAA-MM-DD).`);
  }
  if (!d.adr.certified && (d.adr.expiresOn || d.adr.classes?.length)) e.push("ADR: indique certificação antes de validade/classes.");
  if (d.hours) e.push(...validateBaseline(d.hours, now));
  return e;
}

export function createDriver(d: DriverDraft, ctx: { id: string; now: Date; others: Driver[] }): Result<{ driver: Driver; events: OperationalEvent[] }> {
  const errors = validateDriver(d, ctx.now, ctx.others);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const driver: Driver = { ...d, name: d.name.trim(), id: ctx.id, createdAt: at, updatedAt: at };
  return ok({ driver, events: [makeEvent({ entityType: "driver", entityId: driver.id, type: "RESOURCE_CREATED", at, source: "LOCAL_USER" })] });
}

export function updateDriver(x: Driver, d: DriverDraft, ctx: { now: Date; others: Driver[] }): Result<{ driver: Driver; events: OperationalEvent[] }> {
  const errors = validateDriver(d, ctx.now, ctx.others, x.id);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const driver: Driver = { ...d, name: d.name.trim(), id: x.id, createdAt: x.createdAt, updatedAt: at, ...(x.isDemo ? { isDemo: true } : {}), ...(x.demoMetrics ? { demoMetrics: x.demoMetrics } : {}), ...(x.archivedAt ? { archivedAt: x.archivedAt } : {}) };
  const baselineChanged = JSON.stringify(x.hours) !== JSON.stringify(d.hours);
  return ok({ driver, events: [makeEvent({ entityType: "driver", entityId: x.id, type: "RESOURCE_UPDATED", at, source: "LOCAL_USER", ...(baselineChanged ? { data: { hoursBaseline: d.hours } } : {}) })] });
}

export function driverToDraft(x: Driver): DriverDraft {
  const d: Partial<Driver> = { ...x };
  for (const k of ["id", "createdAt", "updatedAt", "archivedAt", "isDemo", "demoMetrics"] as const) delete d[k];
  return d as DriverDraft;
}

/* ─── Qualifications ─── */

export type QualificationKind = "licence" | "cpc" | "adr" | "tacho";
export type QualificationState = "VALID" | "EXPIRING" | "EXPIRED" | "MISSING" | "NOT_HELD";
export type Qualification = { kind: QualificationKind; label: string; expiresOn?: string; state: QualificationState; daysLeft?: number };

const EXPIRING_DAYS = 60;

function dateState(expiresOn: string | undefined, now: Date): { state: QualificationState; daysLeft?: number } {
  if (!expiresOn) return { state: "MISSING" };
  const days = Math.floor((Date.parse(`${expiresOn}T23:59:59Z`) - now.getTime()) / 86_400_000);
  return { state: days < 0 ? "EXPIRED" : days <= EXPIRING_DAYS ? "EXPIRING" : "VALID", daysLeft: days };
}

export function driverQualifications(x: Driver, now: Date): Qualification[] {
  const heavy = x.licence.categories.filter((c) => c.startsWith("C") || c.startsWith("D"));
  return [
    { kind: "licence", label: `Carta ${x.licence.categories.join(", ") || "—"}`, ...(x.licence.expiresOn ? { expiresOn: x.licence.expiresOn } : {}), ...(heavy.length || x.licence.categories.length ? dateState(x.licence.expiresOn, now) : { state: "MISSING" as const }) },
    { kind: "cpc", label: "CAM / CPC (Código 95)", ...(x.cpc.expiresOn ? { expiresOn: x.cpc.expiresOn } : {}), ...dateState(x.cpc.expiresOn, now) },
    { kind: "adr", label: `ADR${x.adr.classes?.length ? ` (classes ${x.adr.classes.join(", ")})` : ""}${x.adr.tanks ? " · cisternas" : ""}`, ...(x.adr.expiresOn ? { expiresOn: x.adr.expiresOn } : {}), ...(x.adr.certified ? dateState(x.adr.expiresOn, now) : { state: "NOT_HELD" as const }) },
    { kind: "tacho", label: "Cartão de tacógrafo", ...(x.tachoCardExpiresOn ? { expiresOn: x.tachoCardExpiresOn } : {}), ...dateState(x.tachoCardExpiresOn, now) },
  ];
}

export function holdsHeavyGoodsLicence(x: Driver): boolean {
  return x.licence.categories.some((c) => c === "C" || c === "CE" || c === "C1" || c === "C1E");
}

/* ─── Derived operational state ─── */

export function driverOperationalState(x: Driver, jobs: Job[]): DriverOperationalState {
  if (x.archivedAt) return "ARCHIVED";
  const mine = jobs.filter((j) => j.assignedDriverId === x.id);
  if (mine.some((j) => j.status === "loading" || j.status === "in_transit")) return "ON_JOB";
  if (mine.some((j) => j.status === "assigned" || j.status === "queued")) return "ASSIGNED";
  return x.availability;
}

/* ─── EU 561 planning input ─── */

export type PlanningHours = {
  hoursToday: number;
  hoursWeek: number;
  /** True only when the baseline is from the departure's own day/week. */
  todayKnown: boolean;
  weekKnown: boolean;
  basis: string;
  notes: string[];
};

/**
 * Hours the EU 561 engine should start from for a trip departing at `departAtMs`.
 * Today's / this week's driving carry over ONLY when the baseline was recorded on the same
 * local day / ISO week as the departure; otherwise they reset to 0 and the planner is told
 * the value is an assumption.
 */
export function driverHoursForPlanning(x: Driver | null, departAtMs: number): PlanningHours {
  if (!x) return { hoursToday: 0, hoursWeek: 0, todayKnown: false, weekKnown: false, basis: "sem motorista", notes: ["sem motorista selecionado"] };
  const b = x.hours;
  if (!b) {
    return { hoursToday: 0, hoursWeek: 0, todayKnown: false, weekKnown: false, basis: "sem base registada", notes: ["sem base de horas registada para este motorista — UE 561 calculado a partir de 0 h (desconhecido)"] };
  }
  const recMs = Date.parse(b.recordedAt);
  const sameDay = isoToLocalDate(recMs) === isoToLocalDate(departAtMs);
  const sameWeek = localWeekStart(recMs) === localWeekStart(departAtMs);
  const notes: string[] = [];
  if (!sameDay) notes.push(`base de ${isoToLocalDate(recMs)} — condução do dia da partida desconhecida (assumido 0 h)`);
  if (!sameWeek) notes.push("base de outra semana — condução semanal da semana da partida desconhecida (assumido 0 h)");
  if (departAtMs < recMs) notes.push("partida anterior ao registo da base — valores podem não se aplicar");
  return {
    hoursToday: sameDay ? b.drivenTodayMin / 60 : 0,
    hoursWeek: sameWeek ? b.drivenWeekMin / 60 : 0,
    todayKnown: sameDay,
    weekKnown: sameWeek,
    basis: `${b.source === "DEMO" ? "base DEMO" : "base manual"} registada em ${isoToLocal(b.recordedAt).replace("T", " ")}`,
    notes,
  };
}
