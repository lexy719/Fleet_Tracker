import type { PlannerPointDraft } from "./routePlannerTypes";

export type WaypointsReady = {
  coords: { lat: number; lng: number }[];
  waypointStops: { id: string; name: string }[];
};

/** Build TomTom path + per-leg labels from ordered drafts (start → via → finish). */
export function draftsToWaypoints(
  start: PlannerPointDraft,
  middle: PlannerPointDraft[],
  finish: PlannerPointDraft,
): { ok: true; data: WaypointsReady } | { ok: false; error: string } {
  const all: PlannerPointDraft[] = [start, ...middle, finish];
  for (let i = 0; i < all.length; i++) {
    const p = all[i]!;
    if (p.lat == null || p.lng == null) {
      const label = i === 0 ? "Start" : i === all.length - 1 ? "Finish" : `Stop ${i}`;
      return { ok: false, error: `${label}: set a place or valid coordinates.` };
    }
  }
  const coords = all.map((p) => ({ lat: p.lat!, lng: p.lng! }));
  const waypointStops = all.slice(1).map((p, i) => ({
    id: p.id,
    name: p.label.trim() || (i === all.length - 2 ? "Finish" : `Stop ${i + 1}`),
  }));
  return {
    ok: true,
    data: { coords, waypointStops },
  };
}
