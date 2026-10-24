import type { RoutePlanOption } from "../tomtom/planRoutes";
import type { ProviderAvoidRequest, RouteStrategy, RoutingAvoidance, RoutingProvider } from "../solver/types";

/*
 * FleetOS's own routing engine (GraphHopper on OpenStreetMap, Portugal + Spain) as a solver provider.
 *
 * Avoidances become narrow corridor polygons around the avoided path, blocked in a per-request
 * custom model (`in_<area> → priority 0`). Unlike TomTom's avoid rectangles, only roads inside
 * the corridor are affected. Known limit: a road that crosses the corridor (bridge / underpass)
 * is blocked for the edge that crosses it.
 */

export const GH_DEFAULT_URL = "http://localhost:8989";
export const AVOID_BUFFER_M = 15;
/** Lines are cut into pieces of at most this many points so the offset polygons stay simple. */
const MAX_POINTS_PER_CORRIDOR = 60;

type LatLng = [number, number];
type GhPath = {
  distance: number;
  time: number;
  points: { coordinates: [number, number][] };
  snapped_waypoints: { coordinates: [number, number][] };
  details?: Record<string, [number, number, unknown][]>;
};

/** Left/right offset polygon ([lng, lat] ring) around a [lat, lng] polyline. */
export function corridorPolygon(line: LatLng[], bufferM: number): [number, number][] {
  const mPerDegLat = 111_320;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const [lat, lng] = line[i]!;
    const mPerDegLng = mPerDegLat * Math.cos((lat * Math.PI) / 180);
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const dx = (b[1] - a[1]) * mPerDegLng, dy = (b[0] - a[0]) * mPerDegLat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // unit normal (metres)
    left.push([lng + (nx * bufferM) / mPerDegLng, lat + (ny * bufferM) / mPerDegLat]);
    right.push([lng - (nx * bufferM) / mPerDegLng, lat - (ny * bufferM) / mPerDegLat]);
  }
  const ring = [...left, ...right.reverse()];
  ring.push(ring[0]!);
  return ring;
}

function corridors(avoid: RoutingAvoidance[], bufferM: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (const line of avoid.flatMap((a) => a.lines)) {
    for (let i = 0; i < line.length - 1; i += MAX_POINTS_PER_CORRIDOR - 1) {
      const piece = line.slice(i, i + MAX_POINTS_PER_CORRIDOR);
      if (piece.length >= 2) out.push(corridorPolygon(piece, bufferM));
    }
  }
  return out;
}

export function graphhopperAvoidRequest(avoid: RoutingAvoidance[], bufferM = AVOID_BUFFER_M): { ok: true; request: ProviderAvoidRequest } {
  return { ok: true, request: { kind: "avoid_corridors", provider: "fleetos-graphhopper", corridors: corridors(avoid, bufferM).length, bufferM } };
}

export function avoidCustomModel(avoid: RoutingAvoidance[], bufferM = AVOID_BUFFER_M) {
  const polys = corridors(avoid, bufferM);
  if (!polys.length) return undefined;
  return {
    areas: {
      type: "FeatureCollection",
      features: polys.map((ring, i) => ({ type: "Feature", id: `avoid${i}`, properties: {}, geometry: { type: "Polygon", coordinates: [ring] } })),
    },
    priority: [{ if: polys.map((_, i) => `in_avoid${i}`).join(" || "), multiply_by: "0" }],
  };
}

/** Splits the path at each snapped waypoint: points per leg and duration per leg (from the `time` detail). */
function legsOf(path: GhPath): { legPointCounts: number[]; legDurationSec: number[] } {
  const pts = path.points.coordinates;
  const wps = path.snapped_waypoints.coordinates;
  const cut: number[] = [0];
  let from = 0;
  for (const w of wps.slice(1, -1)) {
    let best = from, bestD = Infinity;
    for (let i = from; i < pts.length; i++) {
      const d = (pts[i]![0] - w[0]) ** 2 + (pts[i]![1] - w[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    cut.push(best);
    from = best;
  }
  cut.push(pts.length - 1);
  const times = path.details?.time ?? [];
  const legDurationSec = cut.slice(1).map((end, k) => {
    const start = cut[k]!;
    let ms = 0;
    for (const [s, e, v] of times) {
      const overlap = Math.min(e, end) - Math.max(s, start);
      if (overlap > 0 && e > s) ms += (Number(v) * overlap) / (e - s);
    }
    return ms / 1000;
  });
  const legPointCounts = cut.slice(1).map((end, k) => end - cut[k]! + (k === 0 ? 1 : 0));
  return { legPointCounts, legDurationSec };
}

export type GraphhopperProviderOptions = {
  url?: string;
  /** GraphHopper profile, e.g. "truck3". */
  profile: string;
  waypoints: { lat: number; lng: number }[];
  departAt: Date;
  /** Extra per-request rules (e.g. this truck's dimensions); may only make roads more expensive. */
  customModel?: { priority?: unknown[]; speed?: unknown[] };
  bufferM?: number;
};

export function graphhopperRoutingProvider(opts: GraphhopperProviderOptions): RoutingProvider & { requests: number } {
  const url = opts.url ?? GH_DEFAULT_URL;
  const bufferM = opts.bufferM ?? AVOID_BUFFER_M;
  let n = 0;
  const provider = {
    name: "fleetos-graphhopper",
    requests: 0,
    describe: (avoid: RoutingAvoidance[]) => graphhopperAvoidRequest(avoid, bufferM),
    async route(strategy: RouteStrategy, avoid: RoutingAvoidance[]): Promise<RoutePlanOption> {
      const avoidModel = avoidCustomModel(avoid, bufferM);
      const priority = [...(opts.customModel?.priority ?? []), ...(avoidModel?.priority ?? [])];
      if (strategy === "NO_TOLLS") priority.push({ if: "toll == ALL || toll == HGV", multiply_by: "0.1" });
      const customModel = priority.length || opts.customModel?.speed || avoidModel
        ? { ...(avoidModel ? { areas: avoidModel.areas } : {}), ...(priority.length ? { priority } : {}), ...(opts.customModel?.speed ? { speed: opts.customModel.speed } : {}) }
        : undefined;
      const body = {
        points: opts.waypoints.map((w) => [w.lng, w.lat]),
        profile: opts.profile,
        points_encoded: false,
        instructions: false,
        details: ["time", "street_ref"],
        ...(customModel ? { custom_model: customModel } : {}),
      };
      n++;
      provider.requests = n;
      const res = await fetch(`${url}/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json()) as { paths?: GhPath[]; message?: string };
      const path = j.paths?.[0];
      if (!res.ok || !path) throw new Error(`Motor de rotas: ${j.message ?? `HTTP ${res.status}`}`);
      const { legPointCounts, legDurationSec } = legsOf(path);
      const roadNumbers = [...new Set((path.details?.street_ref ?? []).map(([, , v]) => String(v ?? "")).filter(Boolean))];
      const departAtIso = opts.departAt.toISOString();
      return {
        id: `gh-${strategy.toLowerCase()}-${n}`,
        title: strategy === "NO_TOLLS" ? "Sem portagens" : "Rota de camião",
        subtitle: "Motor FleetOS (OpenStreetMap)",
        polyline: path.points.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        distanceM: path.distance,
        durationSec: path.time / 1000,
        trafficDelaySec: 0,
        fuelCostEur: 0,
        tollCostEur: 0,
        tollPricedEur: 0,
        tollEstimatedEur: 0,
        tollDataQuality: "none",
        tollSectionCount: 0,
        stopArrivals: [],
        legDurationSec,
        legPointCounts,
        roadNumbers,
        departAtIso,
        arrivalAtIso: new Date(opts.departAt.getTime() + path.time).toISOString(),
        colorIndex: 0,
      };
    },
  };
  return provider;
}
