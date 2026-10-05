import { canonicalJson, hashString } from "../regulations/decisionInputs";
import { haversineM } from "../regulations/geometry";
import type { Condition, Evidence, GeometryRecord, RegulationRecord } from "../regulations/types";
import { normalizeWs } from "./text";
import { fromLocalMinute, LISBON, toLocalMinute } from "./time";
import { OPEN_END_LOCAL } from "./toConstraint";
import type { CandidateConstraint, Freshness, SourceRecord } from "./types";

/*
 * Human review bridge: REVIEW_REQUIRED → reviewer resolves what the source does not
 * establish → accepted RoadConstraint → the normal deterministic evaluator.
 *
 * Rules:
 * - Approval never "trusts the extractor": every operational field must be explicitly
 *   resolved (geometry, vehicle applicability, time), and the decision must cite a
 *   verbatim snippet of the source text.
 * - Human-resolved values are labelled HUMAN_RESOLVED — never VERIFIED.
 * - The candidate as seen at decision time is frozen into the review event; the source
 *   evidence is never modified.
 * - History is append-only (approve / reject / revoke). Nothing is deleted.
 * - Only candidates the gate stopped at REVIEW_REQUIRED can be reviewed; a human cannot
 *   switch off an automatically accepted official constraint.
 */

export const REVIEW_SCHEMA_VERSION = 1;

/** Mainland Portugal envelope (reviewed geometry must fall inside). */
const PT_BBOX = { south: 36.8, north: 42.2, west: -9.6, east: -6.1 };
const MAX_VERTEX_GAP_M = 2_000;
const MIN_LINE_LENGTH_M = 50;
/** Reviewed geometry must pass this close to the point the source reported. */
const MAX_DISTANCE_FROM_SOURCE_POINT_M = 1_000;
const MAX_PERIOD_DAYS = 366;

export type ReviewedGeometry =
  /** The candidate's own source geometry (only when the source supplied lines). */
  | { kind: "source_lines" }
  /** An already resolved geometry from the curated dataset. */
  | { kind: "curated"; geometryId: string }
  /** Drawn/entered by the reviewer ([lat, lng]). */
  | { kind: "reviewer_lines"; lines: [number, number][][] };

export type ReviewedVehicles = { kind: "all_traffic" } | { kind: "gross_weight_over_kg"; kg: number };

export type ReviewedTemporal =
  /** Use the source's validity (start required; open end must be confirmed). */
  | { kind: "source_validity"; confirmOpenEnded: boolean }
  /** Local (Europe/Lisbon) periods "YYYY-MM-DDTHH:MM". */
  | { kind: "periods"; periods: { start: string; end: string }[] };

export type ReviewResolution = {
  /** Reviewer confirms the event prohibits passage (only closures can be activated). */
  confirmClosure: boolean;
  /** Verbatim snippet of the source text supporting the decision. */
  evidenceQuote: string;
  geometry?: ReviewedGeometry;
  vehicles?: ReviewedVehicles;
  temporal?: ReviewedTemporal;
  note?: string;
};

/** MACHINE_EXTRACTED: read by an extractor from prose; a reviewer's approval does not turn it into SOURCE_VERIFIED. */
export type FieldProvenance = "SOURCE_VERIFIED" | "SOURCE_DERIVED" | "SOURCE_INTERPRETED" | "MACHINE_EXTRACTED" | "HUMAN_RESOLVED";

export type ReviewEvent = {
  at: string;
  reviewer: string;
  action: "APPROVED" | "REJECTED" | "REVOKED";
  reason?: string;
  resolution?: ReviewResolution;
  /** Provenance of every operational field at approval. */
  provenance?: Record<"category" | "geometry" | "vehicles" | "temporal", FieldProvenance>;
  /** The candidate exactly as reviewed (source evidence preserved). */
  candidate: CandidateConstraint;
  candidateContentHash: string;
  /** Constraint dataset version in force when the decision was taken. */
  datasetVersion?: string;
};

export type ReviewRecord = {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  candidateId: string;
  sourceId: string;
  history: ReviewEvent[];
};

export type ReviewState = "APPROVED" | "REJECTED" | "REVOKED";
export const reviewState = (r: ReviewRecord): ReviewState => r.history.at(-1)!.action;

/* ─── Validation ─── */

function sourceText(c: CandidateConstraint): string {
  return normalizeWs([c.title, c.fields.description.value ?? "", c.fields.locationText.value ?? ""].join(" "));
}

function validateLines(lines: unknown, c: CandidateConstraint): string[] {
  const p: string[] = [];
  if (!Array.isArray(lines) || lines.length === 0) return ["geometria revista vazia"];
  let total = 0;
  for (const [li, line] of lines.entries()) {
    if (!Array.isArray(line) || line.length < 2) {
      p.push(`linha ${li + 1}: precisa de pelo menos 2 pontos`);
      continue;
    }
    for (const [i, pt] of line.entries()) {
      if (!Array.isArray(pt) || pt.length !== 2 || !pt.every((x) => typeof x === "number" && Number.isFinite(x))) {
        p.push(`linha ${li + 1}, ponto ${i + 1}: coordenada inválida`);
        continue;
      }
      const [lat, lng] = pt as [number, number];
      if (lat < PT_BBOX.south || lat > PT_BBOX.north || lng < PT_BBOX.west || lng > PT_BBOX.east) {
        p.push(`linha ${li + 1}, ponto ${i + 1}: fora de Portugal continental (lat, lng trocados?)`);
      }
      if (i > 0) {
        const d = haversineM(line[i - 1] as [number, number], pt as [number, number]);
        if (d > MAX_VERTEX_GAP_M) p.push(`linha ${li + 1}: pontos ${i}–${i + 1} a ${Math.round(d)} m (máx. ${MAX_VERTEX_GAP_M} m)`);
        total += d;
      }
    }
  }
  if (p.length) return p;
  if (total < MIN_LINE_LENGTH_M) p.push(`geometria demasiado curta (${Math.round(total)} m)`);
  const g = c.fields.geometry.value;
  if (g?.kind === "point") {
    const nearest = Math.min(...(lines as [number, number][][]).flat().map((q) => haversineM(q, g.point)));
    if (nearest > MAX_DISTANCE_FROM_SOURCE_POINT_M) {
      p.push(`geometria revista a ${Math.round(nearest)} m do ponto indicado pela fonte (máx. ${MAX_DISTANCE_FROM_SOURCE_POINT_M} m)`);
    }
  }
  return p;
}

function validateLocal(s: unknown): number | null {
  return typeof s === "string" ? fromLocalMinute(s) : null;
}

export type ApprovalCheck = { ok: boolean; problems: string[]; unresolved: string[] };

/** Everything that blocks approval, and which facts are still unresolved. */
export function checkApproval(
  c: CandidateConstraint,
  source: SourceRecord | undefined,
  r: ReviewResolution,
  reviewer: string,
  curated: GeometryRecord[],
  now: Date,
): ApprovalCheck {
  const problems: string[] = [];
  const unresolved: string[] = [];
  if (!source) problems.push("fonte não registada");
  if (c.gate.decision !== "REVIEW_REQUIRED") problems.push(`só candidatos REVIEW_REQUIRED podem ser revistos (estado: ${c.gate.decision})`);
  if (!reviewer.trim()) problems.push("indique o nome do revisor");

  if (!r.confirmClosure) unresolved.push("confirmar que o evento proíbe a passagem (corte)");
  const quote = normalizeWs(r.evidenceQuote ?? "");
  if (quote.length < 10) unresolved.push("citar o excerto da fonte que suporta a decisão");
  else if (!sourceText(c).includes(quote)) problems.push("o excerto citado não existe no texto da fonte");

  // Geometry
  const geom = r.geometry;
  if (!geom) unresolved.push("geometria operacional");
  else if (geom.kind === "source_lines") {
    if (c.fields.geometry.value?.kind !== "lines") problems.push("a fonte não forneceu linhas — indique a geometria");
  } else if (geom.kind === "curated") {
    const g = curated.find((x) => x.id === geom.geometryId);
    if (!g) problems.push(`geometria curada «${geom.geometryId}» não existe`);
    else if (g.status !== "RESOLVED" || !g.resolved || g.resolved.verification === "UNVERIFIED") problems.push(`geometria curada «${geom.geometryId}» não está resolvida/verificada`);
  } else if (geom.kind === "reviewer_lines") problems.push(...validateLines(geom.lines, c));
  else problems.push("tipo de geometria desconhecido");

  // Vehicles
  const v = r.vehicles;
  if (!v) unresolved.push("aplicabilidade a veículos");
  else if (v.kind === "gross_weight_over_kg" && !(Number.isFinite(v.kg) && v.kg > 0 && v.kg < 100_000)) problems.push("peso bruto inválido");
  else if (v.kind !== "all_traffic" && v.kind !== "gross_weight_over_kg") problems.push("aplicabilidade desconhecida");

  // Time
  const t = r.temporal;
  if (!t) unresolved.push("período de vigência");
  else if (t.kind === "source_validity") {
    const val = c.fields.validity.value;
    if (c.fields.validity.state === "UNKNOWN" || !val) problems.push("a fonte não indica validade — indique períodos");
    else {
      if (!val.end && !t.confirmOpenEnded) unresolved.push("confirmar vigência sem fim indicado pela fonte");
      if (val.end && Date.parse(val.end) <= now.getTime()) problems.push("a validade da fonte já terminou");
    }
  } else if (t.kind === "periods") {
    if (!Array.isArray(t.periods) || t.periods.length === 0) problems.push("indique pelo menos um período");
    else {
      let anyFuture = false;
      for (const [i, p] of t.periods.entries()) {
        const s = validateLocal(p?.start), e = validateLocal(p?.end);
        if (s === null || e === null) problems.push(`período ${i + 1}: data/hora inválida ou inexistente (use AAAA-MM-DDTHH:MM, hora de Lisboa)`);
        else if (e <= s) problems.push(`período ${i + 1}: termina antes de começar`);
        else if (e - s > MAX_PERIOD_DAYS * 86_400_000) problems.push(`período ${i + 1}: mais de ${MAX_PERIOD_DAYS} dias`);
        else if (e > now.getTime()) anyFuture = true;
      }
      if (!problems.some((x) => x.startsWith("período")) && !anyFuture) problems.push("todos os períodos já terminaram");
    }
  } else problems.push("regra temporal desconhecida");

  return { ok: problems.length === 0 && unresolved.length === 0, problems, unresolved };
}

export function provenanceOf(c: CandidateConstraint, r: ReviewResolution): NonNullable<ReviewEvent["provenance"]> {
  const machine = c.extraction.kind === "semantic" || c.extraction.kind === "ai";
  const fromField = (s: string): FieldProvenance => (machine ? "MACHINE_EXTRACTED" : s === "VERIFIED" ? "SOURCE_VERIFIED" : s === "DERIVED" ? "SOURCE_DERIVED" : "SOURCE_INTERPRETED");
  return {
    category: c.fields.category.value === "ROAD_CLOSURE" && c.fields.category.state !== "UNKNOWN" ? fromField(c.fields.category.state) : "HUMAN_RESOLVED",
    geometry: r.geometry?.kind === "source_lines" ? fromField(c.fields.geometry.state) : "HUMAN_RESOLVED",
    vehicles:
      r.vehicles?.kind === "all_traffic" && !machine && c.fields.vehicleApplicability.value?.kind === "all_traffic" && c.fields.vehicleApplicability.state === "VERIFIED"
        ? "SOURCE_VERIFIED"
        : "HUMAN_RESOLVED",
    temporal: r.temporal?.kind === "source_validity" ? fromField(c.fields.validity.state) : "HUMAN_RESOLVED",
  };
}

/* ─── Actions (pure; the caller persists the returned record) ─── */

export type ReviewActionResult =
  | { ok: true; record: ReviewRecord; changed: boolean }
  | { ok: false; problems: string[] };

const resolutionKey = (r: ReviewResolution | undefined) => hashString(canonicalJson(r ?? null));

export function approveCandidate(
  existing: ReviewRecord | undefined,
  c: CandidateConstraint,
  source: SourceRecord | undefined,
  resolution: ReviewResolution,
  reviewer: string,
  curated: GeometryRecord[],
  now: Date,
  datasetVersion = "",
): ReviewActionResult {
  if (existing && reviewState(existing) === "APPROVED") {
    const last = existing.history.at(-1)!;
    // Idempotent: same candidate content + same resolution ⇒ nothing new.
    if (last.candidateContentHash === c.contentHash && resolutionKey(last.resolution) === resolutionKey(resolution)) {
      return { ok: true, record: existing, changed: false };
    }
    return { ok: false, problems: ["já aprovado com outra resolução — revogue primeiro"] };
  }
  if (existing && reviewState(existing) === "REJECTED") return { ok: false, problems: ["candidato rejeitado — não pode ser ativado"] };
  const check = checkApproval(c, source, resolution, reviewer, curated, now);
  if (!check.ok) return { ok: false, problems: [...check.problems, ...check.unresolved.map((u) => `por resolver: ${u}`)] };
  const event: ReviewEvent = {
    at: now.toISOString(),
    reviewer: reviewer.trim(),
    action: "APPROVED",
    resolution: structuredClone(resolution),
    provenance: provenanceOf(c, resolution),
    candidate: structuredClone(c),
    candidateContentHash: c.contentHash,
    datasetVersion,
    ...(resolution.note ? { reason: resolution.note } : {}),
  };
  return { ok: true, changed: true, record: appendEvent(existing, c, event) };
}

export function rejectCandidate(existing: ReviewRecord | undefined, c: CandidateConstraint, reviewer: string, reason: string, now: Date): ReviewActionResult {
  const problems: string[] = [];
  if (!reviewer.trim()) problems.push("indique o nome do revisor");
  if (reason.trim().length < 5) problems.push("indique o motivo da rejeição");
  if (c.gate.decision !== "REVIEW_REQUIRED") problems.push(`só candidatos REVIEW_REQUIRED podem ser revistos (estado: ${c.gate.decision})`);
  if (existing && reviewState(existing) === "APPROVED") problems.push("candidato aprovado — revogue a aprovação primeiro");
  if (existing && reviewState(existing) === "REJECTED") return { ok: true, record: existing, changed: false };
  if (problems.length) return { ok: false, problems };
  const event: ReviewEvent = { at: now.toISOString(), reviewer: reviewer.trim(), action: "REJECTED", reason: reason.trim(), candidate: structuredClone(c), candidateContentHash: c.contentHash };
  return { ok: true, changed: true, record: appendEvent(existing, c, event) };
}

/** Withdraw an approval (kept in history). Saved job decisions are untouched. */
export function revokeApproval(existing: ReviewRecord | undefined, c: CandidateConstraint, reviewer: string, reason: string, now: Date): ReviewActionResult {
  if (!existing || reviewState(existing) !== "APPROVED") return { ok: false, problems: ["não há aprovação ativa"] };
  if (!reviewer.trim() || reason.trim().length < 5) return { ok: false, problems: ["indique revisor e motivo"] };
  const event: ReviewEvent = { at: now.toISOString(), reviewer: reviewer.trim(), action: "REVOKED", reason: reason.trim(), candidate: structuredClone(c), candidateContentHash: c.contentHash };
  return { ok: true, changed: true, record: appendEvent(existing, c, event) };
}

function appendEvent(existing: ReviewRecord | undefined, c: CandidateConstraint, e: ReviewEvent): ReviewRecord {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    candidateId: c.id,
    sourceId: c.sourceId,
    history: [...(existing?.history ?? []), e],
  };
}

/* ─── Reading persisted reviews (never trust shape) ─── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseReviewRecord(raw: unknown): { ok: true; record: ReviewRecord } | { ok: false; id: string; reason: string } {
  const id = isObj(raw) && typeof raw.candidateId === "string" ? raw.candidateId : "?";
  const bad = (reason: string) => ({ ok: false as const, id, reason });
  if (!isObj(raw)) return bad("registo não é um objeto");
  if (raw.schemaVersion !== REVIEW_SCHEMA_VERSION) return bad(`versão de esquema desconhecida (${String(raw.schemaVersion)})`);
  if (typeof raw.candidateId !== "string" || typeof raw.sourceId !== "string") return bad("sem candidato/fonte");
  if (!Array.isArray(raw.history) || raw.history.length === 0) return bad("histórico vazio");
  for (const [i, e] of raw.history.entries()) {
    if (!isObj(e)) return bad(`evento ${i} inválido`);
    if (!["APPROVED", "REJECTED", "REVOKED"].includes(String(e.action))) return bad(`evento ${i}: ação desconhecida`);
    if (typeof e.at !== "string" || !Number.isFinite(Date.parse(e.at)) || typeof e.reviewer !== "string") return bad(`evento ${i}: data/revisor inválidos`);
    if (!isObj(e.candidate) || typeof e.candidateContentHash !== "string") return bad(`evento ${i}: candidato original em falta`);
    if (e.action === "APPROVED" && (!isObj(e.resolution) || !isObj(e.provenance))) return bad(`evento ${i}: aprovação sem resolução`);
  }
  return { ok: true, record: raw as unknown as ReviewRecord };
}

/* ─── Approved review → RoadConstraint ─── */

export type ReviewedConstraintResult =
  | { active: true; constraint: RegulationRecord; geometry: GeometryRecord | null }
  | { active: false; reason: string };

export function reviewedConstraint(
  review: ReviewRecord,
  current: CandidateConstraint | undefined,
  source: SourceRecord | undefined,
  freshness: Freshness | undefined,
  curated: GeometryRecord[],
  now: Date,
): ReviewedConstraintResult {
  if (reviewState(review) !== "APPROVED") return { active: false, reason: `revisão ${reviewState(review)}` };
  if (!source) return { active: false, reason: "fonte não disponível (desativada ou removida)" };
  const ev = review.history.at(-1)!;
  const r = ev.resolution!;
  const c = ev.candidate;
  if (current && current.contentHash !== ev.candidateContentHash) {
    return { active: false, reason: "a fonte alterou este registo depois da aprovação — requer nova revisão" };
  }
  // Re-validate at activation time (e.g. corrupted data, expired periods).
  const check = checkApproval({ ...c, gate: { decision: "REVIEW_REQUIRED", reasons: [] } }, source, r, ev.reviewer, curated, now);
  if (!check.ok) return { active: false, reason: [...check.problems, ...check.unresolved].join("; ") };

  const synthetic = !!source.synthetic;
  const tag = synthetic ? "[TESTE SINTÉTICO] " : "";
  const id = `rev-${c.id}`;
  const srcEv = `${id}-fonte`;
  const revEv = `${id}-revisao`;
  const prov = ev.provenance!;
  const human = Object.entries(prov).filter(([, p]) => p === "HUMAN_RESOLVED").map(([k]) => k);
  const snapshotAt = c.lastSeenAt || ev.at;

  const evidence: Evidence[] = [
    {
      id: srcEv,
      authority: source.authority,
      instrument: source.name,
      locator: `registo ${c.externalId} (snapshot ${c.snapshotId})`,
      url: source.landingUrl,
      retrievedAt: snapshotAt.slice(0, 10),
      quote: normalizeWs(r.evidenceQuote),
      verification: synthetic ? "UNVERIFIED" : "VERIFIED",
      note: synthetic ? "Fonte de TESTE SINTÉTICO (desenvolvimento) — não é uma publicação oficial." : "Excerto literal do texto da fonte, citado pelo revisor.",
    },
    {
      id: revEv,
      authority: `Revisor humano: ${ev.reviewer}`,
      instrument: "Revisão FleetOS de candidato ingerido",
      locator: `revisão de ${ev.at}`,
      url: source.landingUrl,
      retrievedAt: ev.at.slice(0, 10),
      verification: "INTERPRETED",
      note: `Campos resolvidos por pessoa (não verificados pela fonte): ${human.join(", ") || "nenhum"}. Proveniência: ${Object.entries(prov).map(([k, p]) => `${k}=${p}`).join(", ")}.${r.note ? ` Nota: ${r.note}` : ""}`,
    },
  ];

  // Geometry
  let geometryId: string;
  let geometry: GeometryRecord | null = null;
  const g = r.geometry!;
  if (g.kind === "curated") {
    geometryId = g.geometryId;
    // Carry the curated geometry with the constraint: it may belong to a curated road event
    // that is not enabled, and a constraint must never reference geometry absent from the dataset.
    const cg = curated.find((x) => x.id === g.geometryId);
    geometry = cg ? structuredClone(cg) : null;
  } else {
    geometryId = `${id}-geom`;
    const lines = g.kind === "source_lines" ? (c.fields.geometry.value as { kind: "lines"; lines: [number, number][][] }).lines : g.lines;
    geometry = {
      id: geometryId,
      label: `${tag}${c.fields.locationText.value ?? c.title}`,
      legalDescriptionEvidence: [srcEv],
      status: "RESOLVED",
      resolved: {
        kind: "polylines",
        lines,
        toleranceM: 30,
        minMatchLengthM: 100,
        maxHeadingDiffDeg: 30,
        verification: g.kind === "source_lines" && c.fields.geometry.state === "VERIFIED" ? "VERIFIED" : "INTERPRETED",
        mappingMethod:
          g.kind === "source_lines"
            ? "geometria linear publicada pela fonte"
            : `traçada pelo revisor ${ev.reviewer} em ${ev.at.slice(0, 10)} — a fonte ${c.fields.geometry.value?.kind === "point" ? "só indica um ponto" : "não fornece geometria"}`,
        evidence: g.kind === "source_lines" ? [srcEv] : [srcEv, revEv],
      },
    };
  }

  const appliesTo: Condition =
    r.vehicles!.kind === "all_traffic"
      ? { kind: "all", of: [] }
      : { kind: "fact", fact: "vehicle.grossWeightKg", op: "gt", value: r.vehicles!.kg, label: `peso bruto > ${r.vehicles!.kg} kg (revisão humana)`, evidence: [revEv] };

  const t = r.temporal!;
  let periods: { start: string; end: string }[];
  if (t.kind === "periods") periods = t.periods;
  else {
    const v = c.fields.validity.value!;
    periods = [{ start: toLocalMinute(Date.parse(v.start), LISBON), end: v.end ? toLocalMinute(Date.parse(v.end), LISBON) : OPEN_END_LOCAL }];
  }
  const from = periods.map((p) => p.start.slice(0, 10)).sort()[0]!;
  const temporalEv = prov.temporal === "HUMAN_RESOLVED" ? [revEv] : [srcEv];

  const openQuestions = [
    ...human.map((k) => `«${k}» resolvido por revisor humano (${ev.reviewer}, ${ev.at.slice(0, 16)}), não pela fonte.`),
    ...(freshness && freshness.state !== "FRESH" && freshness.state !== "AGING" ? [`Fonte ${freshness.state}: ${freshness.reason}`] : []),
    ...(current?.lifecycle === "NO_LONGER_REPORTED" ? ["O registo deixou de constar na fonte — não se presume cancelado; rever."] : []),
    ...(t.kind === "source_validity" && !c.fields.validity.value?.end ? ["Sem fim indicado pela fonte — vigência aberta confirmada pelo revisor."] : []),
  ];

  const constraint: RegulationRecord = {
    id,
    kind: "ROAD_CLOSURE",
    version: parseInt(hashString(canonicalJson([ev.candidateContentHash, r, ev.at])).slice(0, 7), 16),
    title: `${tag}${c.title}`,
    jurisdiction: "PT",
    authority: source.authority,
    instrument: `${source.name} — revisto por ${ev.reviewer}`,
    // The closure itself is stated in the official text (quoted); synthetic sources never verify anything.
    legalStatus: synthetic || source.trustTier > 2 ? "INTERPRETED" : "VERIFIED",
    effect: "prohibited",
    effective: { from, evidence: temporalEv },
    appliesTo,
    location: { geometryId },
    when: { timeZone: LISBON, timeZoneEvidence: [revEv], activePeriods: periods.map((p) => ({ ...p, evidence: temporalEv })) },
    exceptions: [],
    evidence,
    openQuestions: [...openQuestions, `Conjunto de restrições à data da revisão: ${ev.datasetVersion || "não registado"}`],
    origin: {
      kind: "ingested_reviewed",
      sourceId: source.id,
      sourceName: source.name,
      candidateId: c.id,
      synthetic,
      reviewedBy: ev.reviewer,
      reviewedAt: ev.at,
    },
  };
  return { active: true, constraint, geometry };
}
