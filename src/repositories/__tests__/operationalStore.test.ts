import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { buildDemoSeed, legacyDemoJobs } from "../../data/mockData";
import type { LegacyJob } from "../../data/types";
import { makeEvent } from "../../domain/events";
import { makeJob, makeTruck } from "../../domain/__tests__/fixtures";
import { bootstrapOperationalStore, convertLegacyJobs, resetDemoData, type BootstrapInput } from "../bootstrap";
import { ConcurrencyError, IdbOperationalStore, MemoryOperationalStore, OPS_DB, type OperationalStore } from "../operationalStore";

const AT = "2026-10-04T10:00:00.000Z";
const seed = () => buildDemoSeed(AT);

async function idb(factory = new IDBFactory()) {
  return { factory, store: await IdbOperationalStore.open(OPS_DB, factory) };
}
function input(store: OperationalStore, over: Partial<BootstrapInput> = {}): BootstrapInput {
  return { store, seed: seed(), legacySeedJobs: legacyDemoJobs, legacyRaw: null, legacyMarker: false, now: new Date(AT), ...over };
}

describe.each([
  ["memory", async () => new MemoryOperationalStore() as OperationalStore],
  ["indexeddb", async () => (await idb()).store as OperationalStore],
])("OperationalStore (%s)", (_n, make) => {
  it("commit writes records, events and meta together; nextCounter is monotonic with a floor", async () => {
    const s = await make();
    const job = makeJob();
    await s.commit({ put: { jobs: [job], trucks: [makeTruck()] }, events: [makeEvent({ entityType: "job", entityId: job.id, type: "JOB_CREATED", at: AT, source: "LOCAL_USER" })], meta: { k: 1 } });
    const snap = await s.loadAll();
    expect([snap.jobs.length, snap.trucks.length]).toEqual([1, 1]);
    expect(await s.listEvents(job.id)).toHaveLength(1);
    expect(await s.getMeta("k")).toBe(1);
    expect(await s.nextCounter("job", 4201)).toBe(4202);
    expect(await s.nextCounter("job", 0)).toBe(4203);
    expect(await s.nextCounter("job", 9000)).toBe(9001);
  });

  it("optimistic revision check aborts the WHOLE commit", async () => {
    const s = await make();
    const job = makeJob();
    await s.commit({ put: { jobs: [job] } });
    const stale = { ...job, revision: 5 };
    await expect(s.commit({ put: { jobs: [stale], trucks: [makeTruck()] }, expectJobRevisions: { [job.id]: 3 } })).rejects.toBeInstanceOf(ConcurrencyError);
    const snap = await s.loadAll();
    expect(snap.jobs[0]!.revision).toBe(1);
    expect(snap.trucks).toHaveLength(0);
    await s.commit({ put: { jobs: [{ ...job, revision: 2 }] }, expectJobRevisions: { [job.id]: 1 } });
    expect((await s.loadAll()).jobs[0]!.revision).toBe(2);
  });
});

describe("IndexedDB persistence across reloads", () => {
  it("data survives closing and reopening the database", async () => {
    const { factory, store } = await idb();
    await store.commit({ put: { jobs: [makeJob()] } });
    store.close();
    const again = await IdbOperationalStore.open(OPS_DB, factory);
    expect((await again.loadAll()).jobs.map((j) => j.jobNumber)).toEqual(["J-000001"]);
  });

  it("separate database from Road Intelligence (fleetos-ingestion is untouched)", async () => {
    const factory = new IDBFactory();
    await IdbOperationalStore.open(OPS_DB, factory);
    const dbs = await factory.databases();
    expect(dbs.map((d) => d.name)).toEqual(["fleetos-operations"]);
  });
});

describe("bootstrap: demo seed + legacy import", () => {
  it("seeds demo records once; deleted demo trucks never reappear on reload", async () => {
    const { factory, store } = await idb();
    const r1 = await bootstrapOperationalStore(input(store));
    expect(r1.seeded).toBe(true);
    const snap = await store.loadAll();
    expect(snap.trucks.length).toBe(seed().trucks.length);
    expect(snap.trucks.every((t) => t.isDemo)).toBe(true);
    // user deletes a demo truck
    await store.commit({ remove: { trucks: ["t1"] } });
    store.close();
    const reopened = await IdbOperationalStore.open(OPS_DB, factory);
    const r2 = await bootstrapOperationalStore(input(reopened));
    expect(r2.seeded).toBe(false);
    expect((await reopened.loadAll()).trucks.some((t) => t.id === "t1")).toBe(false);
  });

  it("job counter floor covers legacy numbers (no reuse of J-4201..)", async () => {
    const store = new MemoryOperationalStore();
    await bootstrapOperationalStore(input(store));
    expect(await store.nextCounter("job", 0)).toBe(4204);
  });

  it("imports legacy localStorage jobs once — deterministic, idempotent, duplicates preserved, malformed dropped", async () => {
    const user: LegacyJob = { ...(legacyDemoJobs[0] as LegacyJob), id: "J-4301", reference: "U-1", client: "Cliente real", isDemo: undefined };
    const dup: LegacyJob = { ...user, client: "Outro com o mesmo id (bug antigo)" };
    const edited: LegacyJob = { ...(legacyDemoJobs[0] as LegacyJob), notes: "nota do utilizador" };
    const raw = JSON.stringify([user, dup, edited, null, { nope: 1 }, "x"]);

    const a = convertLegacyJobs(JSON.parse(raw), legacyDemoJobs, AT);
    const b = convertLegacyJobs(JSON.parse(raw), legacyDemoJobs, AT);
    expect(a.jobs).toEqual(b.jobs); // deterministic
    expect(a.dropped).toBe(3);
    expect(a.duplicates).toBe(1);
    expect(a.jobs.map((j) => [j.id, j.jobNumber])).toEqual([["J-4301", "J-4301"], ["J-4301~2", "J-4301/2"], ["J-4201", "J-4201"]]);

    const { factory, store } = await idb();
    const r = await bootstrapOperationalStore(input(store, { legacyRaw: raw }));
    expect(r.legacy).toMatchObject({ found: true, imported: 3, duplicates: 1, dropped: 3 });
    const snap = await store.loadAll();
    const j4201 = snap.jobs.find((j) => j.id === "J-4201")!;
    expect(j4201.notes).toBe("nota do utilizador"); // user's state of a demo job wins over the seed
    expect(j4201.isDemo).toBe(true);
    expect(snap.jobs.find((j) => j.id === "J-4301")!.isDemo).toBeUndefined();
    expect(snap.jobs.find((j) => j.id === "J-4301")!.cargo).toHaveLength(1);
    expect((await store.listEvents("J-4301~2"))[0]!.data).toMatchObject({ duplicateOf: "J-4301" });

    // second run (reload) does nothing
    store.close();
    const again = await IdbOperationalStore.open(OPS_DB, factory);
    const before = (await again.loadAll()).jobs.length;
    const r2 = await bootstrapOperationalStore(input(again, { legacyRaw: raw }));
    expect(r2.legacy).toBeNull();
    expect((await again.loadAll()).jobs.length).toBe(before);
  });

  it("a localStorage marker (import already done elsewhere) prevents re-import into an empty store", async () => {
    const store = new MemoryOperationalStore();
    const raw = JSON.stringify([{ ...(legacyDemoJobs[0] as LegacyJob), id: "J-4400", isDemo: undefined }]);
    const r = await bootstrapOperationalStore(input(store, { legacyRaw: raw, legacyMarker: true }));
    expect(r.skippedLegacy).toBe(true);
    expect((await store.loadAll()).jobs.some((j) => j.id === "J-4400")).toBe(false);
  });

  it("legacy jobs past backlog are PLANNED; backlog UNPLANNED; unreadable JSON is counted, not fatal", async () => {
    const conv = convertLegacyJobs(legacyDemoJobs, legacyDemoJobs, AT);
    for (const j of conv.jobs) expect(j.planStatus).toBe(j.status === "backlog" || j.status === "cancelled" ? "UNPLANNED" : "PLANNED");
    const store = new MemoryOperationalStore();
    const r = await bootstrapOperationalStore(input(store, { legacyRaw: "{not json" }));
    expect(r.legacy).toMatchObject({ found: true, imported: 0, dropped: 1 });
  });

  it.each([
    ["memory", async () => new MemoryOperationalStore() as OperationalStore],
    ["indexeddb", async () => (await idb()).store as OperationalStore],
  ])("reset demo restores ALL demo records and never touches user records (%s)", async (_n, make) => {
    const store = await make();
    await bootstrapOperationalStore(input(store));
    const mine = makeTruck("user-truck", { plate: "ZZ-99-ZZ" });
    await store.commit({ put: { trucks: [mine], jobs: [{ ...makeJob("user-job"), assignedTruckId: "t1" }] }, remove: { trucks: ["t1", "t2"] } });
    const r = await resetDemoData(store, seed(), new Date(AT));
    expect(r.seeded).toBeGreaterThan(0);
    const snap = await store.loadAll();
    expect(snap.trucks.some((t) => t.id === "t1")).toBe(true);
    expect(snap.trucks.some((t) => t.id === "user-truck")).toBe(true);
    expect(snap.jobs.find((j) => j.id === "user-job")!.assignedTruckId).toBe("t1");
    // every seed record is back (including those that still existed before the reset)
    const s0 = seed();
    expect(snap.trucks.filter((t) => t.isDemo).map((t) => t.id).sort()).toEqual(s0.trucks.map((t) => t.id).sort());
    expect(snap.drivers.filter((d) => d.isDemo)).toHaveLength(s0.drivers.length);
    expect(snap.trailers.filter((t) => t.isDemo)).toHaveLength(s0.trailers.length);
    expect(snap.jobs.filter((j) => j.isDemo)).toHaveLength(s0.jobs.length);
  });

  it("commit applies removals before puts (same id removed and re-put survives)", async () => {
    const store = new MemoryOperationalStore();
    const t = makeTruck();
    await store.commit({ put: { trucks: [t] } });
    await store.commit({ remove: { trucks: [t.id] }, put: { trucks: [{ ...t, model: "novo" }] } });
    expect((await store.loadAll()).trucks[0]!.model).toBe("novo");
  });
});
