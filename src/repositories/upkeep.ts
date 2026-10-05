import type { Customer, Driver, Job, Site, Truck } from "../data/types";
import { makeEvent, type OperationalEvent } from "../domain/events";
import { isoToLocalDate } from "../domain/time";
import type { OperationalStore, OpsSnapshot } from "./operationalStore";

/*
 * Idempotent store upkeep steps run at every start-up after the Phase 5 bootstrap:
 *  1. demo master data (customers / sites) seeded once and linked to DEMO jobs only;
 *  2. legacy invoice counter (Settings, localStorage) migrated once into the store;
 *  3. demo date re-anchoring so the demo does not age into fake overdue work.
 */

/* ─── 1. Demo customers / sites ─── */

export async function seedDemoRecords(store: OperationalStore, seed: { customers: Customer[]; sites: Site[]; jobs: Job[] }, now: Date): Promise<boolean> {
  if (await store.getMeta("demoRecordsSeed")) return false;
  const cur = await store.loadAll();
  const at = now.toISOString();
  const hasC = new Set(cur.customers.map((c) => c.id));
  const hasS = new Set(cur.sites.map((s) => s.id));
  const customers = seed.customers.filter((c) => !hasC.has(c.id));
  const sites = seed.sites.filter((s) => !hasS.has(s.id));
  // Link existing DEMO jobs (never user jobs) to the seeded records by stable ids.
  const seedJob = new Map(seed.jobs.map((j) => [j.id, j]));
  const jobs: Job[] = [];
  for (const j of cur.jobs) {
    const sj = seedJob.get(j.id);
    if (!j.isDemo || !sj || j.customerId) continue;
    const siteByStop = new Map(sj.stops.map((s) => [s.id, s.siteId]));
    jobs.push({ ...j, ...(sj.customerId ? { customerId: sj.customerId } : {}), stops: j.stops.map((s) => (siteByStop.get(s.id) && !s.siteId ? { ...s, siteId: siteByStop.get(s.id) } : s)) });
  }
  const events: OperationalEvent[] = [
    ...customers.map((c) => makeEvent({ entityType: "customer", entityId: c.id, type: "DEMO_SEEDED", at, source: "DEMO_SEED" })),
    ...sites.map((s) => makeEvent({ entityType: "site", entityId: s.id, type: "DEMO_SEEDED", at, source: "DEMO_SEED" })),
  ];
  await store.commit({ put: { customers, sites, jobs }, events, meta: { demoRecordsSeed: { at, customers: seed.customers.map((c) => c.id), sites: seed.sites.map((s) => s.id) } } });
  return true;
}

/* ─── 2. Invoice counter migration ─── */

export type LegacyInvoiceSettings = { invoicePrefix: string; invoiceNextSeq: number } | null;

/**
 * Settings (localStorage "fleet-settings-v1") used to own `invoiceNextSeq`. The store's
 * counter for the same series is raised to (next − 1) exactly once; it is never lowered.
 */
export async function migrateInvoiceCounter(store: OperationalStore, legacy: LegacyInvoiceSettings, now: Date): Promise<{ migrated: boolean; series?: string; floor?: number }> {
  if (await store.getMeta("invoiceCounterMigrated")) return { migrated: false };
  const meta: Record<string, unknown> = { invoiceCounterMigrated: { at: now.toISOString(), from: legacy ?? null } };
  let series: string | undefined;
  let floor: number | undefined;
  if (legacy && Number.isFinite(legacy.invoiceNextSeq) && legacy.invoiceNextSeq > 1) {
    series = `invoice:${legacy.invoicePrefix}`;
    floor = Math.floor(legacy.invoiceNextSeq) - 1;
    const current = Number((await store.getMeta<number>(`counter:${series}`)) ?? 0);
    meta[`counter:${series}`] = Math.max(current, floor);
  }
  await store.commit({ meta });
  return { migrated: true, series, floor };
}

/* ─── 3. Demo date re-anchoring ─── */

const HOUR = 3_600_000;

const shiftIso = (iso: string | undefined, ms: number) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(Date.parse(iso) + ms).toISOString() : iso);
const shiftDay = (d: string | undefined, days: number) => {
  if (!d || !days) return d;
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

/**
 * A demo job is re-anchored only when its dates were authored RELATIVE to the demo clock:
 * fixtures with dated stop windows are pinned to real dates (they meet real road events),
 * and jobs carrying a confirmed route decision keep their decision inputs intact.
 */
export function isRelativeDemoJob(j: Job): boolean {
  return !!j.isDemo && !j.routeCompliance && !j.stops.some((s) => s.windowStartAt || s.windowEndAt);
}

export function reanchorDemo(snap: Pick<OpsSnapshot, "jobs" | "drivers" | "trucks">, fromIso: string, toIso: string): { jobs: Job[]; drivers: Driver[]; trucks: Truck[] } {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  const days = Math.round((Date.parse(`${isoToLocalDate(Date.parse(toIso))}T12:00:00Z`) - Date.parse(`${isoToLocalDate(Date.parse(fromIso))}T12:00:00Z`)) / 86_400_000);
  const jobs = snap.jobs.filter(isRelativeDemoJob).map((j) => {
    const out: Job = {
      ...j,
      pickupDeadline: shiftIso(j.pickupDeadline, ms)!,
      deliveryDeadline: shiftIso(j.deliveryDeadline, ms)!,
      createdAt: shiftIso(j.createdAt, ms)!,
      stops: j.stops.map((s) => (s.completedAt ? { ...s, completedAt: shiftIso(s.completedAt, ms) } : s)),
    };
    if (j.queuedAt) out.queuedAt = shiftIso(j.queuedAt, ms);
    if (j.plannedDepartureAt) out.plannedDepartureAt = shiftIso(j.plannedDepartureAt, ms);
    return out;
  });
  const drivers = snap.drivers.filter((d) => d.isDemo).map((d) => ({
    ...d,
    licence: { ...d.licence, ...(d.licence.expiresOn ? { expiresOn: shiftDay(d.licence.expiresOn, days) } : {}) },
    cpc: { ...d.cpc, ...(d.cpc.expiresOn ? { expiresOn: shiftDay(d.cpc.expiresOn, days) } : {}) },
    adr: { ...d.adr, ...(d.adr.expiresOn ? { expiresOn: shiftDay(d.adr.expiresOn, days) } : {}) },
    ...(d.tachoCardExpiresOn ? { tachoCardExpiresOn: shiftDay(d.tachoCardExpiresOn, days) } : {}),
    hours: d.hours ? { ...d.hours, recordedAt: shiftIso(d.hours.recordedAt, ms)!, ...(d.hours.dutyStartedAt ? { dutyStartedAt: shiftIso(d.hours.dutyStartedAt, ms) } : {}) } : null,
  }));
  const trucks = snap.trucks.filter((t) => t.isDemo).map((t) => ({
    ...t,
    ...(t.odometerKm ? { odometerKm: { ...t.odometerKm, recordedAt: shiftIso(t.odometerKm.recordedAt, ms)! } } : {}),
    ...(t.fuelLevelPct ? { fuelLevelPct: { ...t.fuelLevelPct, recordedAt: shiftIso(t.fuelLevelPct.recordedAt, ms)! } } : {}),
  }));
  return { jobs, drivers, trucks };
}

/**
 * Keep the demo coherent with "now": shift demo dates by the time elapsed since the last
 * anchor (≥ 1 h). User records and issued documents are never touched.
 */
export async function reanchorDemoStore(store: OperationalStore, now: Date): Promise<{ shiftedMs: number; jobs: number }> {
  const anchor = (await store.getMeta<string>("demoAnchorAt")) ?? (await store.getMeta<{ at: string }>("demoSeed"))?.at;
  if (!anchor) return { shiftedMs: 0, jobs: 0 };
  const ms = now.getTime() - Date.parse(anchor);
  if (Math.abs(ms) < HOUR) {
    if (!(await store.getMeta("demoAnchorAt"))) await store.commit({ meta: { demoAnchorAt: anchor } });
    return { shiftedMs: 0, jobs: 0 };
  }
  const snap = await store.loadAll();
  const r = reanchorDemo(snap, anchor, now.toISOString());
  await store.commit({ put: { jobs: r.jobs, drivers: r.drivers, trucks: r.trucks }, meta: { demoAnchorAt: now.toISOString() } });
  return { shiftedMs: ms, jobs: r.jobs.length };
}
