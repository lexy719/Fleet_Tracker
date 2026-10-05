import type {
  CargoLine,
  Driver,
  Job,
  JobPlanStatus,
  LegacyDriver,
  LegacyJob,
  LegacyTruck,
  Trailer,
  Truck,
  VehicleType,
} from "../../data/types";

/*
 * Converters from the pre-Phase-5 shapes (demo seed in mockData, jobs stored in
 * localStorage "fleet-jobs-v3") to the persistent operational records.
 *
 * Deterministic: the same input + `at` always yields the same record (no random ids —
 * legacy ids are kept as the immutable internal id, and derived ids are suffixes of them).
 * Nothing is invented: values the legacy shape did not hold stay undefined (UNKNOWN).
 */

/* ─── Trucks ─── */

/** Demo routing presets previously hard-coded in tomtom/fleetTruckRouting.ts. */
const LEGACY_PRESET: Record<string, string> = { t6: "rigid-18" };

/** Legacy trucks only ever existed as demo seed records, hence `isDemo` defaults to true. */
export function legacyTruckToTruck(lt: LegacyTruck, at: string, isDemo = true): Truck {
  const make = lt.name.split(/\s+/)[0];
  const fullModel = lt.model ?? lt.name;
  const model = fullModel.startsWith(make) ? fullModel.slice(make.length).trim() : fullModel;
  const presetId = LEGACY_PRESET[lt.id];
  const vehicleType: VehicleType = presetId?.startsWith("rigid") ? "RIGID" : "TRACTOR";
  const demo = isDemo || lt.isDemo === true;
  const t: Truck = {
    id: lt.id,
    plate: lt.plate,
    unitNumber: lt.id.toUpperCase(),
    make,
    model: model || undefined,
    yearManuf: lt.yearManuf,
    vehicleType,
    bodyType: lt.bodyType,
    availability: lt.status === "maintenance" ? "MAINTENANCE" : "AVAILABLE",
    grossVehicleWeightKg: lt.grossVehicleWeightKg,
    // The legacy "maxWeightKg" was the load capacity used by the cargo views.
    payloadKg: lt.maxWeightKg,
    axleCount: lt.axleCount,
    firstAxleHeightM: lt.firstAxleHeightM,
    ownerCategory: lt.ownerCategory,
    routingPresetId: presetId,
    odometerKm: lt.odometerKm !== undefined ? { value: lt.odometerKm, recordedAt: at, source: demo ? "DEMO" : "MANUAL" } : undefined,
    fuelLevelPct: demo ? { value: lt.fuelPct, recordedAt: at, source: "DEMO" } : undefined,
    isDemo: demo || undefined,
    demoPurpose: lt.id === "t-demo-vci" ? "regulatory-test" : demo ? "showcase" : undefined,
    demoTelemetry: demo
      ? { lat: lt.lat, lng: lt.lng, headingDeg: lt.headingDeg, status: lt.status, routeId: lt.routeId, fuelPct: lt.fuelPct }
      : undefined,
    createdAt: at,
    updatedAt: at,
  };
  return stripUndefined(t);
}

/* ─── Drivers ─── */

function licenceCategories(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split("·").map((x) => x.trim().toUpperCase().replace(/\s+/g, ""))) {
    if (/^C\+?E$/.test(raw)) out.push("C", "CE");
    else if (/^C1\+?E$/.test(raw)) out.push("C1", "C1E");
    else if (/^(B|BE|C1|C|D1|D|D1E|DE)$/.test(raw)) out.push(raw);
  }
  return [...new Set(out)];
}

export function legacyDriverToDriver(ld: LegacyDriver, at: string, isDemo = true): Driver {
  const tags = ld.license.toUpperCase();
  const adr = /\bADR\b/.test(tags);
  const d: Driver = {
    id: ld.id,
    name: ld.name,
    phone: ld.phone,
    homeTerminal: ld.homeTerminal,
    availability: ld.availability === "pto" ? "LEAVE" : "AVAILABLE",
    licence: { categories: licenceCategories(ld.license), expiresOn: ld.licenseExpiry },
    cpc: { expiresOn: ld.cpcExpiry },
    adr: { certified: adr, ...(adr && /CISTERN/.test(tags) ? { tanks: true } : {}), ...(adr && ld.adrExpiry ? { expiresOn: ld.adrExpiry } : {}) },
    // Legacy "tachoCalExpiry" is a vehicle calibration date, not the driver card — not mapped.
    hours: { drivenTodayMin: Math.round(ld.hoursToday * 60), drivenWeekMin: Math.round(ld.hoursWeek * 60), recordedAt: at, source: isDemo ? "DEMO" : "MANUAL" },
    isDemo: isDemo || undefined,
    demoMetrics: isDemo ? { safetyScore: ld.safetyScore, onTimePct: ld.onTimePct } : undefined,
    createdAt: at,
    updatedAt: at,
  };
  return stripUndefined(d);
}

/* ─── Jobs ─── */

const PLANNED_STATUSES = ["queued", "assigned", "loading", "in_transit", "delivered", "invoiced"];

/** One cargo line reconstructed from the legacy totals (the only cargo data legacy jobs had). */
export function legacyCargo(lj: Pick<LegacyJob, "id" | "totalWeightKg" | "totalPallets" | "stops" | "adrClass" | "adrUnNumber">): CargoLine[] {
  const description = lj.stops.find((s) => s.type === "pickup")?.cargoDescription || lj.stops[0]?.cargoDescription || "Carga";
  const pallets = lj.totalPallets > 0 ? lj.totalPallets : undefined;
  return [stripUndefined({
    id: `${lj.id}-c1`,
    description,
    quantity: pallets ?? 1,
    unit: pallets ? "pallet" : "unit",
    weightKg: lj.totalWeightKg,
    pallets,
    dangerousGoods: lj.adrClass || lj.adrUnNumber ? stripUndefined({ adrClass: lj.adrClass, unNumber: lj.adrUnNumber }) : undefined,
  } as CargoLine)];
}

/**
 * Legacy / demo job → current record. Already-converted records pass through unchanged
 * (idempotent). A legacy job past backlog is treated as PLANNED: it was assigned through
 * the planner before plan validity was tracked.
 */
export function legacyJobToJob(lj: LegacyJob | Job, at: string): Job {
  const j = lj as LegacyJob;
  const planStatus: JobPlanStatus = j.planStatus ?? (PLANNED_STATUSES.includes(j.status) ? "PLANNED" : "UNPLANNED");
  return {
    ...j,
    jobNumber: j.jobNumber ?? j.id,
    cargo: j.cargo ?? legacyCargo(j),
    planStatus,
    revision: j.revision ?? 1,
    updatedAt: j.updatedAt ?? j.createdAt ?? at,
    stops: j.stops.map((s) => ({ ...s })),
  } as Job;
}

/** Is this a stored entry minimally job-shaped (to be migrated rather than dropped)? */
export function isJobShaped(x: unknown): x is LegacyJob {
  return !!x && typeof x === "object" && typeof (x as Job).id === "string" && Array.isArray((x as Job).stops);
}

/* ─── Demo trailers (there were none before Phase 5) ─── */

export function demoTrailers(at: string): Trailer[] {
  const base = { availability: "AVAILABLE" as const, isDemo: true, createdAt: at, updatedAt: at };
  return [
    { ...base, id: "tr-demo-1", plate: "L-123456", unitNumber: "R01", make: "Krone", model: "Profi Liner", type: "CURTAINSIDER", lengthM: 13.6, widthM: 2.55, heightM: 4.0, tareKg: 6_800, maxGrossWeightKg: 39_000, payloadKg: 27_000, axleCount: 3, palletCapacity: 33, capabilities: {} },
    { ...base, id: "tr-demo-2", plate: "L-234567", unitNumber: "R02", make: "Schmitz Cargobull", model: "S.KO Cool", type: "REFRIGERATED", lengthM: 13.6, widthM: 2.6, heightM: 4.0, tareKg: 8_900, maxGrossWeightKg: 39_000, payloadKg: 25_000, axleCount: 3, palletCapacity: 33, capabilities: { refrigerated: true, tempMinC: -25, tempMaxC: 25 } },
    { ...base, id: "tr-demo-3", plate: "L-345678", unitNumber: "R03", make: "Parcisa", model: "Cisterna 32 m³", type: "TANKER", lengthM: 12.5, widthM: 2.55, heightM: 3.6, tareKg: 7_200, maxGrossWeightKg: 39_000, payloadKg: 26_000, axleCount: 3, capabilities: { adrSuitable: true } },
  ];
}

export function stripUndefined<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}
