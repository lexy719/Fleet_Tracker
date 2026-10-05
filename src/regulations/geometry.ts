import type { BBox, GeometryRecord, RouteGeometryInput } from "./types";

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pointInBBox(p: [number, number], b: BBox): boolean {
  return p[0] >= b.south && p[0] <= b.north && p[1] >= b.west && p[1] <= b.east;
}

/** Distance (m) from p to segment ab — local equirectangular projection (fine at street scale). */
export function pointToSegmentM(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos(toRad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return toRad(Math.sqrt(cx * cx + cy * cy)) * EARTH_R;
}

/**
 * Estimated epoch-ms time at each route point: each leg's travel time is spread over
 * its points proportionally to distance. `legPointCounts` partitions `points`.
 */
export function estimatePointTimes(
  points: [number, number][],
  legPointCounts: number[],
  legDurationSec: number[],
  departMs: number,
): number[] {
  const out: number[] = new Array(points.length);
  let idx = 0;
  let legStartMs = departMs;
  const counts = legPointCounts.length > 0 ? legPointCounts : [points.length];
  counts.forEach((count, leg) => {
    const legSec = legDurationSec[leg] ?? 0;
    const end = Math.min(points.length, idx + count);
    let legDist = 0;
    for (let i = idx + 1; i < end; i++) legDist += haversineM(points[i - 1]!, points[i]!);
    let cum = 0;
    for (let i = idx; i < end; i++) {
      if (i > idx) cum += haversineM(points[i - 1]!, points[i]!);
      out[i] = legStartMs + (legDist > 0 ? (cum / legDist) * legSec * 1000 : 0);
    }
    legStartMs += legSec * 1000;
    idx = end;
  });
  for (let i = idx; i < points.length; i++) out[i] = legStartMs;
  return out;
}

/* ─── Corridor matching ─────────────────────────────── */

export type LineMatchOptions = {
  /** Max distance (m) from a line for a route sample to count as "on" it. */
  toleranceM: number;
  /** Only continuous runs at least this long count (filters crossings / brief proximity). */
  minMatchLengthM: number;
  /** Max direction difference (deg) between route and line. */
  maxHeadingDiffDeg: number;
  /** When true the route must travel in each line's direction (one-direction constraints). */
  directional?: boolean;
  /** Route sampling step (m). */
  sampleStepM?: number;
};

export type MatchRun = {
  fromIndex: number;
  toIndex: number;
  /** Fractional route positions (segment index + t) where the run starts / ends. */
  fromPos: number;
  toPos: number;
  lengthM: number;
};

export type LineMatch = {
  /** Total matched length (m) over qualifying runs. */
  matchedLengthM: number;
  /** Route point indices bounding matched stretches. */
  indices: number[];
  runs: MatchRun[];
};

const M_PER_DEG = 111_320;

type Seg = { a: [number, number]; b: [number, number] };

function segmentsOf(lines: [number, number][][]): Seg[] {
  const out: Seg[] = [];
  for (const l of lines) for (let i = 1; i < l.length; i++) out.push({ a: l[i - 1]!, b: l[i]! });
  return out;
}

/** Bearing in degrees [0, 360). */
function bearing360(a: [number, number], b: [number, number]): number {
  const k = Math.cos(toRad(a[0]));
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

function headingDiff(a: number, b: number, directional: boolean): number {
  const d = Math.abs(a - b) % 360;
  const full = Math.min(d, 360 - d); // 0..180
  return directional ? full : Math.min(full, 180 - full); // undirected: 0..90
}

function nearestSeg(p: [number, number], segs: Seg[], maxM: number): { d: number; heading: number } | null {
  const k = Math.cos(toRad(p[0]));
  const padLat = maxM / M_PER_DEG, padLon = maxM / (M_PER_DEG * k);
  let best: { d: number; heading: number } | null = null;
  for (const s of segs) {
    if (p[0] < Math.min(s.a[0], s.b[0]) - padLat || p[0] > Math.max(s.a[0], s.b[0]) + padLat) continue;
    if (p[1] < Math.min(s.a[1], s.b[1]) - padLon || p[1] > Math.max(s.a[1], s.b[1]) + padLon) continue;
    const d = pointToSegmentM(p, s.a, s.b);
    if (d <= maxM && (!best || d < best.d)) best = { d, heading: bearing360(s.a, s.b) };
  }
  return best;
}

/* ─── Per-route evaluation context (computed once per route, shared by all constraints) ─── */

export type RouteIndex = {
  segLenM: Float64Array;
  heading: Float64Array;
  /** Segment bboxes: [south, west, north, east] × n (segment i = points[i-1]→points[i]). */
  bbox: Float64Array;
};

const routeIndexCache = new WeakMap<[number, number][], RouteIndex>();

/** Route-wide geometry derived once and reused across constraints (WeakMap on the points array). */
export function routeIndexOf(points: [number, number][]): RouteIndex {
  const hit = routeIndexCache.get(points);
  if (hit) return hit;
  const n = points.length;
  const segLenM = new Float64Array(n);
  const heading = new Float64Array(n);
  const bbox = new Float64Array(n * 4);
  for (let i = 1; i < n; i++) {
    const a = points[i - 1]!, b = points[i]!;
    segLenM[i] = haversineM(a, b);
    heading[i] = bearing360(a, b);
    bbox[i * 4] = Math.min(a[0], b[0]);
    bbox[i * 4 + 1] = Math.min(a[1], b[1]);
    bbox[i * 4 + 2] = Math.max(a[0], b[0]);
    bbox[i * 4 + 3] = Math.max(a[1], b[1]);
  }
  const idx = { segLenM, heading, bbox };
  routeIndexCache.set(points, idx);
  return idx;
}

/** Uniform grid over constraint segments for nearest-segment queries. */
class SegGrid {
  private cells = new Map<string, number[]>();
  constructor(
    readonly segs: Seg[],
    private readonly cellDeg: number,
    padM: number,
  ) {
    segs.forEach((s, i) => {
      const lat = Math.max(Math.abs(s.a[0]), Math.abs(s.b[0]));
      const pLat = padM / M_PER_DEG, pLon = padM / (M_PER_DEG * Math.max(0.2, Math.cos(toRad(lat))));
      const r0 = Math.floor((Math.min(s.a[0], s.b[0]) - pLat) / cellDeg), r1 = Math.floor((Math.max(s.a[0], s.b[0]) + pLat) / cellDeg);
      const c0 = Math.floor((Math.min(s.a[1], s.b[1]) - pLon) / cellDeg), c1 = Math.floor((Math.max(s.a[1], s.b[1]) + pLon) / cellDeg);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const k = `${r}:${c}`;
          const l = this.cells.get(k);
          if (l) l.push(i);
          else this.cells.set(k, [i]);
        }
    });
  }
  candidates(p: [number, number]): Seg[] {
    const l = this.cells.get(`${Math.floor(p[0] / this.cellDeg)}:${Math.floor(p[1] / this.cellDeg)}`);
    return l ? l.map((i) => this.segs[i]!) : [];
  }
}

/**
 * Where does a route run ALONG the given lines? Route segments are sampled every
 * `sampleStepM`; a sample matches when it lies within `toleranceM` of a line segment
 * whose direction agrees within `maxHeadingDiffDeg` (undirected unless `directional`).
 * Crossings (over/underpasses) and brief proximity are dropped by `minMatchLengthM`.
 *
 * Route segments whose bbox is farther than `toleranceM` from the lines' envelope cannot
 * contain a matching sample: they are skipped (they only end a run, exactly as a
 * non-matching sample would). Nearest-segment queries use a grid over the lines.
 */
export function matchRouteAlongLines(
  points: [number, number][],
  lines: [number, number][][],
  opts: LineMatchOptions,
): LineMatch {
  const segs = segmentsOf(lines);
  const step = opts.sampleStepM ?? 20;
  const directional = opts.directional === true;
  const runs: MatchRun[] = [];
  let run: MatchRun | null = null;
  const close = () => {
    if (run && run.lengthM >= opts.minMatchLengthM) runs.push(run);
    run = null;
  };
  let south = 90, north = -90, west = 180, east = -180;
  for (const s of segs) {
    south = Math.min(south, s.a[0], s.b[0]); north = Math.max(north, s.a[0], s.b[0]);
    west = Math.min(west, s.a[1], s.b[1]); east = Math.max(east, s.a[1], s.b[1]);
  }
  const padLat = (opts.toleranceM * 1.01) / M_PER_DEG;
  const padLon = (opts.toleranceM * 1.01) / (M_PER_DEG * Math.max(0.2, Math.cos(toRad(Math.max(Math.abs(south), Math.abs(north))))));
  const env = { south: south - padLat, north: north + padLat, west: west - padLon, east: east + padLon };
  const ri = routeIndexOf(points);
  const grid = new SegGrid(segs, 0.005, opts.toleranceM * 1.01);
  for (let i = 1; i < points.length; i++) {
    const segLen = ri.segLenM[i]!;
    if (segLen === 0) continue;
    const bi = i * 4;
    if (ri.bbox[bi]! > env.north || ri.bbox[bi + 2]! < env.south || ri.bbox[bi + 1]! > env.east || ri.bbox[bi + 3]! < env.west) {
      close();
      continue;
    }
    const a = points[i - 1]!, b = points[i]!;
    const heading = ri.heading[i]!;
    const n = Math.max(1, Math.ceil(segLen / step));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const p: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const near = nearestSeg(p, grid.candidates(p), opts.toleranceM);
      if (near && headingDiff(near.heading, heading, directional) <= opts.maxHeadingDiffDeg) {
        if (!run) run = { fromIndex: i - 1, toIndex: i, fromPos: i - 1 + s / n, toPos: i - 1 + (s + 1) / n, lengthM: 0 };
        run.toIndex = i;
        run.toPos = i - 1 + (s + 1) / n;
        run.lengthM += segLen / n;
      } else {
        close();
      }
    }
  }
  close();
  const idx = new Set<number>();
  for (const r of runs) for (let i = r.fromIndex; i <= r.toIndex; i++) idx.add(i);
  return {
    matchedLengthM: runs.reduce((acc, r) => acc + r.lengthM, 0),
    indices: [...idx].sort((x, y) => x - y),
    runs,
  };
}

/** Time at a fractional route position (linear between point times). */
export function timeAtPos(times: number[], pos: number): number {
  const i = Math.max(0, Math.min(times.length - 1, Math.floor(pos)));
  const j = Math.min(times.length - 1, i + 1);
  return times[i]! + (times[j]! - times[i]!) * (pos - i);
}

/* ─── Route input validation ────────────────────────── */

export class RouteInputError extends Error {}

/**
 * Reject malformed route geometry instead of letting NaN produce "no intersection"
 * (which would read as "not affected").
 */
export function assertValidRoute(points: [number, number][], times: number[]): void {
  if (!Array.isArray(points) || !Array.isArray(times)) throw new RouteInputError("geometria da rota em falta");
  if (points.length !== times.length) {
    throw new RouteInputError(`geometria/tempos inconsistentes (${points.length} pontos, ${times.length} tempos)`);
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) {
      throw new RouteInputError(`ponto de rota inválido no índice ${i}`);
    }
    if (!Number.isFinite(times[i]!)) throw new RouteInputError(`tempo inválido no índice ${i}`);
    if (i > 0 && times[i]! < times[i - 1]!) throw new RouteInputError(`tempos da rota não crescentes no índice ${i}`);
  }
}

/**
 * Above this route point spacing (m) near a constraint, a "miss" cannot be trusted.
 * Real TomTom truck routes (fixtures) have max spacing ≈ 530 m, p99 ≤ 311 m.
 */
export const MAX_ROUTE_GAP_M = 1_000;

function longestSegmentNear(points: [number, number][], lines: [number, number][][], padM: number): number {
  let south = 90, north = -90, west = 180, east = -180;
  for (const l of lines) {
    for (const p of l) {
      south = Math.min(south, p[0]);
      north = Math.max(north, p[0]);
      west = Math.min(west, p[1]);
      east = Math.max(east, p[1]);
    }
  }
  const dLat = padM / M_PER_DEG, dLon = padM / (M_PER_DEG * Math.cos(toRad((south + north) / 2)));
  const box = { south: south - dLat, north: north + dLat, west: west - dLon, east: east + dLon };
  const ri = routeIndexOf(points);
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    const bi = i * 4;
    if (ri.bbox[bi]! <= box.north && ri.bbox[bi + 2]! >= box.south && ri.bbox[bi + 1]! <= box.east && ri.bbox[bi + 3]! >= box.west) {
      longest = Math.max(longest, ri.segLenM[i]!);
    }
  }
  return longest;
}

/* ─── Route equivalence (de-duplicating alternatives) ─── */

/** Evenly spaced samples along a polyline (every `stepM` metres), endpoints included. */
function samplePolyline(pts: [number, number][], stepM: number): [number, number][] {
  const out: [number, number][] = [];
  if (pts.length === 0) return out;
  out.push(pts[0]!);
  let next = stepM;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const len = haversineM(a, b);
    while (next <= walked + len && len > 0) {
      const t = (next - walked) / len;
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      next += stepM;
    }
    walked += len;
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Share of `a`'s samples lying within `tolM` of polyline `b`. */
/** Exhaustive reference for `coverage` (kept for equivalence tests). */
export function coverageShareReference(a: [number, number][], b: [number, number][], tolM: number): number {
  const segs = segmentsOf([b]);
  const samples = samplePolyline(a, 50);
  if (samples.length === 0) return 0;
  let hit = 0;
  for (const p of samples) if (nearestSeg(p, segs, tolM)) hit++;
  return hit / samples.length;
}

/**
 * Share of `a` (sampled every 50 m) lying within `tolM` of `b`. Same answer as the
 * exhaustive scan: a point within `tolM` of a segment falls in one of the grid cells of
 * that segment's tolM-padded bbox. Stops early once `minShare` can no longer be reached.
 */
function coverage(a: [number, number][], b: [number, number][], tolM: number, minShare = 0): number {
  const samples = samplePolyline(a, 50);
  if (samples.length === 0) return 0;
  const grid = new SegGrid(segmentsOf([b]), 0.01, tolM);
  const allowedMisses = minShare > 0 ? Math.floor(samples.length * (1 - minShare)) : Infinity;
  let hit = 0, miss = 0;
  for (const p of samples) {
    if (grid.candidates(p).some((s) => pointToSegmentM(p, s.a, s.b) <= tolM)) hit++;
    else if (++miss > allowedMisses) return hit / samples.length;
  }
  return hit / samples.length;
}

/**
 * Two routes are the same path when each lies (almost entirely) on the other — a
 * geometric test, not distance/time similarity (which can merge different roads).
 */
export function routesEquivalent(a: [number, number][], b: [number, number][], tolM = 30, share = 0.98): boolean {
  if (a.length < 2 || b.length < 2) return false;
  return coverage(a, b, tolM, share) >= share && coverage(b, a, tolM, share) >= share;
}

/**
 * Up to `maxRects` axis-aligned rectangles (padded by `padM`) covering all line points.
 * Lines are cut into chunks of similar length; each rectangle bounds one chunk.
 */
export function coveringRectangles(lines: [number, number][][], maxRects: number, padM: number): BBox[] {
  const lens = lines.map((l) => l.slice(1).reduce((acc, p, i) => acc + haversineM(l[i]!, p), 0));
  const total = lens.reduce((a, b) => a + b, 0);
  if (total === 0 || maxRects < 1) return [];
  const perLine = lines.map((_, i) => Math.max(1, Math.round((lens[i]! / total) * maxRects)));
  while (perLine.reduce((a, b) => a + b, 0) > maxRects) {
    const i = perLine.indexOf(Math.max(...perLine));
    if (perLine[i]! <= 1) break;
    perLine[i]! -= 1;
  }
  const chunks: [number, number][][] = [];
  lines.forEach((l, li) => {
    const target = lens[li]! / perLine[li]!;
    let cur: [number, number][] = [l[0]!];
    let acc = 0;
    for (let i = 1; i < l.length; i++) {
      acc += haversineM(l[i - 1]!, l[i]!);
      cur.push(l[i]!);
      if (acc >= target && i < l.length - 1) {
        chunks.push(cur);
        cur = [l[i]!];
        acc = 0;
      }
    }
    if (cur.length > 1) chunks.push(cur);
  });
  let boxes: BBox[] = chunks.map((c) => {
    const lat = c.map((p) => p[0]), lon = c.map((p) => p[1]);
    const midLat = (Math.min(...lat) + Math.max(...lat)) / 2;
    const dLat = padM / M_PER_DEG, dLon = padM / (M_PER_DEG * Math.cos(toRad(midLat)));
    return { south: Math.min(...lat) - dLat, west: Math.min(...lon) - dLon, north: Math.max(...lat) + dLat, east: Math.max(...lon) + dLon };
  });
  // Still too many (many short lines): merge pairs until within the limit.
  while (boxes.length > maxRects) {
    const a = boxes.shift()!, b = boxes.shift()!;
    boxes = [...boxes, { south: Math.min(a.south, b.south), west: Math.min(a.west, b.west), north: Math.max(a.north, b.north), east: Math.max(a.east, b.east) }];
  }
  return boxes;
}

/**
 * Which route points may be on the restricted element.
 * - "exact": geometry RESOLVED (mapping not UNVERIFIED) — indices run along it.
 * - "overApprox": geometry unusable — indices are a superset (screening area or whole route).
 * - "none": the route provably does not use it (resolved miss, or never enters the screening area).
 * - "noRoute": no route geometry available.
 */
export type Exposure =
  | { kind: "exact"; indices: number[]; matchedLengthM: number; runs: MatchRun[] }
  | { kind: "overApprox"; indices: number[]; via: "screeningArea" | "wholeRoute" | "lowResolution" }
  | { kind: "none"; via: "resolvedGeometry" | "screeningArea" }
  | { kind: "noRoute" };

export function routeExposure(route: RouteGeometryInput, geom: GeometryRecord): Exposure {
  const pts = route.points;
  if (pts.length === 0) return { kind: "noRoute" };

  // Negative pre-filter only: outside the screening area the element cannot be used.
  if (geom.screeningArea) {
    const bbox = geom.screeningArea.bbox;
    if (!pts.some((p) => pointInBBox(p, bbox)) && !crossesBBox(pts, bbox)) return { kind: "none", via: "screeningArea" };
  }

  if (geom.status === "RESOLVED" && geom.resolved && geom.resolved.verification !== "UNVERIFIED") {
    const m = matchRouteAlongLines(pts, geom.resolved.lines, geom.resolved);
    if (m.runs.length > 0) return { kind: "exact", indices: m.indices, matchedLengthM: m.matchedLengthM, runs: m.runs };
    // A miss only counts when the route is detailed enough near the constraint.
    if (longestSegmentNear(pts, geom.resolved.lines, geom.resolved.toleranceM) > MAX_ROUTE_GAP_M) {
      return { kind: "overApprox", indices: pts.map((_, i) => i), via: "lowResolution" };
    }
    return { kind: "none", via: "resolvedGeometry" };
  }

  if (geom.screeningArea) {
    const bbox = geom.screeningArea.bbox;
    const inside: number[] = [];
    pts.forEach((p, i) => {
      if (pointInBBox(p, bbox)) inside.push(i);
    });
    return inside.length > 0
      ? { kind: "overApprox", indices: inside, via: "screeningArea" }
      : { kind: "overApprox", indices: pts.map((_, i) => i), via: "wholeRoute" };
  }

  return { kind: "overApprox", indices: pts.map((_, i) => i), via: "wholeRoute" };
}

/** Conservative: does any segment's own bounding box intersect the bbox? */
function crossesBBox(pts: [number, number][], b: BBox): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [a, c] = [pts[i - 1]!, pts[i]!];
    const s = Math.min(a[0], c[0]), n = Math.max(a[0], c[0]);
    const w = Math.min(a[1], c[1]), e = Math.max(a[1], c[1]);
    if (s <= b.north && n >= b.south && w <= b.east && e >= b.west) return true;
  }
  return false;
}

/**
 * Max spacing kept by simplification. Compact storage must never make a saved route
 * look "too coarse" to re-evaluate (MAX_ROUTE_GAP_M), so long straight runs keep a point
 * at least every SIMPLIFY_MAX_SEGMENT_M.
 */
export const SIMPLIFY_MAX_SEGMENT_M = 250;

/** Douglas–Peucker simplification (tolerance in metres); keeps first and last points. */
export function simplifyPolyline(pts: [number, number][], tolM: number): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointToSegmentM(pts[i]!, pts[a]!, pts[b]!);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tolM) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  // Re-insert original points so no kept segment exceeds SIMPLIFY_MAX_SEGMENT_M.
  let last = 0;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    walked += haversineM(pts[i - 1]!, pts[i]!);
    if (keep[i]) {
      last = i;
      walked = 0;
    } else if (walked >= SIMPLIFY_MAX_SEGMENT_M && i > last) {
      keep[i] = true;
      last = i;
      walked = 0;
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify each leg separately so `legPointCounts` still partitions the result. */
export function simplifyByLegs(
  pts: [number, number][],
  legPointCounts: number[],
  tolM: number,
): { points: [number, number][]; legPointCounts: number[] } {
  if (legPointCounts.length === 0) return { points: simplifyPolyline(pts, tolM), legPointCounts: [] };
  const points: [number, number][] = [];
  const counts: number[] = [];
  let idx = 0;
  for (const c of legPointCounts) {
    const leg = simplifyPolyline(pts.slice(idx, idx + c), tolM);
    points.push(...leg);
    counts.push(leg.length);
    idx += c;
  }
  return { points, legPointCounts: counts };
}
