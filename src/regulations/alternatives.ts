import type { Job } from "../data/types";
import { operationalTimeline } from "./operationalTimeline";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import { assessStopWindow, worstWindow, type WindowAssessment, type WindowStatus } from "./deliveryWindow";
import { coveringRectangles, haversineM, matchRouteAlongLines, routesEquivalent, simplifyByLegs } from "./geometry";
import type { BBox, ComplianceReport, PersistedRoute, RegulationDataset, RoutingMethod } from "./types";

/**
 * Candidate verdict — derived ONLY from the compliance engine's report.
 * - compliant: no verified applicable restriction.
 * - uncertain: some restriction UNKNOWN — show with the uncertainty, never call it compliant.
 * - rejected: a restriction APPLIES.
 */
export type CandidateVerdict = "compliant" | "uncertain" | "rejected" | "error" | "not_evaluated";

/** Only an explicit ROUTE_COMPLIANT report is "compliant"; everything else is not green. */
export function verdictFor(report: ComplianceReport | undefined): CandidateVerdict {
  if (!report) return "not_evaluated";
  switch (report.status) {
    case "ROUTE_COMPLIANT":
      return "compliant";
    case "ROUTE_AFFECTED":
      return "rejected";
    case "POTENTIALLY_AFFECTED":
      return "uncertain";
    case "EVALUATION_ERROR":
      return "error";
    default:
      return "not_evaluated";
  }
}

/** How a candidate was produced (kept through de-duplication). */
export function provenanceOf(opt: RoutePlanOption): string {
  if (!opt.routing) return "estimativa local (sem fornecedor)";
  if (opt.routing.avoidAreas && opt.routing.avoidAreas.length > 0) return `TomTom avoidAreas (${opt.routing.avoidAreas.length} retângulos)`;
  if (opt.routing.role === "toll_avoiding") return "TomTom (pedido sem portagens)";
  if (opt.routing.role === "alternative") return "Alternativa nativa TomTom";
  return "Rota principal TomTom";
}

export type ReviewedAlternative = {
  option: RoutePlanOption;
  report?: ComplianceReport;
  verdict: CandidateVerdict;
  /** Every strategy that produced this same path. */
  provenance: string[];
  /** Geometrically the same path as the affected original (provider ignored the request). */
  sameAsOriginal: boolean;
};

/**
 * Candidates for replacing an affected original: de-duplicated GEOMETRICALLY (not by
 * distance/time), provenance merged, verdict taken only from the engine's report.
 */
export function reviewAlternatives(
  original: RoutePlanOption,
  candidates: RoutePlanOption[],
  reports: Record<string, ComplianceReport | undefined>,
): ReviewedAlternative[] {
  const kept: ReviewedAlternative[] = [];
  for (const c of candidates) {
    if (c.id === original.id) continue;
    const usable = !c.error && c.polyline.length >= 2;
    if (usable) {
      const dup = kept.find((k) => k.option.polyline.length >= 2 && sameLength(k.option, c) && routesEquivalent(k.option.polyline, c.polyline));
      if (dup) {
        const prov = provenanceOf(c);
        if (!dup.provenance.includes(prov)) dup.provenance.push(prov);
        continue;
      }
    }
    kept.push({
      option: c,
      report: usable ? reports[c.id] : undefined,
      verdict: usable ? verdictFor(reports[c.id]) : "not_evaluated",
      provenance: [provenanceOf(c)],
      sameAsOriginal: usable && original.polyline.length >= 2 && sameLength(original, c) && routesEquivalent(original.polyline, c.polyline),
    });
  }
  return kept;
}

/** Equivalent paths have near-identical length; cheap guard before the geometric test. */
function sameLength(a: RoutePlanOption, b: RoutePlanOption): boolean {
  const m = Math.max(a.distanceM, b.distanceM);
  return m > 0 && Math.abs(a.distanceM - b.distanceM) / m <= 0.05;
}

/** TomTom documents at most 10 rectangles of about 160×160 km each. */
export const MAX_AVOID_RECTANGLES = 10;
const MAX_RECT_SIDE_M = 160_000;
const AVOID_PAD_M = 150;

export type AvoidancePlan = { rectangles: BBox[]; derivedFrom: string[] };

/**
 * Rectangles covering the resolved geometry of every regulation that APPLIES.
 * Returns null when nothing usable exists (unresolved / unverified geometry, or the
 * rectangles would exceed the documented limits).
 */
export function avoidancePlan(report: ComplianceReport, dataset: RegulationDataset): AvoidancePlan | null {
  const lines: [number, number][][] = [];
  const derivedFrom: string[] = [];
  for (const r of report.results) {
    if (r.outcome !== "APPLIES" || r.effect === "advisory") continue;
    const reg = dataset.regulations.find((x) => x.id === r.regulationId);
    const geom = reg && dataset.geometries.find((g) => g.id === reg.location.geometryId);
    if (!geom || geom.status !== "RESOLVED" || !geom.resolved || geom.resolved.verification === "UNVERIFIED") continue;
    lines.push(...geom.resolved.lines);
    derivedFrom.push(r.regulationId);
  }
  if (lines.length === 0) return null;
  const rectangles = coveringRectangles(lines, MAX_AVOID_RECTANGLES, AVOID_PAD_M);
  const tooBig = rectangles.some(
    (b) =>
      haversineM([b.south, b.west], [b.north, b.west]) > MAX_RECT_SIDE_M ||
      haversineM([b.south, b.west], [b.south, b.east]) > MAX_RECT_SIDE_M,
  );
  if (rectangles.length === 0 || rectangles.length > MAX_AVOID_RECTANGLES || tooBig) return null;
  return { rectangles, derivedFrom };
}

/** Official corridors (from the given regulations' data) that the route actually follows. */
export function officialAlternativesFollowed(
  points: [number, number][],
  regulationIds: string[],
  dataset: RegulationDataset,
): PersistedRoute["followsOfficialAlternatives"] {
  const out: PersistedRoute["followsOfficialAlternatives"] = [];
  for (const id of regulationIds) {
    const reg = dataset.regulations.find((r) => r.id === id);
    for (const alt of reg?.officialAlternatives ?? []) {
      const geom = alt.geometryId ? dataset.geometries.find((g) => g.id === alt.geometryId) : undefined;
      if (!geom?.resolved || out.some((o) => o.id === alt.id)) continue;
      const m = matchRouteAlongLines(points, geom.resolved.lines, geom.resolved);
      if (m.runs.length > 0) out.push({ id: alt.id, label: alt.label, matchedKm: Math.round(m.matchedLengthM / 100) / 10 });
    }
  }
  return out;
}

/** Why a report rejects a route — texts of the APPLIES results. */
export function rejectionReasons(report: ComplianceReport): string[] {
  return report.results
    .filter((r) => r.outcome === "APPLIES")
    .flatMap((r) => [r.title, ...r.reasons.map((x) => `  ${x.text.trim()}`)]);
}

export function routingMethodOf(opt: RoutePlanOption, plan?: AvoidancePlan | null): RoutingMethod {
  const info = opt.routing;
  if (!info) return { kind: "local_estimate" };
  if (info.avoidAreas && info.avoidAreas.length > 0) {
    return { kind: "provider_avoid_areas", provider: "tomtom", request: info.params, avoidAreas: info.avoidAreas, derivedFrom: plan?.derivedFrom ?? [] };
  }
  return info.role === "primary"
    ? { kind: "provider_primary", provider: "tomtom", request: info.params }
    : { kind: "provider_alternative", provider: "tomtom", request: info.params };
}

/** Route representation kept with a decision (geometry simplified to ~5 m). */
export function toPersistedRoute(
  opt: RoutePlanOption,
  title: string,
  fallbackDepartIso: string,
  followsOfficialAlternatives: PersistedRoute["followsOfficialAlternatives"],
  plan?: AvoidancePlan | null,
  /** Douglas–Peucker tolerance (m); 0 keeps the full geometry. */
  simplifyTolM = 5,
): PersistedRoute {
  const simplified =
    simplifyTolM > 0
      ? simplifyByLegs(opt.polyline, opt.legPointCounts, simplifyTolM)
      : { points: opt.polyline.slice(), legPointCounts: opt.legPointCounts.slice() };
  return {
    optionId: opt.id,
    title,
    method: routingMethodOf(opt, plan),
    departAtIso: opt.departAtIso ?? fallbackDepartIso,
    arrivalAtIso: opt.arrivalAtIso,
    distanceM: opt.distanceM,
    durationSec: opt.durationSec,
    roadNumbers: opt.roadNumbers,
    polyline: simplified.points,
    legPointCounts: simplified.legPointCounts,
    legDurationSec: opt.legDurationSec,
    followsOfficialAlternatives,
  };
}

/**
 * Dated window assessment for every stop of an option. Arrival at stop k: earliest =
 * departure + driving and mandatory breaks/rests (EU driving rules) to k.
 * Both ends use the same operational ETA; uncertainty is the explicit assessment margin.
 * Service time at stops is not modelled (unknown) — latest ETA may be optimistic.
 */
export function assessOptionWindows(opt: RoutePlanOption, job: Job, departMs: number, driverHoursToday: number): WindowAssessment[] {
  const stops = [...job.stops].sort((a, b) => a.sequence - b.sequence);
  const timeline = operationalTimeline(opt, departMs, driverHoursToday);
  return stops.map((s, k) => {
    const arrival = timeline.stopArrivalMs[k] ?? Number.NaN;
    return assessStopWindow(s, arrival, arrival);
  });
}

export function optionWindowStatus(opt: RoutePlanOption, job: Job, departMs: number, driverHoursToday: number): WindowStatus {
  return worstWindow(assessOptionWindows(opt, job, departMs, driverHoursToday));
}
