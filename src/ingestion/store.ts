import type { ReviewRecord } from "./review";
import type { CandidateConstraint, ChangeEntry, ExtractionError, LegalFeedItem, RawSnapshot, SourceState } from "./types";

/*
 * Ingestion persistence. localStorage (~5 MB) cannot hold raw snapshots (Porto's DATEX
 * file alone is 3.7 MB), so the app uses IndexedDB; tests use the in-memory store.
 * Everything is per browser/device — there is no shared backend.
 */

export const INGESTION_DB = "fleetos-ingestion";
export const INGESTION_SCHEMA_VERSION = 5;

/** Phase 4 research evidence (append-only audit stores; never cleared). */
export const RESEARCH_STORES = ["researchSnapshots", "researchObservations", "researchRetrievals", "extractionRuns", "candidateVersions", "researchRuns"] as const;
export type ResearchStoreName = (typeof RESEARCH_STORES)[number];
export const ROUTE_METRICS_KEPT = 2_000;
export const DISCOVERY_RUNS_KEPT = 30;

/** Persisted clean-route result for one job × strategy. */
export type SolverRunRecord = { key: string; jobId: string; strategy: string; savedAt: string; result: unknown };
/** Raw snapshot bodies kept per source (older ones keep metadata only). */
export const SNAPSHOT_BODIES_KEPT = 3;
export const SNAPSHOT_META_KEPT = 30;
export const CHANGES_KEPT = 2_000;

export type SnapshotMeta = Omit<RawSnapshot, "body"> & { bodyPruned: boolean };

export interface IngestionStore {
  getSourceStates(): Promise<SourceState[]>;
  putSourceState(s: SourceState): Promise<void>;
  putSnapshot(s: RawSnapshot): Promise<void>;
  getSnapshot(id: string): Promise<RawSnapshot | (SnapshotMeta & { body?: undefined }) | undefined>;
  listSnapshots(sourceId: string): Promise<SnapshotMeta[]>;
  getCandidates(sourceId: string): Promise<CandidateConstraint[]>;
  getAllCandidates(): Promise<CandidateConstraint[]>;
  putCandidates(sourceId: string, items: CandidateConstraint[]): Promise<void>;
  getLegalItems(): Promise<LegalFeedItem[]>;
  putLegalItems(sourceId: string, items: LegalFeedItem[]): Promise<void>;
  putErrors(sourceId: string, errors: ExtractionError[]): Promise<void>;
  getErrors(): Promise<ExtractionError[]>;
  appendChanges(entries: ChangeEntry[]): Promise<void>;
  listChanges(limit: number): Promise<ChangeEntry[]>;
  /** Raw persisted reviews — validate with parseReviewRecord before use. */
  getReviews(): Promise<unknown[]>;
  putReview(r: ReviewRecord): Promise<void>;
  /* Phase 3C — raw values; callers validate (parseCacheEntry / parseProposal / parseStrategyResult). */
  getCacheEntry(key: string): Promise<unknown>;
  getAllCacheEntries(): Promise<unknown[]>;
  putCacheEntry(e: { key: string }): Promise<void>;
  getProposals(): Promise<unknown[]>;
  putProposal(p: { id: string }): Promise<void>;
  getDiscoveryRuns(): Promise<unknown[]>;
  putDiscoveryRun(r: { id: string; startedAt: string }): Promise<void>;
  getSolverRuns(): Promise<unknown[]>;
  putSolverRun(r: SolverRunRecord): Promise<void>;
  getRouteMetrics(): Promise<unknown[]>;
  putRouteMetrics(m: { id: string; solvedAt: string }): Promise<void>;
  /* Phase 4 — research evidence (raw values; research/evidence.ts validates and enforces immutability). */
  putResearchRecord(store: ResearchStoreName, rec: { id: string }): Promise<void>;
  getResearchRecord(store: ResearchStoreName, id: string): Promise<unknown>;
  listResearchRecords(store: ResearchStoreName): Promise<unknown[]>;
  /** Clears fetched data (snapshots, candidates, changes). Reviews are audit records and are kept. */
  clear(): Promise<void>;
}

const metaOf = (s: RawSnapshot, bodyPruned: boolean): SnapshotMeta => {
  const rest: Partial<RawSnapshot> = { ...s };
  delete rest.body;
  return { ...(rest as Omit<RawSnapshot, "body">), bodyPruned };
};

/* ─── In-memory ─── */

export class MemoryIngestionStore implements IngestionStore {
  states = new Map<string, SourceState>();
  snapshots = new Map<string, RawSnapshot | SnapshotMeta>();
  candidates = new Map<string, CandidateConstraint[]>();
  legal = new Map<string, LegalFeedItem[]>();
  errors = new Map<string, ExtractionError[]>();
  changes: ChangeEntry[] = [];
  reviews = new Map<string, unknown>();
  cache = new Map<string, unknown>();
  proposals = new Map<string, unknown>();
  discoveryRuns = new Map<string, { startedAt: string }>();
  solverRuns = new Map<string, unknown>();
  metrics = new Map<string, { id: string; solvedAt: string }>();
  research = new Map<ResearchStoreName, Map<string, unknown>>(RESEARCH_STORES.map((n) => [n, new Map()]));
  async putResearchRecord(store: ResearchStoreName, rec: { id: string }) { this.research.get(store)!.set(rec.id, structuredClone(rec)); }
  async getResearchRecord(store: ResearchStoreName, id: string) { return structuredClone(this.research.get(store)!.get(id)); }
  async listResearchRecords(store: ResearchStoreName) { return [...this.research.get(store)!.values()].map((r) => structuredClone(r)); }
  async getRouteMetrics() { return [...this.metrics.values()].map((m) => structuredClone(m)); }
  async putRouteMetrics(m: { id: string; solvedAt: string }) {
    this.metrics.set(m.id, structuredClone(m));
    const old = [...this.metrics.values()].sort((a, b) => b.solvedAt.localeCompare(a.solvedAt)).slice(ROUTE_METRICS_KEPT);
    for (const o of old) this.metrics.delete(o.id);
  }

  async getCacheEntry(key: string) { return structuredClone(this.cache.get(key)); }
  async getAllCacheEntries() { return [...this.cache.values()].map((e) => structuredClone(e)); }
  async putCacheEntry(e: { key: string }) { this.cache.set(e.key, structuredClone(e)); }
  async getProposals() { return [...this.proposals.values()].map((p) => structuredClone(p)); }
  async putProposal(p: { id: string }) { this.proposals.set(p.id, structuredClone(p)); }
  async getDiscoveryRuns() { return [...this.discoveryRuns.values()].map((r) => structuredClone(r)); }
  async putDiscoveryRun(r: { id: string; startedAt: string }) {
    this.discoveryRuns.set(r.id, structuredClone(r));
    const old = [...this.discoveryRuns.entries()].sort((a, b) => b[1].startedAt.localeCompare(a[1].startedAt)).slice(DISCOVERY_RUNS_KEPT);
    for (const [k] of old) this.discoveryRuns.delete(k);
  }
  async getSolverRuns() { return [...this.solverRuns.values()].map((r) => structuredClone(r)); }
  async putSolverRun(r: SolverRunRecord) { this.solverRuns.set(r.key, structuredClone(r)); }
  async getReviews() { return [...this.reviews.values()].map((r) => structuredClone(r)); }
  async putReview(r: ReviewRecord) { this.reviews.set(r.candidateId, structuredClone(r)); }
  async getSourceStates() { return [...this.states.values()]; }
  async putSourceState(s: SourceState) { this.states.set(s.sourceId, structuredClone(s)); }
  async putSnapshot(s: RawSnapshot) {
    this.snapshots.set(s.id, { ...s });
    const list = [...this.snapshots.values()].filter((x) => x.sourceId === s.sourceId).sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
    list.forEach((x, i) => {
      if (i >= SNAPSHOT_META_KEPT) this.snapshots.delete(x.id);
      else if (i >= SNAPSHOT_BODIES_KEPT && "body" in x) this.snapshots.set(x.id, metaOf(x as RawSnapshot, true));
    });
  }
  async getSnapshot(id: string) { return this.snapshots.get(id) as RawSnapshot | undefined; }
  async listSnapshots(sourceId: string) {
    return [...this.snapshots.values()]
      .filter((x) => x.sourceId === sourceId)
      .map((x) => ("body" in x ? metaOf(x as RawSnapshot, false) : (x as SnapshotMeta)))
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }
  async getCandidates(sourceId: string) { return structuredClone(this.candidates.get(sourceId) ?? []); }
  async getAllCandidates() { return structuredClone([...this.candidates.values()].flat()); }
  async putCandidates(sourceId: string, items: CandidateConstraint[]) { this.candidates.set(sourceId, structuredClone(items)); }
  async getLegalItems() { return [...this.legal.values()].flat(); }
  async putLegalItems(sourceId: string, items: LegalFeedItem[]) { this.legal.set(sourceId, items); }
  async putErrors(sourceId: string, errors: ExtractionError[]) { this.errors.set(sourceId, errors); }
  async getErrors() { return [...this.errors.values()].flat(); }
  async appendChanges(entries: ChangeEntry[]) { this.changes = [...this.changes, ...entries].slice(-CHANGES_KEPT); }
  async listChanges(limit: number) { return this.changes.slice(-limit).reverse(); }
  async clear() {
    // Reviews, proposals and solver runs are audit records: kept.
    this.cache.clear(); this.discoveryRuns.clear();
    this.states.clear(); this.snapshots.clear(); this.candidates.clear(); this.legal.clear(); this.errors.clear(); this.changes = [];
  }
}

/* ─── IndexedDB ─── */

const STORES = ["sourceState", "snapshots", "candidates", "legal", "errors", "changes", "reviews", "discoveryCache", "proposals", "discoveryRuns", "solverRuns", "routeMetrics", ...RESEARCH_STORES] as const;
/** Stores emptied by clear(); reviews, proposals, solver runs and research evidence are audit records and survive. */
const AUDIT: readonly string[] = ["reviews", "proposals", "solverRuns", "routeMetrics", ...RESEARCH_STORES];
const CLEARABLE = STORES.filter((s) => !AUDIT.includes(s));

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbIngestionStore implements IngestionStore {
  private dbp: Promise<IDBDatabase>;

  constructor(name = INGESTION_DB) {
    this.dbp = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, INGESTION_SCHEMA_VERSION);
      open.onupgradeneeded = (ev) => {
        const db = open.result;
        // v1 layout. Future versions migrate here based on ev.oldVersion.
        if ((ev.oldVersion ?? 0) < 1) {
          db.createObjectStore("sourceState", { keyPath: "sourceId" });
          db.createObjectStore("snapshots", { keyPath: "id" }).createIndex("sourceId", "sourceId");
          db.createObjectStore("candidates", { keyPath: "sourceId" });
          db.createObjectStore("legal", { keyPath: "sourceId" });
          db.createObjectStore("errors", { keyPath: "sourceId" });
          db.createObjectStore("changes", { autoIncrement: true });
        }
        if ((ev.oldVersion ?? 0) < 2) {
          db.createObjectStore("reviews", { keyPath: "candidateId" });
        }
        if ((ev.oldVersion ?? 0) < 3) {
          db.createObjectStore("discoveryCache", { keyPath: "key" });
          db.createObjectStore("proposals", { keyPath: "id" });
          db.createObjectStore("discoveryRuns", { keyPath: "id" });
          db.createObjectStore("solverRuns", { keyPath: "key" });
        }
        if ((ev.oldVersion ?? 0) < 4) {
          db.createObjectStore("routeMetrics", { keyPath: "id" });
        }
        if ((ev.oldVersion ?? 0) < 5) {
          for (const n of RESEARCH_STORES) db.createObjectStore(n, { keyPath: "id" });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error("IndexedDB bloqueada por outro separador"));
    });
  }

  private async tx(store: (typeof STORES)[number], mode: IDBTransactionMode = "readonly") {
    return (await this.dbp).transaction(store, mode).objectStore(store);
  }

  async getSourceStates() { return req((await this.tx("sourceState")).getAll()) as Promise<SourceState[]>; }
  async putSourceState(s: SourceState) { await req((await this.tx("sourceState", "readwrite")).put(s)); }
  async putSnapshot(s: RawSnapshot) {
    await req((await this.tx("snapshots", "readwrite")).put(s));
    const list = await this.listSnapshots(s.sourceId);
    const st = await this.tx("snapshots", "readwrite");
    for (const [i, m] of list.entries()) {
      if (i >= SNAPSHOT_META_KEPT) st.delete(m.id);
      else if (i >= SNAPSHOT_BODIES_KEPT && !m.bodyPruned) st.put(m);
    }
  }
  async getSnapshot(id: string) { return req((await this.tx("snapshots")).get(id)) as Promise<RawSnapshot | undefined>; }
  async listSnapshots(sourceId: string) {
    const all = (await req((await this.tx("snapshots")).index("sourceId").getAll(sourceId))) as (RawSnapshot | SnapshotMeta)[];
    return all
      .map((x) => ("body" in x && typeof x.body === "string" ? metaOf(x as RawSnapshot, false) : (x as SnapshotMeta)))
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }
  async getCandidates(sourceId: string) {
    const r = (await req((await this.tx("candidates")).get(sourceId))) as { items: CandidateConstraint[] } | undefined;
    return r?.items ?? [];
  }
  async getAllCandidates() {
    const r = (await req((await this.tx("candidates")).getAll())) as { items: CandidateConstraint[] }[];
    return r.flatMap((x) => x.items);
  }
  async putCandidates(sourceId: string, items: CandidateConstraint[]) { await req((await this.tx("candidates", "readwrite")).put({ sourceId, items })); }
  async getLegalItems() {
    const r = (await req((await this.tx("legal")).getAll())) as { items: LegalFeedItem[] }[];
    return r.flatMap((x) => x.items);
  }
  async putLegalItems(sourceId: string, items: LegalFeedItem[]) { await req((await this.tx("legal", "readwrite")).put({ sourceId, items })); }
  async putErrors(sourceId: string, errors: ExtractionError[]) { await req((await this.tx("errors", "readwrite")).put({ sourceId, errors })); }
  async getErrors() {
    const r = (await req((await this.tx("errors")).getAll())) as { errors: ExtractionError[] }[];
    return r.flatMap((x) => x.errors);
  }
  async appendChanges(entries: ChangeEntry[]) {
    const st = await this.tx("changes", "readwrite");
    for (const e of entries) st.add(e);
    const count = await req(st.count());
    if (count > CHANGES_KEPT) {
      const keys = (await req(st.getAllKeys(null, count - CHANGES_KEPT))) as IDBValidKey[];
      for (const k of keys) st.delete(k);
    }
  }
  async listChanges(limit: number) {
    const all = (await req((await this.tx("changes")).getAll())) as ChangeEntry[];
    return all.slice(-limit).reverse();
  }
  async getReviews() { return (await req((await this.tx("reviews")).getAll())) as unknown[]; }
  async getCacheEntry(key: string) { return req((await this.tx("discoveryCache")).get(key)) as Promise<unknown>; }
  async getAllCacheEntries() { return (await req((await this.tx("discoveryCache")).getAll())) as unknown[]; }
  async putCacheEntry(e: { key: string }) { await req((await this.tx("discoveryCache", "readwrite")).put(e)); }
  async getProposals() { return (await req((await this.tx("proposals")).getAll())) as unknown[]; }
  async putProposal(p: { id: string }) { await req((await this.tx("proposals", "readwrite")).put(p)); }
  async getDiscoveryRuns() { return (await req((await this.tx("discoveryRuns")).getAll())) as unknown[]; }
  async putDiscoveryRun(r: { id: string; startedAt: string }) {
    await req((await this.tx("discoveryRuns", "readwrite")).put(r));
    const all = (await req((await this.tx("discoveryRuns")).getAll())) as { id: string; startedAt: string }[];
    const old = all.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(DISCOVERY_RUNS_KEPT);
    if (old.length) {
      const st = await this.tx("discoveryRuns", "readwrite");
      for (const o of old) st.delete(o.id);
    }
  }
  async getSolverRuns() { return (await req((await this.tx("solverRuns")).getAll())) as unknown[]; }
  async putSolverRun(r: SolverRunRecord) { await req((await this.tx("solverRuns", "readwrite")).put(r)); }
  async getRouteMetrics() { return (await req((await this.tx("routeMetrics")).getAll())) as unknown[]; }
  async putRouteMetrics(m: { id: string; solvedAt: string }) { await req((await this.tx("routeMetrics", "readwrite")).put(m)); }
  async putReview(r: ReviewRecord) { await req((await this.tx("reviews", "readwrite")).put(r)); }
  async putResearchRecord(store: ResearchStoreName, rec: { id: string }) { await req((await this.tx(store, "readwrite")).put(rec)); }
  async getResearchRecord(store: ResearchStoreName, id: string) { return req((await this.tx(store)).get(id)) as Promise<unknown>; }
  async listResearchRecords(store: ResearchStoreName) { return (await req((await this.tx(store)).getAll())) as unknown[]; }
  async clear() {
    const db = await this.dbp;
    const t = db.transaction([...CLEARABLE], "readwrite");
    for (const s of CLEARABLE) t.objectStore(s).clear();
    await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }
}
