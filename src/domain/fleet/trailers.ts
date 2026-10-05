import type { Job, Trailer, TrailerType } from "../../data/types";
import { fail, makeEvent, ok, type OperationalEvent, type Result } from "../events";

/* Trailer domain — first-class resource. Time-aware trailer scheduling belongs to Phase 6. */

export const TRAILER_TYPES: { value: TrailerType; label: string }[] = [
  { value: "CURTAINSIDER", label: "Cortinas" },
  { value: "BOX", label: "Caixa fechada" },
  { value: "REFRIGERATED", label: "Frigorífico" },
  { value: "FLATBED", label: "Plataforma" },
  { value: "TANKER", label: "Cisterna" },
  { value: "CONTAINER_CHASSIS", label: "Porta-contentores" },
  { value: "OTHER", label: "Outro" },
];

export type TrailerDraft = Omit<Trailer, "id" | "createdAt" | "updatedAt" | "archivedAt" | "isDemo">;

const range = (v: number | undefined, min: number, max: number, label: string, e: string[]) => {
  if (v === undefined) return;
  if (!Number.isFinite(v) || v < min || v > max) e.push(`${label}: valor fora do intervalo plausível (${min}–${max}).`);
};
const normPlate = (p: string) => p.replace(/[\s-]/g, "").toUpperCase();

export function validateTrailer(d: TrailerDraft, others: Trailer[] = [], selfId?: string): string[] {
  const e: string[] = [];
  if (!d.plate.trim()) e.push("Matrícula obrigatória.");
  if (d.plate.trim() && others.some((t) => t.id !== selfId && !t.archivedAt && normPlate(t.plate) === normPlate(d.plate))) e.push("Já existe um reboque ativo com esta matrícula.");
  if (d.type === "OTHER" && !d.typeLabel?.trim()) e.push("Indique o tipo de reboque.");
  range(d.lengthM, 2, 20, "Comprimento (m)", e);
  range(d.widthM, 1.5, 3.5, "Largura (m)", e);
  range(d.heightM, 1, 5, "Altura (m)", e);
  range(d.tareKg, 500, 20_000, "Tara (kg)", e);
  range(d.maxGrossWeightKg, 1_000, 60_000, "Peso bruto máximo (kg)", e);
  range(d.payloadKg, 0, 50_000, "Carga útil (kg)", e);
  range(d.palletCapacity, 0, 60, "Lugares de palete", e);
  if (d.axleCount !== undefined && (!Number.isInteger(d.axleCount) || d.axleCount < 1 || d.axleCount > 6)) e.push("Número de eixos: inteiro entre 1 e 6.");
  if (d.tareKg !== undefined && d.maxGrossWeightKg !== undefined && d.tareKg >= d.maxGrossWeightKg) e.push("A tara tem de ser inferior ao peso bruto máximo.");
  const c = d.capabilities;
  if (c.tempMinC !== undefined && c.tempMaxC !== undefined && c.tempMinC > c.tempMaxC) e.push("Temperatura: mínimo acima do máximo.");
  if ((c.tempMinC !== undefined || c.tempMaxC !== undefined) && !c.refrigerated) e.push("Gama de temperatura só se aplica a reboques frigoríficos.");
  return e;
}

export function createTrailer(d: TrailerDraft, ctx: { id: string; now: Date; others: Trailer[] }): Result<{ trailer: Trailer; events: OperationalEvent[] }> {
  const errors = validateTrailer(d, ctx.others);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const trailer: Trailer = { ...d, plate: d.plate.trim().toUpperCase(), id: ctx.id, createdAt: at, updatedAt: at };
  return ok({ trailer, events: [makeEvent({ entityType: "trailer", entityId: trailer.id, type: "RESOURCE_CREATED", at, source: "LOCAL_USER", data: { plate: trailer.plate } })] });
}

export function updateTrailer(t: Trailer, d: TrailerDraft, ctx: { now: Date; others: Trailer[] }): Result<{ trailer: Trailer; events: OperationalEvent[] }> {
  const errors = validateTrailer(d, ctx.others, t.id);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const trailer: Trailer = { ...d, plate: d.plate.trim().toUpperCase(), id: t.id, createdAt: t.createdAt, updatedAt: at, ...(t.isDemo ? { isDemo: true } : {}), ...(t.archivedAt ? { archivedAt: t.archivedAt } : {}) };
  return ok({ trailer, events: [makeEvent({ entityType: "trailer", entityId: t.id, type: "RESOURCE_UPDATED", at, source: "LOCAL_USER" })] });
}

export function trailerToDraft(t: Trailer): TrailerDraft {
  const d: Partial<Trailer> = { ...t };
  for (const k of ["id", "createdAt", "updatedAt", "archivedAt", "isDemo"] as const) delete d[k];
  return d as TrailerDraft;
}

export function trailerTypeLabel(t: Pick<Trailer, "type" | "typeLabel">): string {
  return t.type === "OTHER" ? t.typeLabel || "Outro" : TRAILER_TYPES.find((x) => x.value === t.type)?.label ?? t.type;
}

export function trailerOperationalState(t: Trailer, jobs: Job[]): "AVAILABLE" | "ASSIGNED" | "IN_SERVICE" | "MAINTENANCE" | "OUT_OF_SERVICE" | "ARCHIVED" {
  if (t.archivedAt) return "ARCHIVED";
  if (t.availability !== "AVAILABLE") return t.availability;
  const mine = jobs.filter((j) => j.assignedTrailerId === t.id);
  if (mine.some((j) => j.status === "loading" || j.status === "in_transit")) return "IN_SERVICE";
  if (mine.some((j) => j.status === "assigned" || j.status === "queued")) return "ASSIGNED";
  return "AVAILABLE";
}
