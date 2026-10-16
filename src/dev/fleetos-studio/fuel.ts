// Fuel for the studio, on the project's own engines:
//  · stations + prices: the fuel module's parsers over the repository's price samples
//    (DGEG Norte diesel + MITECO subset). Real stations, real published prices, partial
//    coverage — the live collector (fuel/collector) covers the whole network.
//  · corridor: fuel/corridor `stationsAlongRoute`
//  · decision: domain/fuelPlanning `planRefuel` (cost-optimal stops, pause merging)
// DGEG terms are non-commercial: this view is DEV/research only (see memory: Project 2).
import { parseDgeg } from "../../fuel/parsers/dgeg";
import { parseMiteco } from "../../fuel/parsers/miteco";
import { stationsAlongRoute, type CorridorStation } from "../../fuel/corridor";
import { ROUTING_REFUEL_POLICY } from "../../fuel/intelligence";
import { planRefuel, type RefuelPlan } from "../../domain/fuelPlanning/refuelPlanner";
import type { FuelPriceObservation, FuelStation } from "../../fuel/types";
import { runFuelSource, type FuelFetch } from "../../fuel/collector";
import { IdbFuelStore } from "../../fuel/idbStore";
import { FUEL_SOURCES } from "../../fuel/sources";
import { haversineKm } from "../fleetos-environment/world";
import { truckWorld, NOW, type RecordedRoute } from "./model";
import type { Point } from "./world/types";

const RAW = import.meta.glob<string>("../../fuel/__fixtures__/{dgegDieselNorte,mitecoSubset}.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SAMPLE_LABEL = "Amostra de preços DGEG (Norte) + MITECO · 6–11 out";
/** Where the prices on screen come from (changes once live collection succeeds). */
export let FUEL_SOURCE_LABEL = SAMPLE_LABEL;
export let fuelLive = false;
const DEFAULT_L100 = 30;
/** Office rule: arrive with at least a quarter tank, so the next job can start without a detour. */
export const ARRIVAL_TARGET = 0.25;

type Catalog = { stations: FuelStation[]; prices: FuelPriceObservation[]; asOf: Date };
let catalog: Catalog | null = null;

const MAX_AGE_H = 12;
const browserFetch: FuelFetch = (url, init) => fetch(url, { ...init, credentials: "omit", cache: "no-store" });
const fmtHM = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Live prices, exactly as the application gets them (FuelProvider): read the browser's
 * "fleetos-fuel" store; when a source is empty or older than 12 h, run the same collector
 * over the official feeds. Falls back to the repository sample when nothing is available.
 */
export async function loadLiveFuel(onProgress?: (msg: string) => void, onStored?: () => void): Promise<boolean> {
  try {
    const store = new IdbFuelStore();
    // Last collected prices first (instant), then refresh the stale sources behind it.
    if (await buildFromStore(store)) onStored?.();
    let refreshed = false;
    for (const src of FUEL_SOURCES) {
      const st = await store.getState(src.id);
      const age = st?.lastSuccessAt ? (Date.now() - Date.parse(st.lastSuccessAt)) / 3.6e6 : Infinity;
      if (age > MAX_AGE_H) {
        onProgress?.(`A atualizar preços ${src.authority}…`);
        await runFuelSource(src, { store, fetch: browserFetch, now: new Date() }).catch(() => undefined);
        refreshed = true;
      }
    }
    return refreshed ? await buildFromStore(store) : fuelLive;
  } catch {
    return false;
  }
}

async function buildFromStore(store: IdbFuelStore): Promise<boolean> {
  const stations: FuelStation[] = [];
  const prices: FuelPriceObservation[] = [];
  let asOf = 0;
  const when: string[] = [];
  for (const src of FUEL_SOURCES) {
    const st = await store.getState(src.id);
    const ps = (await store.getCurrentPrices(src.id)).filter((p) => p.fuelType === "diesel");
    if (!ps.length) continue;
    stations.push(...(await store.getStations(src.id)));
    prices.push(...ps);
    if (st?.lastSuccessAt) {
      asOf = Math.max(asOf, Date.parse(st.lastSuccessAt));
      when.push(`${src.authority} ${fmtHM.format(new Date(st.lastSuccessAt))}`);
    }
  }
  if (!prices.length) return false;
  const priced = new Set(prices.map((p) => p.stationId));
  catalog = { stations: stations.filter((x) => priced.has(x.id) && Number.isFinite(x.lat)), prices, asOf: new Date(asOf || Date.now()) };
  corridors.clear();
  fuelLive = true;
  FUEL_SOURCE_LABEL = `Preços oficiais recolhidos · ${when.join(" · ")} · ${catalog.stations.length.toLocaleString("pt-PT")} postos`;
  return true;
}

/** Diesel stations with their published price (parsed once). */
export function fuelCatalog(): Catalog {
  if (catalog) return catalog;
  const stations: FuelStation[] = [];
  const prices: FuelPriceObservation[] = [];
  let asOf = 0;
  for (const [path, body] of Object.entries(RAW)) {
    const ctx = { sourceId: path.includes("dgeg") ? "dgeg" : "miteco", snapshotId: "fixture" };
    const out = path.includes("dgeg") ? parseDgeg(body, ctx) : parseMiteco(body, ctx);
    for (const p of out.prices) {
      if (p.fuelType !== "diesel") continue;
      // A sample has no collection history: evidence time = what the publisher declared.
      const seen = p.sourceValidFrom ?? p.sourcePublishedAt ?? out.publishedAt ?? new Date(0).toISOString();
      asOf = Math.max(asOf, Date.parse(seen));
      prices.push({ ...p, firstSeenAt: seen, lastSeenAt: seen });
    }
    for (const s of out.stations) stations.push({ ...s, firstSeenAt: "", lastSeenAt: "" });
  }
  const priced = new Set(prices.map((p) => p.stationId));
  catalog = { stations: stations.filter((s) => priced.has(s.id)), prices, asOf: new Date(asOf) };
  return catalog;
}

export function stationPoints(): { at: Point; price: number; id: string; name: string }[] {
  const c = fuelCatalog();
  const price = new Map(c.prices.map((p) => [p.stationId, p.price]));
  return c.stations.map((s) => ({ at: [s.lon, s.lat] as Point, price: price.get(s.id)!, id: s.id, name: s.brand ?? s.name ?? "Posto" }));
}

/* ─── Corridor per route (cached) ──────────────────────────────────────── */

type Corridor = { stations: (CorridorStation & { km: number })[]; factor: number };
const corridors = new Map<string, Corridor>();

/** Stations within 8 km of the route, positioned in the route's own km (road-scaled). */
export function corridorOf(route: RecordedRoute): Corridor {
  const ck = `${route.id}|${route.line.length}|${Math.round(route.km)}`;
  const hit = corridors.get(ck);
  if (hit) return hit;
  const c = fuelCatalog();
  let geom = 0;
  for (let i = 1; i < route.line.length; i++) geom += haversineKm(route.line[i - 1], route.line[i]);
  const factor = geom > 0 ? route.km / geom : 1;
  const sum = stationsAlongRoute(
    route.line.map(([lng, lat]) => [lat, lng]),
    c.stations,
    c.prices,
    { fuelType: "diesel", bufferM: 8000, now: c.asOf, maxAgeH: 24 * 30 },
  );
  const out = { stations: sum.stations.map((s) => ({ ...s, km: (s.alongRouteM / 1000) * factor })), factor };
  corridors.set(ck, out);
  return out;
}

/* ─── Outlook: will this transport reach the destination? ─────────────── */

export type Refuel = { km: number; litres: number; stationId: string; name: string; pricePerL: number };

export type FuelView = {
  tankL: number;
  lPer100: number;
  /** Litres on board where the remaining trip starts. */
  startL: number;
  reading: "registo" | "simulado" | "sem leitura";
  reserveL: number;
  /** Litres the office wants on arrival (ARRIVAL_TARGET of the tank). */
  targetL: number;
  fromKm: number;
  toKm: number;
  needL: number;
  /** Litres on arrival, with the route's refuel stops applied. */
  endL: number;
  /** Even with the route's stops the trip misses the arrival rule or touches the reserve. */
  short: boolean;
  /** Absolute route km where fuel would fall to the reserve WITHOUT refuelling (null = never). */
  dryKmWithout: number | null;
  corridor: (CorridorStation & { km: number })[];
  /** The refuel engine's result for this route (same engine the routing uses). */
  plan: RefuelPlan;
  /** Refuel stops that are part of the route plan, in absolute route km. */
  refuels: Refuel[];
  assumptions: string[];
};

type Placed = { route: RecordedRoute; scale: number; positionKm: number | null; truckId: string; status: string };

/**
 * Fuel of a route as the route calculation sees it: the refuel engine runs on the route's own
 * corridor and its stops are applied to the plan — the office does not pick stations by hand.
 */
export function fuelView(job: Placed): FuelView | null {
  if (!job.truckId) return null;
  const t = truckWorld(job.truckId);
  const tankL = t.tankL || 400;
  const lPer100 = t.consumptionL100.value > 0 ? t.consumptionL100.value : DEFAULT_L100;
  const known = t.fuel.prov.kind !== "UNKNOWN";
  const startL = known ? (t.fuel.value / 100) * tankL : tankL * 0.5;
  const fromKm = (job.positionKm ?? 0) * job.scale;
  const toKm = job.route.km;
  const remaining = Math.max(0, toKm - fromKm);
  const reserveL = tankL * 0.1;
  const targetL = tankL * ARRIVAL_TARGET;
  const needL = (remaining * lPer100) / 100;
  const usable = startL - reserveL;
  const dryKmWithout = needL > usable ? fromKm + (usable / lPer100) * 100 : null;
  const cor = corridorOf(job.route);
  const ahead = cor.stations.filter((s) => s.km >= fromKm && s.km <= toKm);
  const kmh = job.route.km / job.route.hours;
  const plan = planRefuel({
    route: { distanceM: remaining * 1000, drivingSec: (remaining / kmh) * 3600 },
    stations: ahead.map((s) => ({ ...s, alongRouteM: (s.km - fromKm) * 1000 })),
    truck: { tankL, startFuelL: known ? startL : undefined, lPer100km: lPer100 },
    policy: { ...ROUTING_REFUEL_POLICY, targetEndL: targetL },
  });
  const refuels: Refuel[] = plan.stops.map((s) => ({
    km: fromKm + s.alongKm,
    litres: s.litres,
    stationId: s.stationId,
    name: [s.brand ?? s.name, s.municipality].filter(Boolean).join(" · "),
    pricePerL: s.pricePerL,
  }));
  const assumptions = [...plan.assumptions];
  if (!(t.consumptionL100.value > 0)) assumptions.push(`Consumo assumido ${DEFAULT_L100} L/100 km (sem registo)`);
  const v: FuelView = {
    tankL,
    lPer100,
    startL,
    reading: !known ? "sem leitura" : t.fuel.prov.kind === "SIMULATED" ? "simulado" : "registo",
    reserveL,
    targetL,
    fromKm,
    toKm,
    needL,
    endL: 0,
    short: false,
    dryKmWithout,
    corridor: ahead,
    plan,
    refuels,
    assumptions,
  };
  v.endL = litresAt(v, toKm);
  v.short = v.endL < targetL - 1 || plan.status === "INFEASIBLE";
  return v;
}

/** Litres on board at route km `km` with the route's refuel stops applied once passed. */
export function litresAt(v: Pick<FuelView, "fromKm" | "lPer100" | "tankL" | "startL" | "refuels">, km: number, withRefuels = true): number {
  let l = v.startL;
  let at = v.fromKm;
  for (const r of withRefuels ? [...v.refuels].sort((a, b) => a.km - b.km) : []) {
    if (r.km > km) break;
    l = Math.min(v.tankL, l - ((r.km - at) * v.lPer100) / 100 + r.litres);
    at = r.km;
  }
  return Math.max(0, l - ((Math.max(at, km) - at) * v.lPer100) / 100);
}

export const priceAge = () => {
  const h = (Date.now() - fuelCatalog().asOf.getTime()) / 3.6e6;
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`;
};
export const nowMin = () => NOW.min;
