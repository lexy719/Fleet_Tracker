import type { Customer, Job, Site } from "../../data/types";
import type { OpsDocument } from "../documents/documents";
import { fail, makeEvent, ok, type OperationalEvent, type Result } from "../events";

/*
 * Transport master data: Customers and Sites. Minimal on purpose (no CRM).
 * Jobs keep their own copy of customer name and stop address fields (snapshots) and hold
 * customerId / siteId references, so editing a record never rewrites history.
 */

export type CustomerDraft = Omit<Customer, "id" | "createdAt" | "updatedAt" | "archivedAt" | "isDemo">;
export type SiteDraft = Omit<Site, "id" | "createdAt" | "updatedAt" | "archivedAt" | "isDemo">;

const normNif = (s: string) => s.replace(/\s/g, "");
const clean = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === "") delete o[k];
  return o;
};

export function validateCustomer(d: CustomerDraft, others: Customer[], selfId?: string): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Nome do cliente obrigatório.");
  if (d.nif && !/^[A-Z]{0,2}\d{9}$/.test(normNif(d.nif).toUpperCase())) e.push("NIF: 9 dígitos (opcionalmente com prefixo de país, ex.: PT).");
  if (d.nif && others.some((c) => c.id !== selfId && !c.archivedAt && c.nif && normNif(c.nif) === normNif(d.nif!))) e.push("Já existe um cliente ativo com este NIF.");
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e.push("Email inválido.");
  return e;
}

export function saveCustomer(d: CustomerDraft, ctx: { id: string; now: Date; others: Customer[]; existing?: Customer }): Result<{ customer: Customer; events: OperationalEvent[] }> {
  const errors = validateCustomer(d, ctx.others, ctx.existing?.id);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const base = ctx.existing;
  const customer: Customer = clean({
    ...d,
    name: d.name.trim(),
    id: base?.id ?? ctx.id,
    createdAt: base?.createdAt ?? at,
    updatedAt: at,
    ...(base?.isDemo ? { isDemo: true } : {}),
    ...(base?.archivedAt ? { archivedAt: base.archivedAt } : {}),
  });
  return ok({ customer, events: [makeEvent({ entityType: "customer", entityId: customer.id, type: base ? "RESOURCE_UPDATED" : "RESOURCE_CREATED", at, source: "LOCAL_USER" })] });
}

export function validateSite(d: SiteDraft, customers: Customer[]): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push("Nome do local obrigatório.");
  if (!d.address.trim()) e.push("Morada obrigatória.");
  if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng) || Math.abs(d.lat) > 90 || Math.abs(d.lng) > 180) e.push("Coordenadas em falta ou inválidas — localize a morada ou indique lat, lng.");
  if (d.customerId && !customers.some((c) => c.id === d.customerId)) e.push("O cliente associado não existe.");
  return e;
}

export function saveSite(d: SiteDraft, ctx: { id: string; now: Date; customers: Customer[]; existing?: Site }): Result<{ site: Site; events: OperationalEvent[] }> {
  const errors = validateSite(d, ctx.customers);
  if (errors.length) return fail(...errors);
  const at = ctx.now.toISOString();
  const base = ctx.existing;
  const site: Site = clean({
    ...d,
    name: d.name.trim(),
    address: d.address.trim(),
    geocodedAddress: d.geocodedAddress ?? d.address.trim(),
    id: base?.id ?? ctx.id,
    createdAt: base?.createdAt ?? at,
    updatedAt: at,
    ...(base?.isDemo ? { isDemo: true } : {}),
    ...(base?.archivedAt ? { archivedAt: base.archivedAt } : {}),
  });
  return ok({ site, events: [makeEvent({ entityType: "site", entityId: site.id, type: base ? "RESOURCE_UPDATED" : "RESOURCE_CREATED", at, source: "LOCAL_USER" })] });
}

/** Coordinates are trustworthy only for the address they were located for. */
export function siteCoordinatesCurrent(s: Pick<Site, "address" | "geocodedAddress">): boolean {
  return !s.geocodedAddress || s.geocodedAddress.trim() === s.address.trim();
}

/** Copy a Site into the operational fields of a stop (the stop keeps its own snapshot). */
export function stopFieldsFromSite(s: Site): { siteId: string; clientName: string; address: string; city: string; lat: number; lng: number; notes?: string } {
  return { siteId: s.id, clientName: s.name, address: s.address, city: s.locality ?? s.address.split(",").pop()!.trim(), lat: s.lat, lng: s.lng, ...(s.accessNotes ? { notes: s.accessNotes } : {}) };
}

/** Why a record cannot be hard-deleted (archive instead). */
export function recordDeleteBlockers(kind: "customer" | "site", id: string, jobs: Job[], docs: OpsDocument[], sites: Site[]): string[] {
  if (kind === "customer") {
    const j = jobs.filter((x) => x.customerId === id).length;
    const d = docs.filter((x) => x.customerId === id).length;
    const s = sites.filter((x) => x.customerId === id && !x.archivedAt).length;
    if (j || d || s) return [`Referenciado por ${j} trabalho(s), ${d} documento(s) e ${s} local(is). Arquive em vez de eliminar.`];
    return [];
  }
  const j = jobs.filter((x) => x.stops.some((st) => st.siteId === id)).length;
  return j ? [`Usado em ${j} trabalho(s). Arquive em vez de eliminar.`] : [];
}
