import type { Crew, Equipment, Instance, LatLng, Load } from "../model";
import { syntheticTravel } from "../model";

/*
 * Benchmark weeks for a Trás-os-Montes carrier (Bragança style): crews live in Bragança, Mirandela
 * and Macedo, leave Monday morning and must be home by Saturday for the weekly rest. Loads are
 * generated (illustrative, NOT market data): a third leave the region, a third come back to it,
 * the rest run between Iberian hubs (some of them cabotage inside Spain). Deterministic per seed.
 */

export type Hub = { name: string; at: LatLng; country: "PT" | "ES"; w: number; region?: true };
export const HUBS: Hub[] = [
  { name: "Bragança", at: [41.806, -6.757], country: "PT", w: 3, region: true },
  { name: "Mirandela", at: [41.485, -7.181], country: "PT", w: 2, region: true },
  { name: "Macedo de Cavaleiros", at: [41.538, -6.96], country: "PT", w: 1, region: true },
  { name: "Chaves", at: [41.74, -7.47], country: "PT", w: 1, region: true },
  { name: "Vila Real", at: [41.3, -7.74], country: "PT", w: 1.5, region: true },
  { name: "Leixões", at: [41.185, -8.7], country: "PT", w: 4 },
  { name: "Maia", at: [41.235, -8.62], country: "PT", w: 3 },
  { name: "Braga", at: [41.545, -8.427], country: "PT", w: 2 },
  { name: "Aveiro", at: [40.64, -8.654], country: "PT", w: 1.5 },
  { name: "Viseu", at: [40.66, -7.91], country: "PT", w: 1 },
  { name: "Leiria", at: [39.744, -8.807], country: "PT", w: 1 },
  { name: "Lisboa (Carregado)", at: [39.07, -8.868], country: "PT", w: 2.5 },
  { name: "Zamora", at: [41.5, -5.75], country: "ES", w: 1.5 },
  { name: "Salamanca", at: [40.97, -5.664], country: "ES", w: 1 },
  { name: "Valladolid", at: [41.652, -4.725], country: "ES", w: 2 },
  { name: "León", at: [42.599, -5.567], country: "ES", w: 1 },
  { name: "Ourense", at: [42.336, -7.864], country: "ES", w: 1 },
  { name: "Vigo", at: [42.241, -8.721], country: "ES", w: 2 },
  { name: "Burgos", at: [42.344, -3.697], country: "ES", w: 1.5 },
  { name: "Madrid (Coslada)", at: [40.424, -3.561], country: "ES", w: 4 },
  { name: "Zaragoza", at: [41.626, -0.962], country: "ES", w: 2 },
  { name: "Valencia", at: [39.47, -0.376], country: "ES", w: 1.5 },
  { name: "Sevilla", at: [37.389, -5.985], country: "ES", w: 1 },
];
const HOMES = [
  { name: "Bragança", at: HUBS[0]!.at, share: 0.6 },
  { name: "Mirandela", at: HUBS[1]!.at, share: 0.25 },
  { name: "Macedo de Cavaleiros", at: HUBS[2]!.at, share: 0.15 },
];

/** mulberry32 — deterministic per seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RATE_FIXED_EUR = 150;
export const RATE_EUR_PER_KM = 1.3;
/** Diesel ~34.5 L/100 km × €1.80 + ~€0.15/km wear: illustrative. */
export const COST_EUR_PER_KM = 0.77;
/** Monday 2 Nov 2026, 06:00 Lisbon (UTC+0 in winter). */
export const BENCH_WEEK_START = Date.parse("2026-11-02T06:00:00Z");
const WEEK_START = BENCH_WEEK_START;

export type BenchSize = { name: string; crews: number; loadsPerCrew: number; seed: number; /** Monday 06:00 Lisbon; default BENCH_WEEK_START. */ weekStartMs?: number };
export const BENCH_SIZES: BenchSize[] = [
  { name: "S", crews: 10, loadsPerCrew: 4.5, seed: 11 },
  { name: "M", crews: 30, loadsPerCrew: 4.5, seed: 23 },
  { name: "L", crews: 100, loadsPerCrew: 4.5, seed: 37 },
];

export function bragancaInstance(size: BenchSize): Instance {
  const r = rng(size.seed);
  const BENCH_WEEK_START = size.weekStartMs ?? WEEK_START;
  const H = 3_600_000, D = 24 * H;
  const travel = syntheticTravel();
  const pick = (hubs: Hub[]) => {
    const total = hubs.reduce((s, h) => s + h.w, 0);
    let x = r() * total;
    for (const h of hubs) if ((x -= h.w) <= 0) return h;
    return hubs.at(-1)!;
  };
  const region = HUBS.filter((h) => h.region), outside = HUBS.filter((h) => !h.region);

  const crews: Crew[] = [];
  for (let i = 0; i < size.crews; i++) {
    const x = r();
    const home = x < HOMES[0]!.share ? HOMES[0]! : x < HOMES[0]!.share + HOMES[1]!.share ? HOMES[1]! : HOMES[2]!;
    const n = String(i + 1).padStart(3, "0");
    crews.push({
      id: `E${n}`,
      truckId: `T${n}`,
      driverId: `M${n}`,
      trailerId: `R${n}`,
      equipment: r() < 0.2 ? "REEFER" : "CURTAIN",
      homeName: home.name,
      home: home.at,
      start: home.at,
      availableFromMs: BENCH_WEEK_START + Math.floor(r() * 3) * H, // 06:00–08:00 Monday
      homeByMs: BENCH_WEEK_START + 5 * D + 8 * H, // Saturday 14:00
      driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 0, previousWeekDriveSec: 0 },
    });
  }

  const loads: Load[] = [];
  const count = Math.round(size.crews * size.loadsPerCrew);
  let guard = 0;
  while (loads.length < count && guard++ < count * 50) {
    const kind = r();
    let a: Hub, b: Hub;
    if (kind < 0.35) { a = pick(region); b = pick(outside); }
    else if (kind < 0.7) { a = pick(outside); b = pick(region); }
    else { a = pick(outside); b = pick(outside); }
    if (a === b) continue;
    const loaded = travel(a.at, b.at);
    if (loaded.km < 60) continue;
    // Pickup Mon–Fri, heavier early in the week; window opens 06:00–14:00 and lasts 2–8 h.
    const day = Math.min(4, Math.floor(r() * r() * 6.5));
    const pickupStartMs = BENCH_WEEK_START + day * D + Math.floor(r() * 9) * H;
    const pickupEndMs = pickupStartMs + (2 + Math.floor(r() * 7)) * H;
    // Delivery: from the earliest possible arrival, open 6–30 h (overnight drives need a rest).
    const transitH = loaded.sec / 3600;
    const restsH = Math.floor(transitH / 9) * 11 + Math.floor(transitH / 4.5) * 0.75;
    const deliveryStartMs = pickupStartMs + Math.ceil(transitH + restsH + 1) * H;
    const deliveryEndMs = deliveryStartMs + (6 + Math.floor(r() * 25)) * H;
    const equipment: Equipment = r() < 0.2 ? "REEFER" : "CURTAIN";
    const n = String(loads.length + 1).padStart(3, "0");
    loads.push({
      id: `C${n}`,
      fromName: a.name,
      toName: b.name,
      from: a.at,
      to: b.at,
      fromCountry: a.country,
      toCountry: b.country,
      pickupStartMs,
      pickupEndMs,
      deliveryStartMs,
      deliveryEndMs,
      pickupServiceSec: 3600,
      deliveryServiceSec: 3600,
      equipment,
      weightKg: 10_000 + Math.floor(r() * 15) * 1000,
      rateEur: Math.round(RATE_FIXED_EUR + RATE_EUR_PER_KM * loaded.km),
    });
  }
  return { name: `Bragança ${size.name} (${size.crews} equipas, ${loads.length} cargas)`, weekStartMs: BENCH_WEEK_START, crews, loads, travel, costEurPerKm: COST_EUR_PER_KM };
}
