import type { BBox, Evidence, GeometryRecord, RegulationRecord } from "../regulations/types";
import { toLocalMinute, LISBON } from "./time";
import type { CandidateConstraint, SourceRecord } from "./types";

/*
 * ACTIVE / ACTIVE_SCREENING_ONLY candidates → the SAME RoadConstraint shape the Phase 2.5
 * evaluator already consumes. No evaluator change: screening-only candidates become
 * UNRESOLVED geometry with a screening bbox (can only rule a route OUT, never IN).
 */

/** Open-ended validity is represented with this local end (disclosed as "sem fim indicado"). */
export const OPEN_END_LOCAL = "9999-12-31T00:00";

function bboxOf(points: [number, number][], padDeg = 0.0005): BBox {
  let south = 90, north = -90, west = 180, east = -180;
  for (const [lat, lng] of points) {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lng); east = Math.max(east, lng);
  }
  return { south: south - padDeg, west: west - padDeg, north: north + padDeg, east: east + padDeg };
}

export function candidateToConstraint(
  c: CandidateConstraint,
  source: SourceRecord,
  retrievedAt: string,
): { constraint: RegulationRecord; geometry: GeometryRecord } | null {
  if (c.gate.decision !== "ACTIVE" && c.gate.decision !== "ACTIVE_SCREENING_ONLY") return null;
  const g = c.fields.geometry.value;
  const v = c.fields.validity.value;
  if (!g || g.kind === "point" || !v) return null;

  const synthetic = !!source.synthetic;
  const evId = `ing-${c.id}`;
  const evidence: Evidence[] = [
    {
      id: evId,
      authority: source.authority,
      instrument: source.name,
      locator: `registo ${c.externalId}`,
      url: source.landingUrl,
      retrievedAt: retrievedAt.slice(0, 10),
      ...(c.fields.description.value ? { quote: c.fields.description.value.slice(0, 300) } : {}),
      verification: synthetic ? "UNVERIFIED" : "VERIFIED",
      note: `${synthetic ? "TESTE SINTÉTICO (não oficial). " : ""}Ingerido automaticamente (${c.extraction.kind === "parser" ? `parser ${c.extraction.parser} v${c.extraction.version}` : "IA"}); snapshot ${c.snapshotId}.`,
    },
    {
      id: `${evId}-gate`,
      authority: "FleetOS",
      instrument: "Trust gate de ingestão",
      url: source.landingUrl,
      retrievedAt: retrievedAt.slice(0, 10),
      verification: "INTERPRETED",
      note: c.gate.reasons.join(" ") || "Aprovado pelo trust gate.",
    },
  ];

  const geomId = `ing-geom-${c.id}`;
  const points = g.kind === "polygons" ? g.rings.flat() : g.lines.flat();
  const geometry: GeometryRecord =
    c.gate.decision === "ACTIVE" && g.kind === "lines"
      ? {
          id: geomId,
          label: c.fields.locationText.value ?? c.title,
          legalDescriptionEvidence: [evId],
          status: "RESOLVED",
          resolved: {
            kind: "polylines",
            lines: g.lines,
            toleranceM: 30,
            minMatchLengthM: 100,
            maxHeadingDiffDeg: 30,
            verification: "VERIFIED",
            mappingMethod: "geometria linear publicada pela fonte",
            evidence: [evId],
          },
          screeningArea: { bbox: bboxOf(points), method: "envolvente da geometria publicada", evidence: [evId] },
        }
      : {
          id: geomId,
          label: c.fields.locationText.value ?? c.title,
          legalDescriptionEvidence: [evId],
          status: "UNRESOLVED",
          screeningArea: {
            bbox: bboxOf(points),
            method: g.kind === "polygons" ? "envolvente do polígono publicado (só triagem)" : "envolvente da geometria (fonte desatualizada — só triagem)",
            evidence: [evId, `${evId}-gate`],
          },
        };

  const startMs = Date.parse(v.start);
  const endMs = v.end ? Date.parse(v.end) : NaN;
  const periods = c.fields.periods.value?.length
    ? c.fields.periods.value
    : [{ start: toLocalMinute(startMs, LISBON), end: Number.isFinite(endMs) ? toLocalMinute(endMs, LISBON) : OPEN_END_LOCAL }];

  const constraint: RegulationRecord = {
    id: `ing-${c.id}`,
    kind: "ROAD_CLOSURE",
    version: parseInt(c.contentHash.slice(0, 7), 16),
    title: `${synthetic ? "[TESTE SINTÉTICO] " : ""}${c.title}`,
    jurisdiction: "PT",
    authority: source.authority,
    instrument: source.name,
    // Synthetic test data can never establish a verified violation.
    legalStatus: synthetic ? "INTERPRETED" : "VERIFIED",
    effect: "prohibited",
    effective: { from: toLocalMinute(startMs, LISBON).slice(0, 10), evidence: [evId] },
    appliesTo: { kind: "all", of: [] },
    location: { geometryId: geomId },
    when: {
      timeZone: LISBON,
      timeZoneEvidence: [`${evId}-gate`],
      activePeriods: periods.map((p) => ({ ...p, evidence: [evId] })),
    },
    exceptions: [],
    evidence,
    origin: { kind: "ingested_auto", sourceId: source.id, sourceName: source.name, candidateId: c.id, synthetic },
    openQuestions: [
      ...(synthetic ? ["DADOS DE TESTE SINTÉTICOS — não é uma publicação oficial."] : []),
      ...c.gate.reasons,
      ...(Number.isFinite(endMs) ? [] : ["Sem data de fim indicada pela fonte — considerado em vigor até deixar de constar."]),
    ],
  };
  return { constraint, geometry };
}
