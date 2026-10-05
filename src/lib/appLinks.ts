import type { OpsAlert } from "../data/types";

/** Deep links — the single place URLs are built. */

const enc = encodeURIComponent;

export const paths = {
  overview: () => "/",
  work: () => "/work",
  /** Work list with the job drawer open (keeps the list context). */
  workJob: (jobId: string) => `/work?job=${enc(jobId)}`,
  /** Full job workspace. */
  job: (jobId: string, tab?: string) => `/work/${enc(jobId)}${tab ? `?tab=${enc(tab)}` : ""}`,
  dispatch: (jobId?: string) => `/dispatch${jobId ? `?job=${enc(jobId)}` : ""}`,
  trucks: () => "/fleet",
  trailers: () => "/fleet/trailers",
  truck: (id: string) => `/fleet/trucks/${enc(id)}`,
  trailer: (id: string) => `/fleet/trailers/${enc(id)}`,
  drivers: () => "/drivers",
  driver: (id: string, tab?: "qualifications" | "hours" | "work" | "history") => `/drivers/${enc(id)}${tab ? `?tab=${tab}` : ""}`,
  documents: (view?: "pending", q?: string) => {
    const p = new URLSearchParams();
    if (view) p.set("view", view);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/documents${s ? `?${s}` : ""}`;
  },
  compliance: (f?: "expiring" | "expired" | "missing") => `/compliance${f ? `?f=${f}` : ""}`,
  intelligence: (area?: string) => `/intelligence${area ? `?area=${enc(area)}` : ""}`,
  settings: (section?: "company" | "billing" | "operations" | "customers" | "sites" | "data" | "demo") => `/settings${section ? `?section=${section}` : ""}`,
};

/** Where an alert is resolved — the exact screen and tab, never a generic list. */
export function alertHref(a: Pick<OpsAlert, "entityType" | "entityId" | "id">): string {
  switch (a.entityType) {
    case "job":
      if (a.id.startsWith("replan-")) return paths.dispatch(a.entityId);
      if (a.id.startsWith("ref-")) return paths.job(a.entityId);
      return paths.workJob(a.entityId);
    case "truck":
      return paths.truck(a.entityId);
    case "driver":
      return a.id.startsWith("q-") ? paths.driver(a.entityId, "qualifications") : paths.driver(a.entityId);
    case "document":
      return a.entityId === "pending" ? paths.documents("pending") : paths.documents(undefined, a.entityId);
    default:
      return paths.overview();
  }
}

/* Compatibility helpers for components that predate the route rebuild. */
export const jobsUrl = (jobId?: string) => (jobId ? paths.workJob(jobId) : paths.work());
export const driversUrl = (driverId?: string) => (driverId ? paths.driver(driverId) : paths.drivers());
export const fleetUrl = (truckId?: string) => (truckId ? paths.truck(truckId) : paths.trucks());
export const dispatchUrl = (jobId?: string) => paths.dispatch(jobId);
