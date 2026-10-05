import { candidateContentHash, emptyFields, field, geometryField, type ParsedCandidate } from "../candidate";
import { allTagTexts, firstTagText, normalizeWs, parseTimestamp } from "../text";
import type { CandidateCategory, CandidateGeometry, ExtractionError, ParseOutput, RawSnapshot } from "../types";

/*
 * DATEX II v3 SituationPublication (subset actually used by Porto's feeds):
 * situation → situationRecord (xsi:type), validity/overallStartTime|EndTime,
 * generalPublicComment, locationReference (AreaLocation gmlMultiPolygon, or
 * gmlLineString / pointByCoordinates), roadOrCarriagewayOrLaneManagementType,
 * forVehiclesWithCharacteristicsOf.
 *
 * String-based on purpose (no DOMParser in Node tests, and the payload is ~4 MB).
 * Anything not understood becomes an issue on the record — never a guessed value.
 */

export const DATEX2_PARSER_VERSION = 1;

const MANAGEMENT_CATEGORY: Record<string, CandidateCategory> = {
  roadClosed: "ROAD_CLOSURE",
  carriagewayClosures: "ROAD_CLOSURE",
  laneClosures: "LANE_CLOSURE",
  narrowLanes: "LANE_CLOSURE",
  singleAlternateLineTraffic: "LANE_CLOSURE",
};

function categoryFor(recordType: string, mgmtType: string | undefined): { value: CandidateCategory; basis: string } {
  if (recordType === "RoadOrCarriagewayOrLaneManagement" && mgmtType) {
    return { value: MANAGEMENT_CATEGORY[mgmtType] ?? "OTHER", basis: `roadOrCarriagewayOrLaneManagementType = ${mgmtType}` };
  }
  if (recordType === "MaintenanceWorks" || recordType === "ConstructionWorks" || recordType === "Roadworks") {
    return { value: "ROADWORKS", basis: `xsi:type = ${recordType}` };
  }
  if (recordType === "Accident") return { value: "INCIDENT", basis: `xsi:type = ${recordType}` };
  if (/Obstruction$/.test(recordType)) return { value: "OBSTRUCTION", basis: `xsi:type = ${recordType}` };
  return { value: "OTHER", basis: `xsi:type = ${recordType}` };
}

/** DATEX gml posList is "lat lon lat lon …" (EPSG:4326 axis order). */
function posList(text: string): [number, number][] | null {
  const n = text.trim().split(/\s+/).map(Number);
  if (n.length < 4 || n.length % 2 !== 0 || n.some((x) => !Number.isFinite(x))) return null;
  const out: [number, number][] = [];
  for (let i = 0; i < n.length; i += 2) {
    const lat = n[i]!, lng = n[i + 1]!;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    out.push([lat, lng]);
  }
  return out;
}

function geometryOf(rec: string, issues: string[]): CandidateGeometry | null {
  const polys = allTagTexts(rec, "loc:gmlPolygon");
  if (polys.length) {
    const rings: [number, number][][] = [];
    for (const p of polys) {
      const ext = firstTagText(p, "loc:exterior");
      const pl = ext ? posList(firstTagText(ext, "loc:posList") ?? "") : null;
      if (pl && pl.length >= 3) rings.push(pl);
      else issues.push("polígono com posList inválida (ignorado)");
    }
    return rings.length ? { kind: "polygons", rings } : null;
  }
  const lines = allTagTexts(rec, "loc:gmlLineString").map((l) => posList(firstTagText(l, "loc:posList") ?? ""));
  if (lines.length) {
    const ok = lines.filter((l): l is [number, number][] => !!l && l.length >= 2);
    if (ok.length < lines.length) issues.push("linha com posList inválida (ignorada)");
    return ok.length ? { kind: "lines", lines: ok } : null;
  }
  const lat = Number(firstTagText(rec, "loc:latitude"));
  const lng = Number(firstTagText(rec, "loc:longitude"));
  if (Number.isFinite(lat) && Number.isFinite(lng) && firstTagText(rec, "loc:latitude") !== undefined) return { kind: "point", point: [lat, lng] };
  if (/<sit:locationReference/.test(rec)) issues.push("tipo de localização não suportado (ex.: ALERT-C/TPEG) — geometria desconhecida");
  return null;
}

/** dd/mm/yyyy dates mentioned in free text (to detect conflicts with structured validity). */
function datesInText(text: string): string[] {
  return [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map(
    (m) => `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`,
  );
}

export function parseDatex2(snapshot: RawSnapshot): ParseOutput {
  const body = snapshot.body;
  const errors: ExtractionError[] = [];
  if (!/<(\w+:)?payload[\s>]/.test(body) || !/SituationPublication/.test(body)) {
    return {
      candidates: [],
      errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: "não é uma SituationPublication DATEX II" }],
      recordCount: 0,
    };
  }
  const pubRaw = firstTagText(body, "com:publicationTime");
  const pub = parseTimestamp(pubRaw);

  const candidates: ParsedCandidate[] = [];
  const records = body.split(/<sit:situationRecord\s/).slice(1);
  for (const chunk of records) {
    const rec = chunk.split("</sit:situationRecord>")[0]!;
    const id = rec.match(/^[^>]*\bid="([^"]+)"/)?.[1];
    const recordType = rec.match(/^[^>]*xsi:type="(?:\w+:)?(\w+)"/)?.[1] ?? "?";
    if (!id) {
      errors.push({ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: "situationRecord sem id" });
      continue;
    }
    const issues: string[] = [];
    const fields = emptyFields();
    const mgmt = firstTagText(rec, "sit:roadOrCarriagewayOrLaneManagementType")?.trim();
    const cat = categoryFor(recordType, mgmt);
    fields.category = field("VERIFIED", cat.value, cat.basis);

    const start = parseTimestamp(firstTagText(rec, "com:overallStartTime"));
    const end = parseTimestamp(firstTagText(rec, "com:overallEndTime"));
    if (start) {
      fields.validity = field(
        "VERIFIED",
        { start: start.iso, ...(end ? { end: end.iso } : {}) },
        "validity/validityTimeSpecification/overallStartTime|overallEndTime",
        [start.naive || end?.naive ? "Hora sem fuso na fonte — lida como UTC (interpretação)." : "", end ? "" : "Sem data de fim indicada."].filter(Boolean).join(" ") || undefined,
      );
    } else issues.push("sem hora de início válida");
    if (/<com:validPeriod|<com:recurringTimePeriodOfDay|<com:recurringDayWeekMonthPeriod/.test(rec)) {
      issues.push("A validade tem períodos recorrentes que este parser não interpreta — só a validade global foi lida.");
    }

    const comments = allTagTexts(rec, "com:value").map(normalizeWs).filter(Boolean);
    const comment = comments.join(" · ");
    if (comment) fields.description = field("VERIFIED", comment, "generalPublicComment");
    if (/\b\d{1,2}\s*h\s*\d{0,2}\s*[/-]\s*\d{1,2}\s*h/i.test(comment)) {
      issues.push(`O comentário indica um horário («${comment}») que não está na validade estruturada.`);
    }
    if (end) {
      const endDay = end.iso.slice(0, 10);
      const conflicting = datesInText(comment).filter((d) => d !== endDay && /at[eé]|prorroga/i.test(comment));
      if (conflicting.length) {
        issues.push(`Conflito: o comentário indica ${conflicting.join(", ")}, a validade estruturada termina em ${endDay}.`);
      }
    }

    const geom = geometryOf(rec, issues);
    if (geom) {
      fields.geometry = geometryField("VERIFIED", geom, "VERIFIED", "locationReference", geom.kind === "polygons" ? "Área (polígono) — não indica que atravessamentos estão impedidos." : undefined);
    }

    const vehicles = firstTagText(rec, "sit:forVehiclesWithCharacteristicsOf");
    if (vehicles) {
      fields.vehicleApplicability = field("VERIFIED", { kind: "conditions", text: normalizeWs(vehicles.replace(/<[^>]+>/g, " ")) }, "forVehiclesWithCharacteristicsOf");
    } else if (cat.value === "ROAD_CLOSURE") {
      fields.vehicleApplicability = field(
        "INTERPRETED",
        { kind: "all_traffic" },
        "ausência de forVehiclesWithCharacteristicsOf",
        "DATEX sem restrição de veículos num corte — lido como aplicável a todo o trânsito.",
      );
    }
    const dir = firstTagText(rec, "loc:directionRelativeOnLinearSection") ?? firstTagText(rec, "loc:directionBoundOnLinearSection");
    if (dir) fields.direction = field("VERIFIED", normalizeWs(dir), "direction");
    const roadName = firstTagText(rec, "loc:roadName") ?? firstTagText(rec, "loc:roadNumber");
    if (roadName) fields.roads = field("VERIFIED", [normalizeWs(roadName.replace(/<[^>]+>/g, " "))], "roadName/roadNumber");

    const externalId = id;
    const title = `${recordType}${mgmt ? ` (${mgmt})` : ""}${comment ? ` — ${comment.slice(0, 80)}` : ""}`;
    candidates.push({
      id: `${snapshot.sourceId}:${externalId}`,
      sourceId: snapshot.sourceId,
      externalId,
      title,
      fields,
      extraction: { kind: "parser", parser: "datex2-situations", version: DATEX2_PARSER_VERSION },
      snapshotId: snapshot.id,
      contentHash: candidateContentHash(title, fields),
      issues,
    });
  }
  return {
    candidates,
    errors,
    recordCount: records.length,
    ...(pub ? { publishedAt: pub.iso, publishedAtBasis: `DATEX publicationTime${pub.naive ? " (sem fuso — lido como UTC)" : ""}` } : {}),
  };
}
