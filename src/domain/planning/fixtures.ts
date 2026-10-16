import type { CargoType, Driver, Job, Trailer, Truck } from "../../data/types";
import { createDriver } from "../drivers/drivers";
import { createTruck } from "../fleet/trucks";
import { createTrailer } from "../fleet/trailers";
import { createJobFromDraft } from "../jobs/jobDraft";
import type { Result } from "../events";
import { haversineM } from "../../regulations/geometry";
import { REGULATION_DATASET } from "../../regulations/repository";
import type { MovementRequest, PlanningRequest, Position } from "./types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";

/** Synthetic data only: imported by tests and the DEV acceptance surface, never Dispatch. */
export const FIXTURE_NOW = Date.parse("2026-10-07T07:00:00Z");
const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
};
export const fixturePosition = (point: [number, number]): Position => ({
  point,
  source: "SYNTHETIC_ACCEPTANCE",
});
export function planningJob(
  id: string,
  from: [number, number],
  to: [number, number],
  now = FIXTURE_NOW,
  cargoType: CargoType = "dry",
  weight = 12_000,
): Job {
  const job = unwrap(
    createJobFromDraft(
      {
        client: "Teste sintético de planeamento",
        reference: id,
        priority: "normal",
        cargoType,
        rateEur: 0,
        cargo: [
          {
            description: "Carga de teste",
            quantity: 1,
            unit: "pallet",
            weightKg: weight,
          },
        ],
        stops: [
          {
            id: `${id}-p`,
            type: "pickup",
            clientName: "Origem teste",
            address: "Coordenadas sintéticas",
            city: "Origem",
            lat: from[0],
            lng: from[1],
            windowStartAt: new Date(now).toISOString(),
            windowEndAt: new Date(now + 6 * 86400_000).toISOString(),
          },
          {
            id: `${id}-d`,
            type: "delivery",
            clientName: "Destino teste",
            address: "Coordenadas sintéticas",
            city: "Destino",
            lat: to[0],
            lng: to[1],
            windowStartAt: new Date(now).toISOString(),
            windowEndAt: new Date(now + 6 * 86400_000).toISOString(),
          },
        ],
      },
      { id, jobNumber: id, now: new Date(now) },
    ),
  ).job;
  job.operationalRequirements = {
    serviceSecByStop: Object.fromEntries(job.stops.map((s) => [s.id, 600])),
  };
  return job;
}
export function planningTruck(id: string): Truck {
  return unwrap(
    createTruck(
      {
        plate: id,
        vehicleType: "RIGID",
        bodyType: "box",
        availability: "AVAILABLE",
        payloadKg: 26_000,
        grossVehicleWeightKg: 32_000,
        kerbWeightKg: 6_000,
        axleCount: 3,
        firstAxleHeightM: 1.4,
        heightM: 3.8,
        widthM: 2.5,
        lengthM: 10,
        palletCapacity: 33,
      },
      { id, now: new Date(FIXTURE_NOW), others: [] },
    ),
  ).truck;
}
export function planningDriver(id: string, now = FIXTURE_NOW): Driver {
  return unwrap(
    createDriver(
      {
        name: id,
        availability: "AVAILABLE",
        licence: { categories: ["C", "CE"], expiresOn: "2030-01-01" },
        cpc: { expiresOn: "2030-01-01" },
        tachoCardExpiresOn: "2030-01-01",
        adr: { certified: false },
        hours: {
          drivenTodayMin: 0,
          drivenWeekMin: 0,
          currentSpellMin: 0,
          recordedAt: new Date(now).toISOString(),
          source: "MANUAL",
        },
      },
      { id, now: new Date(now), others: [] },
    ),
  ).driver;
}

/** Densified synthetic road, 15% distance uplift, 80 km/h, €0.45/km fuel; NOT TomTom. */
export function syntheticOption(
  r: Pick<MovementRequest, "from" | "to" | "departMs">,
  over: Partial<RoutePlanOption> = {},
): RoutePlanOption {
  const direct = haversineM(r.from, r.to),
    distanceM = direct * 1.15,
    count = Math.max(2, Math.ceil(direct / 500) + 1);
  const polyline: [number, number][] = Array.from({ length: count }, (_, i) => [
    r.from[0] + ((r.to[0] - r.from[0]) * i) / (count - 1),
    r.from[1] + ((r.to[1] - r.from[1]) * i) / (count - 1),
  ]);
  const durationSec = Math.max(1, (distanceM / 80_000) * 3600);
  return {
    id: "synthetic-road",
    title: "Rota sintética",
    subtitle: "Teste sem fornecedor",
    polyline,
    distanceM,
    durationSec,
    trafficDelaySec: 0,
    fuelCostEur: (distanceM / 1000) * 0.45,
    tollCostEur: 0,
    tollPricedEur: 0,
    tollEstimatedEur: 0,
    tollDataQuality: "none",
    tollSectionCount: 0,
    stopArrivals: [],
    legDurationSec: [durationSec],
    legPointCounts: [polyline.length],
    roadNumbers: [],
    departAtIso: new Date(r.departMs).toISOString(),
    colorIndex: 0,
    ...over,
  };
}
export const syntheticRouter = async (r: MovementRequest) => [
  syntheticOption(r),
];

export function singleJobFixture(now = FIXTURE_NOW): PlanningRequest {
  const p: [number, number] = [38.753, -9.23];
  return {
    jobs: [planningJob("Teste Amadora–Porto", p, [41.12, -8.58], now)],
    trucks: [planningTruck("TESTE-01")],
    drivers: [planningDriver("Motorista teste", now)],
    trailers: [],
    nowMs: now,
    earliestStartMs: now + 600_000,
    horizonEndMs: now + 6 * 86400_000,
    dataset: REGULATION_DATASET,
    initialState: {
      trucks: {
        "TESTE-01": { availableAt: now, position: fixturePosition(p) },
      },
      drivers: {
        "Motorista teste": {
          availableAt: now,
          position: fixturePosition(p),
          driving: {
            drivenTodaySec: 0,
            continuousSec: 0,
            weekSec: 0,
            known: true,
          },
        },
      },
    },
    route: syntheticRouter,
    search: { beamWidth: 4, extensionsPerState: 8, maxRouteRequests: 128 },
  };
}

/** Five spatially separated crews, heterogeneous equipment and unequal demand: 8/5/3/2/2. */
export function fleetFixture(now = FIXTURE_NOW): PlanningRequest {
  const hubs: [number, number][] = [
    [41.1, -8.4],
    [38.7, -9.1],
    [40.2, -8.4],
    [41.5, -8.4],
    [37.05, -7.9],
  ];
  const quantities = [8, 5, 3, 2, 2],
    types: CargoType[] = [
      "dry",
      "refrigerated",
      "bulk",
      "automotive",
      "hazmat",
    ];
  const trailerTypes: Trailer["type"][] = [
    "CURTAINSIDER",
    "REFRIGERATED",
    "TANKER",
    "FLATBED",
    "BOX",
  ];
  const trucks: Truck[] = [],
    drivers: Driver[] = [],
    trailers: Trailer[] = [],
    jobs: Job[] = [];
  const initialState: NonNullable<PlanningRequest["initialState"]> = {
    trucks: {},
    drivers: {},
    trailers: {},
  };
  for (let i = 0; i < 5; i++) {
    const truck = {
      ...planningTruck(`TESTE-V${i + 1}`),
      vehicleType: "TRACTOR" as const,
      axleCountScope: "POWER_UNIT" as const,
      bodyType: undefined,
      adrEquipped: i === 4,
    };
    const driver = {
      ...planningDriver(`Motorista teste ${i + 1}`, now),
      ...(i === 4
        ? { adr: { certified: true, expiresOn: "2030-01-01", classes: ["3"] } }
        : {}),
    };
    const trailer = unwrap(
      createTrailer(
        {
          plate: `TESTE-R${i + 1}`,
          type: trailerTypes[i],
          availability: "AVAILABLE",
          payloadKg: 27_000,
          palletCapacity: 33,
          axleCount: 3,
          heightM: 4,
          lengthM: 13.6,
          widthM: 2.5,
          capabilities: {
            ...(i === 1
              ? { refrigerated: true, tempMinC: -20, tempMaxC: 10 }
              : {}),
            adrSuitable: i === 4,
          },
        },
        { id: `TESTE-R${i + 1}`, now: new Date(now), others: [] },
      ),
    ).trailer;
    trucks.push(truck);
    drivers.push(driver);
    trailers.push(trailer);
    const position = fixturePosition(hubs[i]);
    initialState.trucks![truck.id] = { availableAt: now, position };
    initialState.drivers![driver.id] = {
      availableAt: now,
      position,
      driving: { drivenTodaySec: 0, continuousSec: 0, weekSec: 0, known: true },
    };
    initialState.trailers![trailer.id] = { availableAt: now, position };
    for (let n = 0; n < quantities[i]; n++) {
      const from: [number, number] = [
          hubs[i][0] + n * 0.08,
          hubs[i][1] + n * 0.04,
        ],
        to: [number, number] = [from[0] + 0.07, from[1] + 0.03];
      const job = planningJob(
        `TESTE-J${i + 1}-${n + 1}`,
        from,
        to,
        now,
        types[i],
        i === 0 ? 20_000 : 12_000,
      );
      job.operationalRequirements = {
        ...job.operationalRequirements,
        trailerRequired: true,
        trailerTypes: [trailerTypes[i]],
      };
      if (i === 1) job.tempTargetC = { min: 0, max: 5 };
      if (i === 4) job.adrClass = "3";
      job.stops[0].windowEndAt = new Date(
        now + (12 + n * 3) * 3600_000,
      ).toISOString();
      job.stops[1].windowEndAt = new Date(
        now + (18 + n * 3) * 3600_000,
      ).toISOString();
      jobs.push(job);
    }
  }
  return {
    jobs,
    trucks,
    drivers,
    trailers,
    initialState,
    nowMs: now,
    earliestStartMs: now + 600_000,
    horizonEndMs: now + 6 * 86400_000,
    dataset: REGULATION_DATASET,
    route: syntheticRouter,
    search: {
      beamWidth: 4,
      extensionsPerState: 8,
      maxRouteRequests: 4096,
      maxAlternatives: 4,
    },
  };
}
