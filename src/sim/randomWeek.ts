import type { Job } from "../data/types";
import { planningJob } from "../domain/planning/fixtures";
import { haversineM } from "../regulations/geometry";
import { SERVICE_SEC } from "./iberianWeek";
import { ROAD_UPLIFT, TRUCK_AVG_KMH } from "./weekSimulation";

/*
 * Random Iberian load pools for Monte-Carlo weeks. Cities are real freight hubs, weighted by
 * rough activity; loads, windows and rates are generated (illustrative, NOT market data).
 */

const HUBS: { name: string; at: [number, number]; w: number; tz: "PT" | "ES" }[] = [
  { name: "Porto", at: [41.235, -8.62], w: 4, tz: "PT" },
  { name: "Braga", at: [41.5454, -8.4265], w: 2, tz: "PT" },
  { name: "Aveiro", at: [40.6405, -8.6538], w: 1.5, tz: "PT" },
  { name: "Leiria", at: [39.7436, -8.8071], w: 1.5, tz: "PT" },
  { name: "Lisboa", at: [39.07, -8.868], w: 3, tz: "PT" },
  { name: "Vigo", at: [42.2406, -8.7207], w: 2, tz: "ES" },
  { name: "Ourense", at: [42.3358, -7.8639], w: 1, tz: "ES" },
  { name: "León", at: [42.5987, -5.5671], w: 1, tz: "ES" },
  { name: "Valladolid", at: [41.6523, -4.7245], w: 2, tz: "ES" },
  { name: "Salamanca", at: [40.9701, -5.6635], w: 1, tz: "ES" },
  { name: "Burgos", at: [42.3439, -3.6969], w: 1.5, tz: "ES" },
  { name: "Bilbao", at: [43.263, -2.935], w: 2, tz: "ES" },
  { name: "Madrid", at: [40.4238, -3.5613], w: 5, tz: "ES" },
  { name: "Zaragoza", at: [41.626, -0.962], w: 3, tz: "ES" },
  { name: "Barcelona", at: [41.3874, 2.1686], w: 4, tz: "ES" },
  { name: "Valencia", at: [39.4699, -0.3763], w: 3, tz: "ES" },
  { name: "Sevilla", at: [37.3891, -5.9845], w: 2, tz: "ES" },
  { name: "Badajoz", at: [38.8794, -6.9707], w: 1, tz: "ES" },
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

export function randomWeekJobs(seed: number, weekStartMs: number, count = 24): Job[] {
  const r = rng(seed);
  const total = HUBS.reduce((s, h) => s + h.w, 0);
  const pick = () => {
    let x = r() * total;
    for (const h of HUBS) if ((x -= h.w) <= 0) return h;
    return HUBS.at(-1)!;
  };
  const jobs: Job[] = [];
  let guard = 0;
  while (jobs.length < count && guard++ < count * 20) {
    const a = pick(), b = pick();
    const km = (haversineM(a.at, b.at) / 1000) * ROAD_UPLIFT;
    if (a === b || km < 120 || km > 1100) continue;
    const day = Math.floor(r() * 5); // Mon..Fri
    const startH = 6 + Math.floor(r() * 9); // 06..14 local
    const pickStart = weekStartMs + day * 86400_000 + (startH - 6) * 3600_000;
    const pickEnd = pickStart + (4 + Math.floor(r() * 3)) * 3600_000;
    const driveH = km / TRUCK_AVG_KMH;
    const needH = driveH + (driveH > 4.5 ? 0.75 : 0) + (driveH > 9 ? 11 : 0) + SERVICE_SEC / 3600;
    const delStart = pickStart + needH * 0.8 * 3600_000;
    const delEnd = pickEnd + (needH + 10) * 3600_000;
    const id = `R${seed}-${String(jobs.length + 1).padStart(2, "0")} ${a.name}→${b.name}`;
    const j = planningJob(id, a.at, b.at, weekStartMs, "dry", 14_000 + Math.floor(r() * 10_000));
    j.rateEur = Math.round(RATE_FIXED_EUR + km * RATE_EUR_PER_KM);
    j.stops[0]!.city = a.name;
    j.stops[1]!.city = b.name;
    j.stops[0]!.windowStartAt = new Date(pickStart).toISOString();
    j.stops[0]!.windowEndAt = new Date(pickEnd).toISOString();
    j.stops[1]!.windowStartAt = new Date(delStart).toISOString();
    j.stops[1]!.windowEndAt = new Date(delEnd).toISOString();
    j.operationalRequirements = { serviceSecByStop: Object.fromEntries(j.stops.map((s) => [s.id, SERVICE_SEC])) };
    jobs.push(j);
  }
  return jobs;
}
