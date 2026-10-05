import type { Driver, Job, Trailer, Truck } from "../../data/types";
import { createDriver, type DriverDraft } from "../drivers/drivers";
import { createTrailer, type TrailerDraft } from "../fleet/trailers";
import { createTruck, type TruckDraft } from "../fleet/trucks";
import { createJobFromDraft, type JobDraft } from "../jobs/jobDraft";
import type { ResourceIndex } from "../jobs/lifecycle";

/* Synthetic test fixtures (labelled; never imported by application code). */

export const NOW = new Date("2026-10-04T10:00:00Z");

/** The Phase 5 acceptance job: Braga 06 Oct 08:00–09:00 → intermediate → Lisboa 14:00–15:30. */
export function bragaDraft(over: Partial<JobDraft> = {}): JobDraft {
  return {
    client: "Cliente Teste Braga",
    reference: "PO-778812",
    priority: "normal",
    cargoType: "dry",
    rateEur: 950,
    plannedDepartureAt: "2026-10-06T07:30:00+01:00",
    stops: [
      { type: "pickup", clientName: "Armazém Braga", address: "Zona Industrial, Braga", city: "Braga", lat: 41.5454, lng: -8.4265, windowStartAt: "2026-10-06T08:00:00+01:00", windowEndAt: "2026-10-06T09:00:00+01:00" },
      { type: "stop", clientName: "Cross-dock Coimbra", address: "Taveiro, Coimbra", city: "Coimbra", lat: 40.2033, lng: -8.4103, windowStartAt: "2026-10-06T11:00:00+01:00", windowEndAt: "2026-10-06T11:30:00+01:00" },
      { type: "delivery", clientName: "Loja Lisboa", address: "Av. Brasília, Lisboa", city: "Lisboa", lat: 38.7223, lng: -9.1393, windowStartAt: "2026-10-06T14:00:00+01:00", windowEndAt: "2026-10-06T15:30:00+01:00" },
    ],
    cargo: [
      { description: "Bebidas", quantity: 12, unit: "pallet", weightKg: 8_400 },
      { description: "Mercearia", quantity: 6, unit: "pallet", weightKg: 4_000 },
    ],
    ...over,
  };
}

export function makeJob(id = "job-1", over: Partial<JobDraft> = {}, jobNumber = "J-000001"): Job {
  const r = createJobFromDraft(bragaDraft(over), { id, jobNumber, now: NOW });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value.job;
}

export const truckDraft = (over: Partial<TruckDraft> = {}): TruckDraft => ({
  plate: "AA-11-BB",
  vehicleType: "TRACTOR",
  availability: "AVAILABLE",
  make: "Volvo",
  model: "FH 500",
  grossVehicleWeightKg: 40_000,
  kerbWeightKg: 8_000,
  payloadKg: 25_000,
  axleCount: 5,
  heightM: 4,
  ...over,
});

export function makeTruck(id = "truck-1", over: Partial<TruckDraft> = {}, others: Truck[] = []): Truck {
  const r = createTruck(truckDraft(over), { id, now: NOW, others });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value.truck;
}

export const driverDraft = (over: Partial<DriverDraft> = {}): DriverDraft => ({
  name: "Motorista Teste",
  availability: "AVAILABLE",
  licence: { categories: ["C", "CE"], expiresOn: "2030-01-01" },
  cpc: { expiresOn: "2029-01-01" },
  adr: { certified: false },
  tachoCardExpiresOn: "2029-06-01",
  hours: { drivenTodayMin: 120, drivenWeekMin: 1_200, recordedAt: "2026-10-04T09:00:00Z", source: "MANUAL" },
  ...over,
});

export function makeDriver(id = "driver-1", over: Partial<DriverDraft> = {}): Driver {
  const r = createDriver(driverDraft(over), { id, now: NOW, others: [] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value.driver;
}

export const trailerDraft = (over: Partial<TrailerDraft> = {}): TrailerDraft => ({
  plate: "L-999999",
  type: "CURTAINSIDER",
  availability: "AVAILABLE",
  payloadKg: 27_000,
  palletCapacity: 33,
  axleCount: 3,
  capabilities: {},
  ...over,
});

export function makeTrailer(id = "trailer-1", over: Partial<TrailerDraft> = {}): Trailer {
  const r = createTrailer(trailerDraft(over), { id, now: NOW, others: [] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value.trailer;
}

export function index(trucks: Truck[], drivers: Driver[], trailers: Trailer[] = []): ResourceIndex {
  return { trucks: new Map(trucks.map((t) => [t.id, t])), drivers: new Map(drivers.map((d) => [d.id, d])), trailers: new Map(trailers.map((t) => [t.id, t])) };
}
