import { haversineM } from "../regulations/geometry";
import type { BBox } from "../regulations/types";
import { planStrategyRoute, type PlanRoutePlanningOpts, type RoutePlanOption } from "../tomtom/planRoutes";
import type { ProviderAvoidRequest, RouteStrategy, RoutingAvoidance, RoutingProvider } from "./types";

/*
 * TomTom adapter: provider-neutral avoidances → documented POST `avoidAreas`
 * (≤ 10 rectangles, each ≤ ~160 × 160 km). Nothing TomTom-specific leaks into
 * RoadConstraint or the solver.
 */

export const TOMTOM_MAX_RECTANGLES = 10;
const MAX_SIDE_M = 160_000;
const PAD_M = 150;
/** No single avoid rectangle may exceed this (≈ 20 × 20 km): larger areas block unrelated roads. */
export const MAX_RECT_AREA_KM2 = 400;
/** A rectangle may cover at most this multiple of the corridor it exists for (small ones exempt). */
export const MAX_FALSE_RATIO = 15;
const MIN_CHECKED_AREA_KM2 = 5;

export function tomtomAvoidRequest(avoid: RoutingAvoidance[]): { ok: true; request: ProviderAvoidRequest } | { ok: false; reason: string } {
  const lines = avoid.flatMap((a) => a.lines);
  if (lines.length === 0) return { ok: true, request: { kind: "avoid_rectangles", provider: "tomtom", rectangles: [] } };
  // Adaptive covering: fewest rectangles with bounded false area (see adaptiveRectangles).
  const covered = adaptiveRectanglesWithCorridor(lines, TOMTOM_MAX_RECTANGLES, PAD_M);
  const rectangles: BBox[] = covered.map((c) => c.rect);
  const tooBig = rectangles.some(
    (b) => haversineM([b.south, b.west], [b.north, b.west]) > MAX_SIDE_M || haversineM([b.south, b.west], [b.south, b.east]) > MAX_SIDE_M,
  );
  if (rectangles.length === 0 || rectangles.length > TOMTOM_MAX_RECTANGLES || tooBig) {
    return { ok: false, reason: "as áreas a evitar excedem os limites documentados do fornecedor (10 retângulos de ~160 km)" };
  }
  const wasteful = covered.some((c) => rectAreaKm2(c.rect) > MIN_CHECKED_AREA_KM2 && rectAreaKm2(c.rect) > MAX_FALSE_RATIO * c.corridorKm2);
  if (wasteful) {
    return { ok: false, reason: `as restrições não cabem nos ${TOMTOM_MAX_RECTANGLES} retângulos do fornecedor sem evitar áreas não relacionadas (> ${MAX_FALSE_RATIO}× a área a evitar)` };
  }
  if (rectangles.some((r) => rectAreaKm2(r) > MAX_RECT_AREA_KM2)) {
    return { ok: false, reason: `não é possível representar todas as restrições sem evitar áreas não relacionadas (retângulo > ${MAX_RECT_AREA_KM2} km²)` };
  }
  return { ok: true, request: { kind: "avoid_rectangles", provider: "tomtom", rectangles } };
}

export function tomtomRoutingProvider(apiKey: string, waypoints: { lat: number; lng: number }[], planning: PlanRoutePlanningOpts): RoutingProvider & { requests: number } {
  let n = 0;
  const provider = {
    name: "tomtom",
    requests: 0,
    describe: tomtomAvoidRequest,
    async route(strategy: RouteStrategy, avoid: RoutingAvoidance[]): Promise<RoutePlanOption> {
      const d = tomtomAvoidRequest(avoid);
      if (!d.ok) throw new Error(d.reason);
      if (d.request.kind !== "avoid_rectangles") throw new Error("pedido de desvio inesperado para o TomTom");
      const rectangles = d.request.rectangles;
      n++;
      provider.requests = n;
      return planStrategyRoute(apiKey, waypoints, { ...planning, avoidAreas: rectangles.length ? rectangles : undefined }, strategy, `clean-${strategy.toLowerCase()}-${n}`);
    },
  };
  return provider;
}

/* ─── Adaptive covering (Phase 3C.5) ───────────────────────────────────────── */

type BBoxM = { south: number; west: number; north: number; east: number };
const M_DEG = 111_320;
const lenM = (l: [number, number][]) => l.slice(1).reduce((s, p, i) => s + haversineM(l[i]!, p), 0);
function padded(l: [number, number][], padM: number): BBoxM {
  let s = 90, n = -90, w = 180, e = -180;
  for (const [a, b] of l) { s = Math.min(s, a); n = Math.max(n, a); w = Math.min(w, b); e = Math.max(e, b); }
  const mid = (s + n) / 2;
  const dLat = padM / M_DEG, dLon = padM / (M_DEG * Math.cos((mid * Math.PI) / 180));
  return { south: s - dLat, west: w - dLon, north: n + dLat, east: e + dLon };
}
export function rectAreaKm2(b: BBoxM): number {
  const h = haversineM([b.south, b.west], [b.north, b.west]);
  const w = haversineM([b.south, b.west], [b.south, b.east]);
  return (h * w) / 1e6;
}
const corridorKm2 = (l: [number, number][], padM: number) => (lenM(l) * 2 * padM + Math.PI * padM * padM) / 1e6;

/**
 * Fewest rectangles whose "false" (non-corridor) area stays bounded: start with one
 * rectangle per line and split the most wasteful chunk in two (by length) until every
 * rectangle's area is ≤ `maxWasteRatio` × its corridor area, or the provider limit is hit.
 * Straight stretches stay a single rectangle; bends and diagonals get split.
 */
export function adaptiveRectangles(lines: [number, number][][], maxRects: number, padM: number, maxWasteRatio = 3): BBox[] {
  return adaptiveRectanglesWithCorridor(lines, maxRects, padM, maxWasteRatio).map((r) => r.rect);
}

/** Same as adaptiveRectangles, keeping the corridor area (km²) each rectangle is there to cover. */
export function adaptiveRectanglesWithCorridor(lines: [number, number][][], maxRects: number, padM: number, maxWasteRatio = 3): { rect: BBox; corridorKm2: number }[] {
  let chunks = lines.filter((l) => l.length >= 2 && lenM(l) > 0);
  if (chunks.length === 0) return [];
  const ratio = (c: [number, number][]) => rectAreaKm2(padded(c, padM)) / corridorKm2(c, padM);
  for (let guard = 0; guard < 200 && chunks.length < maxRects; guard++) {
    let worst = -1, worstRatio = maxWasteRatio;
    chunks.forEach((c, i) => {
      if (c.length < 3) return;
      const r = ratio(c);
      if (r > worstRatio) { worstRatio = r; worst = i; }
    });
    if (worst < 0) break;
    const c = chunks[worst]!;
    // split at half length
    const half = lenM(c) / 2;
    let acc = 0, k = 1;
    for (; k < c.length - 1; k++) { acc += haversineM(c[k - 1]!, c[k]!); if (acc >= half) break; }
    chunks = [...chunks.slice(0, worst), c.slice(0, k + 1), c.slice(k), ...chunks.slice(worst + 1)];
  }
  let rects: { rect: BBoxM; corridorKm2: number }[] = chunks.map((c) => ({ rect: padded(c, padM), corridorKm2: corridorKm2(c, padM) }));
  // More lines than the provider allows: merge the pair whose union grows the least
  // (nearby constraints share a rectangle; far-apart ones are never merged first).
  while (rects.length > maxRects) {
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const u = union(rects[i]!.rect, rects[j]!.rect);
        const grow = rectAreaKm2(u) - rectAreaKm2(rects[i]!.rect) - rectAreaKm2(rects[j]!.rect);
        if (grow < best) { best = grow; bi = i; bj = j; }
      }
    const merged = { rect: union(rects[bi]!.rect, rects[bj]!.rect), corridorKm2: rects[bi]!.corridorKm2 + rects[bj]!.corridorKm2 };
    rects = [...rects.filter((_, k) => k !== bi && k !== bj), merged];
  }
  return rects;
}
const union = (a: BBoxM, b: BBoxM): BBoxM => ({ south: Math.min(a.south, b.south), west: Math.min(a.west, b.west), north: Math.max(a.north, b.north), east: Math.max(a.east, b.east) });

export type AvoidanceMetrics = { rectangles: number; rectAreaKm2: number; corridorAreaKm2: number; falseAreaKm2: number; requestBytes: number };
export function avoidanceMetrics(rects: BBox[], lines: [number, number][][], padM = PAD_M): AvoidanceMetrics {
  const rectArea = rects.reduce((s, r) => s + rectAreaKm2(r), 0);
  const corridor = lines.reduce((s, l) => s + corridorKm2(l, padM), 0);
  const body = { avoidAreas: { rectangles: rects.map((r) => ({ southWestCorner: { latitude: r.south, longitude: r.west }, northEastCorner: { latitude: r.north, longitude: r.east } })) } };
  return { rectangles: rects.length, rectAreaKm2: rectArea, corridorAreaKm2: corridor, falseAreaKm2: Math.max(0, rectArea - corridor), requestBytes: JSON.stringify(body).length };
}
