import type { Customer, Driver, Job, JobStatus, Site, Trailer, Truck } from "../data/types";
import { documentSeries, issueDocument, voidDocument, type CompanySnapshot, type DocumentType, type OpsDocument } from "../domain/documents/documents";
import { recordDeleteBlockers, saveCustomer, saveSite, type CustomerDraft, type SiteDraft } from "../domain/records/records";
import { archiveBlockers, deleteBlockers } from "../domain/integrity";
import { createDriver, updateDriver, type DriverDraft } from "../domain/drivers/drivers";
import { fail, makeEvent, ok, type EntityType, type OperationalEvent, type Result } from "../domain/events";
import { createTrailer, updateTrailer, type TrailerDraft } from "../domain/fleet/trailers";
import { createTruck, updateTruck, type TruckDraft } from "../domain/fleet/trucks";
import { formatJobNumber, maxJobNumber, newId } from "../domain/ids";
import { createJobFromDraft, editJob, type JobDraft } from "../domain/jobs/jobDraft";
import { confirmPlan, setStopCompleted, transitionJob, updateNotes, type PlanConfirmation, type ResourceIndex } from "../domain/jobs/lifecycle";
import { deriveSla } from "../domain/jobs/sla";
import { ConcurrencyError, type CommitBatch, type OperationalStore, type OpsSnapshot } from "../repositories/operationalStore";
import { resetDemoData, type DemoSeed } from "../repositories/bootstrap";

/*
 * Application service — the ONLY write path for jobs, resources, documents, customers and sites.
 * UI → OperationsService → domain (pure rules) → OperationalStore (IndexedDB).
 *
 * Writes are serialised; each one computes the next state with the domain functions,
 * persists records + events in one atomic commit, and only then publishes the new state.
 * A failed commit leaves the published state unchanged.
 */

export type OpsState = OpsSnapshot & { ready: boolean; error: string | null; version: number };

type Listener = () => void;

export class OperationsService {
  private state: OpsState = { jobs: [], trucks: [], trailers: [], drivers: [], documents: [], customers: [], sites: [], ready: false, error: null, version: 0 };
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private store: OperationalStore,
    private clock: () => Date = () => new Date(),
  ) {}

  /* ─── Subscription (useSyncExternalStore) ─── */
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): OpsState => this.state;

  private publish(next: Partial<OpsState>) {
    this.state = { ...this.state, ...next, version: this.state.version + 1 };
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    try {
      const snap = await this.store.loadAll();
      this.publish({ ...snap, jobs: sortJobs(snap.jobs), ready: true, error: null });
    } catch (e) {
      this.publish({ ready: true, error: e instanceof Error ? e.message : String(e) });
    }
  }

  private resources(s: OpsSnapshot = this.state): ResourceIndex {
    return {
      trucks: new Map(s.trucks.map((t) => [t.id, t])),
      drivers: new Map(s.drivers.map((d) => [d.id, d])),
      trailers: new Map(s.trailers.map((t) => [t.id, t])),
    };
  }

  /** Serialise a write: compute → commit → publish. */
  private write<T>(fn: (s: OpsState, now: Date) => Promise<Result<{ batch: CommitBatch; next: Partial<OpsSnapshot>; value: T }>> | Result<{ batch: CommitBatch; next: Partial<OpsSnapshot>; value: T }>): Promise<Result<T>> {
    const run = async (): Promise<Result<T>> => {
      const now = this.clock();
      const r = await fn(this.state, now);
      if (!r.ok) return r;
      try {
        await this.store.commit(r.value.batch);
      } catch (e) {
        if (e instanceof ConcurrencyError) {
          await this.load();
          return fail(e.message);
        }
        return fail(`Não foi possível gravar: ${e instanceof Error ? e.message : String(e)}`);
      }
      const n = r.value.next;
      this.publish({ ...n, ...(n.jobs ? { jobs: sortJobs(n.jobs) } : {}) });
      return ok(r.value.value);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /* ─── Jobs ─── */

  private jobsCommit(before: Job[], after: Job[], events: OperationalEvent[]): { batch: CommitBatch; next: Partial<OpsSnapshot> } {
    const prev = new Map(before.map((j) => [j.id, j]));
    const changed = after.filter((j) => prev.get(j.id) !== j);
    const expect: Record<string, number | null> = {};
    for (const j of changed) expect[j.id] = prev.get(j.id)?.revision ?? null;
    return { batch: { put: { jobs: changed }, events, expectJobRevisions: expect }, next: { jobs: after } };
  }

  createJob(draft: JobDraft): Promise<Result<Job>> {
    return this.write(async (s, now) => {
      const n = await this.store.nextCounter("job", maxJobNumber(s.jobs.map((j) => j.jobNumber)));
      const r = createJobFromDraft(draft, { id: newId(), jobNumber: formatJobNumber(n), now });
      if (!r.ok) return r;
      const job = { ...r.value.job, slaStatus: deriveSla(r.value.job, now) };
      return ok({ ...this.jobsCommit(s.jobs, [job, ...s.jobs], r.value.events), value: job });
    });
  }

  editJob(id: string, draft: JobDraft): Promise<Result<{ job: Job; invalidated: boolean; planningChanges: string[] }>> {
    return this.write((s, now) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job) return fail("trabalho não encontrado");
      const r = editJob(job, draft, now);
      if (!r.ok) return r;
      const next = { ...r.value.job, slaStatus: deriveSla(r.value.job, now) };
      return ok({ ...this.jobsCommit(s.jobs, s.jobs.map((j) => (j.id === id ? next : j)), r.value.events), value: { job: next, invalidated: r.value.invalidated, planningChanges: r.value.planningChanges } });
    });
  }

  /** The single status-change entry point (detail sheet, Kanban, dispatch queue). */
  transition(id: string, to: JobStatus, reason?: string): Promise<Result<Job>> {
    return this.write((s, now) => {
      const r = transitionJob(s.jobs, id, to, { now, resources: this.resources(s), source: "LOCAL_USER", reason });
      if (!r.ok) return r;
      const jobs = r.value.jobs.map((j) => (j.status !== s.jobs.find((x) => x.id === j.id)?.status ? { ...j, slaStatus: deriveSla(j, now) } : j));
      return ok({ ...this.jobsCommit(s.jobs, jobs, r.value.events), value: jobs.find((j) => j.id === id)! });
    });
  }

  confirmPlan(id: string, p: PlanConfirmation): Promise<Result<Job>> {
    return this.write((s, now) => {
      const r = confirmPlan(s.jobs, id, p, { now, resources: this.resources(s), source: "LOCAL_USER" });
      if (!r.ok) return r;
      return ok({ ...this.jobsCommit(s.jobs, r.value.jobs, r.value.events), value: r.value.jobs.find((j) => j.id === id)! });
    });
  }

  setStopCompleted(id: string, stopId: string, completed: boolean): Promise<Result<Job>> {
    return this.write((s, now) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job) return fail("trabalho não encontrado");
      const r = setStopCompleted(job, stopId, completed, { now });
      if (!r.ok) return r;
      return ok({ ...this.jobsCommit(s.jobs, s.jobs.map((j) => (j.id === id ? r.value.job : j)), r.value.events), value: r.value.job });
    });
  }

  updateNotes(id: string, notes: string): Promise<Result<Job>> {
    return this.write((s, now) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job) return fail("trabalho não encontrado");
      const r = updateNotes(job, notes, now);
      return ok({ ...this.jobsCommit(s.jobs, s.jobs.map((j) => (j.id === id ? r.job : j)), r.events), value: r.job });
    });
  }

  /** Recompute stored SLA flags from deadlines (no other field changes). */
  refreshSla(): Promise<Result<number>> {
    return this.write((s, now) => {
      const changed = s.jobs.filter((j) => deriveSla(j, now) !== j.slaStatus);
      if (!changed.length) return ok({ batch: {}, next: {}, value: 0 });
      const upd = new Map(changed.map((j) => [j.id, { ...j, slaStatus: deriveSla(j, now) }]));
      const jobs = s.jobs.map((j) => upd.get(j.id) ?? j);
      return ok({ batch: { put: { jobs: [...upd.values()] } }, next: { jobs }, value: changed.length });
    });
  }

  /* ─── Resources ─── */

  createTruck(d: TruckDraft): Promise<Result<Truck>> {
    return this.write((s, now) => {
      const r = createTruck(d, { id: newId(), now, others: s.trucks });
      if (!r.ok) return r;
      return ok({ batch: { put: { trucks: [r.value.truck] }, events: r.value.events }, next: { trucks: [...s.trucks, r.value.truck] }, value: r.value.truck });
    });
  }
  updateTruck(id: string, d: TruckDraft): Promise<Result<Truck>> {
    return this.write((s, now) => {
      const t = s.trucks.find((x) => x.id === id);
      if (!t) return fail("viatura não encontrada");
      const r = updateTruck(t, d, { now, others: s.trucks });
      if (!r.ok) return r;
      return ok({ batch: { put: { trucks: [r.value.truck] }, events: r.value.events }, next: { trucks: s.trucks.map((x) => (x.id === id ? r.value.truck : x)) }, value: r.value.truck });
    });
  }
  createTrailer(d: TrailerDraft): Promise<Result<Trailer>> {
    return this.write((s, now) => {
      const r = createTrailer(d, { id: newId(), now, others: s.trailers });
      if (!r.ok) return r;
      return ok({ batch: { put: { trailers: [r.value.trailer] }, events: r.value.events }, next: { trailers: [...s.trailers, r.value.trailer] }, value: r.value.trailer });
    });
  }
  updateTrailer(id: string, d: TrailerDraft): Promise<Result<Trailer>> {
    return this.write((s, now) => {
      const t = s.trailers.find((x) => x.id === id);
      if (!t) return fail("reboque não encontrado");
      const r = updateTrailer(t, d, { now, others: s.trailers });
      if (!r.ok) return r;
      return ok({ batch: { put: { trailers: [r.value.trailer] }, events: r.value.events }, next: { trailers: s.trailers.map((x) => (x.id === id ? r.value.trailer : x)) }, value: r.value.trailer });
    });
  }
  createDriver(d: DriverDraft): Promise<Result<Driver>> {
    return this.write((s, now) => {
      const r = createDriver(d, { id: newId(), now, others: s.drivers });
      if (!r.ok) return r;
      return ok({ batch: { put: { drivers: [r.value.driver] }, events: r.value.events }, next: { drivers: [...s.drivers, r.value.driver] }, value: r.value.driver });
    });
  }
  updateDriver(id: string, d: DriverDraft): Promise<Result<Driver>> {
    return this.write((s, now) => {
      const x = s.drivers.find((y) => y.id === id);
      if (!x) return fail("motorista não encontrado");
      const r = updateDriver(x, d, { now, others: s.drivers });
      if (!r.ok) return r;
      return ok({ batch: { put: { drivers: [r.value.driver] }, events: r.value.events }, next: { drivers: s.drivers.map((y) => (y.id === id ? r.value.driver : y)) }, value: r.value.driver });
    });
  }

  /** Archive (default) or restore a resource. Archiving a resource on a live job is refused. */
  setArchived(kind: ArchivableKind, id: string, archived: boolean): Promise<Result<void>> {
    return this.write((s, now) => {
      const key = storeOf(kind);
      const list = s[key] as (Truck | Trailer | Driver | Customer | Site)[];
      const rec = list.find((x) => x.id === id);
      if (!rec) return fail("registo não encontrado");
      if (!!rec.archivedAt === archived) return fail(archived ? "já está arquivado" : "não está arquivado");
      if (archived && (kind === "truck" || kind === "trailer" || kind === "driver")) {
        const b = archiveBlockers(s.jobs, kind, id);
        if (b.length) return fail(...b);
      }
      const at = now.toISOString();
      const next = { ...rec, archivedAt: archived ? at : undefined, updatedAt: at };
      if (!archived) delete next.archivedAt;
      const ev = makeEvent({ entityType: kind as EntityType, entityId: id, type: archived ? "RESOURCE_ARCHIVED" : "RESOURCE_RESTORED", at, source: "LOCAL_USER" });
      return ok({ batch: { put: { [key]: [next] }, events: [ev] } as CommitBatch, next: { [key]: list.map((x) => (x.id === id ? next : x)) } as Partial<OpsSnapshot>, value: undefined });
    });
  }

  /** Hard delete — only for records no job has ever referenced (e.g. a mistaken entry). */
  deleteResource(kind: ArchivableKind, id: string): Promise<Result<void>> {
    return this.write((s, now) => {
      const key = storeOf(kind);
      const list = s[key] as { id: string }[];
      if (!list.some((x) => x.id === id)) return fail("registo não encontrado");
      const b = kind === "customer" || kind === "site" ? recordDeleteBlockers(kind, id, s.jobs, s.documents, s.sites) : deleteBlockers(s.jobs, kind, id);
      if (b.length) return fail(...b);
      const ev = makeEvent({ entityType: kind as EntityType, entityId: id, type: "RESOURCE_DELETED", at: now.toISOString(), source: "LOCAL_USER" });
      return ok({ batch: { remove: { [key]: [id] }, events: [ev] } as CommitBatch, next: { [key]: list.filter((x) => x.id !== id) } as Partial<OpsSnapshot>, value: undefined });
    });
  }

  /* ─── Customers / sites ─── */

  saveCustomer(id: string | null, d: CustomerDraft): Promise<Result<Customer>> {
    return this.write((s, now) => {
      const existing = id ? s.customers.find((c) => c.id === id) : undefined;
      if (id && !existing) return fail("cliente não encontrado");
      const r = saveCustomer(d, { id: newId(), now, others: s.customers, existing });
      if (!r.ok) return r;
      const c = r.value.customer;
      return ok({ batch: { put: { customers: [c] }, events: r.value.events }, next: { customers: existing ? s.customers.map((x) => (x.id === c.id ? c : x)) : [...s.customers, c] }, value: c });
    });
  }

  saveSite(id: string | null, d: SiteDraft): Promise<Result<Site>> {
    return this.write((s, now) => {
      const existing = id ? s.sites.find((x) => x.id === id) : undefined;
      if (id && !existing) return fail("local não encontrado");
      const r = saveSite(d, { id: newId(), now, customers: s.customers, existing });
      if (!r.ok) return r;
      const site = r.value.site;
      return ok({ batch: { put: { sites: [site] }, events: r.value.events }, next: { sites: existing ? s.sites.map((x) => (x.id === site.id ? site : x)) : [...s.sites, site] }, value: site });
    });
  }

  /* ─── Documents ─── */

  /**
   * Issue a CMR / invoice: allocates the next number from the persistent counter (atomic),
   * snapshots everything the document renders, and stores it with a DOCUMENT_ISSUED event.
   * A commit failure after allocation leaves a gap in the series (never a duplicate).
   */
  issueDocument(jobId: string, type: DocumentType, company: CompanySnapshot): Promise<Result<OpsDocument>> {
    return this.write(async (s, now) => {
      const job = s.jobs.find((j) => j.id === jobId);
      if (!job) return fail("trabalho não encontrado");
      const series = documentSeries(type, company, now);
      const floor = Math.max(0, ...s.documents.filter((d) => d.series === series).map((d) => d.seq));
      const pre = issueDocument({ id: "probe", type, seq: floor + 1, job, company, now, existing: s.documents });
      if (!pre.ok) return pre; // do not consume a number for a refused issue
      const seq = await this.store.nextCounter(series, floor);
      const truck = job.assignedTruckId ? s.trucks.find((t) => t.id === job.assignedTruckId) : undefined;
      const driver = job.assignedDriverId ? s.drivers.find((d) => d.id === job.assignedDriverId) : undefined;
      const carrier = truck || driver ? { truckPlate: truck?.plate, truckName: truck ? [truck.make, truck.model].filter(Boolean).join(" ") || truck.unitNumber : undefined, driverName: driver?.name, driverLicense: driver?.licence.categories.join(", ") || undefined } : undefined;
      const customer = job.customerId ? s.customers.find((c) => c.id === job.customerId) : undefined;
      const r = issueDocument({ id: newId(), type, seq, job, customer, company, carrier, now, existing: s.documents });
      if (!r.ok) return r;
      const doc = r.value.document;
      return ok({ batch: { put: { documents: [doc] }, events: r.value.events }, next: { documents: [...s.documents, doc] }, value: doc });
    });
  }

  voidDocument(id: string, reason: string): Promise<Result<OpsDocument>> {
    return this.write((s, now) => {
      const doc = s.documents.find((d) => d.id === id);
      if (!doc) return fail("documento não encontrado");
      const r = voidDocument(doc, reason, now);
      if (!r.ok) return r;
      const d = r.value.document;
      return ok({ batch: { put: { documents: [d] }, events: r.value.events }, next: { documents: s.documents.map((x) => (x.id === id ? d : x)) }, value: d });
    });
  }

  /** Next number a new document of this series would get (read-only preview). */
  async peekNextNumber(series: string): Promise<number> {
    const cur = Number((await this.store.getMeta<number>(`counter:${series}`)) ?? 0);
    const floor = Math.max(0, ...this.state.documents.filter((d) => d.series === series).map((d) => d.seq));
    return Math.max(cur, floor) + 1;
  }

  /* ─── History / demo ─── */

  listEvents(entityId: string): Promise<OperationalEvent[]> {
    return this.store.listEvents(entityId);
  }

  resetDemo(seed: DemoSeed): Promise<Result<{ removed: number; seeded: number }>> {
    const run = async (): Promise<Result<{ removed: number; seeded: number }>> => {
      try {
        const r = await resetDemoData(this.store, seed, this.clock());
        await this.load();
        return ok(r);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

export type ArchivableKind = "truck" | "trailer" | "driver" | "customer" | "site";

function storeOf(kind: ArchivableKind): "trucks" | "trailers" | "drivers" | "customers" | "sites" {
  return ({ truck: "trucks", trailer: "trailers", driver: "drivers", customer: "customers", site: "sites" } as const)[kind];
}

/** Newest first by creation (stable display order). */
function sortJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
