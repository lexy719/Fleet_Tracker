/* ─────────────────────────────────────────────────────
   Road Intelligence research subsystem (Phase 4) — core model.

   Transport-neutral by design: nothing here knows about jobs, drivers, customers, prices
   or FleetOS UI state. It operates on road-data concepts and a bounded research scope, so
   it can later move out of FleetOS (Project 2).

   The research agent DISCOVERS → RETRIEVES → PRESERVES → UNDERSTANDS → PROPOSES.
   It never activates a constraint and never approves its own work.
   ───────────────────────────────────────────────────── */

/** Who/what established a value. Confidence never upgrades MACHINE_EXTRACTED. */
export type ProvenanceKind =
  /** Structured field published by the responsible authority (feed/API). */
  | "AUTHORITY_SUPPLIED"
  /** Computed by deterministic code from authority-supplied or verified values. */
  | "DETERMINISTIC"
  /** Read from prose by an extractor (rules or model). Always requires review. */
  | "MACHINE_EXTRACTED"
  /** Resolved by a named human reviewer. */
  | "HUMAN_RESOLVED";

export type Certainty = "EXPLICIT" | "INTERPRETED" | "UNKNOWN";

/** Where a value sits inside a document's text representation. */
export type TextLocation = {
  /** 1-based page (PDF) — absent for single-page representations. */
  page?: number;
  /** Character offsets into that page's text (UTF-16 code units, [start, end)). */
  start: number;
  end: number;
  /** Structured path (JSON/XML) when the value comes from a structured field. */
  path?: string;
};

export type EvidenceSpan = {
  snapshotId: string;
  /** Text representation the offsets refer to (e.g. "html-text@1", "pdf-text@1"). */
  representation: string;
  location: TextLocation;
  /** The exact original text at that location (Portuguese, unaltered). */
  quote: string;
};

export type FieldEvidence = {
  field: string;
  /** Normalized interpretation (canonical enums/structures). */
  value: unknown;
  /** Original wording, when it differs from the normalized value. */
  sourceWording?: string;
  evidence: EvidenceSpan[];
  provenance: ProvenanceKind;
  /** Extractor id@version (or parser id@version) that produced the value. */
  method: string;
  certainty: Certainty;
  note?: string;
};

/* ─── Why something happened (explainability) ─── */

export type ResearchReason = {
  /** Gap kind that triggered the work (NO_OPERATIONAL_SOURCE, SOURCE_STALE…). */
  gap: string;
  authorityId?: string;
  road?: string;
  municipalityCode?: string;
  /** Scope / route geometry hash that caused it. */
  scopeId?: string;
  detail: string;
};

/* ─── Retrieval / snapshots ─── */

export type RetrievalErrorKind =
  | "NOT_ALLOWED"
  | "ROBOTS_DISALLOWED"
  | "REDIRECT_LIMIT"
  | "REDIRECT_NOT_ALLOWED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "TOO_LARGE"
  | "EMPTY"
  | "UNAVAILABLE"
  | "BUDGET_EXHAUSTED";

export type RetrievalRecord = {
  id: string;
  requestedUrl: string;
  finalUrl?: string;
  redirects: string[];
  retrievedAt: string;
  httpStatus?: number;
  contentType?: string;
  /** Headers useful for freshness/caching only (never cookies or auth). */
  headers: Record<string, string>;
  sha256?: string;
  byteLength?: number;
  snapshotId?: string;
  /** Same bytes as an earlier snapshot of this URL. */
  unchanged?: boolean;
  sourceId?: string;
  authorityId?: string;
  method: "research-proxy" | "recorded" | "direct";
  retrieverVersion: number;
  latencyMs: number;
  error?: { kind: RetrievalErrorKind; message: string };
  why: ResearchReason;
};

export type TextStatus =
  | "OK"
  /** Some pages produced little or no text — extraction may be incomplete. */
  | "PARTIAL"
  /** No text layer (e.g. scanned PDF) — explicitly unsupported (no OCR provider). */
  | "NO_TEXT"
  | "UNSUPPORTED";

export type DocumentText = {
  representation: string;
  pages: { page: number; text: string }[];
  status: TextStatus;
  note?: string;
};

/** Content-addressed, immutable. The same bytes are stored once; observations record every sighting. */
export type DocumentSnapshot = {
  /** "snap-" + first 32 hex chars of the SHA-256 of the original bytes. */
  id: string;
  sha256: string;
  contentType: string;
  byteLength: number;
  /** Original bytes (base64) — kept for audit/reproducibility. */
  bytesBase64: string;
  text?: DocumentText;
  firstSeenAt: string;
  firstUrl: string;
};

export type Observation = {
  id: string;
  url: string;
  snapshotId: string;
  observedAt: string;
  retrievalId: string;
  /** Same snapshot as the previous observation of this URL. */
  unchanged: boolean;
};

/* ─── Extraction runs (cost / reuse) ─── */

export type ExtractionRun = {
  id: string;
  snapshotId: string;
  extractorId: string;
  extractorVersion: number;
  schemaVersion: number;
  kind: "STRUCTURED" | "SEMANTIC";
  engine: "PARSER" | "RULES" | "LLM";
  provider?: string;
  model?: string;
  inputChars: number;
  outputChars: number;
  tokens?: { input: number; output: number };
  /** Null when the provider does not report cost. */
  costEur?: number | null;
  latencyMs: number;
  status: "OK" | "FAILED" | "SCHEMA_ERROR" | "UNAVAILABLE";
  error?: string;
  /** Id of the earlier identical run reused instead of calling the extractor again. */
  reusedFrom?: string;
  createdAt: string;
  /** Validated output (semantic extractions). */
  output?: unknown;
};

/* ─── Source-use metadata (licensing) ─── */

export type UseStatus = "ALLOWED" | "NOT_ALLOWED" | "CONDITIONAL" | "UNKNOWN";

export type SourceUseMetadata = {
  licence: string | "UNKNOWN";
  termsUrl?: string;
  commercialUse: UseStatus;
  redistribution: UseStatus;
  attributionRequired: "YES" | "NO" | "UNKNOWN";
  snapshotRetention: UseStatus;
  evidenceDisplay: UseStatus;
  /** How each value was established; UNKNOWN stays UNKNOWN (no legal conclusion from silence). */
  basis: string;
  checkedAt?: string;
};

export const UNKNOWN_USE: SourceUseMetadata = {
  licence: "UNKNOWN",
  commercialUse: "UNKNOWN",
  redistribution: "UNKNOWN",
  attributionRequired: "UNKNOWN",
  snapshotRetention: "UNKNOWN",
  evidenceDisplay: "UNKNOWN",
  basis: "termos não encontrados/analisados — a ausência de termos não é uma autorização",
};

/* ─── Gaps ─── */

export type ResearchGapKind =
  | "NO_REGISTERED_SOURCE"
  | "SEARCH_UNAVAILABLE"
  | "NO_OFFICIAL_RESULT_FOUND"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_STALE"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_UNAVAILABLE"
  | "GEOMETRY_UNRESOLVED"
  | "AUTHORITY_UNRESOLVED"
  | "LICENCE_UNKNOWN"
  | "VEHICLE_APPLICABILITY_UNKNOWN"
  | "TEMPORAL_AMBIGUOUS"
  | "PDF_UNSUPPORTED"
  | "BUDGET_EXHAUSTED"
  | "SECONDARY_ONLY"
  | "CONFLICT";

export type ResearchGap = { kind: ResearchGapKind; detail: string; url?: string; authorityId?: string; why?: ResearchReason };
