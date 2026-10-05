import type { Customer, Driver, Job, Site, Trailer, Truck } from "../data/types";
import type { OpsDocument } from "../domain/documents/documents";
import { compareEvents, type OperationalEvent } from "../domain/events";

/*
 * Operational persistence — SEPARATE from Road Intelligence ("fleetos-ingestion").
 * Database "fleetos-operations": jobs, trucks, trailers, drivers (keyed by immutable id),
 * an append-only events store and a meta store (counters, seed / migration markers).
 *
 * Every write is a `commit`: one IndexedDB transaction covering records, events and meta,
 * so a status change and its history entry land together or not at all. Optional revision
 * expectations give optimistic concurrency between tabs.
 */

export const OPS_DB = "fleetos-operations";
export const OPS_SCHEMA_VERSION = 2;

export const ENTITY_STORES = ["jobs", "trucks", "trailers", "drivers", "documents", "customers", "sites"] as const;
export type EntityStore = (typeof ENTITY_STORES)[number];
export type EntityOf = { jobs: Job; trucks: Truck; trailers: Trailer; drivers: Driver; documents: OpsDocument; customers: Customer; sites: Site };

export type OpsSnapshot = { jobs: Job[]; trucks: Truck[]; trailers: Trailer[]; drivers: Driver[]; documents: OpsDocument[]; customers: Customer[]; sites: Site[] };

export type CommitBatch = {
  put?: { [K in EntityStore]?: EntityOf[K][] };
  remove?: { [K in EntityStore]?: string[] };
  events?: OperationalEvent[];
  meta?: Record<string, unknown>;
  /** Abort unless the stored job revision still equals the expected one (null = must not exist). */
  expectJobRevisions?: Record<string, number | null>;
};

export class ConcurrencyError extends Error {
  constructor(public readonly jobId: string) {
    super(`O trabalho foi alterado noutro separador ou sessão (${jobId}). Recarregue antes de voltar a alterar.`);
    this.name = "ConcurrencyError";
  }
}

export interface OperationalStore {
  loadAll(): Promise<OpsSnapshot>;
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  listEvents(entityId?: string): Promise<OperationalEvent[]>;
  commit(batch: CommitBatch): Promise<void>;
  /** Atomically returns max(stored, floor) + 1 and stores it. */
  nextCounter(name: string, floor: number): Promise<number>;
  close(): void;
}

const byAt = compareEvents;

/* ─── In-memory (tests, and fallback when IndexedDB is unavailable) ─── */

export class MemoryOperationalStore implements OperationalStore {
  data: { [K in EntityStore]: Map<string, EntityOf[K]> } = { jobs: new Map(), trucks: new Map(), trailers: new Map(), drivers: new Map(), documents: new Map(), customers: new Map(), sites: new Map() };
  events: OperationalEvent[] = [];
  meta = new Map<string, unknown>();
  commits = 0;

  async loadAll(): Promise<OpsSnapshot> {
    return structuredClone(Object.fromEntries(ENTITY_STORES.map((s) => [s, [...this.data[s].values()]])) as OpsSnapshot);
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.meta.get(key)) as T | undefined;
  }
  async listEvents(entityId?: string): Promise<OperationalEvent[]> {
    return structuredClone(this.events.filter((e) => !entityId || e.entityId === entityId)).sort(byAt);
  }
  async commit(b: CommitBatch): Promise<void> {
    for (const [id, rev] of Object.entries(b.expectJobRevisions ?? {})) {
      const cur = this.data.jobs.get(id);
      if ((cur?.revision ?? null) !== rev) throw new ConcurrencyError(id);
    }
    for (const s of ENTITY_STORES) {
      // Removals first: a batch may remove and re-put the same id (demo reset).
      for (const id of b.remove?.[s] ?? []) this.data[s].delete(id);
      for (const rec of b.put?.[s] ?? []) (this.data[s] as Map<string, unknown>).set(rec.id, structuredClone(rec));
    }
    for (const e of b.events ?? []) if (!this.events.some((x) => x.id === e.id)) this.events.push(structuredClone(e));
    for (const [k, v] of Object.entries(b.meta ?? {})) this.meta.set(k, structuredClone(v));
    this.commits++;
  }
  async nextCounter(name: string, floor: number): Promise<number> {
    const n = Math.max(Number(this.meta.get(`counter:${name}`) ?? 0), floor) + 1;
    this.meta.set(`counter:${name}`, n);
    return n;
  }
  close() {}
}

/* ─── IndexedDB ─── */

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error("transaction aborted"));
  });
}

/** Ordered schema migrations; index i upgrades version i → i+1. */
const MIGRATIONS: ((db: IDBDatabase) => void)[] = [
  (db) => {
    // v1 (Phase 5): the four operational entities. Fixed list — never derived from ENTITY_STORES.
    for (const s of ["jobs", "trucks", "trailers", "drivers"]) db.createObjectStore(s, { keyPath: "id" });
    const ev = db.createObjectStore("events", { keyPath: "id" });
    ev.createIndex("entityId", "entityId");
    db.createObjectStore("meta", { keyPath: "key" });
  },
  (db) => {
    // v2 (Phase 5.6B): documents, customers, sites. Existing stores are untouched.
    const docs = db.createObjectStore("documents", { keyPath: "id" });
    docs.createIndex("jobId", "jobId");
    db.createObjectStore("customers", { keyPath: "id" });
    db.createObjectStore("sites", { keyPath: "id" });
  },
];

export async function openOperationalDb(name = OPS_DB, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = factory.open(name, OPS_SCHEMA_VERSION);
    r.onupgradeneeded = (ev) => {
      const db = r.result;
      for (let v = ev.oldVersion; v < OPS_SCHEMA_VERSION; v++) MIGRATIONS[v]!(db);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("fleetos-operations: atualização bloqueada por outro separador aberto"));
  });
}

export class IdbOperationalStore implements OperationalStore {
  private constructor(private db: IDBDatabase) {}

  static async open(name = OPS_DB, factory: IDBFactory = indexedDB): Promise<IdbOperationalStore> {
    return new IdbOperationalStore(await openOperationalDb(name, factory));
  }

  async loadAll(): Promise<OpsSnapshot> {
    const tx = this.db.transaction([...ENTITY_STORES], "readonly");
    const all = await Promise.all(ENTITY_STORES.map((s) => req(tx.objectStore(s).getAll())));
    return Object.fromEntries(ENTITY_STORES.map((s, i) => [s, all[i]])) as OpsSnapshot;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const rec = await req(this.db.transaction("meta", "readonly").objectStore("meta").get(key));
    return (rec as { value: T } | undefined)?.value;
  }

  async listEvents(entityId?: string): Promise<OperationalEvent[]> {
    const store = this.db.transaction("events", "readonly").objectStore("events");
    const all = (await req(entityId ? store.index("entityId").getAll(entityId) : store.getAll())) as OperationalEvent[];
    return all.sort(byAt);
  }

  async commit(b: CommitBatch): Promise<void> {
    const tx = this.db.transaction([...ENTITY_STORES, "events", "meta"], "readwrite");
    const finished = done(tx);
    let conflict: ConcurrencyError | null = null;
    const expectations = Object.entries(b.expectJobRevisions ?? {});
    const write = () => {
      for (const s of ENTITY_STORES) {
        const os = tx.objectStore(s);
        // Removals first: a batch may remove and re-put the same id (demo reset).
        for (const id of b.remove?.[s] ?? []) os.delete(id);
        for (const rec of b.put?.[s] ?? []) os.put(rec);
      }
      const ev = tx.objectStore("events");
      for (const e of b.events ?? []) ev.put(e);
      const meta = tx.objectStore("meta");
      for (const [key, value] of Object.entries(b.meta ?? {})) meta.put({ key, value });
    };
    if (!expectations.length) write();
    else {
      // Read-check-write inside the SAME transaction (IndexedDB serialises overlapping readwrite tx).
      let pending = expectations.length;
      for (const [id, rev] of expectations) {
        const g = tx.objectStore("jobs").get(id);
        g.onsuccess = () => {
          if (conflict) return;
          const cur = (g.result as Job | undefined)?.revision ?? null;
          if (cur !== rev) {
            conflict = new ConcurrencyError(id);
            tx.abort();
            return;
          }
          if (--pending === 0) write();
        };
      }
    }
    try {
      await finished;
    } catch (e) {
      throw conflict ?? e;
    }
  }

  async nextCounter(name: string, floor: number): Promise<number> {
    const tx = this.db.transaction("meta", "readwrite");
    const finished = done(tx);
    const os = tx.objectStore("meta");
    const key = `counter:${name}`;
    let n = 0;
    const g = os.get(key);
    g.onsuccess = () => {
      n = Math.max(Number((g.result as { value: number } | undefined)?.value ?? 0), floor) + 1;
      os.put({ key, value: n });
    };
    await finished;
    return n;
  }

  close() {
    this.db.close();
  }
}
