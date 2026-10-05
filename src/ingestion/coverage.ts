import { haversineM, pointToSegmentM } from "../regulations/geometry";
import type { ComplianceStatus } from "../regulations/types";
import { curationFor, type MunicipalCuration } from "./municipalRegistry";
import type { MunicipalityIndex } from "./municipalities";
import type { CandidateConstraint, Freshness, FreshnessState, SourceRecord } from "./types";

/*
 * Route coverage: which authorities' information FleetOS actually has along a route.
 * It never changes the compliance status — it qualifies it (no false green by omission).
 */

export const COVERAGE_SAMPLE_M = 500;
export const NEARBY_M = 150;

export type SourceCoverageRef = { sourceId: string; name: string; freshness: FreshnessState };

export type MunicipalityCoverage = {
  code: string;
  name: string;
  /** Approximate route length inside (from samples). */
  approxKm: number;
  temporaryEvents: "COVERED" | "COVERED_NOT_FRESH" | "NO_SOURCE";
  municipalSources: SourceCoverageRef[];
  curation: MunicipalCuration;
};

export type RouteCoverage = {
  municipalities: MunicipalityCoverage[];
  /** Samples whose municipality is uncertain (near a boundary) or outside CAOP (e.g. Spain). */
  unresolvedSamples: number;
  /** Approx. km of the route outside every SUPPORTED territory — no Road Intelligence there. */
  outsideTerritoryKm: number;
  /** Supported territories crossed (from the loaded registries' declarations) with approx. km. */
  territories: { code: string; name: string; km: number }[];
  /** Route samples with unusable coordinates (unknown — never counted as foreign). */
  invalidSamples: number;
  /** No route geometry: coverage cannot be assessed at all. */
  noGeometry: boolean;
  totalSamples: number;
  nationalSources: SourceCoverageRef[];
  /** Candidates needing review whose location is near the route (not evaluated). */
  unresolvedNearby: CandidateConstraint[];
  informationalNearby: number;
  knownNotEncoded: { municipality: string; label: string; source: string }[];
  complete: boolean;
  headline: string;
  notes: string[];
};

/** Points every `stepM` along the route (always includes the ends). */
/**
 * Points every `stepM` ALONG the route (interpolated inside long segments, so sparse
 * geometry cannot skip a municipality), always including both ends. Invalid points
 * (NaN / out of range) are kept as-is so callers count them as unresolved.
 */
/** A usable WGS84 [lat, lng]. */
export const validLatLng = (p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

export function sampleRoute(points: [number, number][], stepM = COVERAGE_SAMPLE_M): [number, number][] {
  if (points.length === 0) return [];
  const out: [number, number][] = [points[0]!];
  let carried = 0; // distance travelled since the last sample
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const seg = validLatLng(a) && validLatLng(b) ? haversineM(a, b) : Number.NaN;
    if (!Number.isFinite(seg)) {
      out.push(b);
      carried = 0;
      continue;
    }
    let at = stepM - carried;
    while (at <= seg) {
      const f = at / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      at += stepM;
    }
    carried = seg - (at - stepM);
  }
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1]!;
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

/** Municipality of every route sample, computed once per (route, registry) and shared by scope + coverage. */
export type RouteMunicipalities = { samples: [number, number][]; lookups: ReturnType<MunicipalityIndex["lookup"]>[] };
const routeMuniCache = new WeakMap<[number, number][], WeakMap<MunicipalityIndex, RouteMunicipalities>>();
export function routeMunicipalities(points: [number, number][], index: MunicipalityIndex): RouteMunicipalities {
  let byIndex = routeMuniCache.get(points);
  if (!byIndex) {
    byIndex = new WeakMap();
    routeMuniCache.set(points, byIndex);
  }
  const hit = byIndex.get(index);
  if (hit) return hit;
  const samples = sampleRoute(points);
  const out = { samples, lookups: samples.map(([la, lo]) => index.lookup(la, lo)) };
  byIndex.set(index, out);
  return out;
}

const CELL_DEG = 0.01;

/**
 * Uniform grid over the route's segments (each segment registered in every cell its
 * threshold-padded bbox touches). A point within `thresholdM` of a segment necessarily
 * falls in one of that segment's cells, so lookups are exact, not approximate.
 */
export class RouteProximityIndex {
  private cells = new Map<string, number[]>();

  constructor(
    private readonly route: [number, number][],
    readonly thresholdM: number,
  ) {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!, b = route[i]!;
      // Malformed points cannot be "near" anything (and must not blow up the grid).
      if (!validLatLng(a) || !validLatLng(b)) continue;
      const latPad = thresholdM / 111_000;
      const lngPad = thresholdM / (111_000 * Math.max(0.2, Math.cos((Math.max(Math.abs(a[0]), Math.abs(b[0])) * Math.PI) / 180)));
      const r0 = Math.floor((Math.min(a[0], b[0]) - latPad) / CELL_DEG), r1 = Math.floor((Math.max(a[0], b[0]) + latPad) / CELL_DEG);
      const c0 = Math.floor((Math.min(a[1], b[1]) - lngPad) / CELL_DEG), c1 = Math.floor((Math.max(a[1], b[1]) + lngPad) / CELL_DEG);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = `${r}:${c}`;
          const list = this.cells.get(k);
          if (list) list.push(i);
          else this.cells.set(k, [i]);
        }
      }
    }
  }

  near(p: [number, number]): boolean {
    if (this.route.length === 1) return haversineM(p, this.route[0]!) <= this.thresholdM;
    const segs = this.cells.get(`${Math.floor(p[0] / CELL_DEG)}:${Math.floor(p[1] / CELL_DEG)}`);
    if (!segs) return false;
    return segs.some((i) => pointToSegmentM(p, this.route[i - 1]!, this.route[i]!) <= this.thresholdM);
  }
}

export function candidateNearRoute(
  c: CandidateConstraint,
  route: [number, number][],
  thresholdM = NEARBY_M,
  index: RouteProximityIndex = new RouteProximityIndex(route, thresholdM),
): boolean {
  const g = c.fields.geometry.value;
  if (!g || route.length === 0) return false;
  const pts = g.kind === "point" ? [g.point] : g.kind === "lines" ? g.lines.flat() : g.rings.flat();
  return pts.some((p) => index.near(p));
}

export function assessRouteCoverage(args: {
  route: [number, number][];
  index: MunicipalityIndex | null;
  sources: SourceRecord[];
  freshness: Record<string, Freshness>;
  candidates: CandidateConstraint[];
  status?: ComplianceStatus;
}): RouteCoverage {
  const { route, index, sources, freshness, candidates } = args;
  const fr = (id: string): FreshnessState => freshness[id]?.state ?? "UNKNOWN";
  const rm = index ? routeMunicipalities(route, index) : null;
  const samples = rm ? rm.samples : sampleRoute(route);
  const counts = new Map<string, { name: string; n: number }>();
  let unresolved = 0;
  let outside = 0;
  let invalid = 0;
  let enclosed = 0;
  const byTerritory = new Map<string, number>();
  if (index && rm) {
    for (const r of rm.lookups) {
      if (r.status === "inside") {
        const e = counts.get(r.municipality.code) ?? { name: r.municipality.name, n: 0 };
        e.n++;
        counts.set(r.municipality.code, e);
      } else {
        unresolved++;
        if (r.status === "outside_dataset") outside++;
        if (r.status === "invalid") invalid++;
        if (r.status === "enclosed_gap") enclosed++;
      }
      const terr = r.status === "inside" ? r.municipality.territory : r.status === "near_border" ? r.candidates[0]?.territory : r.status === "enclosed_gap" ? r.territory : undefined;
      if (terr) byTerritory.set(terr, (byTerritory.get(terr) ?? 0) + 1);
    }
  } else unresolved = samples.length;
  const outsideTerritoryKm = Math.round((outside * COVERAGE_SAMPLE_M) / 100) / 10;
  const territories = index
    ? index.territories.filter((t) => byTerritory.has(t.code)).map((t) => ({ code: t.code, name: t.name, km: Math.round(((byTerritory.get(t.code) ?? 0) * COVERAGE_SAMPLE_M) / 100) / 10 }))
    : [];
  const supportedNames = index ? index.territories.map((t) => t.name).join(", ") : "";
  const noGeometry = route.length < 2;

  const eventSources = sources.filter((s) => s.enabled && s.coverage.provides.some((p) => p === "temporary_events" || p === "closures"));
  const municipalities: MunicipalityCoverage[] = [...counts.entries()].map(([code, { name, n }]) => {
    const municipal = eventSources
      .filter((s) => s.coverage.jurisdiction.kind === "municipal" && s.coverage.jurisdiction.municipalityCodes.includes(code))
      .map((s) => ({ sourceId: s.id, name: s.name, freshness: fr(s.id) }));
    return {
      code,
      name,
      approxKm: Math.round((n * COVERAGE_SAMPLE_M) / 100) / 10,
      temporaryEvents: municipal.length === 0 ? "NO_SOURCE" : municipal.some((m) => m.freshness === "FRESH" || m.freshness === "AGING") ? "COVERED" : "COVERED_NOT_FRESH",
      municipalSources: municipal,
      curation: curationFor(code),
    };
  });
  const nationalSources = eventSources
    .filter((s) => s.coverage.jurisdiction.kind === "national" && s.access.kind !== "STATIC" && s.type !== "HTML_NOTICE")
    .map((s) => ({ sourceId: s.id, name: s.name, freshness: fr(s.id) }));

  const proximity = new RouteProximityIndex(route, NEARBY_M);
  const near = route.length ? candidates.filter((c) => candidateNearRoute(c, route, NEARBY_M, proximity)) : [];
  const unresolvedNearby = near.filter((c) => c.gate.decision === "REVIEW_REQUIRED");
  const informationalNearby = near.filter((c) => c.gate.decision === "INFORMATIONAL").length;
  const knownNotEncoded = municipalities.flatMap((m) => m.curation.knownNotEncoded.map((k) => ({ municipality: m.name, label: k.label, source: k.source })));

  const notes: string[] = [];
  const noSource = municipalities.filter((m) => m.temporaryEvents === "NO_SOURCE");
  if (noSource.length) notes.push(`Sem fonte de eventos municipais em ${noSource.length} de ${municipalities.length} municípios atravessados.`);
  const notCurated = municipalities.filter((m) => m.curation.status === "NOT_CURATED");
  if (notCurated.length) notes.push(`Restrições permanentes municipais não revistas em ${notCurated.length} municípios.`);
  if (nationalSources.every((s) => s.freshness !== "FRESH")) notes.push("Fonte nacional de eventos da IP não está atual (ver frescura).");
  notes.push("Autoestradas concessionadas: sem fonte pública licenciada de eventos.");
  if (!index) notes.push("Registo municipal (CAOP) não carregado — municípios da rota desconhecidos.");
  if (noGeometry) notes.push("Rota sem geometria — não é possível avaliar a cobertura.");
  if (outside > 0 && index) notes.push(`~${outsideTerritoryKm} km da rota ficam fora do território suportado (${supportedNames}) — sem Road Intelligence nessa parte (nem conformidade, nem ilegalidade presumidas).`);
  if (invalid > 0) notes.push(`${invalid} ponto(s) da rota com coordenadas inválidas — cobertura desconhecida nesses pontos.`);
  if (enclosed > 0) notes.push(`~${Math.round((enclosed * COVERAGE_SAMPLE_M) / 100) / 10} km sobre área sem município atribuído dentro do território suportado (p. ex. estuário ou albufeira) — território coberto, município incerto.`);
  if (unresolved > 0 && index) notes.push(`${unresolved} de ${samples.length} pontos amostrados junto a limites municipais, fora do território suportado ou inválidos (município incerto).`);

  const complete =
    !!index &&
    !noGeometry &&
    invalid === 0 &&
    unresolved === 0 &&
    municipalities.every((m) => m.temporaryEvents === "COVERED" && m.curation.status === "PARTIAL") &&
    nationalSources.some((s) => s.freshness === "FRESH");

  const parts: string[] = [];
  if (args.status === "ROUTE_COMPLIANT") parts.push(complete ? "NO KNOWN CONSTRAINT FOUND" : "NO KNOWN CONSTRAINT FOUND BUT COVERAGE IS PARTIAL");
  else parts.push(complete ? "COVERAGE COMPLETE FOR KNOWN SOURCES" : "COVERAGE IS PARTIAL");
  if (noGeometry) parts.push("NO ROUTE GEOMETRY — COVERAGE UNKNOWN");
  if (invalid > 0) parts.push(`${invalid} INVALID ROUTE POINT(S) — COVERAGE UNKNOWN THERE`);
  if (outside > 0 && index) parts.push(`ROUTE LEAVES SUPPORTED TERRITORY (~${outsideTerritoryKm} km outside ${supportedNames} — ROAD INTELLIGENCE UNKNOWN THERE)`);
  if (unresolvedNearby.length) parts.push(`${unresolvedNearby.length} UNREVIEWED REPORT(S) NEAR ROUTE`);
  if (knownNotEncoded.length) parts.push("KNOWN RESTRICTION NOT ENCODED");

  return {
    municipalities,
    unresolvedSamples: unresolved,
    outsideTerritoryKm,
    territories,
    invalidSamples: invalid,
    noGeometry,
    totalSamples: samples.length,
    nationalSources,
    unresolvedNearby,
    informationalNearby,
    knownNotEncoded,
    complete,
    headline: parts.join(" · "),
    notes,
  };
}
