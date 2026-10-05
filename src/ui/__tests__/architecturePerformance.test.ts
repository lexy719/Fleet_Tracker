import { describe, expect, it } from "vitest";
import type { Customer, Driver, Job, JobStatus, Site } from "../../data/types";
import { makeDriver, makeJob, makeTruck, NOW } from "../../domain/__tests__/fixtures";
import { deriveAlerts } from "../../domain/alerts";
import { driverComplianceItems, filterCompliance } from "../../domain/compliance";
import { issueDocument, missingDocuments, type CompanySnapshot, type OpsDocument } from "../../domain/documents/documents";
import { OperationsService } from "../../application/operations";
import { MemoryOperationalStore } from "../../repositories/operationalStore";
import { dispatchQueue } from "../dispatchModel";
import { upcomingMoments } from "../overviewModel";
import { fold } from "../records/RecordLists";
import { buildSearchIndex, searchAll } from "../search/globalSearch";

/* Measured cost of the Phase 5.6B computations at realistic-to-large volumes. */

const STATUSES: JobStatus[] = ["backlog", "queued", "assigned", "loading", "in_transit", "delivered", "invoiced", "cancelled"];
const CITIES = ["Porto", "Matosinhos", "Guimarães", "Braga", "Lisboa", "Setúbal", "Faro", "Coimbra", "Aveiro", "Viseu"];
const COMPANY: CompanySnapshot = { name: "T", nif: "500000000", address: "a", postalCity: "p", country: "PT", phone: "", email: "", licencaComunitaria: "", iban: "", invoicePrefix: "FT 2026/", vatPct: 23, paymentTermsDays: 30 };
const time = (fn: () => void, runs = 10) => {
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
};

const base = makeJob("base");
const jobs: Job[] = Array.from({ length: 2_000 }, (_, i) => ({
  ...base,
  id: `p${i}`,
  jobNumber: `J-${String(i).padStart(6, "0")}`,
  client: `Cliente ${i % 300}`,
  customerId: `c${i % 300}`,
  status: STATUSES[i % STATUSES.length]!,
  rateEur: 800,
  planStatus: i % 13 === 0 ? "REPLAN_REQUIRED" : base.planStatus,
  stops: base.stops.map((s, k) => ({ ...s, id: `p${i}s${k}`, city: CITIES[(i + k) % CITIES.length]!, siteId: `s${(i * 2 + k) % 1000}` })),
}));
const customers: Customer[] = Array.from({ length: 1_000 }, (_, i) => ({ id: `c${i}`, name: `Cliente ${i} Comércio, Lda.`, nif: String(500000000 + i), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }));
const sites: Site[] = Array.from({ length: 1_000 }, (_, i) => ({ id: `s${i}`, name: `Armazém ${i}`, address: `Rua ${i}, ${CITIES[i % CITIES.length]}`, locality: CITIES[i % CITIES.length], lat: 41, lng: -8.6, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }));
const drivers: Driver[] = Array.from({ length: 200 }, (_, i) => makeDriver(`d${i}`, { name: `Motorista ${i}`, cpc: { expiresOn: i % 3 ? "2027-01-01" : "2026-10-20" } }));
const trucks = Array.from({ length: 150 }, (_, i) => ({ ...makeTruck(`t${i}`), plate: `${String(10 + (i % 89)).padStart(2, "0")}-AB-${String(i).padStart(2, "0")}` }));
const documents: OpsDocument[] = jobs
  .filter((j) => j.status === "delivered" || j.status === "invoiced")
  .map((j, i) => {
    const r = issueDocument({ id: `doc${i}`, type: "INVOICE", seq: i + 1, job: j, company: COMPANY, now: NOW, existing: [] });
    if (!r.ok) throw new Error(r.errors.join());
    return r.value.document;
  });

describe("Phase 5.6B performance", () => {
  it("global search: index 2,000 jobs / 1,000 customers / 1,000 sites / 500 documents; query per keystroke", () => {
    let ix = buildSearchIndex({ jobs, trucks, trailers: [], drivers, customers, sites, documents });
    const build = time(() => (ix = buildSearchIndex({ jobs, trucks, trailers: [], drivers, customers, sites, documents })), 5);
    const query = time(() => ["Matosinhos", "Cliente 12", "FT 2026/0042", "Motorista 7", "J-001234", "guimaraes"].forEach((q) => searchAll(ix, q)), 20) / 6;
    console.log(`[perf] search index build ${build.toFixed(1)} ms · query ${query.toFixed(2)} ms (${documents.length} docs)`);
    expect(searchAll(ix, "J-001234")[0]!.title).toBe("J-001234");
    expect(build).toBeLessThan(250);
    expect(query).toBeLessThan(16);
  });

  it("alerts with documents, Overview moments, Dispatch queue over 2,000 jobs", () => {
    const alerts = time(() => deriveAlerts({ jobs, trucks, drivers, trailers: [], documents }, NOW), 5);
    const moments = time(() => upcomingMoments(jobs, NOW, 12));
    const queue = time(() => dispatchQueue(jobs));
    console.log(`[perf] alerts ${alerts.toFixed(1)} ms · próximas horas ${moments.toFixed(2)} ms · dispatch queue ${queue.toFixed(2)} ms`);
    expect(alerts).toBeLessThan(150);
    expect(moments).toBeLessThan(30);
    expect(queue).toBeLessThan(10);
  });

  it("documents: pending computation over 2,000 jobs; issuing 200 documents through the service", async () => {
    const pending = time(() => jobs.reduce((n, j) => n + missingDocuments(j, documents).length, 0), 3);
    const store = new MemoryOperationalStore();
    await store.commit({ put: { jobs: jobs.slice(0, 400).map((j) => ({ ...j, status: "delivered" as const })) } });
    const svc = new OperationsService(store);
    await svc.load();
    const t0 = performance.now();
    const res = await Promise.all(jobs.slice(0, 200).map((j) => svc.issueDocument(j.id, "INVOICE", COMPANY)));
    const perIssue = (performance.now() - t0) / 200;
    console.log(`[perf] pending docs ${pending.toFixed(1)} ms · issue ${perIssue.toFixed(2)} ms/doc (memory store)`);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(new Set(svc.getState().documents.map((d) => d.number)).size).toBe(200);
    expect(pending).toBeLessThan(400);
  });

  it("compliance register (200 drivers) and record pickers (1,000 customers / sites)", () => {
    const comp = time(() => filterCompliance(driverComplianceItems(drivers, NOW), "all"));
    const pick = time(() => {
      const q = fold("armazem 12");
      sites.filter((s) => fold(`${s.name} ${s.address}`).includes(q)).slice(0, 8);
      customers.filter((c) => fold(`${c.name} ${c.nif}`).includes(fold("cliente 99"))).slice(0, 8);
    }, 20);
    console.log(`[perf] compliance ${comp.toFixed(2)} ms · picker query ${pick.toFixed(2)} ms`);
    expect(comp).toBeLessThan(30);
    expect(pick).toBeLessThan(16);
  });
});
