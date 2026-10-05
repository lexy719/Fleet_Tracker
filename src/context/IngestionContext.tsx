import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SnapshotMeta } from "../ingestion/store";
import { assessFreshness, isDue } from "../ingestion/freshness";
import { CAOP_URL, isMunicipalityDataset, MunicipalityIndex } from "../ingestion/municipalities";
import { buildIngestedConstraints, regate, runSource, type FetchImpl, type IngestedConstraints, type RunReport } from "../ingestion/pipeline";
import {
  approveCandidate,
  parseReviewRecord,
  rejectCandidate,
  revokeApproval,
  type ReviewActionResult,
  type ReviewRecord,
  type ReviewResolution,
} from "../ingestion/review";
import { activeSources, DEV_FIXTURE_PREFIX } from "../ingestion/sources";
import { allAuthorities } from "../discovery/authorities";
import { parseCacheEntry } from "../discovery/cache";
import { runDiscovery } from "../discovery/orchestrator";
import { decideProposal, parseProposal, proposalAuthorities, proposalToSource } from "../discovery/proposals";
import { fixtureSearchProvider, legalIndexProvider, registeredSourceProvider, UNAVAILABLE_SEARCH_PROVIDER, type DiscoveryProvider } from "../discovery/providers";
import { buildDiscoveryScope } from "../discovery/scope";
import type { DiscoveryCacheEntry, DiscoveryRun, RawDiscoveryHit, SourceProposal } from "../discovery/types";
import type { SolverRunRecord } from "../ingestion/store";
import { parseStrategyResult } from "../solver/solver";
import type { StrategyResult } from "../solver/types";
import { parseRouteMetrics, type RouteIntelligenceMetrics } from "../solver/metrics";
import type { FactSet } from "../regulations/types";
import type { RoutePlanOption } from "../tomtom/planRoutes";
import { IdbIngestionStore, MemoryIngestionStore, type IngestionStore } from "../ingestion/store";
import type { CandidateConstraint, ChangeEntry, ExtractionError, Freshness, LegalFeedItem, SourceRecord, SourceState } from "../ingestion/types";
import { availableRoadEvents, REGULATION_DATASET } from "../regulations/repository";
import type { GeometryRecord, RegulationRecord } from "../regulations/types";
import { classifyUrl } from "../discovery/domainTrust";
import { NATIONAL_AUTHORITIES } from "../discovery/authorities";
import { applyResearchRun, researchSourceRecord } from "../ingestion/researchIngest";
import { runResearch, type ResearchRun, type ResearchScope } from "../research/agent";
import { factFromCandidate, factFromRegulation } from "../research/conflicts";
import { legalBasisEntrypoints, RESEARCH_ENTRYPOINTS, type ResearchEntrypoint } from "../research/entrypoints";
import { EvidenceStore, type CandidateVersion } from "../research/evidence";
import { llmExtractor, rulesExtractor } from "../research/extractors";
import type { NamedSegmentReference } from "../research/geometryResolution";
import { proxyRetriever } from "../research/retrieval";
import { NO_SEARCH, proxySearch } from "../research/search";
import type { DocumentSnapshot, ExtractionRun } from "../research/types";

/*
 * Road Intelligence ingestion, local-first: sources are checked while the app is open
 * (on load, then every minute for sources that are due, or on demand). Nothing runs
 * while the app is closed, and everything is stored per browser (IndexedDB).
 */

const TICK_MS = 60_000;
const DEV_FIXTURES_KEY = "fleet-dev-ingestion-fixtures";
/** Synthetic test sources can only ever be enabled in a development build. */
export const DEV_FIXTURES_AVAILABLE = import.meta.env.DEV;

/** Resolved geometries a reviewer may select (curated dataset + curated road events). */
export const CURATED_GEOMETRIES: GeometryRecord[] = [
  ...REGULATION_DATASET.geometries,
  ...availableRoadEvents().flatMap((e) => e.geometries),
].filter((g) => g.status === "RESOLVED" && g.resolved && g.resolved.verification !== "UNVERIFIED");

/** Curated road-event constraints + standing restrictions: existing knowledge research is compared with. */
const CURATED_REGULATIONS: RegulationRecord[] = [...REGULATION_DATASET.regulations, ...availableRoadEvents().flatMap((e) => e.constraints)];

/** Named junction-to-junction segments of curated geometries ("IP3 — Nó de X ↔ Nó de Y"). */
export const NAMED_SEGMENTS: NamedSegmentReference[] = CURATED_GEOMETRIES.flatMap((g) => {
  const m = g.label.match(/^(\S+) — Nó de .+ ↔ Nó de .+$/);
  return m ? [{ road: m[1]!, label: g.label, geometryId: g.id, dataset: "geometrias curadas FleetOS" }] : [];
});

/** Research entry points: verified listings + legal bases cited by curated knowledge (derived, not hand-listed). */
export const ALL_RESEARCH_ENTRYPOINTS: ResearchEntrypoint[] = [
  ...RESEARCH_ENTRYPOINTS,
  ...legalBasisEntrypoints(CURATED_REGULATIONS, (url) => {
    const t = classifyUrl(url, NATIONAL_AUTHORITIES);
    return t.trust === "OFFICIAL_VERIFIED" ? t.authorityId : undefined;
  }),
];

export type ResearchCapabilities = { retrieve: boolean; extract: boolean; search: boolean; checked: boolean };

type ReviewAction =
  | { kind: "approve"; candidateId: string; reviewer: string; resolution: ReviewResolution; datasetVersion: string }
  | { kind: "reject"; candidateId: string; reviewer: string; reason: string }
  | { kind: "revoke"; candidateId: string; reviewer: string; reason: string };

type IngestionValue = {
  ready: boolean;
  storage: "indexeddb" | "memory";
  sources: SourceRecord[];
  devFixturesEnabled: boolean;
  setDevFixturesEnabled: (on: boolean) => void;
  running: string[];
  lastRun: Record<string, RunReport>;
  states: SourceState[];
  freshness: Record<string, Freshness>;
  candidates: CandidateConstraint[];
  legalItems: LegalFeedItem[];
  errors: ExtractionError[];
  changes: ChangeEntry[];
  ingested: IngestedConstraints & { reviewStatus: Record<string, string> };
  /** REVIEW_REQUIRED candidates with no standing human decision (approved/rejected). */
  pendingReviewCount: number;
  reviews: ReviewRecord[];
  corruptReviews: { id: string; reason: string }[];
  review: (a: ReviewAction) => Promise<ReviewActionResult>;
  municipalities: MunicipalityIndex | null;
  municipalitiesError: string | null;
  /* Phase 3C — discovery */
  proposals: SourceProposal[];
  decideSourceProposal: (id: string, decision: "APPROVED" | "REJECTED", by: string, reason: string) => Promise<string[]>;
  discoveryRuns: DiscoveryRun[];
  runRouteDiscovery: (route: RoutePlanOption, strategy: string, facts: FactSet) => Promise<DiscoveryRun>;
  /** Ingested constraints recomputed from storage right now (for the solver's per-iteration dataset). */
  ingestedNow: () => Promise<IngestedConstraints>;
  loadSolverRun: (key: string) => Promise<StrategyResult | null>;
  routeMetrics: RouteIntelligenceMetrics[];
  recordRouteMetrics: (m: RouteIntelligenceMetrics) => Promise<void>;
  saveSolverRun: (r: SolverRunRecord) => Promise<void>;
  refresh: (sourceId?: string) => Promise<void>;
  snapshots: (sourceId: string) => Promise<SnapshotMeta[]>;
  clearAll: () => Promise<void>;
  /* Phase 4 — research agent */
  researchCapabilities: ResearchCapabilities;
  researchRuns: ResearchRun[];
  researching: boolean;
  runRouteResearch: (route: RoutePlanOption, strategy: string, facts: FactSet, opts?: { revalidate?: string[]; force?: boolean }) => Promise<ResearchRun>;
  evidenceSnapshot: (id: string) => Promise<DocumentSnapshot | undefined>;
  candidateVersions: (candidateId: string) => Promise<CandidateVersion[]>;
  extractionRuns: () => Promise<ExtractionRun[]>;
};

const IngestionContext = createContext<IngestionValue | null>(null);

function openStore(): { store: IngestionStore; kind: "indexeddb" | "memory" } {
  try {
    if (typeof indexedDB !== "undefined") return { store: new IdbIngestionStore(), kind: "indexeddb" };
  } catch {
    /* fall through */
  }
  return { store: new MemoryIngestionStore(), kind: "memory" };
}

const browserFetch: FetchImpl = (url, init) => fetch(url, { ...init, credentials: "omit", cache: "no-store" });

function readDevFlag(): boolean {
  if (!DEV_FIXTURES_AVAILABLE) return false;
  try {
    return localStorage.getItem(DEV_FIXTURES_KEY) === "1";
  } catch {
    return false;
  }
}

export function IngestionProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<{ store: IngestionStore; kind: "indexeddb" | "memory" } | null>(null);
  if (!storeRef.current) storeRef.current = openStore();
  const [storage, setStorage] = useState(storeRef.current.kind);
  const [devFixturesEnabled, setDevFlag] = useState(readDevFlag);
  const [proposals, setProposals] = useState<SourceProposal[]>([]);
  const [discoveryRuns, setDiscoveryRuns] = useState<DiscoveryRun[]>([]);
  const [routeMetrics, setRouteMetrics] = useState<RouteIntelligenceMetrics[]>([]);
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([]);
  const [researching, setResearching] = useState(false);
  const [researchCapabilities, setResearchCapabilities] = useState<ResearchCapabilities>({ retrieve: false, extract: false, search: false, checked: false });
  // Registry = official sources (+ dev fixtures in development) + validated discovered sources.
  const sources = useMemo(() => {
    const approved = proposals
      .map(proposalToSource)
      .filter((s): s is SourceRecord => !!s && (!s.synthetic || devFixturesEnabled));
    const research = ALL_RESEARCH_ENTRYPOINTS.map((ep) => researchSourceRecord(ep, NATIONAL_AUTHORITIES.find((a) => a.id === ep.authorityId)?.name ?? ep.authorityId));
    return [...activeSources(devFixturesEnabled), ...approved, ...research];
  }, [devFixturesEnabled, proposals]);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<Record<string, RunReport>>({});
  const [states, setStates] = useState<SourceState[]>([]);
  const [candidates, setCandidates] = useState<CandidateConstraint[]>([]);
  const [legalItems, setLegalItems] = useState<LegalFeedItem[]>([]);
  const [errors, setErrors] = useState<ExtractionError[]>([]);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [corruptReviews, setCorruptReviews] = useState<{ id: string; reason: string }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [municipalities, setMunicipalities] = useState<MunicipalityIndex | null>(null);
  const [municipalitiesError, setMunicipalitiesError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const s = storeRef.current!.store;
    const [st, c, l, e, ch, rv, pr, dr] = await Promise.all([
      s.getSourceStates(),
      s.getAllCandidates(),
      s.getLegalItems(),
      s.getErrors(),
      s.listChanges(200),
      s.getReviews().catch(() => [] as unknown[]),
      s.getProposals().catch(() => [] as unknown[]),
      s.getDiscoveryRuns().catch(() => [] as unknown[]),
    ]);
    setProposals(pr.map(parseProposal).filter((p): p is SourceProposal => !!p));
    const rr = await s.listResearchRecords("researchRuns").catch(() => [] as unknown[]);
    setResearchRuns((rr as ResearchRun[]).filter((r) => r && typeof r.id === "string" && Array.isArray(r.steps)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30));
    const rm = await s.getRouteMetrics().catch(() => [] as unknown[]);
    setRouteMetrics(rm.map(parseRouteMetrics).filter((m): m is RouteIntelligenceMetrics => !!m).sort((a, b) => b.solvedAt.localeCompare(a.solvedAt)));
    setDiscoveryRuns(
      (dr as DiscoveryRun[]).filter((r) => r && typeof r.id === "string" && r.scope && Array.isArray(r.gaps)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    );
    setStates(st);
    setCandidates(c);
    setLegalItems(l);
    setErrors(e);
    setChanges(ch);
    const ok: ReviewRecord[] = [];
    const bad: { id: string; reason: string }[] = [];
    for (const raw of rv) {
      const p = parseReviewRecord(raw);
      if (p.ok) ok.push(p.record);
      else bad.push({ id: p.id, reason: p.reason });
    }
    setReviews(ok);
    setCorruptReviews(bad);
  }, []);

  const runOne = useCallback(async (sourceId: string): Promise<RunReport | undefined> => {
    const source = sourcesRef.current.find((x) => x.id === sourceId);
    if (!source || inFlight.current.has(sourceId)) return undefined;
    inFlight.current.add(sourceId);
    setRunning([...inFlight.current]);
    try {
      const report = await runSource(source, { store: storeRef.current!.store, fetch: browserFetch, now: new Date() });
      setLastRun((r) => ({ ...r, [sourceId]: report }));
      return report;
    } catch (e) {
      // Storage failure (quota, blocked DB): degrade to memory for this session.
      console.warn("[ingestion] run failed", sourceId, e);
      const failed: RunReport = { sourceId, outcome: "FETCH_ERROR", message: `armazenamento: ${e instanceof Error ? e.message : String(e)}` };
      setLastRun((r) => ({ ...r, [sourceId]: failed }));
      if (storeRef.current!.kind === "indexeddb") {
        storeRef.current = { store: new MemoryIngestionStore(), kind: "memory" };
        setStorage("memory");
      }
      return failed;
    } finally {
      inFlight.current.delete(sourceId);
      setRunning([...inFlight.current]);
    }
  }, []);

  const runDue = useCallback(
    async (force: boolean, only?: string) => {
      const t = new Date();
      const st = await storeRef.current!.store.getSourceStates().catch(() => [] as SourceState[]);
      const due = sourcesRef.current.filter(
        (s) => (only ? s.id === only : true) && s.enabled && s.access.kind !== "STATIC" && s.access.kind !== "RESEARCH" && (force || isDue(s, st.find((x) => x.sourceId === s.id), t)),
      );
      await Promise.all(due.map((s) => runOne(s.id)));
      setNow(new Date());
      await reload().catch(() => undefined);
    },
    [reload, runOne],
  );

  useEffect(() => {
    let alive = true;
    reload()
      .catch((e) => {
        console.warn("[ingestion] IndexedDB unavailable, using memory", e);
        storeRef.current = { store: new MemoryIngestionStore(), kind: "memory" };
        setStorage("memory");
      })
      .finally(() => {
        if (!alive) return;
        setReady(true);
        void runDue(false);
      });
    const id = window.setInterval(() => void runDue(false), TICK_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload, runDue]);

  // A newly registered source (e.g. a validated discovery proposal) is checked right away.
  const sourceIdsKey = sources.map((x) => x.id).join(",");
  useEffect(() => {
    if (ready) void runDue(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIdsKey]);

  // Which research capabilities this environment has (booleans only; secrets stay server-side).
  useEffect(() => {
    let alive = true;
    fetch("/__research/status", { cache: "no-store" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : Promise.reject(new Error("sem fronteira"))))
      .then((j: { retrieve?: boolean; extract?: boolean; search?: boolean }) => alive && setResearchCapabilities({ retrieve: !!j.retrieve, extract: !!j.extract, search: !!j.search, checked: true }))
      .catch(() => alive && setResearchCapabilities({ retrieve: false, extract: false, search: false, checked: true }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(CAOP_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: unknown) => {
        if (!alive) return;
        if (!isMunicipalityDataset(d)) throw new Error("formato CAOP inválido");
        setMunicipalities(new MunicipalityIndex(d));
      })
      .catch((e) => alive && setMunicipalitiesError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const setDevFixturesEnabled = useCallback(
    (on: boolean) => {
      if (!DEV_FIXTURES_AVAILABLE) return;
      try {
        localStorage.setItem(DEV_FIXTURES_KEY, on ? "1" : "0");
      } catch {
        /* ignore */
      }
      setDevFlag(on);
      if (on) window.setTimeout(() => void runDue(false), 0);
    },
    [runDue],
  );

  const freshness = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, assessFreshness(s, states.find((x) => x.sourceId === s.id), now)])),
    [sources, states, now],
  );

  // Gates depend on time and freshness: recompute on every refresh. Candidates of inactive
  // sources (e.g. disabled test fixtures) are not shown and never evaluated.
  const gated = useMemo(
    () =>
      sources.flatMap((s) => {
        const own = candidates.filter((c) => c.sourceId === s.id);
        return own.length ? regate(own, s, freshness[s.id]!, now) : [];
      }),
    [sources, candidates, freshness, now],
  );

  const gatedRef = useRef(gated);
  gatedRef.current = gated;

  const ingested = useMemo(
    () => buildIngestedConstraints(gated, sources, freshness, now, { records: reviews, curatedGeometries: CURATED_GEOMETRIES }),
    [gated, sources, freshness, now, reviews],
  );

  const pendingReviewCount = useMemo(() => {
    const decided = new Set(reviews.filter((r) => r.history.at(-1)!.action !== "REVOKED").map((r) => r.candidateId));
    return gated.filter((c) => c.gate.decision === "REVIEW_REQUIRED" && !decided.has(c.id)).length;
  }, [gated, reviews]);

  const review = useCallback(
    async (a: ReviewAction): Promise<ReviewActionResult> => {
      const c = gated.find((x) => x.id === a.candidateId);
      if (!c) return { ok: false, problems: ["candidato não encontrado"] };
      const existing = reviews.find((r) => r.candidateId === a.candidateId);
      const t = new Date();
      const res =
        a.kind === "approve"
          ? approveCandidate(existing, c, sources.find((s) => s.id === c.sourceId), a.resolution, a.reviewer, CURATED_GEOMETRIES, t, a.datasetVersion)
          : a.kind === "reject"
            ? rejectCandidate(existing, c, a.reviewer, a.reason, t)
            : revokeApproval(existing, c, a.reviewer, a.reason, t);
      if (res.ok && res.changed) {
        await storeRef.current!.store.putReview(res.record);
        await reload();
        setNow(new Date());
      }
      return res;
    },
    [gated, reviews, sources, reload],
  );

  const decideSourceProposal = useCallback(
    async (id: string, decision: "APPROVED" | "REJECTED", by: string, reason: string): Promise<string[]> => {
      const p = proposals.find((x) => x.id === id);
      if (!p) return ["proposta não encontrada"];
      const d = decideProposal(p, decision, by, reason, new Date(), devFixturesEnabled);
      if (!d.ok) return d.problems;
      await storeRef.current!.store.putProposal(d.proposal);
      await reload();
      return [];
    },
    [proposals, devFixturesEnabled, reload],
  );

  /** Same computation as the memoised `ingested`, but read from storage now. */
  const ingestedNow = useCallback(async (): Promise<IngestedConstraints> => {
    const s = storeRef.current!.store;
    const t = new Date();
    const [st, cands, rv] = await Promise.all([s.getSourceStates(), s.getAllCandidates(), s.getReviews().catch(() => [] as unknown[])]);
    const srcs = sourcesRef.current;
    const fr = Object.fromEntries(srcs.map((x) => [x.id, assessFreshness(x, st.find((y) => y.sourceId === x.id), t)]));
    const g = srcs.flatMap((x) => {
      const own = cands.filter((c) => c.sourceId === x.id);
      return own.length ? regate(own, x, fr[x.id]!, t) : [];
    });
    const recs = rv.map(parseReviewRecord).flatMap((p) => (p.ok ? [p.record] : []));
    return buildIngestedConstraints(g, srcs, fr, t, { records: recs, curatedGeometries: CURATED_GEOMETRIES });
  }, []);

  const devHits = useRef<RawDiscoveryHit[] | null>(null);
  /** In-memory mirror of the persisted discovery cache (one bulk read, then write-through). */
  const cacheMirror = useRef<Map<string, DiscoveryCacheEntry> | null>(null);
  const loadCacheMirror = useCallback(async () => {
    if (cacheMirror.current) return cacheMirror.current;
    const all = await storeRef.current!.store.getAllCacheEntries().catch(() => [] as unknown[]);
    const m = new Map<string, DiscoveryCacheEntry>();
    for (const raw of all) {
      const e = parseCacheEntry(raw); // corrupt entries are dropped (⇒ MISS)
      if (e) m.set(e.key, e);
    }
    cacheMirror.current = m;
    return m;
  }, []);
  const runRouteDiscovery = useCallback(
    async (route: RoutePlanOption, strategy: string, facts: FactSet): Promise<DiscoveryRun> => {
      const s = storeRef.current!.store;
      const t = new Date();
      const phase: Record<string, number> = {};
      let tp = performance.now();
      const mark = (k: string) => {
        const n = performance.now();
        phase[k] = Math.round(n - tp);
        tp = n;
      };
      const srcs = sourcesRef.current;
      const st = await s.getSourceStates();
      const fr = Object.fromEntries(srcs.map((x) => [x.id, assessFreshness(x, st.find((y) => y.sourceId === x.id), t)]));
      const stored = (await s.getProposals()).map(parseProposal).filter((p): p is SourceProposal => !!p);
      const baseAuth = allAuthorities(municipalities?.dataset.municipalities ?? [], devFixturesEnabled);
      const extra = proposalAuthorities(stored, baseAuth);
      mark("storeRead");
      const scope = buildDiscoveryScope({ route, strategy, index: municipalities, sources: srcs, freshness: fr, facts, includeDev: devFixturesEnabled, extraAuthorities: extra, now: t });
      const scopeMs = performance.now() - tp;
      mark("scope");
      const providers: DiscoveryProvider[] = [registeredSourceProvider(srcs), legalIndexProvider(await s.getLegalItems()), UNAVAILABLE_SEARCH_PROVIDER];
      // `import.meta.env.DEV` lets production builds drop this branch entirely.
      if (import.meta.env.DEV && devFixturesEnabled) {
        if (!devHits.current) {
          devHits.current = await fetch(`${DEV_FIXTURE_PREFIX}discovery-search-results.json`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : { hits: [] }))
            .then((j: { hits?: RawDiscoveryHit[] }) => (Array.isArray(j.hits) ? j.hits : []))
            .catch(() => []);
        }
        providers.push(fixtureSearchProvider(devHits.current ?? [], "dev-fixture-search"));
      }
      const authorities = [...baseAuth.filter((a) => !extra.some((e) => e.id === a.id)), ...extra];
      await loadCacheMirror();
      mark("providersAndCacheLoad");
      const run = await runDiscovery(scope, {
        authorities,
        providers,
        sources: srcs,
        cacheGet: async (k) => (await loadCacheMirror()).get(k),
        cachePut: async (e) => {
          (await loadCacheMirror()).set(e.key, e);
          void s.putCacheEntry(e).catch(() => undefined); // persisted in the background
        },
        proposals: stored,
        // Respect each source's cadence: a stale-but-recently-checked source is not re-fetched.
        refreshSource: async (id) => {
          const src = srcs.find((x) => x.id === id);
          if (!src || !isDue(src, st.find((y) => y.sourceId === id), new Date())) return false;
          await runOne(id);
          return true;
        },
        allowSynthetic: devFixturesEnabled,
        now: t,
      });
      mark("run");
      run.timings.scopeMs = scopeMs;
      for (const p of run.proposals) await s.putProposal(p);
      await s.putDiscoveryRun(run);
      // Targeted updates — a full reload of the ingestion store per run is needlessly expensive.
      setProposals((prev) => [...prev.filter((x) => !run.proposals.some((p) => p.id === x.id)), ...run.proposals]);
      setDiscoveryRuns((prev) => [run, ...prev.filter((x) => x.id !== run.id)].slice(0, 30));
      if (run.refreshedSourceIds.length) await reload();
      mark("persist");
      run.timings.contextMs = phase;
      return run;
    },
    [municipalities, devFixturesEnabled, runOne, reload, loadCacheMirror],
  );

  const runRouteResearch = useCallback(
    async (route: RoutePlanOption, strategy: string, facts: FactSet, opts: { revalidate?: string[]; force?: boolean } = {}): Promise<ResearchRun> => {
      setResearching(true);
      try {
        const s = storeRef.current!.store;
        const t = new Date();
        // The research scope is the 3C discovery scope of this route, with its gaps.
        const disc = await runRouteDiscovery(route, strategy, facts);
        const researchIds = new Set(ALL_RESEARCH_ENTRYPOINTS.map((e) => `research:${e.id}`));
        const scope: ResearchScope = {
          id: disc.scope.id,
          roads: disc.scope.roads.map((r) => r.ref),
          municipalities: disc.scope.municipalities.map((m) => ({ code: m.code, name: m.name })),
          authorityIds: [...new Set(disc.scope.authorities.map((a) => a.authorityId))],
          gaps: [
            ...disc.gaps.map((g) => ({ kind: g.kind, ...(g.authorityId ? { authorityId: g.authorityId } : {}), ...(g.sourceId ? { sourceId: g.sourceId } : {}), ...(g.road ? { road: g.road } : {}), ...(g.municipalityCode ? { municipalityCode: g.municipalityCode } : {}) })),
            ...(opts.revalidate ?? []).map((id) => ({ kind: "REVALIDATE", sourceId: id })),
          ],
        };
        // Legal-basis entry points are national: in scope when their knowledge is being revalidated.
        if (opts.revalidate?.length && !scope.authorityIds.includes("incm-dr")) scope.authorityIds.push("incm-dr");
        const authorities = allAuthorities(municipalities?.dataset.municipalities ?? [], false);
        const caps = researchCapabilities;
        const run = await runResearch(scope, {
          retriever: proxyRetriever(),
          extractors: caps.extract ? [llmExtractor(), rulesExtractor] : [rulesExtractor],
          search: caps.search ? proxySearch() : NO_SEARCH,
          store: new EvidenceStore(s),
          authorities,
          entrypoints: ALL_RESEARCH_ENTRYPOINTS,
          refs: NAMED_SEGMENTS,
          chainage: null,
          knownFacts: [
            ...gatedRef.current.filter((c) => !researchIds.has(c.sourceId)).map((c) => factFromCandidate(c)),
            ...CURATED_REGULATIONS.map((r) => factFromRegulation(r, CURATED_GEOMETRIES)),
          ],
          registered: disc.scope.registeredSources.filter((x) => !researchIds.has(x.sourceId)).map((x) => ({ sourceId: x.sourceId, authorityId: x.authorityId, freshness: x.freshness })),
          refreshRegisteredSource: async (id) => {
            const r = await runOne(id);
            return { outcome: r?.outcome ?? "SKIPPED_IN_FLIGHT", ...(r?.message ? { message: r.message } : {}) };
          },
          ...(opts.force ? { force: true } : {}),
          now: t,
        });
        await applyResearchRun(s, run, sourcesRef.current, new Date());
        setResearchRuns((prev) => [run, ...prev.filter((x) => x.id !== run.id)].slice(0, 30));
        await reload();
        setNow(new Date());
        return run;
      } finally {
        setResearching(false);
      }
    },
    [runRouteDiscovery, municipalities, researchCapabilities, runOne, reload],
  );
  const evidenceSnapshot = useCallback((id: string) => new EvidenceStore(storeRef.current!.store).getSnapshot(id), []);
  const candidateVersions = useCallback((id: string) => new EvidenceStore(storeRef.current!.store).versionsOf(id), []);
  const extractionRuns = useCallback(() => new EvidenceStore(storeRef.current!.store).extractions(), []);

  const loadSolverRun = useCallback(async (key: string) => {
    const all = (await storeRef.current!.store.getSolverRuns().catch(() => [])) as SolverRunRecord[];
    const r = all.find((x) => x && x.key === key);
    return r ? parseStrategyResult(r.result) : null;
  }, []);
  const saveSolverRun = useCallback((r: SolverRunRecord) => storeRef.current!.store.putSolverRun(r), []);
  const recordRouteMetrics = useCallback(
    async (m: RouteIntelligenceMetrics) => {
      await storeRef.current!.store.putRouteMetrics(m).catch(() => undefined);
      setRouteMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)]);
    },
    [],
  );

  // Development-only probe: measures, on THIS browser's real store, the unit costs of the
  // code path used before the 3C.5 fix (store re-read per iteration, full reload per
  // discovery run, one IndexedDB transaction per cache key read/write).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__fleetosPerfProbe = async () => {
      const s = storeRef.current!.store;
      const t = (async <T,>(f: () => Promise<T>) => {
        const a = performance.now();
        await f();
        return Math.round((performance.now() - a) * 10) / 10;
      });
      const keys = [...(await loadCacheMirror()).keys()].slice(0, 200);
      const ingestedNowMs = await t(() => ingestedNow());
      const reloadMs = await t(() => reload());
      const getMs = await t(async () => {
        for (const k of keys) await s.getCacheEntry(k);
      });
      const sample = (await loadCacheMirror()).values().next().value;
      const putMs = sample
        ? await t(async () => {
            for (let i = 0; i < 50; i++) await s.putCacheEntry(sample);
          })
        : 0;
      const mirrorGetMs = await t(async () => {
        const m = await loadCacheMirror();
        for (const k of keys) m.get(k);
      });
      return {
        candidates: (await s.getAllCandidates()).length,
        cacheEntries: (await loadCacheMirror()).size,
        ingestedNowMs,
        fullReloadMs: reloadMs,
        idbGetPerKeyMs: keys.length ? Math.round((getMs / keys.length) * 100) / 100 : 0,
        idbPutPerKeyMs: Math.round((putMs / 50) * 100) / 100,
        mirrorGetPerKeyMs: keys.length ? Math.round((mirrorGetMs / keys.length) * 1000) / 1000 : 0,
      };
    };
  }, [ingestedNow, reload, loadCacheMirror]);

  const refresh = useCallback((sourceId?: string) => runDue(true, sourceId), [runDue]);
  const snapshots = useCallback((sourceId: string) => storeRef.current!.store.listSnapshots(sourceId), []);
  const clearAll = useCallback(async () => {
    await storeRef.current!.store.clear();
    cacheMirror.current = null;
    setLastRun({});
    await reload();
  }, [reload]);

  const value: IngestionValue = {
    ready,
    storage,
    sources,
    devFixturesEnabled,
    setDevFixturesEnabled,
    running,
    lastRun,
    states,
    freshness,
    candidates: gated,
    legalItems,
    errors,
    changes,
    ingested,
    pendingReviewCount,
    reviews,
    corruptReviews,
    review,
    municipalities,
    municipalitiesError,
    proposals,
    decideSourceProposal,
    discoveryRuns,
    runRouteDiscovery,
    ingestedNow,
    loadSolverRun,
    saveSolverRun,
    routeMetrics,
    recordRouteMetrics,
    refresh,
    snapshots,
    clearAll,
    researchCapabilities,
    researchRuns,
    researching,
    runRouteResearch,
    evidenceSnapshot,
    candidateVersions,
    extractionRuns,
  };
  return <IngestionContext.Provider value={value}>{children}</IngestionContext.Provider>;
}

export function useIngestion(): IngestionValue {
  const ctx = useContext(IngestionContext);
  if (!ctx) throw new Error("useIngestion must be used within IngestionProvider");
  return ctx;
}
