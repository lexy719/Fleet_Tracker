/* ─────────────────────────────────────────────────────
   Road Intelligence — ingestion domain.

   Sources are fetched into raw snapshots; parsers (deterministic) or the AI extractor
   turn snapshots into CandidateConstraints with per-field evidence; a deterministic
   trust gate decides whether a candidate may feed the compliance evaluator.
   AI never decides compliance and never activates a constraint.
   ───────────────────────────────────────────────────── */

import type { BBox } from "../regulations/types";
import type { ResearchCandidateMeta } from "../research/candidates";
import type { FieldEvidence } from "../research/types";

export type SourceType =
  | "ARCGIS_FEATURE_SERVICE"
  | "DATEX_II"
  | "CKAN"
  | "RSS"
  | "HTML_NOTICE"
  | "PDF_DOCUMENT"
  | "STATIC_LEGAL_RECORD";

/**
 * 1 — official structured feed from the responsible authority;
 * 2 — official prose publication (notice, legal act) from the responsible authority;
 * 3 — official but indirect (aggregated, index only, or not the responsible authority);
 * 4 — non-official (e.g. OSM). Never activates a constraint.
 */
export type TrustTier = 1 | 2 | 3 | 4;

/** How the browser reaches the source. */
export type SourceAccess =
  | { kind: "DIRECT_CORS"; url: string }
  /** Same-origin relay (Vite dev/preview proxy, Vercel rewrite) to a fixed upstream. */
  | { kind: "SAME_ORIGIN_PROXY"; path: string; upstreamUrl: string }
  /** Curated in code; nothing to fetch. */
  | { kind: "STATIC" }
  /** Development-only synthetic fixture served by the Vite dev server (never in production). */
  | { kind: "DEV_FIXTURE"; path: string }
  /** Read by the Phase 4 research agent (allow-listed retrieval boundary), never by the scheduler. */
  | { kind: "RESEARCH"; entrypointId: string };

export type ParserId =
  | "ip-arcgis-events"
  | "datex2-situations"
  | "ckan-package"
  | "dr-rss"
  | "html-notice-ai"
  | "research-agent"
  | "static-curated";

/** What part of the road domain a source can speak for. Used for coverage, never for compliance. */
export type SourceCoverage = {
  /** "national" (network-wide) or the CAOP municipality codes (DTMN) it covers. */
  jurisdiction: { kind: "national" } | { kind: "municipal"; municipalityCodes: string[] };
  /** Road network the source reports on (free text as the source describes it). */
  network: string;
  /** Which information the source can provide. */
  provides: ("temporary_events" | "closures" | "roadworks" | "incidents" | "legal_acts" | "permanent_restrictions")[];
  /** Known gaps, verbatim where possible. */
  gaps: string[];
};

export type Cadence = {
  /** How often FleetOS checks the source. */
  checkEveryMin: number;
  /** Publication age after which data is AGING / STALE (by the source's own dates). */
  agingAfterMin: number;
  staleAfterMin: number;
};

export type SourceRecord = {
  id: string;
  name: string;
  authority: string;
  type: SourceType;
  access: SourceAccess;
  /** Human-visible page for the dataset / notice. */
  landingUrl: string;
  license: string;
  trustTier: TrustTier;
  parser: ParserId;
  cadence: Cadence;
  coverage: SourceCoverage;
  enabled: boolean;
  /** Verified observations about the source (e.g. last publication seen during research). */
  notes: string[];
  /** Synthetic test data (development only). Everything derived from it is labelled as such. */
  synthetic?: boolean;
};

/* ─── Fetching / snapshots ─── */

export type RawSnapshot = {
  id: string;
  sourceId: string;
  fetchedAt: string;
  httpStatus: number;
  contentType: string;
  byteLength: number;
  /** SHA-256 of the body (hex). */
  sha256: string;
  body: string;
};

export type FetchAttempt =
  | { ok: true; snapshot: RawSnapshot }
  | { ok: false; sourceId: string; attemptedAt: string; error: string; httpStatus?: number };

/* ─── Freshness ─── */

export type FreshnessState = "FRESH" | "AGING" | "STALE" | "UNKNOWN" | "FETCH_ERROR";

export type Freshness = {
  state: FreshnessState;
  /** Newest publication/observation time declared by the source, if any. */
  publishedAt?: string;
  /** Where `publishedAt` comes from, e.g. "DATEX publicationTime". */
  publishedAtBasis?: string;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  reason: string;
};

/* ─── Candidates ─── */

/**
 * Per-field provenance.
 * - VERIFIED: value stated in the source (structured field, or verbatim quote found in text);
 * - DERIVED: computed deterministically from VERIFIED values (e.g. bbox of a polygon);
 * - INTERPRETED: a reading the source does not spell out;
 * - UNKNOWN: not established.
 */
export type FieldState = "VERIFIED" | "DERIVED" | "INTERPRETED" | "UNKNOWN";

export type Field<T> = {
  state: FieldState;
  value?: T;
  /** Source path (structured) or verbatim quote (text) the value rests on. */
  basis?: string;
  note?: string;
};

export type CandidateCategory =
  | "ROAD_CLOSURE"
  | "LANE_CLOSURE"
  | "ROADWORKS"
  | "INCIDENT"
  | "OBSTRUCTION"
  | "LEGAL_ACT"
  | "OTHER";

export type GeometryProvenance = "VERIFIED" | "DERIVED" | "INTERPRETED" | "SCREENING" | "UNKNOWN";

export type CandidateGeometry =
  | { kind: "point"; point: [number, number] }
  | { kind: "polygons"; rings: [number, number][][] }
  | { kind: "lines"; lines: [number, number][][] };

export type DatedInterval = { start: string; end?: string };

export type VehicleApplicability =
  | { kind: "all_traffic" }
  | { kind: "conditions"; text: string }
  | { kind: "none_stated" };

export type CandidateFields = {
  category: Field<CandidateCategory>;
  /** Road identifiers, e.g. ["IP3"], ["EN211"]. */
  roads: Field<string[]>;
  locationText: Field<string>;
  geometry: Field<CandidateGeometry> & { provenance: GeometryProvenance };
  /** Absolute validity (UTC ISO). */
  validity: Field<DatedInterval>;
  /** Dated local periods (Europe/Lisbon) when the constraint is in force, if the source gives them. */
  periods: Field<{ start: string; end: string }[]>;
  vehicleApplicability: Field<VehicleApplicability>;
  direction: Field<string>;
  diversion: Field<string>;
  description: Field<string>;
};

export type ExtractionMethod =
  | { kind: "parser"; parser: ParserId; version: number }
  | { kind: "ai"; model: string; promptVersion: number; recorded: boolean }
  /** Phase 4 research extraction (rules or LLM). MACHINE_EXTRACTED — always reviewed, never activated by itself. */
  | { kind: "semantic"; extractorId: string; extractorVersion: number; schemaVersion: number; engine: "RULES" | "LLM"; model?: string };

export type Lifecycle = "NEW" | "UNCHANGED" | "UPDATED" | "NO_LONGER_REPORTED";

export type GateDecision =
  /** May feed the evaluator (full geometry). */
  | "ACTIVE"
  /** May feed the evaluator with screening geometry only (can yield UNKNOWN, never APPLIES). */
  | "ACTIVE_SCREENING_ONLY"
  /** Needs a person to review / resolve before it can be used. */
  | "REVIEW_REQUIRED"
  /** Not a prohibition (works, lane closures, legal index…) — shown, never evaluated. */
  | "INFORMATIONAL"
  | "REJECTED";

export type GateResult = { decision: GateDecision; reasons: string[] };

export type CandidateConstraint = {
  /** `${sourceId}:${externalId}` */
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  fields: CandidateFields;
  extraction: ExtractionMethod;
  /** Snapshot the current version was read from. */
  snapshotId: string;
  /** Hash of the normalized content (change detection). */
  contentHash: string;
  lifecycle: Lifecycle;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Set when lifecycle is NO_LONGER_REPORTED. Absence from a feed is NOT a cancellation. */
  missingSinceAt?: string;
  gate: GateResult;
  /** Per-record parse/extraction problems (kept, never silently dropped). */
  issues: string[];
  /** Field-level evidence chains (Phase 4): value → exact quote → snapshot/page/offsets. */
  evidence?: FieldEvidence[];
  /** Research provenance (Phase 4 agent output only). */
  research?: ResearchCandidateMeta;
};

export type ExtractionError = {
  sourceId: string;
  snapshotId: string;
  externalId?: string;
  kind: "PARSE_ERROR" | "EXTRACTION_ERROR" | "SCHEMA_ERROR" | "EVIDENCE_ERROR";
  message: string;
};

export type ParseOutput = {
  candidates: Omit<CandidateConstraint, "lifecycle" | "firstSeenAt" | "lastSeenAt" | "gate" | "missingSinceAt">[];
  errors: ExtractionError[];
  /** Newest publication/observation time declared inside the payload. */
  publishedAt?: string;
  publishedAtBasis?: string;
  /** Records the parser saw (including ones that produced no candidate). */
  recordCount: number;
};

/* ─── Change log ─── */

export type ChangeEntry = {
  at: string;
  sourceId: string;
  candidateId: string;
  change: Lifecycle;
  /** Fields that changed (UPDATED only). */
  fields?: string[];
};

/* ─── DR (Diário da República) classification ─── */

export type LegalRelevance = "POTENTIALLY_RELEVANT" | "UNCERTAIN" | "NOT_RELEVANT";

export type LegalFeedItem = {
  id: string;
  sourceId: string;
  title: string;
  description: string;
  url: string;
  publishedOn?: string;
  relevance: LegalRelevance;
  /** Terms that matched (positive and negative). */
  matched: string[];
  /** Human-facing label, e.g. "POTENTIALLY RELEVANT — REVIEW/EXTRACT". */
  label: string;
};

/* ─── Per-source state ─── */

export type SourceState = {
  sourceId: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastHttpStatus?: number;
  lastSnapshotId?: string;
  lastSha256?: string;
  publishedAt?: string;
  publishedAtBasis?: string;
  recordCount?: number;
  /** Consecutive snapshots with identical hash. */
  unchangedFetches: number;
};

/* ─── Municipal registry (CAOP) ─── */

export type Municipality = {
  code: string;
  /** Territory code of the dataset this municipality belongs to (set by the index). */
  territory?: string;
  name: string;
  district: string;
  nuts3: string;
  bbox: BBox;
  /** Polygons as rings of [lng, lat]; ring 0 = exterior, others = holes. */
  polygons: [number, number][][][];
};

/** A territory a municipal registry declares it covers (e.g. PT-CONT). Coverage is derived from these. */
export type DeclaredTerritory = { code: string; name: string; basis?: string };

export type MunicipalityDataset = {
  /** Territory covered by this registry. Absent ⇒ "UNDECLARED" (never assumed to be a country). */
  territory?: DeclaredTerritory;
  dataset: string;
  authority: string;
  source: string;
  license: string;
  retrievedAt: string;
  simplification: { method: string; toleranceM: number; borderMarginM: number };
  count: number;
  municipalities: Municipality[];
};
