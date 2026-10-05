import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { Job } from "../../data/types";
import { buildDemoSeed } from "../../data/mockData";
import { makeJob } from "../../domain/__tests__/fixtures";
import type { CompanySnapshot } from "../../domain/documents/documents";
import { renderDocumentHtml } from "../../lib/documentRender";
import { bootstrapOperationalStore, resetDemoData } from "../../repositories/bootstrap";
import { IdbOperationalStore, MemoryOperationalStore, OPS_DB, type OperationalStore } from "../../repositories/operationalStore";
import { migrateInvoiceCounter, seedDemoRecords } from "../../repositories/upkeep";
import { OperationsService } from "../operations";

let tick = Date.parse("2026-10-05T09:00:00Z");
const clock = () => new Date((tick += 1_000));

const COMPANY: CompanySnapshot = {
  name: "Transportes Teste, Lda.",
  nif: "500000000",
  address: "Rua A, 1",
  postalCity: "4470-000 Maia",
  country: "Portugal",
  phone: "+351 200 000 000",
  email: "geral@teste.pt",
  licencaComunitaria: "CM 1",
  iban: "PT50 0000",
  invoicePrefix: "FT 2026/",
  vatPct: 23,
  paymentTermsDays: 30,
};

function must<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
}

const delivered = (id: string, n: string, over: Partial<Job> = {}): Job => ({ ...makeJob(id, {}, n), status: "delivered", rateEur: 1000, planStatus: "PLANNED", ...over });

async function open(factory: IDBFactory) {
  const store = await IdbOperationalStore.open(OPS_DB, factory);
  const svc = new OperationsService(store, clock);
  await svc.load();
  return { store, svc };
}

async function seeded(jobs: Job[], factory = new IDBFactory()) {
  const store = await IdbOperationalStore.open(OPS_DB, factory);
  await store.commit({ put: { jobs } });
  store.close?.();
  return factory;
}

describe("Documents — persistent numbering and snapshots", () => {
  it("issuing allocates FT 2026/0001; reload shows the same document and number", async () => {
    const factory = await seeded([delivered("a", "J-000001")]);
    const { svc } = await open(factory);
    const doc = must(await svc.issueDocument("a", "INVOICE", COMPANY));
    expect(doc.number).toBe("FT 2026/0001");
    expect(doc.status).toBe("ISSUED");

    const again = await open(factory);
    const docs = again.svc.getState().documents;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.number).toBe("FT 2026/0001");
    expect(docs[0]!.snapshot).toEqual(doc.snapshot);
  });

  it("opening / reprinting never consumes a number", async () => {
    const factory = await seeded([delivered("a", "J-000001"), delivered("b", "J-000002")]);
    const { svc } = await open(factory);
    const doc = must(await svc.issueDocument("a", "INVOICE", COMPANY));
    const html1 = renderDocumentHtml(doc);
    const html2 = renderDocumentHtml(doc);
    expect(html1).toBe(html2);
    expect(html1).toContain("FT 2026/0001");
    expect(await svc.peekNextNumber("invoice:FT 2026/")).toBe(2);
    expect(must(await svc.issueDocument("b", "INVOICE", COMPANY)).number).toBe("FT 2026/0002");
  });

  it("concurrent issues get distinct consecutive numbers", async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => delivered(`c${i}`, `J-00001${i}`));
    const factory = await seeded(jobs);
    const { svc } = await open(factory);
    const docs = await Promise.all(jobs.map((j) => svc.issueDocument(j.id, "INVOICE", COMPANY)));
    const numbers = docs.map((d) => must(d).number).sort();
    expect(new Set(numbers).size).toBe(6);
    expect(numbers).toEqual(["FT 2026/0001", "FT 2026/0002", "FT 2026/0003", "FT 2026/0004", "FT 2026/0005", "FT 2026/0006"]);
  });

  it("a second active invoice for the same job is refused and does not consume a number", async () => {
    const factory = await seeded([delivered("a", "J-000001"), delivered("b", "J-000002")]);
    const { svc } = await open(factory);
    must(await svc.issueDocument("a", "INVOICE", COMPANY));
    const dup = await svc.issueDocument("a", "INVOICE", COMPANY);
    expect(dup.ok).toBe(false);
    expect(must(await svc.issueDocument("b", "INVOICE", COMPANY)).number).toBe("FT 2026/0002");
  });

  it("invoice only after delivery; CMR from assignment; refused issue consumes nothing", async () => {
    const factory = await seeded([{ ...makeJob("x", {}, "J-000009"), rateEur: 500 }]);
    const { svc } = await open(factory);
    expect((await svc.issueDocument("x", "INVOICE", COMPANY)).ok).toBe(false);
    expect((await svc.issueDocument("x", "CMR", COMPANY)).ok).toBe(false); // backlog
    expect(await svc.peekNextNumber("invoice:FT 2026/")).toBe(1);
  });

  it("void keeps the number; the next invoice never reuses it", async () => {
    const factory = await seeded([delivered("a", "J-000001")]);
    const { svc } = await open(factory);
    const d1 = must(await svc.issueDocument("a", "INVOICE", COMPANY));
    expect((await svc.voidDocument(d1.id, "x")).ok).toBe(false); // reason required
    const v = must(await svc.voidDocument(d1.id, "NIF errado"));
    expect(v.status).toBe("VOID");
    expect(v.number).toBe("FT 2026/0001");
    expect(renderDocumentHtml(v)).toContain("ANULADO");
    const d2 = must(await svc.issueDocument("a", "INVOICE", COMPANY));
    expect(d2.number).toBe("FT 2026/0002");
    const events = await svc.listEvents("a");
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["DOCUMENT_ISSUED", "DOCUMENT_VOIDED"]));
  });

  it("editing the customer after issue: reprint still shows the original buyer", async () => {
    const factory = await seeded([]);
    const { svc } = await open(factory);
    const c = must(await svc.saveCustomer(null, { name: "Cliente Original, SA", nif: "501234567", billingAddress: "Rua Velha 1" }));
    const { store } = await open(factory);
    await store.commit({ put: { jobs: [delivered("a", "J-000001", { customerId: c.id, client: c.name })] } });
    const s2 = await open(factory);
    const doc = must(await s2.svc.issueDocument("a", "INVOICE", COMPANY));
    must(await s2.svc.saveCustomer(c.id, { name: "Cliente Renomeado, SA", nif: "509999990", billingAddress: "Rua Nova 2" }));
    const reloaded = (await open(factory)).svc.getState().documents[0]!;
    const html = renderDocumentHtml(reloaded);
    expect(html).toContain("Cliente Original, SA");
    expect(html).toContain("501234567");
    expect(html).not.toContain("Renomeado");
    expect(reloaded.snapshot.buyer.billingAddress).toBe("Rua Velha 1");
    expect(doc.customerId).toBe(c.id);
  });

  it("CMR numbering is a separate series (CMR-YYYY-NNNN)", async () => {
    const factory = await seeded([{ ...delivered("a", "J-000001"), status: "in_transit" }]);
    const { svc } = await open(factory);
    const cmr = must(await svc.issueDocument("a", "CMR", COMPANY));
    expect(cmr.number).toBe("CMR-2026-0001");
    expect(renderDocumentHtml(cmr)).toContain("CMR-2026-0001");
  });
});

describe("Legacy invoice counter migration (Settings → store), exactly once", () => {
  it("continues after the legacy sequence and is idempotent", async () => {
    const factory = await seeded([delivered("a", "J-000001")]);
    const store = await IdbOperationalStore.open(OPS_DB, factory);
    const now = new Date("2026-10-05T10:00:00Z");
    expect((await migrateInvoiceCounter(store, { invoicePrefix: "FT 2026/", invoiceNextSeq: 42 }, now)).migrated).toBe(true);
    // A second run (e.g. after the legacy value moved on) never changes the counter again.
    expect((await migrateInvoiceCounter(store, { invoicePrefix: "FT 2026/", invoiceNextSeq: 99 }, now)).migrated).toBe(false);
    const svc = new OperationsService(store, clock);
    await svc.load();
    expect(must(await svc.issueDocument("a", "INVOICE", COMPANY)).number).toBe("FT 2026/0042");
  });

  it("no legacy settings → marks migrated, counter untouched", async () => {
    const store = new MemoryOperationalStore();
    const r = await migrateInvoiceCounter(store, null, new Date());
    expect(r).toEqual({ migrated: true, series: undefined, floor: undefined });
    expect(await store.getMeta("counter:invoice:FT 2026/")).toBeUndefined();
  });
});

describe("Customers and sites", () => {
  async function svcMem() {
    const store: OperationalStore = new MemoryOperationalStore();
    const svc = new OperationsService(store, clock);
    await svc.load();
    return { store, svc };
  }

  it("create, validate, edit, archive, restore; NIF unique among active customers", async () => {
    const { svc } = await svcMem();
    expect((await svc.saveCustomer(null, { name: "" })).ok).toBe(false);
    expect((await svc.saveCustomer(null, { name: "X", nif: "12" })).ok).toBe(false);
    const a = must(await svc.saveCustomer(null, { name: "Sonae MC", nif: "500100144" }));
    expect((await svc.saveCustomer(null, { name: "Outro", nif: "500100144" })).ok).toBe(false);
    must(await svc.setArchived("customer", a.id, true));
    expect(svc.getState().customers[0]!.archivedAt).toBeTruthy();
    must(await svc.saveCustomer(null, { name: "Outro", nif: "500100144" })); // archived one no longer blocks
    must(await svc.setArchived("customer", a.id, false));
    expect(svc.getState().customers.find((c) => c.id === a.id)!.archivedAt).toBeUndefined();
  });

  it("referential integrity: a customer used by a job / site cannot be hard-deleted", async () => {
    const { store, svc } = await svcMem();
    const c = must(await svc.saveCustomer(null, { name: "Cliente" }));
    const site = must(await svc.saveSite(null, { name: "Armazém", address: "Rua 1, Porto", customerId: c.id, lat: 41.15, lng: -8.61 }));
    expect((await svc.deleteResource("customer", c.id)).ok).toBe(false);
    await store.commit({ put: { jobs: [{ ...makeJob("j", {}, "J-000001"), customerId: c.id, stops: makeJob("j").stops.map((s) => ({ ...s, siteId: site.id })) }] } });
    await svc.load();
    const r = await svc.deleteResource("site", site.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Arquive/);
    const free = must(await svc.saveCustomer(null, { name: "Sem uso" }));
    must(await svc.deleteResource("customer", free.id));
    expect(svc.getState().customers.some((x) => x.id === free.id)).toBe(false);
  });

  it("a site requires coordinates and keeps the address its coordinates belong to", async () => {
    const { svc } = await svcMem();
    expect((await svc.saveSite(null, { name: "S", address: "Rua 1", lat: NaN, lng: NaN })).ok).toBe(false);
    const s = must(await svc.saveSite(null, { name: "S", address: "Rua 1, Matosinhos", lat: 41.18, lng: -8.69 }));
    expect(s.geocodedAddress).toBe("Rua 1, Matosinhos");
    const moved = must(await svc.saveSite(s.id, { name: "S", address: "Rua 2, Matosinhos", lat: 41.18, lng: -8.69, geocodedAddress: s.geocodedAddress }));
    expect(moved.geocodedAddress).toBe("Rua 1, Matosinhos"); // stale: address changed, not re-located
  });

  it("job keeps customerId + client snapshot; stop keeps siteId + its own address", async () => {
    const { svc } = await svcMem();
    const c = must(await svc.saveCustomer(null, { name: "Cliente A" }));
    const draft = { ...(await import("../../domain/__tests__/fixtures")).bragaDraft(), customerId: c.id, client: c.name };
    draft.stops = draft.stops.map((s, i) => (i === 0 ? { ...s, siteId: "site-x" } : s));
    const j = must(await svc.createJob(draft));
    expect(j.customerId).toBe(c.id);
    expect(j.stops[0]!.siteId).toBe("site-x");
    must(await svc.saveCustomer(c.id, { name: "Cliente A (novo nome)" }));
    expect(svc.getState().jobs.find((x) => x.id === j.id)!.client).toBe("Cliente A");
  });
});

describe("Schema v2 migration and demo master data", () => {
  it("v1 data survives the upgrade; customers/sites/documents stores exist", async () => {
    const factory = new IDBFactory();
    const store = await IdbOperationalStore.open(OPS_DB, factory);
    await store.commit({ put: { jobs: [makeJob()] } });
    store.close?.();
    const again = await IdbOperationalStore.open(OPS_DB, factory);
    const snap = await again.loadAll();
    expect(snap.jobs).toHaveLength(1);
    expect(snap.customers).toEqual([]);
    expect(snap.sites).toEqual([]);
    expect(snap.documents).toEqual([]);
  });

  it("demo seed derives deterministic customers/sites and links demo jobs", () => {
    const a = buildDemoSeed("2026-10-05T10:00:00.000Z");
    const b = buildDemoSeed("2026-10-05T10:00:00.000Z");
    expect(a.customers.map((c) => c.id)).toEqual(b.customers.map((c) => c.id));
    expect(a.customers.length).toBeGreaterThan(3);
    for (const j of a.jobs) {
      expect(a.customers.some((c) => c.id === j.customerId)).toBe(true);
      for (const s of j.stops) expect(a.sites.some((x) => x.id === s.siteId)).toBe(true);
    }
  });

  it("seedDemoRecords links existing DEMO jobs only, once", async () => {
    const store = new MemoryOperationalStore();
    const seed = buildDemoSeed("2026-10-05T10:00:00.000Z");
    const unlinked = seed.jobs.map((j) => {
      const copy = { ...j, stops: j.stops.map((s) => ({ ...s })) };
      delete copy.customerId;
      for (const s of copy.stops) delete s.siteId;
      return copy;
    });
    const user = { ...makeJob("user-1", {}, "J-900001"), client: unlinked[0]!.client };
    await store.commit({ put: { jobs: [...unlinked, user] } });
    expect(await seedDemoRecords(store, seed, new Date())).toBe(true);
    expect(await seedDemoRecords(store, seed, new Date())).toBe(false);
    const snap = await store.loadAll();
    expect(snap.customers.length).toBe(seed.customers.length);
    expect(snap.jobs.find((j) => j.id === "user-1")!.customerId).toBeUndefined();
    expect(snap.jobs.filter((j) => j.isDemo).every((j) => j.customerId)).toBe(true);
  });

  it("resetting demo data restores demo customers/sites and removes demo documents, never user records", async () => {
    const store = new MemoryOperationalStore();
    const seed = buildDemoSeed("2026-10-05T10:00:00.000Z");
    await bootstrapOperationalStore({ store, seed, legacySeedJobs: [], legacyRaw: null, legacyMarker: false, now: new Date("2026-10-05T10:00:00Z") });
    await seedDemoRecords(store, seed, new Date());
    const svc = new OperationsService(store, clock);
    await svc.load();
    const mine = must(await svc.saveCustomer(null, { name: "Meu cliente" }));
    const demoCustomer = svc.getState().customers.find((c) => c.isDemo)!;
    must(await svc.deleteResource("customer", (await svc.saveCustomer(null, { name: "Temp" }).then(must)).id));
    await resetDemoData(store, seed, new Date());
    const snap = await store.loadAll();
    expect(snap.customers.some((c) => c.id === mine.id)).toBe(true);
    expect(snap.customers.some((c) => c.id === demoCustomer.id)).toBe(true);
  });
});
