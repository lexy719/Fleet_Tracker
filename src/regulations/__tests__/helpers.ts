import { REGULATION_DATASET } from "../repository";
import type {
  ActivePeriod,
  EvaluationInput,
  GeometryRecord,
  RegulationDataset,
  RegulationRecord,
  RouteGeometryInput,
  TemporalRule,
} from "../types";

/** A straight synthetic road (≈1.7 km, east–west) — test-only geometry. */
export const ROAD_A: [number, number][] = [
  [41.0, -8.62],
  [41.0, -8.6],
];
/** A second synthetic road, 5 km north. */
export const ROAD_B: [number, number][] = [
  [41.045, -8.62],
  [41.045, -8.6],
];

export const EV = "test-evidence";

export function geometry(id: string, line: [number, number][], opts: { directional?: boolean; verification?: "INTERPRETED" | "UNVERIFIED" } = {}): GeometryRecord {
  return {
    id,
    label: id,
    legalDescriptionEvidence: [EV],
    status: "RESOLVED",
    resolved: {
      kind: "polylines",
      lines: [line],
      toleranceM: 30,
      minMatchLengthM: 200,
      maxHeadingDiffDeg: 30,
      directional: opts.directional,
      verification: opts.verification ?? "INTERPRETED",
      mappingMethod: "test",
      evidence: [EV],
    },
  };
}

export function closure(id: string, geometryId: string, when: Partial<TemporalRule> & { activePeriods?: ActivePeriod[] }, extra: Partial<RegulationRecord> = {}): RegulationRecord {
  return {
    id,
    kind: "ROAD_CLOSURE",
    version: 1,
    title: id,
    jurisdiction: "PT",
    authority: "test",
    instrument: "test",
    legalStatus: "VERIFIED",
    effect: "prohibited",
    effective: { from: "2020-01-01", evidence: [EV] },
    appliesTo: { kind: "all", of: [] },
    location: { geometryId },
    when: { timeZone: "Europe/Lisbon", timeZoneEvidence: [EV], ...when },
    exceptions: [],
    evidence: [{ id: EV, authority: "test", instrument: "test", url: "https://example.test", retrievedAt: "2026-09-30", verification: "VERIFIED", quote: "q", locator: "l" }],
    openQuestions: [],
    ...extra,
  };
}

export function period(start: string, end: string): ActivePeriod {
  return { start, end, evidence: [EV] };
}

export function dataset(regs: RegulationRecord[], geoms: GeometryRecord[]): RegulationDataset {
  return { ...REGULATION_DATASET, id: "test", version: "t1", regulations: regs, geometries: geoms, areas: [] };
}

/**
 * Route along `line` from its first to last point (plus approach/exit stubs west/east),
 * entering the constrained line at `enterIso`, travelling at `kmh`.
 */
export function routeAlong(line: [number, number][], enterIso: string, kmh = 60, reverse = false): RouteGeometryInput {
  const [a, b] = reverse ? [line[1]!, line[0]!] : [line[0]!, line[1]!];
  const dLon = b[1] - a[1];
  const pre: [number, number] = [a[0], a[1] - dLon * 0.5];
  const post: [number, number] = [b[0], b[1] + dLon * 0.5];
  const pts: [number, number][] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) pts.push([pre[0] + (post[0] - pre[0]) * (i / steps), pre[1] + (post[1] - pre[1]) * (i / steps)]);
  const totalKm = (Math.abs(post[1] - pre[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180));
  const totalMs = (totalKm / kmh) * 3_600_000;
  const t0 = Date.parse(enterIso) - totalMs / 4; // line starts at 1/4 of the way
  return { points: pts, pointTimesMs: pts.map((_, i) => t0 + (totalMs * i) / steps), timesAreEstimates: true };
}

export function input(route: RouteGeometryInput): EvaluationInput {
  return { route, stops: [], facts: {} };
}

/** Local Lisbon wall time → ISO UTC (explicit offset given by the caller). */
export const at = (localWithOffset: string) => new Date(localWithOffset).toISOString();
