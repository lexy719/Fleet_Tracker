import type { FuelPriceObservation, FuelStation, FuelType } from "./types";

/*
 * Read-side query for routing consumers: stations near a route polyline with their latest
 * price for one fuel. Distances are straight-line to the nearest route vertex/segment — a
 * screening value, not a driven detour (the routing engine computes real detours).
 */

export type CorridorStation = {
  station: FuelStation;
  price: FuelPriceObservation;
  /** Straight-line distance from the route (m). */
  offRouteM: number;
  /** Distance along the route to the closest point (m). */
  alongRouteM: number;
  /** Age of the price evidence at query time (h), by lastSeenAt. */
  ageH: number;
};

export type CorridorSummary = {
  fuelType: FuelType;
  stations: CorridorStation[];
  cheapest?: CorridorStation;
  medianPrice?: number;
  /** Median minus cheapest, per unit — the screening "spread" on this corridor. */
  spread?: number;
};

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function hav(a: [number, number], b: [number, number]): number {
  const dp = rad(b[0] - a[0]);
  const dl = rad(b[1] - a[1]);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance from p to segment ab (equirectangular projection — fine at corridor scale). */
function toSegment(p: [number, number], a: [number, number], b: [number, number]): { d: number; t: number } {
  const k = Math.cos(rad(p[0]));
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const q: [number, number] = [ay + t * dy, (ax + t * dx) / k];
  return { d: hav(p, q), t };
}

/** Keep route vertices at least `minM` apart (first and last always kept) — enough for corridor screening. */
export function decimate(route: [number, number][], minM: number): [number, number][] {
  if (route.length <= 2) return route;
  const out: [number, number][] = [route[0]!];
  for (let i = 1; i < route.length - 1; i++) if (hav(out[out.length - 1]!, route[i]!) >= minM) out.push(route[i]!);
  out.push(route[route.length - 1]!);
  return out;
}

const latestCache = new WeakMap<FuelPriceObservation[], Map<FuelType, Map<string, FuelPriceObservation>>>();

/** Latest live price per station for one fuel (memoised per prices array). */
function latestPrices(prices: FuelPriceObservation[], fuelType: FuelType): Map<string, FuelPriceObservation> {
  let byFuel = latestCache.get(prices);
  if (!byFuel) latestCache.set(prices, (byFuel = new Map()));
  let m = byFuel.get(fuelType);
  if (m) return m;
  m = new Map();
  for (const p of prices) {
    if (p.fuelType !== fuelType || p.supersededAt) continue;
    const old = m.get(p.stationId);
    if (!old || p.lastSeenAt > old.lastSeenAt) m.set(p.stationId, p);
  }
  byFuel.set(fuelType, m);
  return m;
}

export function stationsAlongRoute(
  fullRoute: [number, number][],
  stations: FuelStation[],
  prices: FuelPriceObservation[],
  opts: { fuelType: FuelType; bufferM: number; now: Date; maxAgeH?: number },
): CorridorSummary {
  const route = fullRoute.length > 1000 ? decimate(fullRoute, 300) : fullRoute;
  if (route.length < 2) return { fuelType: opts.fuelType, stations: [] };
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [la, lo] of route) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo); }
  const padLat = opts.bufferM / 111_320;
  // Widest longitude span of the buffer is at the latitude farthest from the equator.
  const padLon = opts.bufferM / (111_320 * Math.cos(rad(Math.min(89, Math.max(Math.abs(minLat), Math.abs(maxLat)) + padLat))));
  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1]! + hav(route[i - 1]!, route[i]!));

  const priceBy = latestPrices(prices, opts.fuelType);
  // Segment grid with cells ≥ buffer: any segment within the buffer of a station overlaps the
  // station's cell or one of its 8 neighbours.
  const cellLat = padLat, cellLon = padLon;
  const grid = new Map<string, number[]>();
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!;
    const i0 = Math.floor(Math.min(a[0], b[0]) / cellLat), i1 = Math.floor(Math.max(a[0], b[0]) / cellLat);
    const j0 = Math.floor(Math.min(a[1], b[1]) / cellLon), j1 = Math.floor(Math.max(a[1], b[1]) / cellLon);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
      const k = `${ci}:${cj}`;
      const list = grid.get(k);
      if (list) list.push(i); else grid.set(k, [i]);
    }
  }
  const out: CorridorStation[] = [];
  for (const s of stations) {
    if (s.lat < minLat - padLat || s.lat > maxLat + padLat || s.lon < minLon - padLon || s.lon > maxLon + padLon) continue;
    const price = priceBy.get(s.id);
    if (!price) continue;
    const ageH = (opts.now.getTime() - Date.parse(price.lastSeenAt)) / 3_600_000;
    if (opts.maxAgeH !== undefined && ageH > opts.maxAgeH) continue;
    const ci = Math.floor(s.lat / cellLat), cj = Math.floor(s.lon / cellLon);
    let best = { d: Infinity, along: 0 };
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const i of grid.get(`${ci + di}:${cj + dj}`) ?? []) {
        const r = toSegment([s.lat, s.lon], route[i - 1]!, route[i]!);
        if (r.d < best.d) best = { d: r.d, along: cum[i - 1]! + r.t * (cum[i]! - cum[i - 1]!) };
      }
    }
    if (best.d <= opts.bufferM) out.push({ station: s, price, offRouteM: Math.round(best.d), alongRouteM: Math.round(best.along), ageH: Math.round(ageH * 10) / 10 });
  }
  out.sort((a, b) => a.price.price - b.price.price || a.offRouteM - b.offRouteM);
  if (!out.length) return { fuelType: opts.fuelType, stations: [] };
  const sorted = out.map((x) => x.price.price).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    fuelType: opts.fuelType,
    stations: out,
    cheapest: out[0]!,
    medianPrice: Math.round(median * 1000) / 1000,
    spread: Math.round((median - out[0]!.price.price) * 1000) / 1000,
  };
}
