import type { Route as FleetRoute } from "../data/types";
import { getTomTomRestBase } from "./config";
import { tomtomFetchJson } from "./httpClient";

/**
 * Routing API — minimal truck params for **polyline only** (fleet map).
 * Does not request `sectionType=toll`, so responses omit toll sections — map lines only.
 * Toll metadata for the route planner lives in `planRoutes.ts` (full section types + toll parsing).
 */
export async function fetchTruckRoutePolyline(
  key: string,
  stops: { lat: number; lng: number }[],
): Promise<[number, number][]> {
  if (stops.length < 2) return [];

  const path = stops.map((s) => `${s.lat},${s.lng}`).join(":");
  const params = new URLSearchParams({
    key,
    travelMode: "truck",
    vehicleWeight: "26000",
    vehicleNumberOfAxles: "5",
    vehicleCommercial: "true",
    traffic: "true",
    routeType: "fastest",
  });

  const url = `${getTomTomRestBase()}/routing/1/calculateRoute/${path}/json?${params.toString()}`;
  const data = await tomtomFetchJson<{
    routes?: {
      legs: { points: { latitude: number; longitude: number }[] }[];
    }[];
  }>(url, { timeoutMs: 12_000, retries: 1 });

  const route = data.routes?.[0];
  if (!route?.legs?.length) return [];

  const pts: [number, number][] = [];
  for (const leg of route.legs) {
    for (const p of leg.points) {
      pts.push([p.latitude, p.longitude]);
    }
  }
  return pts;
}

export async function loadFleetRoutePolylines(
  key: string,
  routes: FleetRoute[],
): Promise<Record<string, [number, number][]>> {
  const out: Record<string, [number, number][]> = {};
  for (const r of routes) {
    const stops = r.stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    try {
      out[r.id] = await fetchTruckRoutePolyline(key, stops);
    } catch {
      out[r.id] = r.polyline;
    }
    await new Promise((res) => setTimeout(res, 120));
  }
  return out;
}
