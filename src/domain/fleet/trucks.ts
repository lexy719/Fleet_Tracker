import type { Job, ResourceAvailability, Trailer, Truck, TruckOperationalState, TruckStatus, TruckView, VehicleType } from "../../data/types";
import { fail, makeEvent, ok, type OperationalEvent, type Result } from "../events";
import { isIsoInstant } from "../time";

/*
 * Truck domain. Manual availability (AVAILABLE / MAINTENANCE / OUT_OF_SERVICE) is set by
 * people; ASSIGNED / IN_SERVICE are DERIVED from jobs and cannot be set from the UI.
 */

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "TRACTOR", label: "Trator (semirreboque)" },
  { value: "RIGID", label: "Rígido" },
  { value: "VAN", label: "Furgão" },
];

export type TruckDraft = Omit<Truck, "id" | "createdAt" | "updatedAt" | "archivedAt" | "isDemo" | "demoPurpose" | "demoTelemetry">;

const range = (v: number | undefined, min: number, max: number, label: string, e: string[]) => {
  if (v === undefined) return;
  if (!Number.isFinite(v) || v < min || v > max) e.push(`${label}: valor fora do intervalo plausível (${min}–${max}).`);
};

const normPlate = (p: string) => p.replace(/[\s-]/g, "").toUpperCase();

export function validateTruck(d: TruckDraft, others: Truck[] = [], selfId?: string): string[] {
  const e: string[] = [];
  if (!d.plate.trim()) e.push("Matrícula obrigatória.");
  if (d.plate.trim() && others.some((t) => t.id !== selfId && !t.archivedAt && normPlate(t.plate) === normPlate(d.plate))) e.push("Já existe uma viatura ativa com esta matrícula.");
  range(d.lengthM, 3, 30, "Comprimento (m)", e);
  range(d.widthM, 1.5, 3.5, "Largura (m)", e);
  range(d.heightM, 1.5, 5, "Altura (m)", e);
  range(d.grossVehicleWeightKg, 2_000, 100_000, "Peso bruto (kg)", e);
  range(d.kerbWeightKg, 1_000, 30_000, "Tara (kg)", e);
  range(d.payloadKg, 0, 80_000, "Carga útil (kg)", e);
  range(d.maxAxleWeightKg, 1_000, 15_000, "Peso por eixo (kg)", e);
  range(d.firstAxleHeightM, 0.3, 2.5, "Altura no 1.º eixo (m)", e);
  range(d.fuelCapacityL, 1, 2_000, "Depósito (L)", e);
  range(d.palletCapacity, 0, 60, "Lugares de palete", e);
  range(d.yearManuf, 1950, new Date().getFullYear() + 1, "Ano", e);
  if (d.axleCount !== undefined && (!Number.isInteger(d.axleCount) || d.axleCount < 2 || d.axleCount > 10)) e.push("Número de eixos: inteiro entre 2 e 10.");
  if (d.grossVehicleWeightKg !== undefined && d.kerbWeightKg !== undefined && d.kerbWeightKg >= d.grossVehicleWeightKg) e.push("A tara tem de ser inferior ao peso bruto.");
  if (d.payloadKg !== undefined && d.grossVehicleWeightKg !== undefined && d.payloadKg > d.grossVehicleWeightKg) e.push("A carga útil não pode exceder o peso bruto.");
  const measured: [string, { value: number; recordedAt: string } | undefined][] = [["Conta-quilómetros", d.odometerKm], ["Combustível", d.fuelLevelPct]];
  for (const [label, m] of measured) {
    if (!m) continue;
    if (!Number.isFinite(m.value) || m.value < 0) e.push(`${label}: valor inválido.`);
    if (!isIsoInstant(m.recordedAt)) e.push(`${label}: data de registo inválida.`);
  }
  if (d.fuelLevelPct && d.fuelLevelPct.value > 100) e.push("Combustível: percentagem acima de 100.");
  return e;
}

export function createTruck(d: TruckDraft, ctx: { id: string; now: Date; others: Truck[] }): Result<{ truck: Truck; events: OperationalEvent[] }> {
  const errors = validateTruck(d, ctx.others);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const truck: Truck = { ...d, plate: d.plate.trim().toUpperCase(), id: ctx.id, createdAt: at, updatedAt: at };
  return ok({ truck, events: [makeEvent({ entityType: "truck", entityId: truck.id, type: "RESOURCE_CREATED", at, source: "LOCAL_USER", data: { plate: truck.plate } })] });
}

export function updateTruck(t: Truck, d: TruckDraft, ctx: { now: Date; others: Truck[] }): Result<{ truck: Truck; events: OperationalEvent[] }> {
  const errors = validateTruck(d, ctx.others, t.id);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const keep: Partial<Truck> = {
    ...(t.isDemo ? { isDemo: true } : {}),
    ...(t.demoPurpose ? { demoPurpose: t.demoPurpose } : {}),
    ...(t.demoTelemetry ? { demoTelemetry: t.demoTelemetry } : {}),
    ...(t.archivedAt ? { archivedAt: t.archivedAt } : {}),
  };
  const truck: Truck = { ...d, ...keep, plate: d.plate.trim().toUpperCase(), id: t.id, createdAt: t.createdAt, updatedAt: at };
  return ok({ truck, events: [makeEvent({ entityType: "truck", entityId: t.id, type: "RESOURCE_UPDATED", at, source: "LOCAL_USER" })] });
}

export function truckToDraft(t: Truck): TruckDraft {
  const draft: Partial<Truck> = { ...t };
  for (const k of ["id", "createdAt", "updatedAt", "archivedAt", "isDemo", "demoPurpose", "demoTelemetry"] as const) delete draft[k];
  return draft as TruckDraft;
}

export function truckDisplayName(t: Pick<Truck, "make" | "model" | "unitNumber" | "plate">): string {
  const mm = [t.make, t.model].filter(Boolean).join(" ").trim();
  return mm || (t.unitNumber ? `Unidade ${t.unitNumber}` : t.plate);
}

/** Payload capacity: recorded payload, else GVW − tare when both are recorded; null when unknown. */
export function truckPayloadKg(t: Truck): number | null {
  if (t.payloadKg !== undefined) return t.payloadKg;
  if (t.grossVehicleWeightKg !== undefined && t.kerbWeightKg !== undefined) return t.grossVehicleWeightKg - t.kerbWeightKg;
  return null;
}

const ACTIVE = ["assigned", "loading", "in_transit"];

export function truckOperationalState(t: Truck, jobs: Job[]): TruckOperationalState {
  if (t.archivedAt) return "ARCHIVED";
  if (t.availability !== "AVAILABLE") return t.availability;
  const mine = jobs.filter((j) => j.assignedTruckId === t.id);
  if (mine.some((j) => j.status === "loading" || j.status === "in_transit")) return "IN_SERVICE";
  if (mine.some((j) => j.status === "assigned" || j.status === "queued")) return "ASSIGNED";
  return "AVAILABLE";
}

export const TRUCK_STATE_LABEL: Record<TruckOperationalState, string> = {
  AVAILABLE: "Disponível",
  ASSIGNED: "Atribuída",
  IN_SERVICE: "Em serviço",
  MAINTENANCE: "Em manutenção",
  OUT_OF_SERVICE: "Fora de serviço",
  ARCHIVED: "Arquivada",
};

export const AVAILABILITY_LABEL: Record<ResourceAvailability, string> = {
  AVAILABLE: "Disponível",
  MAINTENANCE: "Em manutenção",
  OUT_OF_SERVICE: "Fora de serviço",
};

const STATE_TO_DISPLAY: Record<TruckOperationalState, TruckStatus> = {
  AVAILABLE: "idle",
  ASSIGNED: "idle",
  IN_SERVICE: "in_transit",
  MAINTENANCE: "maintenance",
  OUT_OF_SERVICE: "maintenance",
  ARCHIVED: "maintenance",
};

/**
 * Read model for visual components. Position is SIMULATED for demo vehicles and UNKNOWN
 * otherwise; load is derived from the cargo of the truck's active jobs.
 */
export function truckView(t: Truck, jobs: Job[], trailers: Trailer[] = []): TruckView {
  const state = truckOperationalState(t, jobs);
  const active = jobs.filter((j) => j.assignedTruckId === t.id && ACTIVE.includes(j.status));
  const onBoard = active.filter((j) => j.status === "loading" || j.status === "in_transit");
  const trailer = active.map((j) => trailers.find((x) => x.id === j.assignedTrailerId)).find((x): x is Trailer => !!x);
  const tele = t.demoTelemetry;
  return {
    ...t,
    name: truckDisplayName(t),
    status: tele && state === "AVAILABLE" ? tele.status : STATE_TO_DISPLAY[state],
    operationalState: state,
    lat: tele?.lat ?? null,
    lng: tele?.lng ?? null,
    positionSource: tele ? "DEMO_SIMULATED" : "UNKNOWN",
    headingDeg: tele?.headingDeg ?? 0,
    fuelPct: t.fuelLevelPct?.value ?? null,
    maxWeightKg: trailer?.payloadKg ?? truckPayloadKg(t) ?? 0,
    currentWeightKg: onBoard.reduce((s, j) => s + j.totalWeightKg, 0),
    cargoSlots: onBoard.reduce((s, j) => s + j.totalPallets, 0),
    maxSlots: trailer?.palletCapacity ?? t.palletCapacity ?? 0,
    routeId: tele?.routeId ?? null,
    driverId: active[0]?.assignedDriverId ?? null,
  };
}

/** A truck whose position is known (only demo vehicles carry a — simulated — position). */
export type PlacedTruck = TruckView & { lat: number; lng: number };
export function hasKnownPosition(t: TruckView): t is PlacedTruck {
  return t.lat !== null && t.lng !== null;
}
