import type { Customer, Driver, Job, LegacyJob, Site, Trailer, Truck } from "../data/types";
import { isJobShaped, legacyJobToJob } from "../domain/demo/legacy";
import { makeEvent, type OperationalEvent } from "../domain/events";
import { maxJobNumber } from "../domain/ids";
import { migrateStoredJobs } from "../lib/jobsStorage";
import type { OperationalStore } from "./operationalStore";

/*
 * One-time initialisation of the operational store.
 *
 *  1. Legacy import — jobs persisted by earlier versions in localStorage "fleet-jobs-v3"
 *     are converted ONCE (meta "legacyImport" + localStorage marker). The original key is
 *     left untouched (read-only source; the user may delete it). Duplicate legacy ids are
 *     kept — later copies get a deterministic derived id — never dropped or merged.
 *  2. Demo seed — demo trucks / trailers / drivers / jobs are written ONCE (meta
 *     "demoSeed" with the seeded ids). Deleting or archiving a demo record is therefore
 *     permanent until the user explicitly asks to "repor dados demo".
 *
 * Both steps are idempotent: re-running bootstrap on an initialised store writes nothing.
 */

export const LEGACY_JOBS_KEY = "fleet-jobs-v3";
export const LEGACY_IMPORTED_MARKER = "fleetos-ops-legacy-imported";

export type DemoSeed = { trucks: Truck[]; drivers: Driver[]; trailers: Trailer[]; jobs: Job[]; customers: Customer[]; sites: Site[] };
export type SeedMeta = { at: string; ids: { trucks: string[]; drivers: string[]; trailers: string[]; jobs: string[] } };
export type LegacyImportMeta = { at: string; found: boolean; imported: number; dropped: number; duplicates: number };

export type BootstrapInput = {
  store: OperationalStore;
  seed: DemoSeed;
  /** Pre-Phase-5 demo jobs in their legacy shape (fill-in source for stored demo jobs). */
  legacySeedJobs: readonly LegacyJob[];
  /** Raw localStorage "fleet-jobs-v3" string (null when absent). */
  legacyRaw: string | null;
  /** True when a previous import was already recorded outside the store (localStorage marker). */
  legacyMarker: boolean;
  now: Date;
};

export type BootstrapReport = { seeded: boolean; legacy: LegacyImportMeta | null; skippedLegacy: boolean };

export function convertLegacyJobs(raw: unknown, legacySeedJobs: readonly LegacyJob[], at: string): { jobs: Job[]; dropped: number; duplicates: number; events: OperationalEvent[] } {
  const total = Array.isArray(raw) ? raw.length : 0;
  const shaped = Array.isArray(raw) ? raw.filter(isJobShaped) : [];
  const migrated = migrateStoredJobs<LegacyJob>(shaped, legacySeedJobs);
  // migrateStoredJobs appends demo jobs missing from storage; the demo seed handles those.
  const stored = migrated.filter((j) => shaped.some((s) => s.id === j.id));
  const seedIds = new Set(legacySeedJobs.map((j) => j.id));
  const seen = new Map<string, number>();
  const jobs: Job[] = [];
  const events: OperationalEvent[] = [];
  let duplicates = 0;
  for (const lj of stored) {
    const n = (seen.get(lj.id) ?? 0) + 1;
    seen.set(lj.id, n);
    let job = legacyJobToJob(lj, at);
    if (seedIds.has(lj.id)) job = { ...job, isDemo: true };
    if (n > 1) {
      // The pre-Phase-5 duplicate-id bug: keep the record under a deterministic new id.
      duplicates++;
      job = { ...job, id: `${lj.id}~${n}`, jobNumber: `${job.jobNumber}/${n}`, stops: job.stops.map((s) => ({ ...s, id: `${s.id}~${n}` })), cargo: job.cargo.map((c) => ({ ...c, id: `${c.id}~${n}` })) };
    }
    jobs.push(job);
    events.push(makeEvent({ entityType: "job", entityId: job.id, type: "MIGRATED", at, source: "MIGRATION", data: { from: LEGACY_JOBS_KEY, legacyId: lj.id, ...(n > 1 ? { duplicateOf: lj.id } : {}) } }));
  }
  return { jobs, dropped: total - shaped.length, duplicates, events };
}

export async function bootstrapOperationalStore(inp: BootstrapInput): Promise<BootstrapReport> {
  const { store, seed, now } = inp;
  const at = now.toISOString();
  const seedMeta = await store.getMeta<SeedMeta>("demoSeed");
  const legacyMeta = await store.getMeta<LegacyImportMeta>("legacyImport");
  if (seedMeta && legacyMeta) return { seeded: false, legacy: null, skippedLegacy: false };
  // (Phase 5.6B upkeep — demo records, invoice counter, demo re-anchoring — runs separately; see upkeep.ts.)

  const current = await store.loadAll();
  const has = { jobs: new Set(current.jobs.map((x) => x.id)), trucks: new Set(current.trucks.map((x) => x.id)), drivers: new Set(current.drivers.map((x) => x.id)), trailers: new Set(current.trailers.map((x) => x.id)) };

  const putJobs: Job[] = [];
  const events: OperationalEvent[] = [];
  const meta: Record<string, unknown> = {};
  let legacy: LegacyImportMeta | null = null;
  let skippedLegacy = false;

  if (!legacyMeta) {
    if (inp.legacyMarker) {
      skippedLegacy = true;
      meta.legacyImport = { at, found: inp.legacyRaw !== null, imported: 0, dropped: 0, duplicates: 0, skipped: "marker" };
    } else {
      let parsed: unknown = null;
      let unreadable = false;
      if (inp.legacyRaw !== null) {
        try {
          parsed = JSON.parse(inp.legacyRaw);
        } catch {
          unreadable = true;
        }
      }
      const conv = convertLegacyJobs(parsed, inp.legacySeedJobs, at);
      for (const j of conv.jobs) if (!has.jobs.has(j.id)) { putJobs.push(j); has.jobs.add(j.id); }
      events.push(...conv.events.filter((e) => putJobs.some((j) => j.id === e.entityId)));
      legacy = { at, found: inp.legacyRaw !== null, imported: putJobs.length, dropped: conv.dropped + (unreadable ? 1 : 0), duplicates: conv.duplicates };
      meta.legacyImport = legacy;
    }
  }

  const put: { trucks: Truck[]; drivers: Driver[]; trailers: Trailer[]; jobs: Job[] } = { trucks: [], drivers: [], trailers: [], jobs: putJobs };
  let seeded = false;
  if (!seedMeta) {
    seeded = true;
    const ids: SeedMeta["ids"] = { trucks: [], drivers: [], trailers: [], jobs: [] };
    const add = <K extends keyof typeof put>(k: K, recs: (typeof put)[K], type: "truck" | "driver" | "trailer" | "job") => {
      for (const r of recs) {
        ids[k].push(r.id);
        if (has[k].has(r.id)) continue; // legacy import (user's state of a demo job) wins
        (put[k] as { id: string }[]).push(structuredClone(r));
        has[k].add(r.id);
        events.push(makeEvent({ entityType: type, entityId: r.id, type: "DEMO_SEEDED", at, source: "DEMO_SEED" }));
      }
    };
    add("trucks", seed.trucks, "truck");
    add("drivers", seed.drivers, "driver");
    add("trailers", seed.trailers, "trailer");
    add("jobs", seed.jobs, "job");
    meta.demoSeed = { at, ids } satisfies SeedMeta;
  }

  const allJobNumbers = [...current.jobs, ...put.jobs].map((j) => j.jobNumber);
  meta["counter:job"] = Math.max(Number((await store.getMeta<number>("counter:job")) ?? 0), maxJobNumber(allJobNumbers));
  meta.schema = { version: 1, at };

  await store.commit({ put, events, meta });
  return { seeded, legacy, skippedLegacy };
}

/**
 * Explicit "repor dados demo": removes every demo record (isDemo) and writes the seed again.
 * User records are never touched. Jobs created by the user that reference a demo resource
 * keep their reference (it resolves again once the seed is back).
 */
export async function resetDemoData(store: OperationalStore, seed: DemoSeed, now: Date): Promise<{ removed: number; seeded: number }> {
  const at = now.toISOString();
  const cur = await store.loadAll();
  const remove = {
    jobs: cur.jobs.filter((x) => x.isDemo).map((x) => x.id),
    trucks: cur.trucks.filter((x) => x.isDemo).map((x) => x.id),
    trailers: cur.trailers.filter((x) => x.isDemo).map((x) => x.id),
    drivers: cur.drivers.filter((x) => x.isDemo).map((x) => x.id),
    customers: cur.customers.filter((x) => x.isDemo).map((x) => x.id),
    sites: cur.sites.filter((x) => x.isDemo).map((x) => x.id),
    // Demo documents go with their demo jobs. Counters are NOT rewound: numbers are never reused.
    documents: cur.documents.filter((x) => x.isDemo).map((x) => x.id),
  };
  // A user record that happens to share a seed id is kept; the seed record is skipped.
  const userIds = new Set([...cur.jobs, ...cur.trucks, ...cur.trailers, ...cur.drivers, ...cur.customers, ...cur.sites].filter((x) => !x.isDemo).map((x) => x.id));
  const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !userIds.has(x.id)).map((x) => structuredClone(x));
  const put = { jobs: keep(seed.jobs), trucks: keep(seed.trucks), trailers: keep(seed.trailers), drivers: keep(seed.drivers), customers: keep(seed.customers), sites: keep(seed.sites) };
  const events: OperationalEvent[] = [];
  for (const [type, recs] of [["job", put.jobs], ["truck", put.trucks], ["trailer", put.trailers], ["driver", put.drivers]] as const) {
    for (const r of recs) events.push(makeEvent({ entityType: type, entityId: r.id, type: "DEMO_SEEDED", at, source: "DEMO_SEED", reason: "repor dados demo" }));
  }
  const allNumbers = [...cur.jobs.filter((j) => !j.isDemo), ...put.jobs].map((j) => j.jobNumber);
  await store.commit({
    remove,
    put,
    events,
    meta: {
      demoSeed: { at, ids: { trucks: put.trucks.map((x) => x.id), drivers: put.drivers.map((x) => x.id), trailers: put.trailers.map((x) => x.id), jobs: put.jobs.map((x) => x.id) } } satisfies SeedMeta,
      "counter:job": Math.max(Number((await store.getMeta<number>("counter:job")) ?? 0), maxJobNumber(allNumbers)),
      demoRecordsSeed: { at, customers: put.customers.map((x) => x.id), sites: put.sites.map((x) => x.id) },
      // Freshly built seed dates are relative to "now".
      demoAnchorAt: at,
    },
  });
  const removed = remove.jobs.length + remove.trucks.length + remove.trailers.length + remove.drivers.length + remove.customers.length + remove.sites.length + remove.documents.length;
  return { removed, seeded: events.length };
}
