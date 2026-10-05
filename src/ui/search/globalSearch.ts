import type { Customer, Driver, Job, Site, Trailer, Truck } from "../../data/types";
import type { OpsDocument } from "../../domain/documents/documents";
import { DOC_LABEL } from "../../domain/documents/documents";
import { trailerTypeLabel } from "../../domain/fleet/trailers";
import { truckDisplayName } from "../../domain/fleet/trucks";
import { paths } from "../../lib/appLinks";
import { firstStop, lastStop } from "../work/workModel";

/*
 * Global search over everything a dispatcher names out loud: job number, customer, client
 * reference, pickup / delivery city or site, truck plate, driver, document number.
 * The index is built once per data change; a query is a linear scan of pre-folded strings.
 */

export type SearchKind = "job" | "document" | "truck" | "trailer" | "driver" | "customer" | "place";
export type SearchHit = { key: string; kind: SearchKind; title: string; sub: string; to: string };

const fold = (s: string | undefined) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const compact = (s: string) => s.replace(/[\s\-/.]/g, "");

type Entry = { hay: string; tight: string; hit: SearchHit; exact?: string };

export type SearchIndex = { jobs: Entry[]; docs: Entry[]; trucks: Entry[]; trailers: Entry[]; drivers: Entry[]; customers: Entry[]; places: Entry[] };

export function buildSearchIndex(d: { jobs: Job[]; trucks: Truck[]; trailers: Trailer[]; drivers: Driver[]; customers: Customer[]; sites: Site[]; documents: OpsDocument[] }): SearchIndex {
  const truck = new Map(d.trucks.map((t) => [t.id, t]));
  const driver = new Map(d.drivers.map((x) => [x.id, x]));
  const docsByJob = new Map<string, string[]>();
  for (const doc of d.documents) docsByJob.set(doc.jobId, [...(docsByJob.get(doc.jobId) ?? []), doc.number]);
  const siteName = new Map(d.sites.map((s) => [s.id, s.name]));
  const entry = (parts: (string | undefined)[], hit: SearchHit, exact?: string): Entry => {
    const hay = fold(parts.filter(Boolean).join(" \u0001 "));
    return { hay, tight: compact(hay), hit, ...(exact ? { exact: compact(fold(exact)) } : {}) };
  };

  const jobs = d.jobs.map((j) =>
    entry(
      [j.jobNumber, j.reference, j.client, ...j.stops.flatMap((s) => [s.city, s.clientName, s.siteId ? siteName.get(s.siteId) : undefined]), truck.get(j.assignedTruckId ?? "")?.plate, driver.get(j.assignedDriverId ?? "")?.name, ...(docsByJob.get(j.id) ?? [])],
      { key: `j:${j.id}`, kind: "job", title: j.jobNumber, sub: `${j.client} · ${firstStop(j)?.city ?? "—"} → ${lastStop(j)?.city ?? "—"}`, to: paths.workJob(j.id) },
      j.jobNumber,
    ),
  );
  const docs = d.documents.map((x) => entry([x.number, x.jobNumber, x.customerName], { key: `d:${x.id}`, kind: "document", title: x.number, sub: `${DOC_LABEL[x.type]} · ${x.jobNumber} · ${x.customerName}${x.status === "VOID" ? " · anulado" : ""}`, to: paths.job(x.jobId, "documents") }, x.number));
  const trucks = d.trucks.filter((t) => !t.archivedAt).map((t) => entry([t.plate, t.unitNumber, truckDisplayName(t)], { key: `t:${t.id}`, kind: "truck", title: t.plate, sub: truckDisplayName(t), to: paths.truck(t.id) }, t.plate));
  const trailers = d.trailers.filter((t) => !t.archivedAt).map((t) => entry([t.plate, t.unitNumber], { key: `r:${t.id}`, kind: "trailer", title: t.plate, sub: trailerTypeLabel(t), to: paths.trailer(t.id) }, t.plate));
  const drivers = d.drivers.filter((x) => !x.archivedAt).map((x) => entry([x.name, x.employeeNumber], { key: `m:${x.id}`, kind: "driver", title: x.name, sub: x.homeTerminal ?? "Motorista", to: paths.driver(x.id) }));

  // Customers: records plus names only known from job snapshots (legacy / free text).
  const custCount = new Map<string, number>();
  for (const j of d.jobs) custCount.set(j.client, (custCount.get(j.client) ?? 0) + 1);
  const custNames = new Map<string, string>();
  for (const c of d.customers) if (!c.archivedAt) custNames.set(fold(c.name), c.name);
  for (const name of custCount.keys()) if (!custNames.has(fold(name))) custNames.set(fold(name), name);
  const customers = [...custNames.values()].map((name) => entry([name], { key: `c:${name}`, kind: "customer", title: name, sub: `Cliente · ${custCount.get(name) ?? 0} trabalho(s)`, to: `${paths.work()}?q=${encodeURIComponent(name)}` }));

  // Places: cities and registered sites appearing as pickup / delivery.
  const placeCount = new Map<string, { label: string; n: number; site: boolean }>();
  const addPlace = (label: string | undefined, site: boolean) => {
    if (!label?.trim()) return;
    const k = fold(label);
    const cur = placeCount.get(k);
    placeCount.set(k, { label: cur?.label ?? label, n: (cur?.n ?? 0) + 1, site: cur?.site || site });
  };
  for (const j of d.jobs) for (const s of new Set(j.stops.map((x) => x.city))) addPlace(s, false);
  for (const s of d.sites) if (!s.archivedAt) addPlace(s.name, true);
  const places = [...placeCount.values()].map((p) => entry([p.label], { key: `p:${p.label}`, kind: "place", title: p.label, sub: p.site ? "Local registado" : `Localidade · ${p.n} trabalho(s)`, to: `${paths.work()}?q=${encodeURIComponent(p.label)}` }));

  return { jobs, docs, trucks, trailers, drivers, customers, places };
}

/** Every token must match (accent/case-insensitive); plates and numbers also match without separators. */
function matches(e: Entry, tokens: string[], tight: string): boolean {
  if (tight.length >= 3 && e.tight.includes(tight)) return true;
  return tokens.every((t) => e.hay.includes(t));
}

export function searchAll(ix: SearchIndex, q: string, limit = 16): SearchHit[] {
  const n = fold(q.trim());
  if (n.length < 2) return [];
  const tokens = n.split(/\s+/);
  const tight = compact(n);
  const pick = (list: Entry[], max: number) => {
    const out: Entry[] = [];
    for (const e of list) {
      if (matches(e, tokens, tight)) out.push(e);
      if (out.length >= max * 4) break;
    }
    // Exact identifiers first (J-4201, 11-ST-78, FT 2026/0003).
    return out.sort((a, b) => Number(b.exact === tight) - Number(a.exact === tight)).slice(0, max).map((e) => e.hit);
  };
  const exactJob = ix.jobs.filter((e) => e.exact === tight).map((e) => e.hit);
  // Document numbers lead only when the query looks like one (FT 2026/…, CMR-2026-…).
  const numberLike = /\d{3,}/.test(tight) && ix.docs.some((e) => e.exact?.startsWith(tight));
  const docs = pick(ix.docs, 4);
  const groups = [
    exactJob,
    numberLike ? docs : [],
    pick(ix.trucks, 3),
    pick(ix.trailers, 2),
    pick(ix.drivers, 3),
    pick(ix.customers, 3),
    pick(ix.places, 3),
    docs,
    pick(ix.jobs, 6),
  ];
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const g of groups) for (const h of g) if (!seen.has(h.key)) { seen.add(h.key); out.push(h); }
  return out.slice(0, limit);
}
