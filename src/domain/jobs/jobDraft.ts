import type { CargoLine, CargoType, Job, JobPriority, JobStop, StopType } from "../../data/types";
import { canonicalJson } from "../../regulations/decisionInputs";
import { makeEvent, type OperationalEvent, type Result, fail, ok } from "../events";
import { newId } from "../ids";
import { isIsoInstant, isoToClock } from "../time";

/*
 * Job drafts: what a dispatcher enters (create or edit). The factory turns a validated
 * draft into a Job with DERIVED fields (cargo totals, deadlines, legacy display clocks);
 * editing detects planning-relevant changes and invalidates a stale route plan.
 */

export type StopDraft = {
  id?: string;
  /** Site record the address was taken from (the stop keeps its own copy). */
  siteId?: string;
  type: StopType;
  clientName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** ISO instants with offset (entered as Lisbon local time). */
  windowStartAt?: string;
  windowEndAt?: string;
  notes?: string;
  municipality?: string;
};

export type CargoLineDraft = Omit<CargoLine, "id"> & { id?: string };

export type JobDraft = {
  /** Customer record (the job keeps `client` as its own snapshot of the name). */
  customerId?: string;
  client: string;
  reference: string;
  priority: JobPriority;
  cargoType: CargoType;
  rateEur: number;
  notes?: string;
  plannedDepartureAt?: string;
  stops: StopDraft[];
  cargo: CargoLineDraft[];
  adrClass?: string;
  adrUnNumber?: string;
  tempTargetC?: { min: number; max: number };
  isInternational?: boolean;
  destinationCountryCode?: string;
  buyerNif?: string;
};

/* ─── Cargo ─── */

export function cargoTotals(cargo: CargoLine[]): { weightKg: number; pallets: number; dangerous: boolean } {
  return {
    weightKg: Math.round(cargo.reduce((s, c) => s + (Number.isFinite(c.weightKg) ? c.weightKg : 0), 0)),
    pallets: cargo.reduce((s, c) => s + (c.pallets ?? (c.unit === "pallet" ? c.quantity : 0)), 0),
    dangerous: cargo.some((c) => !!c.dangerousGoods),
  };
}

/* ─── Validation ─── */

export function validateJobDraft(d: JobDraft): string[] {
  const e: string[] = [];
  if (!d.client.trim()) e.push("Cliente obrigatório.");
  if (!Number.isFinite(d.rateEur) || d.rateEur < 0) e.push("Valor do frete inválido.");
  if (d.stops.length < 2) e.push("Um trabalho precisa de pelo menos 2 paragens.");
  if (d.stops[0] && d.stops[0].type !== "pickup") e.push("A primeira paragem tem de ser uma recolha.");
  if (!d.stops.some((s) => s.type === "delivery")) e.push("É necessária pelo menos uma entrega.");
  d.stops.forEach((s, i) => {
    const n = `Paragem ${i + 1}`;
    if (!s.address.trim()) e.push(`${n}: morada obrigatória.`);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || Math.abs(s.lat) > 90 || Math.abs(s.lng) > 180) e.push(`${n}: coordenadas em falta ou inválidas (localize a morada).`);
    if (s.windowStartAt !== undefined && !isIsoInstant(s.windowStartAt)) e.push(`${n}: início da janela inválido.`);
    if (s.windowEndAt !== undefined && !isIsoInstant(s.windowEndAt)) e.push(`${n}: fim da janela inválido.`);
    if (isIsoInstant(s.windowStartAt) && isIsoInstant(s.windowEndAt) && Date.parse(s.windowEndAt) < Date.parse(s.windowStartAt)) e.push(`${n}: a janela termina antes de começar.`);
  });
  const starts = d.stops.map((s) => (isIsoInstant(s.windowStartAt) ? Date.parse(s.windowStartAt) : null));
  for (let i = 1; i < starts.length; i++) {
    const prev = starts.slice(0, i).filter((x): x is number => x !== null).at(-1);
    if (prev !== undefined && starts[i] !== null && starts[i]! < prev) e.push(`Paragem ${i + 1}: janela anterior à da paragem precedente (verifique a ordem).`);
  }
  if (d.plannedDepartureAt !== undefined && !isIsoInstant(d.plannedDepartureAt)) e.push("Partida planeada inválida.");
  if (d.cargo.length === 0) e.push("Indique pelo menos uma linha de carga.");
  d.cargo.forEach((c, i) => {
    const n = `Carga ${i + 1}`;
    if (!c.description.trim()) e.push(`${n}: descrição obrigatória.`);
    if (!Number.isFinite(c.quantity) || c.quantity <= 0) e.push(`${n}: quantidade tem de ser > 0.`);
    if (!Number.isFinite(c.weightKg) || c.weightKg < 0) e.push(`${n}: peso inválido.`);
    if (c.pallets !== undefined && (!Number.isFinite(c.pallets) || c.pallets < 0)) e.push(`${n}: paletes inválidas.`);
  });
  if (d.cargo.length && cargoTotals(d.cargo as CargoLine[]).weightKg <= 0) e.push("O peso total da carga tem de ser > 0.");
  if (d.tempTargetC && d.tempTargetC.min > d.tempTargetC.max) e.push("Temperatura: mínimo acima do máximo.");
  return e;
}

/* ─── Derivations ─── */

function buildStops(draft: JobDraft, previous: JobStop[] = []): JobStop[] {
  return draft.stops.map((s, i) => {
    const prev = previous.find((p) => p.id === s.id);
    return {
      id: s.id ?? newId(),
      sequence: i + 1,
      type: s.type,
      clientName: s.clientName.trim() || draft.client.trim(),
      address: s.address.trim(),
      city: s.city.trim(),
      lat: s.lat,
      lng: s.lng,
      ...(s.windowStartAt ? { windowStartAt: s.windowStartAt } : {}),
      ...(s.windowEndAt ? { windowEndAt: s.windowEndAt } : {}),
      // Legacy display clocks are DERIVED from the dated window (never the source of truth).
      scheduledTime: s.windowStartAt ? isoToClock(s.windowStartAt) : "",
      windowEnd: s.windowEndAt ? isoToClock(s.windowEndAt) : "",
      cargoDescription: draft.cargo.map((c) => c.description).join("; "),
      weightKg: 0,
      pallets: 0,
      completed: prev?.completed ?? false,
      ...(prev?.completedAt ? { completedAt: prev.completedAt } : {}),
      ...(prev?.actualTime ? { actualTime: prev.actualTime } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      ...(s.municipality ? { municipality: s.municipality } : {}),
      ...(s.siteId ? { siteId: s.siteId } : {}),
    };
  });
}

function deadlines(stops: JobStop[], fallback: { pickup: string; delivery: string }) {
  const firstPickup = stops.find((s) => s.type === "pickup");
  const lastDelivery = [...stops].reverse().find((s) => s.type === "delivery");
  return {
    pickupDeadline: firstPickup?.windowEndAt ?? fallback.pickup,
    deliveryDeadline: lastDelivery?.windowEndAt ?? fallback.delivery,
  };
}

function cargoFromDraft(d: JobDraft): CargoLine[] {
  return d.cargo.map((c) => ({ ...c, id: c.id ?? newId(), description: c.description.trim() }));
}

function optionalFields(d: JobDraft): Partial<Job> {
  return {
    ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
    ...(d.plannedDepartureAt ? { plannedDepartureAt: d.plannedDepartureAt } : {}),
    ...(d.cargoType === "hazmat" && d.adrClass ? { adrClass: d.adrClass, ...(d.adrUnNumber?.trim() ? { adrUnNumber: d.adrUnNumber.trim() } : {}) } : {}),
    ...(d.cargoType === "refrigerated" && d.tempTargetC ? { tempTargetC: d.tempTargetC } : {}),
    ...(d.isInternational ? { isInternational: true, ...(d.destinationCountryCode?.trim() ? { destinationCountryCode: d.destinationCountryCode.trim().toUpperCase() } : {}) } : {}),
    ...(d.buyerNif?.trim() ? { buyerNif: d.buyerNif.trim() } : {}),
    ...(d.customerId ? { customerId: d.customerId } : {}),
  };
}

/* ─── Create ─── */

export function createJobFromDraft(d: JobDraft, ctx: { id: string; jobNumber: string; now: Date }): Result<{ job: Job; events: OperationalEvent[] }> {
  const errors = validateJobDraft(d);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const cargo = cargoFromDraft(d);
  const totals = cargoTotals(cargo);
  const stops = buildStops(d);
  const job: Job = {
    id: ctx.id,
    jobNumber: ctx.jobNumber,
    reference: d.reference.trim(),
    client: d.client.trim(),
    status: "backlog",
    priority: d.priority,
    cargoType: d.cargoType,
    totalWeightKg: totals.weightKg,
    totalPallets: totals.pallets,
    cargo,
    stops,
    ...deadlines(stops, { pickup: d.plannedDepartureAt ?? at, delivery: d.plannedDepartureAt ?? at }),
    slaStatus: "on_track",
    rateEur: d.rateEur,
    createdAt: at,
    planStatus: "UNPLANNED",
    revision: 1,
    updatedAt: at,
    ...optionalFields(d),
  };
  return ok({ job, events: [makeEvent({ entityType: "job", entityId: job.id, type: "JOB_CREATED", at, source: "LOCAL_USER", toStatus: "backlog", data: { jobNumber: job.jobNumber } })] });
}

/* ─── Edit ─── */

/** Statuses in which a job's content may still change (nothing has been loaded yet). */
export const EDITABLE_STATUSES: readonly Job["status"][] = ["backlog", "queued", "assigned"];

/** Projection of everything a route plan / compliance decision depends on. */
export function planningProjection(j: Pick<Job, "stops" | "cargo" | "cargoType" | "plannedDepartureAt" | "adrClass" | "adrUnNumber" | "tempTargetC" | "recordedFacts" | "totalWeightKg">) {
  return {
    stops: [...j.stops].sort((a, b) => a.sequence - b.sequence).map((s) => [s.type, Math.round(s.lat * 1e5), Math.round(s.lng * 1e5), s.windowStartAt ?? null, s.windowEndAt ?? null, s.municipality ?? null]),
    weight: j.totalWeightKg,
    dangerous: j.cargo.map((c) => c.dangerousGoods ?? null),
    cargoType: j.cargoType,
    departure: j.plannedDepartureAt ?? null,
    adr: [j.adrClass ?? null, j.adrUnNumber ?? null],
    temp: j.tempTargetC ?? null,
    facts: j.recordedFacts ?? null,
  };
}

const PROJECTION_LABELS: Record<string, string> = { stops: "paragens/janelas", weight: "peso da carga", dangerous: "mercadorias perigosas", cargoType: "tipo de carga", departure: "partida planeada", adr: "ADR", temp: "temperatura", facts: "factos regulatórios" };

export function changedPlanningFields(a: Job, b: Job): string[] {
  const pa = planningProjection(a) as Record<string, unknown>;
  const pb = planningProjection(b) as Record<string, unknown>;
  return Object.keys(pa).filter((k) => canonicalJson(pa[k]) !== canonicalJson(pb[k])).map((k) => PROJECTION_LABELS[k] ?? k);
}

/** Retire the current route decision: kept in history, plan marked REPLAN_REQUIRED. */
export function invalidatePlan(job: Job, reason: string, fields: string[], at: string): Job {
  if (job.planStatus !== "PLANNED") return job;
  return {
    ...job,
    planStatus: "REPLAN_REQUIRED",
    planInvalidation: { at, reason, fields },
    ...(job.routeCompliance ? { routeComplianceHistory: [...(job.routeComplianceHistory ?? []), job.routeCompliance].slice(-10) } : {}),
    routeCompliance: undefined,
    plannedKm: undefined,
    plannedDurationMin: undefined,
    plannedCostEur: undefined,
  };
}

export function jobToDraft(j: Job): JobDraft {
  return {
    client: j.client,
    reference: j.reference,
    priority: j.priority,
    cargoType: j.cargoType,
    rateEur: j.rateEur,
    ...(j.notes ? { notes: j.notes } : {}),
    ...(j.plannedDepartureAt ? { plannedDepartureAt: j.plannedDepartureAt } : {}),
    stops: [...j.stops].sort((a, b) => a.sequence - b.sequence).map((s) => ({
      id: s.id, type: s.type, clientName: s.clientName, address: s.address, city: s.city, lat: s.lat, lng: s.lng,
      ...(s.windowStartAt ? { windowStartAt: s.windowStartAt } : {}),
      ...(s.windowEndAt ? { windowEndAt: s.windowEndAt } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      ...(s.municipality ? { municipality: s.municipality } : {}),
      ...(s.siteId ? { siteId: s.siteId } : {}),
    })),
    cargo: j.cargo.map((c) => ({ ...c })),
    ...(j.adrClass ? { adrClass: j.adrClass } : {}),
    ...(j.adrUnNumber ? { adrUnNumber: j.adrUnNumber } : {}),
    ...(j.tempTargetC ? { tempTargetC: j.tempTargetC } : {}),
    ...(j.isInternational ? { isInternational: true } : {}),
    ...(j.destinationCountryCode ? { destinationCountryCode: j.destinationCountryCode } : {}),
    ...(j.buyerNif ? { buyerNif: j.buyerNif } : {}),
    ...(j.customerId ? { customerId: j.customerId } : {}),
  };
}

export function editJob(job: Job, d: JobDraft, now: Date): Result<{ job: Job; events: OperationalEvent[]; invalidated: boolean; planningChanges: string[] }> {
  if (!EDITABLE_STATUSES.includes(job.status)) return fail(`Não é possível editar um trabalho no estado «${job.status}» (já em execução, concluído ou cancelado).`);
  const errors = validateJobDraft(d);
  if (errors.length) return fail(...errors);
  const at = now.toISOString();
  const cargo = cargoFromDraft(d);
  const totals = cargoTotals(cargo);
  const stops = buildStops(d, job.stops);
  // Rebuild optional fields from the draft (so clearing a field really clears it).
  const base: Job = { ...job };
  for (const k of ["notes", "plannedDepartureAt", "adrClass", "adrUnNumber", "tempTargetC", "isInternational", "destinationCountryCode", "buyerNif", "customerId"] as const) delete base[k];
  let next: Job = {
    ...base,
    client: d.client.trim(),
    reference: d.reference.trim(),
    priority: d.priority,
    cargoType: d.cargoType,
    rateEur: d.rateEur,
    cargo,
    totalWeightKg: totals.weightKg,
    totalPallets: totals.pallets,
    stops,
    ...deadlines(stops, { pickup: job.pickupDeadline, delivery: job.deliveryDeadline }),
    ...optionalFields(d),
    revision: job.revision + 1,
    updatedAt: at,
  };
  const planningChanges = changedPlanningFields(job, next);
  const events: OperationalEvent[] = [makeEvent({ entityType: "job", entityId: job.id, type: "JOB_EDITED", at, source: "LOCAL_USER", data: { revision: next.revision, planningChanges } })];
  let invalidated = false;
  if (planningChanges.length && job.planStatus === "PLANNED") {
    next = invalidatePlan(next, "dados de planeamento alterados após a confirmação da rota", planningChanges, at);
    invalidated = true;
    events.push(makeEvent({ entityType: "job", entityId: job.id, type: "ROUTE_INVALIDATED", at, source: "SYSTEM", reason: `alterado: ${planningChanges.join(", ")}` }));
  }
  return ok({ job: next, events, invalidated, planningChanges });
}
