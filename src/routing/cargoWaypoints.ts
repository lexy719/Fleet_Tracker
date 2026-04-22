import type { CargoItem, Route, RouteStop, Truck } from "../data/types";

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Whether cargo is destined for this stop (name / destination match). */
export function cargoMatchesStop(cargo: CargoItem, stop: RouteStop): boolean {
  const d = norm(cargo.destination);
  const n = norm(stop.name);
  if (d === n) return true;
  if (n.includes(d) || d.includes(n)) return true;
  const dw = d.split(/\s+/)[0];
  const nw = n.split(/\s+/)[0];
  return dw.length > 2 && nw.length > 2 && (n.includes(dw) || d.includes(nw));
}

/** Sort delivery stops by first matching cargo index in trailer order (unload priority). */
export function reorderRouteStopsForCargo(stops: RouteStop[], cargoInOrder: CargoItem[]): RouteStop[] {
  const deliveries = stops.filter((s) => s.type === "delivery");
  if (deliveries.length <= 1) return stops;

  const score = (stop: RouteStop) => {
    let best = Infinity;
    cargoInOrder.forEach((c, i) => {
      if (cargoMatchesStop(c, stop)) best = Math.min(best, i);
    });
    return best === Infinity ? 999 : best;
  };

  const sorted = [...deliveries].sort((a, b) => score(a) - score(b));
  let di = 0;
  return stops.map((s) => (s.type === "delivery" ? sorted[di++] : s));
}

/**
 * Stops not yet visited from mock progress, then cargo-aware delivery order.
 */
export function buildOperationalStopSequence(route: Route, cargoInOrder: CargoItem[]): RouteStop[] {
  const passed = Math.min(
    route.stops.length - 1,
    Math.max(0, Math.floor((route.progressPct / 100) * route.stops.length)),
  );
  const remaining = route.stops.slice(passed);
  return reorderRouteStopsForCargo(remaining, cargoInOrder);
}

export function buildTomTomWaypoints(
  truck: Truck,
  orderedStops: RouteStop[],
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [{ lat: truck.lat, lng: truck.lng }];
  for (const s of orderedStops) {
    pts.push({ lat: s.lat, lng: s.lng });
  }
  return pts;
}

export function cargoForStop(stop: RouteStop, cargoInOrder: CargoItem[]): CargoItem[] {
  return cargoInOrder.filter((c) => cargoMatchesStop(c, stop));
}

/** Cargo item ids ordered to follow geographic stop sequence (for load/unload alignment). */
export function reorderCargoToMatchStops(orderedStops: RouteStop[], cargoInOrder: CargoItem[]): string[] {
  const ids: string[] = [];
  const used = new Set<string>();
  for (const stop of orderedStops) {
    for (const c of cargoInOrder) {
      if (used.has(c.id)) continue;
      if (cargoMatchesStop(c, stop)) {
        ids.push(c.id);
        used.add(c.id);
      }
    }
  }
  for (const c of cargoInOrder) {
    if (!used.has(c.id)) ids.push(c.id);
  }
  return ids;
}

export function cargoOrderMismatch(orderedStops: RouteStop[], cargoInOrder: CargoItem[]): boolean {
  const ideal = reorderCargoToMatchStops(orderedStops, cargoInOrder);
  const cur = cargoInOrder.map((c) => c.id);
  if (ideal.length !== cur.length) return true;
  return ideal.some((id, i) => id !== cur[i]);
}
