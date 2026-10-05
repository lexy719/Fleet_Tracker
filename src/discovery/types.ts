/* ─────────────────────────────────────────────────────
   Route-driven discovery (Phase 3C).

   Discovery never produces operational truth. It finds WHERE authoritative information
   may be, classifies who published it, and hands it to the Phase 3B pipeline
   (source registry → snapshots → CandidateConstraint → trust gate / human review).
   ───────────────────────────────────────────────────── */

import type { FreshnessState, ParserId, SourceType } from "../ingestion/types";

export type AuthorityKind =
  | "national_road_manager"
  | "municipality"
  | "legal_publisher"
  | "geodata_authority"
  | "concessionaire"
  | "synthetic_test";

/** How an official domain was established — never inferred from how a name looks. */
export type DomainEvidence = {
  domain: string;
  /** e.g. "publica o conjunto de dados registado X (metadados CKAN: organização …)". */
  establishedBy: string;
  checkedAt: string;
};

export type Authority = {
  id: string;
  name: string;
  kind: AuthorityKind;
  /** National, or the CAOP municipality codes it governs. */
  jurisdiction: { kind: "national" } | { kind: "municipal"; municipalityCodes: string[] };
  /** Verified official domains (empty = unknown, NOT "none"). */
  domains: DomainEvidence[];
  /** Registered source ids published by this authority. */
  sourceIds: string[];
  synthetic?: boolean;
};

export type DomainTrust =
  /** Host is (a subdomain of) a domain in the authority registry with recorded evidence. */
  | "OFFICIAL_VERIFIED"
  /** Development fixture domain — official *for testing only*, never in production. */
  | "OFFICIAL_SYNTHETIC_TEST"
  /** Looks governmental (e.g. .gov.pt) but not in the registry — needs validation. */
  | "UNVERIFIED_GOVERNMENT_SUFFIX"
  /** Anything else (news, blogs, social, forums, SEO…). Never operational evidence. */
  | "NON_AUTHORITATIVE"
  | "INVALID_URL";

export type TrustClassification = {
  url: string;
  domain: string;
  trust: DomainTrust;
  authorityId?: string;
  basis: string;
};

export type DiscoveryTopic =
  | "temporary_closures"
  | "temporary_restrictions"
  | "roadworks"
  | "permanent_hgv_restrictions"
  | "dimension_weight_limits"
  | "access_zones"
  | "dangerous_goods"
  | "legal_acts";

export type RoadClass = "motorway" | "national" | "regional" | "municipal" | "european" | "unknown";

export type ScopeRoad = {
  ref: string;
  roadClass: RoadClass;
  /** Road manager is NOT derivable from the number alone (IP vs concessions). */
  manager: { status: "undetermined"; note: string } | { status: "municipal"; note: string };
};

export type ScopeMunicipality = { code: string; name: string; district: string; approxKm: number };

export type ScopeAuthority = { authorityId: string; name: string; kind: AuthorityKind; reasons: string[] };

export type ScopeSource = { sourceId: string; name: string; authorityId: string; freshness: FreshnessState };

export type ScopeVehicle = {
  known: Record<string, string | number | boolean>;
  /** Facts restrictions commonly depend on that FleetOS does not have for this transport. */
  missing: string[];
};

export type DiscoveryScope = {
  id: string;
  createdAt: string;
  routeId: string;
  strategy: string;
  /** Hash of the route geometry the scope was derived from. */
  routeHash: string;
  departAtIso?: string;
  horizon?: { fromIso: string; toIso: string };
  roads: ScopeRoad[];
  municipalities: ScopeMunicipality[];
  /** Route samples whose municipality is uncertain (near a boundary / outside CAOP). */
  uncertainSamples: number;
  /** Samples outside every supported (declared) territory of the loaded registries. */
  outsideSamples: number;
  totalSamples: number;
  districts: string[];
  authorities: ScopeAuthority[];
  registeredSources: ScopeSource[];
  /** Authorities along the route with no registered operational source. */
  uncoveredAuthorityIds: string[];
  staleSourceIds: string[];
  unknownCoverageSourceIds: string[];
  vehicle: ScopeVehicle;
  topics: DiscoveryTopic[];
};

export type DiscoveryTask = {
  key: string;
  authorityId: string;
  topic: DiscoveryTopic;
  /**
   * Network-wide authorities are researched PER ROAD (reusable across routes sharing the
   * road); municipal authorities per municipality. Part of the cache key.
   */
  road?: string;
  /** Vehicle class the answer depends on (cache partition). */
  vehicleClass: string;
  roads: string[];
  municipalityCodes: string[];
};

export type DiscoveryMethod =
  | "registered_source"
  | "legal_index"
  | "search_engine"
  | "official_site_search"
  | "official_page_link";

/** Raw hit from a provider, BEFORE trust classification. Treated as hostile input. */
export type RawDiscoveryHit = {
  url: string;
  title: string;
  snippet: string;
  method: DiscoveryMethod;
  topics: DiscoveryTopic[];
  municipalityCodes: string[];
  roads: string[];
  sourceType?: SourceType;
  /** Structured, machine-readable source the hit points to (feed / dataset). */
  structured?: { parser: ParserId; fetchPath: string; expectedCadenceMin?: number; license?: string };
  /** Official URL this (possibly non-authoritative) page links to — a discovery hint only. */
  pointsTo?: string;
  publishedAt?: string;
  /** Set by the registered-source provider. */
  registeredSourceId?: string;
};

export type DiscoveryResultKind =
  | "registered_source"
  | "candidate_source"
  | "document_pending_extraction"
  | "non_authoritative"
  | "hint";

export type DiscoveryResult = {
  id: string;
  kind: DiscoveryResultKind;
  authorityId?: string;
  url: string;
  domain: string;
  title: string;
  /** Plain text, sanitised, length-capped. Never rendered as HTML. */
  snippet: string;
  methods: DiscoveryMethod[];
  discoveredAt: string;
  relevance: { municipalityCodes: string[]; roads: string[]; topics: DiscoveryTopic[] };
  sourceType?: SourceType;
  trust: TrustClassification;
  /** Can this result ever be used as operational evidence (after the 3B pipeline)? */
  operationalEligible: boolean;
  freshness?: { publishedAt?: string; state?: FreshnessState };
  registeredSourceId?: string;
  proposalId?: string;
  note?: string;
};

export type DiscoveryGapKind =
  | "NO_OPERATIONAL_SOURCE"
  | "OFFICIAL_DOMAIN_UNKNOWN"
  | "SOURCE_STALE"
  | "SOURCE_FETCH_FAILED"
  | "SOURCE_FRESHNESS_UNKNOWN"
  | "EXTRACTION_UNAVAILABLE"
  | "SOURCE_PENDING_VALIDATION"
  | "CONCESSION_DATA_UNAVAILABLE"
  | "ROAD_MANAGER_UNDETERMINED"
  | "LEGAL_RULE_NOT_ENCODED"
  | "SEARCH_UNAVAILABLE"
  | "VEHICLE_FACT_MISSING"
  | "PROVIDER_ERROR"
  | "OUTSIDE_COVERED_TERRITORY";

export type DiscoveryGap = {
  id: string;
  kind: DiscoveryGapKind;
  authorityId?: string;
  authorityName?: string;
  road?: string;
  municipalityCode?: string;
  sourceId?: string;
  /** What information is missing, phrased as a task. */
  need: string;
  reason: string;
};

export type SourceProposalStatus = "PROPOSED" | "APPROVED" | "REJECTED";

/** A reusable source found by discovery — enters the registry only after validation. */
export type SourceProposal = {
  id: string;
  status: SourceProposalStatus;
  authorityId: string;
  authorityName: string;
  url: string;
  domain: string;
  trust: TrustClassification;
  sourceType: SourceType;
  parser?: ParserId;
  /** Path the browser would fetch (only same-origin paths are ingestible here). */
  fetchPath?: string;
  geographicScope: { municipalityCodes: string[]; roads: string[] };
  topics: DiscoveryTopic[];
  expectedCadenceMin?: number;
  license?: string;
  discoveredVia: { method: DiscoveryMethod; at: string; fromUrl?: string }[];
  synthetic: boolean;
  decision?: { by: string; at: string; reason: string };
  /** Why this proposal cannot be auto-ingested even if approved (e.g. needs extraction). */
  ingestBlocker?: string;
};

export type CacheStatus = "HIT" | "MISS" | "STALE" | "ERROR";

export type DiscoveryCacheEntry = {
  schemaVersion: 1;
  key: string;
  task: DiscoveryTask;
  providerId: string;
  discoveredAt: string;
  /** After this, the entry is STALE and must be refreshed (not silently reused). */
  refreshAfter: string;
  ok: boolean;
  error?: string;
  hits: RawDiscoveryHit[];
};

export type DiscoveryRun = {
  id: string;
  startedAt: string;
  finishedAt: string;
  scope: DiscoveryScope;
  results: DiscoveryResult[];
  gaps: DiscoveryGap[];
  proposals: SourceProposal[];
  cache: { hit: number; miss: number; stale: number; error: number; details: { key: string; providerId: string; status: CacheStatus }[] };
  refreshedSourceIds: string[];
  providerErrors: { providerId: string; message: string }[];
  timings: { scopeMs: number; cacheMs: number; classifyMs: number; totalMs: number; externalMs: number; contextMs?: Record<string, number> };
};
