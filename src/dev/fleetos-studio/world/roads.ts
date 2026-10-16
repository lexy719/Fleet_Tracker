// Road geometry for transports that have no confirmed plan yet: one TomTom truck route through
// the recorded stops, so the map draws roads instead of straight lines. Display only — it is not
// a plan (no compliance, no fuel or toll decision); confirming a plan replaces it with the saved
// route. Cached per stop sequence in this browser.
import { getTomTomKey, getTomTomRestBase } from "../../../tomtom/config";
import { tomtomFetchJson } from "../../../tomtom/httpClient";
import type { Point } from "./types";

export type RoadGeometry = { line: Point[]; distanceM: number; durationSec: number; legM: number[]; at: string };

const STORE = "fleetos-studio.roads.v1";
const MAX_AGE_MS = 14 * 24 * 3600_000;
const cache = new Map<string, RoadGeometry>(load());
const pending = new Map<string, Promise<RoadGeometry | null>>();
/** Keys TomTom could not route this session (not retried until reload). */
const failed = new Set<string>();

function load(): [string, RoadGeometry][] {
  try {
    const raw = localStorage.getItem(STORE);
    const all = raw ? (JSON.parse(raw) as [string, RoadGeometry][]) : [];
    return all.filter(([, g]) => Date.now() - Date.parse(g.at) < MAX_AGE_MS);
  } catch {
    return [];
  }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify([...cache.entries()]));
  } catch {
    /* cache only */
  }
}

/** Identity of a stop sequence (≈10 m precision). */
export function roadKey(stops: { lat: number; lng: number }[]): string {
  return stops.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).join(";");
}

export function roadFailed(key: string): boolean {
  return failed.has(key);
}

export function cachedRoad(key: string): RoadGeometry | null {
  return cache.get(key) ?? null;
}

type CalcResponse = {
  routes?: {
    summary: { lengthInMeters: number; travelTimeInSeconds: number };
    legs: { summary: { lengthInMeters: number }; points: { latitude: number; longitude: number }[] }[];
  }[];
};

/** Fetch (once per key) the truck road route through the stops. Null when unavailable. */
export function fetchRoad(key: string, stops: { lat: number; lng: number }[]): Promise<RoadGeometry | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (failed.has(key)) return Promise.resolve(null);
  const running = pending.get(key);
  if (running) return running;
  const apiKey = getTomTomKey();
  if (!apiKey || stops.length < 2) return Promise.resolve(null);
  const path = stops.map((s) => `${s.lat},${s.lng}`).join(":");
  const q = new URLSearchParams({ key: apiKey, travelMode: "truck", vehicleCommercial: "true", routeType: "fastest", traffic: "false" });
  const p = tomtomFetchJson<CalcResponse>(`${getTomTomRestBase()}/routing/1/calculateRoute/${path}/json?${q}`, { timeoutMs: 15_000, retries: 1 })
    .then((r) => {
      const route = r.routes?.[0];
      if (!route) {
        failed.add(key);
        return null;
      }
      const pts: Point[] = route.legs.flatMap((l) => l.points.map((x) => [x.longitude, x.latitude] as Point));
      const g: RoadGeometry = {
        line: simplify(pts, 0.00008),
        distanceM: route.summary.lengthInMeters,
        durationSec: route.summary.travelTimeInSeconds,
        legM: route.legs.map((l) => l.summary.lengthInMeters),
        at: new Date().toISOString(),
      };
      cache.set(key, g);
      save();
      return g;
    })
    .catch(() => {
      failed.add(key);
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** Douglas–Peucker in degrees (≈9 m): keeps road shape, drops redundant vertices. */
function simplify(pts: Point[], tol: number): Point[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let dmax = tol;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > dmax) {
        dmax = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
