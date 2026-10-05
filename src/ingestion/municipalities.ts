import { pointToSegmentM } from "../regulations/geometry";
import type { DeclaredTerritory, Municipality, MunicipalityDataset } from "./types";

/*
 * CAOP2025 municipality registry (DGT, CC-BY 4.0) — DATA in public/data, built by
 * scripts/build-caop-municipalities.mjs. Polygons are simplified; a point closer than
 * `borderMarginM` to a boundary has UNKNOWN membership.
 */

export const CAOP_URL = "/data/caop2025-municipios.json";

/**
 * inside / near_border: within a SUPPORTED territory (a loaded registry).
 * enclosed_gap: in no municipality, but enclosed by ONE supported territory in all four
 *   directions within ENCLOSURE_PROBE_KM (estuary, reservoir, unassigned area) — the
 *   territory is supported, the municipality is unknown. Never treated as foreign.
 * outside_dataset: a valid point outside every supported territory (unsupported territory).
 * invalid: not a usable coordinate (NaN, out of range) — unknown, NOT "foreign".
 */
export type MunicipalityLookup =
  | { status: "inside"; municipality: Municipality }
  | { status: "near_border"; candidates: Municipality[] }
  | { status: "enclosed_gap"; territory: string }
  | { status: "outside_dataset" }
  | { status: "invalid" };

/** Ray casting on [lng, lat] ring with a [lat, lng] point. */
function inRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inMunicipality(lat: number, lng: number, m: Municipality): boolean {
  return m.polygons.some((poly) => inRing(lat, lng, poly[0]!) && !poly.slice(1).some((hole) => inRing(lat, lng, hole)));
}

function distanceToBoundaryM(lat: number, lng: number, m: Municipality, limitM: number): number {
  let best = Infinity;
  const p: [number, number] = [lat, lng];
  for (const poly of m.polygons) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!, b = ring[i]!;
        const d = pointToSegmentM(p, [a[1], a[0]], [b[1], b[0]]);
        if (d < best) best = d;
        if (best < limitM) return best;
      }
    }
  }
  return best;
}

const padDeg = (m: number) => m / 111_000 + 0.002;

const BORDER_CELL_DEG = 0.01;

/** Reference (exhaustive) boundary distance — kept for equivalence tests. */
export function distanceToBoundaryMReference(lat: number, lng: number, m: Municipality, limitM: number): number {
  return distanceToBoundaryM(lat, lng, m, limitM);
}

/** How far (km) to look in each direction for the territory enclosing an unassigned point. */
export const ENCLOSURE_PROBE_KM = 30;

export function territoryOf(d: MunicipalityDataset): DeclaredTerritory {
  return d.territory ?? { code: "UNDECLARED", name: d.dataset };
}

/**
 * Municipality registry over one or more datasets, each declaring the territory it covers.
 * Road Intelligence coverage = union of loaded territories; nothing is assumed about any
 * country — adding e.g. a Spanish registry makes Spain supported without code changes.
 */
export class MunicipalityIndex {
  readonly dataset: MunicipalityDataset;
  readonly datasets: MunicipalityDataset[];
  readonly territories: DeclaredTerritory[];
  private readonly all: Municipality[];
  private readonly margin: number;

  constructor(datasets: MunicipalityDataset | MunicipalityDataset[]) {
    this.datasets = Array.isArray(datasets) ? datasets : [datasets];
    this.dataset = this.datasets[0]!;
    this.territories = this.datasets.map(territoryOf);
    this.all = this.datasets.flatMap((d) => d.municipalities.map((m) => ({ ...m, territory: territoryOf(d).code })));
    this.margin = Math.max(...this.datasets.map((d) => d.simplification.borderMarginM));
  }

  /** Boundary segments bucketed by grid cell (padded by the border margin), built once. */
  private borderGrid: Map<string, { m: number; a: [number, number]; b: [number, number] }[]> | null = null;
  private grid() {
    if (this.borderGrid) return this.borderGrid;
    const g = new Map<string, { m: number; a: [number, number]; b: [number, number] }[]>();
    const margin = this.margin;
    this.all.forEach((mu, mi) => {
      for (const poly of mu.polygons)
        for (const ring of poly)
          for (let i = 1; i < ring.length; i++) {
            const a: [number, number] = [ring[i - 1]![1], ring[i - 1]![0]], b: [number, number] = [ring[i]![1], ring[i]![0]]; // → [lat, lng]
            const pLat = (margin * 1.05) / 111_000, pLng = (margin * 1.05) / (111_000 * Math.cos((Math.max(Math.abs(a[0]), Math.abs(b[0])) * Math.PI) / 180));
            const r0 = Math.floor((Math.min(a[0], b[0]) - pLat) / BORDER_CELL_DEG), r1 = Math.floor((Math.max(a[0], b[0]) + pLat) / BORDER_CELL_DEG);
            const c0 = Math.floor((Math.min(a[1], b[1]) - pLng) / BORDER_CELL_DEG), c1 = Math.floor((Math.max(a[1], b[1]) + pLng) / BORDER_CELL_DEG);
            for (let r = r0; r <= r1; r++)
              for (let c = c0; c <= c1; c++) {
                const k = `${r}:${c}`;
                const l = g.get(k);
                const e = { m: mi, a, b };
                if (l) l.push(e);
                else g.set(k, [e]);
              }
          }
    });
    this.borderGrid = g;
    return g;
  }

  /** Codes of municipalities with a boundary segment closer than the border margin. */
  private nearBorder(lat: number, lng: number): Set<number> {
    const margin = this.margin;
    const out = new Set<number>();
    for (const e of this.grid().get(`${Math.floor(lat / BORDER_CELL_DEG)}:${Math.floor(lng / BORDER_CELL_DEG)}`) ?? []) {
      if (!out.has(e.m) && pointToSegmentM([lat, lng], e.a, e.b) < margin) out.add(e.m);
    }
    return out;
  }

  get byCode(): Map<string, Municipality> {
    return new Map(this.all.map((m) => [m.code, m]));
  }

  lookup(lat: number, lng: number): MunicipalityLookup {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { status: "invalid" };
    const pad = padDeg(this.margin);
    const near = this.all.filter(
      (m) => lat >= m.bbox.south - pad && lat <= m.bbox.north + pad && lng >= m.bbox.west - pad && lng <= m.bbox.east + pad,
    );
    const containing = near.filter((m) => inMunicipality(lat, lng, m));
    const nb = this.nearBorder(lat, lng);
    const closeToBorder = [...nb].map((i) => this.all[i]!);
    if (containing.length === 1 && closeToBorder.length === 0) return { status: "inside", municipality: containing[0]! };
    const cands = [...new Map([...containing, ...closeToBorder].map((m) => [m.code, m])).values()];
    if (cands.length === 0) {
      const t = this.enclosingTerritory(lat, lng);
      return t ? { status: "enclosed_gap", territory: t } : { status: "outside_dataset" };
    }
    return { status: "near_border", candidates: cands };
  }

  private territoryAt(lat: number, lng: number): string | undefined {
    for (const m of this.all) {
      if (lat < m.bbox.south || lat > m.bbox.north || lng < m.bbox.west || lng > m.bbox.east) continue;
      if (inMunicipality(lat, lng, m)) return m.territory;
    }
    return undefined;
  }

  /**
   * The territory surrounding a point that lies in no municipality, if the SAME territory is
   * found in every cardinal direction within ENCLOSURE_PROBE_KM (500 m steps). Derived only
   * from the loaded registries — no geography is hard-coded.
   */
  private enclosingTerritory(lat: number, lng: number): string | undefined {
    const stepLat = 0.5 / 111.32, stepLng = 0.5 / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const steps = Math.round(ENCLOSURE_PROBE_KM / 0.5);
    let common: string | undefined;
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let hit: string | undefined;
      for (let k = 1; k <= steps && !hit; k++) hit = this.territoryAt(lat + dy * k * stepLat, lng + dx * k * stepLng);
      if (!hit || (common && hit !== common)) return undefined;
      common = hit;
    }
    return common;
  }
}

export function isMunicipalityDataset(v: unknown): v is MunicipalityDataset {
  // territory is optional (older files); when present it must be well-formed.
  const d = v as MunicipalityDataset;
  return !!d && Array.isArray(d.municipalities) && typeof d.simplification?.borderMarginM === "number" && d.municipalities.every((m) => typeof m.code === "string" && Array.isArray(m.polygons));
}
