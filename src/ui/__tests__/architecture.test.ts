import { describe, expect, it } from "vitest";
import type { Job } from "../../data/types";
import { buildDemoSeed } from "../../data/mockData";
import { makeDriver, makeJob } from "../../domain/__tests__/fixtures";
import { deriveAlerts } from "../../domain/alerts";
import { complianceCounts, driverComplianceItems, filterCompliance } from "../../domain/compliance";
import { issueDocument, missingDocuments, type CompanySnapshot } from "../../domain/documents/documents";
import { isRelativeDemoJob, reanchorDemo, reanchorDemoStore } from "../../repositories/upkeep";
import { MemoryOperationalStore } from "../../repositories/operationalStore";
import { coverageHeadlinePt } from "../coverageText";
import { dispatchQueue } from "../dispatchModel";
import { upcomingMoments } from "../overviewModel";
import { buildSearchIndex, searchAll } from "../search/globalSearch";

const AT = "2026-10-05T10:00:00.000Z";
const COMPANY: CompanySnapshot = { name: "T", nif: "500000000", address: "a", postalCity: "p", country: "PT", phone: "", email: "", licencaComunitaria: "", iban: "", invoicePrefix: "FT 2026/", vatPct: 23, paymentTermsDays: 30 };

describe("Global search", () => {
  const seed = buildDemoSeed(AT);
  const j4201 = seed.jobs.find((j) => j.jobNumber === "J-4201")!;
  const invoice = issueDocument({ id: "doc-1", type: "INVOICE", seq: 7, job: { ...j4201, status: "delivered" }, company: COMPANY, now: new Date(AT), existing: [] });
  if (!invoice.ok) throw new Error("fixture");
  const ix = buildSearchIndex({ ...seed, documents: [invoice.value.document] });
  const titles = (q: string) => searchAll(ix, q).map((h) => `${h.kind}:${h.title}`);

  it("job number — exact match first", () => {
    expect(titles("J-4201")[0]).toBe("job:J-4201");
    expect(titles("j4201")[0]).toBe("job:J-4201");
  });
  it("customer name (Sonae) and the jobs for it", () => {
    const t = titles("Sonae");
    expect(t.some((x) => x.startsWith("customer:") && /sonae/i.test(x))).toBe(true);
    expect(t.some((x) => x.startsWith("job:"))).toBe(true);
  });
  it("pickup / delivery city — Matosinhos and accent-insensitive Guimarães", () => {
    expect(titles("Matosinhos")).toContain("place:Matosinhos");
    expect(titles("guimaraes").some((x) => /Guimar/.test(x))).toBe(true);
    expect(searchAll(ix, "Guimarães").find((h) => h.kind === "place")!.to).toBe("/work?q=Guimar%C3%A3es");
  });
  it("truck plate with or without separators", () => {
    expect(titles("11-ST-78")[0]).toBe("truck:11-ST-78");
    expect(titles("11st78")).toContain("truck:11-ST-78");
  });
  it("driver name", () => {
    expect(titles("Carlos Mendes")).toContain("driver:Carlos Mendes");
  });
  it("document number (FT 2026/…) leads to the job's Documents tab", () => {
    const hit = searchAll(ix, "FT 2026/0007")[0]!;
    expect(hit.kind).toBe("document");
    expect(hit.to).toBe(`/work/${j4201.id}?tab=documents`);
    expect(titles("FT 2026").some((x) => x.startsWith("document:"))).toBe(true);
  });
  it("short queries return nothing; results are capped", () => {
    expect(searchAll(ix, "a")).toEqual([]);
    expect(searchAll(ix, "e").length).toBe(0);
    expect(searchAll(ix, "ar").length).toBeLessThanOrEqual(16);
  });
});

describe("Alerts severity model", () => {
  it("maps facts to BLOCKER / ACTION_REQUIRED / RISK / INFORMATION; unknown data raises nothing", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    const broken = { ...makeJob("a", {}, "J-000001"), status: "assigned" as const, assignedTruckId: "gone" };
    const deliveredNoInvoice: Job = { ...makeJob("b", {}, "J-000002"), status: "delivered", rateEur: 900 };
    const expiring = makeDriver("d1", { cpc: { expiresOn: "2026-11-01" } });
    const unknown = makeDriver("d2", { cpc: {} });
    const alerts = deriveAlerts({ jobs: [broken, deliveredNoInvoice], trucks: [], trailers: [], drivers: [expiring, unknown], documents: [] }, now);
    const sev = (prefix: string) => alerts.find((a) => a.id.startsWith(prefix))?.severity;
    expect(sev("ref-")).toBe("BLOCKER");
    expect(sev("sla-a")).toBe("ACTION_REQUIRED");
    expect(sev("q-d1")).toBe("RISK");
    expect(sev("docs-pending")).toBe("INFORMATION");
    expect(alerts.some((a) => a.entityId === "d2")).toBe(false); // MISSING date ≠ alert
    expect(alerts[0]!.severity).toBe("BLOCKER");
  });
});

describe("Documents due", () => {
  it("CMR from loading; invoice after delivery with a rate", () => {
    const j = makeJob();
    expect(missingDocuments({ ...j, status: "assigned" }, [])).toEqual([]);
    expect(missingDocuments({ ...j, status: "loading" }, [])).toEqual(["CMR"]);
    expect(missingDocuments({ ...j, status: "delivered", rateEur: 100 }, [])).toEqual(["CMR", "INVOICE"]);
    expect(missingDocuments({ ...j, status: "delivered", rateEur: 0 }, [])).toEqual(["CMR"]);
  });
});

describe("Compliance register", () => {
  it("drivers only, filters by state, unknown is its own neutral bucket, archived excluded", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    const drivers = [
      makeDriver("a", { cpc: { expiresOn: "2026-09-01" } }),
      makeDriver("b", { cpc: { expiresOn: "2026-10-20" } }),
      makeDriver("c", { cpc: {} }),
      { ...makeDriver("z", { cpc: { expiresOn: "2020-01-01" } }), archivedAt: AT },
    ];
    const items = driverComplianceItems(drivers, now);
    expect(items.every((i) => i.subject.kind === "driver" && i.subject.id !== "z")).toBe(true);
    const counts = complianceCounts(items);
    expect(counts.expired).toBeGreaterThanOrEqual(1);
    expect(counts.expiring).toBeGreaterThanOrEqual(1);
    expect(filterCompliance(items, "missing").every((i) => i.state === "MISSING")).toBe(true);
    expect(filterCompliance(items, "all")[0]!.state).toBe("EXPIRED");
    expect(items.some((i) => i.state === "NOT_HELD")).toBe(false);
  });
});

describe("Dispatch queue", () => {
  it("holds only jobs to plan and plans to redo", () => {
    const j = makeJob();
    const jobs: Job[] = [
      { ...j, id: "1", status: "backlog" },
      { ...j, id: "2", status: "assigned", planStatus: "REPLAN_REQUIRED" },
      { ...j, id: "3", status: "assigned", planStatus: "PLANNED" },
      { ...j, id: "4", status: "in_transit", planStatus: "PLANNED" },
      { ...j, id: "5", status: "delivered", planStatus: "REPLAN_REQUIRED" },
    ];
    const q = dispatchQueue(jobs);
    expect(q.toPlan.map((x) => x.id)).toEqual(["1"]);
    expect(q.replan.map((x) => x.id)).toEqual(["2"]);
  });
});

describe("Overview «Próximas horas»", () => {
  it("planned pickups / deliveries / deadlines in range, ordered; completed and finished work excluded", () => {
    const now = new Date("2026-10-05T08:00:00Z");
    const base = makeJob();
    const mk = (id: string, start: string, end: string, over: Partial<Job> = {}): Job => ({
      ...base,
      id,
      stops: base.stops.map((s, i) => ({ ...s, windowStartAt: i === 0 ? start : end, windowEndAt: i === 0 ? start : end })),
      deliveryDeadline: end,
      ...over,
    });
    const m = upcomingMoments([mk("a", "2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z"), mk("b", "2026-10-05T07:00:00Z", "2026-10-05T10:00:00Z"), mk("c", "2026-10-05T09:30:00Z", "2026-10-06T12:00:00Z", { status: "delivered" })], now, 12);
    expect(m.map((x) => `${x.job.id}:${x.kind}`)).toEqual(["a:pickup", "b:delivery", "a:delivery"]);
  });
});

describe("Demo date re-anchoring", () => {
  const seed = buildDemoSeed("2026-10-01T10:00:00.000Z");
  const later = "2026-10-05T10:00:00.000Z";

  it("shifts relative demo jobs by the elapsed time, preserving durations and relationships", () => {
    const r = reanchorDemo(seed, "2026-10-01T10:00:00.000Z", later);
    const ms = Date.parse(later) - Date.parse("2026-10-01T10:00:00.000Z");
    expect(r.jobs.length).toBe(seed.jobs.filter(isRelativeDemoJob).length);
    for (const j of r.jobs) {
      const o = seed.jobs.find((x) => x.id === j.id)!;
      expect(Date.parse(j.deliveryDeadline) - Date.parse(o.deliveryDeadline)).toBe(ms);
      expect(Date.parse(j.deliveryDeadline) - Date.parse(j.pickupDeadline)).toBe(Date.parse(o.deliveryDeadline) - Date.parse(o.pickupDeadline));
      expect(j.assignedTruckId).toBe(o.assignedTruckId);
      expect(j.customerId).toBe(o.customerId);
      expect(j.stops.map((s) => s.siteId)).toEqual(o.stops.map((s) => s.siteId));
    }
  });

  it("never shifts user jobs or fixed-date regulatory fixtures", () => {
    const user = { ...makeJob("mine", {}, "J-900001") };
    const r = reanchorDemo({ ...seed, jobs: [...seed.jobs, user] }, "2026-10-01T10:00:00.000Z", later);
    expect(r.jobs.some((j) => j.id === "mine")).toBe(false);
    // Fixtures pinned to real dates (dated windows meet real road events) stay as authored.
    const pinned = seed.jobs.filter((j) => j.stops.some((s) => s.windowStartAt));
    expect(pinned.length).toBeGreaterThan(0);
    expect(r.jobs.some((j) => pinned.some((p) => p.id === j.id))).toBe(false);
  });

  it("is deterministic and idempotent through the store anchor (< 1 h → no change)", async () => {
    const store = new MemoryOperationalStore();
    await store.commit({ put: { jobs: seed.jobs, drivers: seed.drivers, trucks: seed.trucks }, meta: { demoSeed: { at: "2026-10-01T10:00:00.000Z", ids: {} } } });
    const first = await reanchorDemoStore(store, new Date(later));
    expect(first.shiftedMs).toBe(4 * 86_400_000);
    const snapA = await store.loadAll();
    const second = await reanchorDemoStore(store, new Date(Date.parse(later) + 10 * 60_000));
    expect(second.shiftedMs).toBe(0);
    expect(await store.loadAll()).toEqual(snapA);
    const d = snapA.drivers.find((x) => x.isDemo && x.cpc.expiresOn)!;
    const o = seed.drivers.find((x) => x.id === d.id)!;
    expect(Date.parse(`${d.cpc.expiresOn}T00:00:00Z`) - Date.parse(`${o.cpc.expiresOn}T00:00:00Z`)).toBe(4 * 86_400_000);
  });
});

describe("Coverage headline wording", () => {
  it("shows Portuguese text for the machine headline", () => {
    expect(coverageHeadlinePt("NO KNOWN CONSTRAINT FOUND BUT COVERAGE IS PARTIAL")).toBe("Sem restrições conhecidas — cobertura parcial");
    expect(coverageHeadlinePt("COVERAGE IS PARTIAL · 2 UNREVIEWED REPORT(S) NEAR ROUTE")).toBe("Cobertura parcial · 2 aviso(s) por rever junto à rota");
    expect(coverageHeadlinePt("ROUTE LEAVES SUPPORTED TERRITORY (~12.5 km outside Porto — ROAD INTELLIGENCE UNKNOWN THERE)")).toMatch(/^A rota sai do território suportado/);
  });
});
