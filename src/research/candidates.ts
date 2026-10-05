import { candidateContentHash, emptyFields, field } from "../ingestion/candidate";
import { fromLocalMinute } from "../ingestion/time";
import type { CandidateCategory, CandidateFields, ParseOutput, VehicleApplicability } from "../ingestion/types";
import { nameTokens, resolveEventGeometry, type ChainageReference, type GeometryResolution, type NamedSegmentReference } from "./geometryResolution";
import type { EventKind, SemanticEvent, SemanticExtraction, TemporalSpec, Valued, VehicleSpec } from "./semantic/schema";
import { interpretTemporal, OPEN_END, type TemporalInterpretation } from "./semantic/temporal";
import type { FieldEvidence } from "./types";

/*
 * SemanticExtraction → CandidateConstraint (the existing 3B shape), one per event.
 * The candidate enters the SAME trust gate / review boundary as every other candidate;
 * there is no shortcut from agent output to route evaluation.
 */

export type ResearchCandidateMeta = {
  documentUrl: string;
  snapshotId: string;
  /** Same official document series across revisions (URL with the numeric revision suffix removed). */
  seriesKey: string;
  eventIndex: number;
  eventKind: EventKind | null;
  temporal: { spec: TemporalSpec | null; interpretation: TemporalInterpretation | null };
  vehicles: VehicleSpec | null;
  geometry: GeometryResolution;
  provenance: "MACHINE_EXTRACTED";
  extractionRunId: string;
  injectionSignals: string[];
  authorityId?: string;
  /** Candidate ids this one disagrees with (filled by conflict detection). */
  conflicts?: string[];
};

const CATEGORY: Record<EventKind, CandidateCategory> = {
  ROAD_CLOSURE: "ROAD_CLOSURE",
  CARRIAGEWAY_CLOSURE: "ROAD_CLOSURE",
  VEHICLE_PROHIBITION: "LEGAL_ACT",
  LANE_RESTRICTION: "LANE_CLOSURE",
  ALTERNATING_TRAFFIC: "LANE_CLOSURE",
  ROADWORKS: "ROADWORKS",
  OTHER: "OTHER",
};

/** Document series: same URL path with a trailing numeric revision suffix ("…-16", "…-17") removed. */
export function seriesKeyOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/-\d{1,3}$/, "").replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

const quoteOf = (v: NonNullable<Valued<unknown>>) => v.evidence.map((e) => e.quote).join(" … ");

function vehicleField(v: Valued<VehicleSpec>): CandidateFields["vehicleApplicability"] {
  if (!v) return { state: "UNKNOWN", note: "O texto não indica a que veículos se aplica — nada foi presumido." };
  const s = v.value;
  const value: VehicleApplicability =
    s.scope === "ALL_TRAFFIC"
      ? { kind: "all_traffic" }
      : { kind: "conditions", text: [`${v.sourceWording}`, ...s.conditions.map((c) => c.sourceWording), ...s.exceptions.map((x) => `exceção: ${x.text}`)].join("; ") };
  return field(v.certainty === "EXPLICIT" && s.scope === "ALL_TRAFFIC" ? "VERIFIED" : "INTERPRETED", value, quoteOf(v), v.note ?? `Âmbito «${s.scope}» lido do texto (não colapsado: «${v.sourceWording}»).`);
}

export type ToCandidatesInput = {
  extraction: SemanticExtraction;
  extractionRunId: string;
  engine: "RULES" | "LLM";
  model?: string;
  sourceId: string;
  authorityId?: string;
  documentUrl: string;
  snapshotId: string;
  documentTitle: string;
  documentText: string;
  refs: NamedSegmentReference[];
  chainage: ChainageReference | null;
};

/**
 * Stable identity of an event within a document series: WHERE it is (normalised junction names,
 * PK, direction) and its occurrence, not its position in the text — so a weekly notice whose
 * nights move is diffed segment by segment.
 */
function eventKeys(events: SemanticEvent[]): string[] {
  const seen = new Map<string, number>();
  return events.map((e, i) => {
    const where =
      e.nodes?.value.map((n) => [nameTokens(n.from).join("-"), nameTokens(n.to).join("-")].sort().join("--")).join("+") ||
      e.pk.map((p) => `${p.road}-km${p.km}`).join("+") ||
      `evento${i + 1}`;
    const dir = e.direction ? `@${nameTokens(e.direction.value).join("-")}` : "";
    const base = `${(e.roads?.value ?? []).join("-").toLowerCase()}:${where}${dir}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}~${n}`;
  });
}

export function extractionToCandidates(x: ToCandidatesInput): ParseOutput["candidates"] {
  const ex = x.extraction;
  const method = `${ex.extractorId}@${ex.extractorVersion}`;
  const seriesKey = seriesKeyOf(x.documentUrl);
  const keys = eventKeys(ex.events);
  return ex.events.map((e, i) => {
    const evidence: FieldEvidence[] = [];
    const add = (name: string, v: Valued<unknown>) => {
      if (v) evidence.push({ field: name, value: v.value, sourceWording: v.sourceWording, evidence: v.evidence, provenance: "MACHINE_EXTRACTED", method, certainty: v.certainty, ...(v.note ? { note: v.note } : {}) });
    };
    add("kind", e.kind);
    add("roads", e.roads);
    add("location", e.locationText);
    add("nodes", e.nodes);
    add("municipalities", e.municipalities);
    add("direction", e.direction);
    add("temporal", e.temporal);
    add("vehicles.scope", e.vehicles ? { ...e.vehicles, value: e.vehicles.value.scope } : null);
    add("diversion", e.diversion);
    for (const p of e.pk) evidence.push({ field: "pk", value: { road: p.road, km: p.km }, sourceWording: p.sourceWording, evidence: p.evidence, provenance: "MACHINE_EXTRACTED", method, certainty: "EXPLICIT" });
    for (const c of e.vehicles?.value.conditions ?? []) evidence.push({ field: `vehicles.condition.${c.condition.kind}`, value: c.condition, sourceWording: c.sourceWording, evidence: c.evidence, provenance: "MACHINE_EXTRACTED", method, certainty: "EXPLICIT" });
    for (const c of e.vehicles?.value.exceptions ?? []) evidence.push({ field: "vehicles.exception", value: c.text, sourceWording: c.text, evidence: c.evidence, provenance: "MACHINE_EXTRACTED", method, certainty: "EXPLICIT" });

    const issues = [...ex.issues.filter((s) => s.startsWith(`evento ${i + 1}:`) || !/^evento \d+:/.test(s))];
    const fields = emptyFields();
    if (e.kind) fields.category = field(e.kind.certainty === "EXPLICIT" ? "VERIFIED" : "INTERPRETED", CATEGORY[e.kind.value], quoteOf(e.kind), e.kind.note ?? `tipo «${e.kind.value}»`);
    if (e.roads) fields.roads = field(e.roads.certainty === "EXPLICIT" ? "VERIFIED" : "INTERPRETED", e.roads.value, quoteOf(e.roads), e.roads.note);
    if (e.locationText) fields.locationText = field(e.locationText.certainty === "EXPLICIT" ? "VERIFIED" : "INTERPRETED", e.locationText.value, quoteOf(e.locationText), e.locationText.note);
    if (e.direction) fields.direction = field("VERIFIED", e.direction.value, quoteOf(e.direction));
    if (e.diversion) fields.diversion = field(e.diversion.certainty === "EXPLICIT" ? "VERIFIED" : "INTERPRETED", e.diversion.value, quoteOf(e.diversion), e.diversion.note);
    fields.vehicleApplicability = vehicleField(e.vehicles);
    fields.description = field("VERIFIED", x.documentText, "texto integral do documento (representação preservada)");

    let interpretation: TemporalInterpretation | null = null;
    if (e.temporal) {
      interpretation = interpretTemporal(e.temporal.value);
      if (interpretation.periods.length) {
        const clean = e.temporal.certainty === "EXPLICIT" && interpretation.ambiguities.length === 0;
        fields.periods = field(clean ? "VERIFIED" : "INTERPRETED", interpretation.periods, quoteOf(e.temporal), [e.temporal.note, ...interpretation.ambiguities].filter(Boolean).join("; ") || undefined);
        evidence.push({ field: "periods", value: interpretation.periods, evidence: e.temporal.evidence, provenance: "DETERMINISTIC", method: "temporal-interpretation@1", certainty: clean ? "EXPLICIT" : "INTERPRETED", note: "períodos datados derivados deterministicamente da regra temporal extraída" });
        const starts = interpretation.periods.map((p) => fromLocalMinute(p.start)).filter((v): v is number => v !== null);
        const ends = interpretation.periods.filter((p) => p.end !== OPEN_END).map((p) => fromLocalMinute(p.end)).filter((v): v is number => v !== null);
        if (starts.length) {
          fields.validity = field("DERIVED", { start: new Date(Math.min(...starts)).toISOString(), ...(!interpretation.openEnded && ends.length ? { end: new Date(Math.max(...ends)).toISOString() } : {}) }, "primeiro início / último fim dos períodos interpretados", interpretation.openEnded ? "sem fim indicado pela fonte" : undefined);
        }
      }
      issues.push(...interpretation.ambiguities);
    }
    const geometry = resolveEventGeometry(e, x.refs, x.chainage);
    fields.geometry = { state: "UNKNOWN", provenance: "UNKNOWN", note: `${geometry.reason}${geometry.geometryIds.length ? ` (referência candidata: ${geometry.geometryIds.join(", ")} — requer confirmação)` : ""}` };
    if (geometry.status !== "RESOLVED_REFERENCE") issues.push(`geometria: ${geometry.reason}`);
    if (ex.injectionSignals.length) issues.push(`documento contém ${ex.injectionSignals.length} instrução(ões) dirigida(s) a sistemas automáticos — ignoradas`);

    const label = [e.kind?.value, e.roads?.value.join("/"), e.direction?.value, e.locationText?.value].filter(Boolean).join(" · ");
    const title = `${x.documentTitle} — ${label || `evento ${i + 1}`}`;
    const externalId = `${seriesKey}#${keys[i]}`;
    return {
      id: `${x.sourceId}:${externalId}`,
      sourceId: x.sourceId,
      externalId,
      title,
      fields,
      extraction: { kind: "semantic" as const, extractorId: ex.extractorId, extractorVersion: ex.extractorVersion, schemaVersion: ex.schemaVersion, engine: x.engine, ...(x.model ? { model: x.model } : {}) },
      snapshotId: x.snapshotId,
      contentHash: candidateContentHash(title, fields),
      issues: [...new Set(issues)],
      evidence,
      research: {
        documentUrl: x.documentUrl,
        snapshotId: x.snapshotId,
        seriesKey,
        eventIndex: i,
        eventKind: e.kind?.value ?? null,
        temporal: { spec: e.temporal?.value ?? null, interpretation },
        vehicles: e.vehicles?.value ?? null,
        geometry,
        provenance: "MACHINE_EXTRACTED" as const,
        extractionRunId: x.extractionRunId,
        injectionSignals: ex.injectionSignals,
        ...(x.authorityId ? { authorityId: x.authorityId } : {}),
      },
    };
  });
}

export type { SemanticEvent };

/**
 * Field evidence for STRUCTURED (deterministic parser) candidates: each value is
 * AUTHORITY_SUPPLIED at a structured path of the preserved snapshot (no prose quote needed).
 */
export function structuredFieldEvidence(c: { fields: CandidateFields; extraction: { kind: string; parser?: string; version?: number }; snapshotId: string }): FieldEvidence[] {
  if (c.extraction.kind !== "parser") return [];
  const method = `${c.extraction.parser}@${c.extraction.version}`;
  return (Object.entries(c.fields) as [string, { state: string; value?: unknown; basis?: string; note?: string }][])
    .filter(([, f]) => f.state !== "UNKNOWN" && f.value !== undefined && f.basis)
    .map(([name, f]) => ({
      field: name,
      value: f.value,
      evidence: [{ snapshotId: c.snapshotId, representation: "structured", location: { start: 0, end: 0, path: f.basis! }, quote: f.basis! }],
      provenance: f.state === "DERIVED" ? ("DETERMINISTIC" as const) : ("AUTHORITY_SUPPLIED" as const),
      method,
      certainty: f.state === "INTERPRETED" ? ("INTERPRETED" as const) : ("EXPLICIT" as const),
      ...(f.note ? { note: f.note } : {}),
    }));
}
