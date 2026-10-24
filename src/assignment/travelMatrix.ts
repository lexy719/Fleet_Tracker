import { haversineM } from "../regulations/geometry";
import type { Instance, LatLng, Leg, Travel } from "./model";

/*
 * Real truck travel for the search, from our routing engine, asked ONCE per week plan. The search
 * needs thousands of lookups per second, so they come from a table filled beforehand:
 *
 * - places are snapped to a grid (default ~2 km) so loads at the same industrial estate share a row;
 * - only the pairs a plan can use are asked: start → pickups, pickup → delivery, delivery → later
 *   pickups (reachable in time and distance), deliveries → home;
 * - a missing pair falls back to a CONSERVATIVE estimate (straight line × 1.4 at 60 km/h) and is
 *   counted, never silently treated as real;
 * - `withSlack` adds a safety margin to every leg, because real days run longer than the engine says.
 */

export type RouteLeg = (a: LatLng, b: LatLng) => Promise<Leg>;
export type TravelTable = { travel: Travel; asked: number; failed: number; fallbacks: () => number };

const keyOf = (p: LatLng, grid: number) => `${Math.round(p[0] / grid)},${Math.round(p[1] / grid)}`;
const conservative = (a: LatLng, b: LatLng): Leg => {
  const km = (haversineM(a, b) / 1000) * 1.4;
  return { km, sec: (km / 60) * 3600 };
};

/** Pairs of places a week plan can drive between. */
export function neededPairs(inst: Instance, maxEmptyKm = 900): [LatLng, LatLng][] {
  const out: [LatLng, LatLng][] = [];
  for (const l of inst.loads) {
    out.push([l.from, l.to]);
    for (const c of inst.crews) if (c.equipment === l.equipment) out.push([c.start, l.from]);
    for (const h of new Set(inst.crews.map((c) => c.home))) out.push([l.to, h]);
    for (const m of inst.loads)
      if (m !== l && m.equipment === l.equipment && m.pickupEndMs >= l.deliveryStartMs && haversineM(l.to, m.from) / 1000 <= maxEmptyKm) out.push([l.to, m.from]);
  }
  for (const c of inst.crews) out.push([c.start, c.home]);
  return out;
}

export async function buildTravel(pairs: [LatLng, LatLng][], route: RouteLeg, opts: { gridDeg?: number; concurrency?: number } = {}): Promise<TravelTable> {
  const grid = opts.gridDeg ?? 0.02, conc = opts.concurrency ?? 8;
  const table = new Map<string, Leg>();
  const todo = new Map<string, [LatLng, LatLng]>();
  for (const [a, b] of pairs) {
    const ka = keyOf(a, grid), kb = keyOf(b, grid);
    if (ka !== kb) todo.set(`${ka}|${kb}`, [a, b]);
  }
  let failed = 0;
  const queue = [...todo.entries()];
  await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        table.set(next[0], await route(...next[1]));
      } catch {
        failed++;
      }
    }
  }));
  let fallbacks = 0;
  const travel: Travel = (a, b) => {
    const ka = keyOf(a, grid), kb = keyOf(b, grid);
    if (ka === kb) return conservative(a, b);
    const hit = table.get(`${ka}|${kb}`);
    if (hit) return hit;
    fallbacks++;
    return conservative(a, b);
  };
  return { travel, asked: todo.size, failed, fallbacks: () => fallbacks };
}

/** Every leg takes `pct` longer plus `minutes` (only legs that actually move). */
export function withSlack(travel: Travel, pct: number, minutes = 0): Travel {
  return (a, b) => {
    const l = travel(a, b);
    return l.km > 0.05 ? { km: l.km, sec: l.sec * (1 + pct) + minutes * 60 } : l;
  };
}

/** One leg from our GraphHopper engine (truck profile). */
export function graphhopperLeg(url = "http://localhost:8989", profile = "truck3"): RouteLeg {
  return async (a, b) => {
    const r = await fetch(`${url}/route?point=${a[0]},${a[1]}&point=${b[0]},${b[1]}&profile=${profile}&instructions=false&calc_points=false`);
    const j = (await r.json()) as { paths?: { distance: number; time: number }[]; message?: string };
    if (!j.paths?.[0]) throw new Error(j.message ?? "no route");
    return { km: j.paths[0].distance / 1000, sec: j.paths[0].time / 1000 };
  };
}
