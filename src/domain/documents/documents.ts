import type { Customer, Job } from "../../data/types";
import { fail, makeEvent, ok, type OperationalEvent, type Result } from "../events";

/*
 * Operational documents (CMR, invoice). A document is ISSUED once with a number from the
 * persistent counter and a SNAPSHOT of every value its rendering needs. Opening or printing
 * an issued document renders that snapshot — it never re-reads the mutable job/customer and
 * never consumes another number. Voiding keeps the number (no reuse).
 * Not fiscal software: no e-Fatura / SAF-T integration.
 */

export type DocumentType = "CMR" | "INVOICE";
export type DocumentStatus = "ISSUED" | "VOID";

/** Company identity as needed by the renderers (copied from Settings at issue time). */
export type CompanySnapshot = {
  name: string;
  nif: string;
  address: string;
  postalCity: string;
  country: string;
  phone: string;
  email: string;
  licencaComunitaria: string;
  iban: string;
  invoicePrefix: string;
  vatPct: number;
  paymentTermsDays: number;
};

export type DocumentSnapshot = {
  job: Job;
  company: CompanySnapshot;
  buyer: { name: string; nif?: string; billingAddress?: string };
  carrier?: { truckPlate?: string; truckName?: string; driverName?: string; driverLicense?: string };
  /** Invoice due date (ISO). */
  dueAt?: string;
};

export interface OpsDocument {
  id: string;
  type: DocumentType;
  /** Display number, e.g. "FT 2026/0184" or "CMR-2026-0041". */
  number: string;
  /** Series key + sequence the number came from. */
  series: string;
  seq: number;
  jobId: string;
  jobNumber: string;
  customerId?: string;
  customerName: string;
  issuedAt: string;
  status: DocumentStatus;
  voidedAt?: string;
  voidReason?: string;
  snapshot: DocumentSnapshot;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DOC_LABEL: Record<DocumentType, string> = { CMR: "Guia CMR", INVOICE: "Fatura" };

/** Counter series for a document type (invoice series follow the configured prefix). */
export function documentSeries(type: DocumentType, company: Pick<CompanySnapshot, "invoicePrefix">, issuedAt: Date): string {
  return type === "INVOICE" ? `invoice:${company.invoicePrefix}` : `cmr:${issuedAt.getUTCFullYear()}`;
}

export function formatDocumentNumber(type: DocumentType, seq: number, company: Pick<CompanySnapshot, "invoicePrefix">, issuedAt: Date): string {
  return type === "INVOICE" ? `${company.invoicePrefix}${String(seq).padStart(4, "0")}` : `CMR-${issuedAt.getUTCFullYear()}-${String(seq).padStart(4, "0")}`;
}

const INVOICEABLE: Job["status"][] = ["delivered", "invoiced"];
const CMR_STATUSES: Job["status"][] = ["queued", "assigned", "loading", "in_transit", "delivered", "invoiced"];

/** Reasons a document of `type` cannot be issued for `job` now (empty = allowed). */
export function issueBlockers(type: DocumentType, job: Job, existing: OpsDocument[]): string[] {
  const active = existing.find((d) => d.jobId === job.id && d.type === type && d.status === "ISSUED");
  if (active) return [`já existe ${DOC_LABEL[type].toLowerCase()} emitida (${active.number}) — anule-a antes de emitir outra`];
  if (job.status === "cancelled") return ["o trabalho está cancelado"];
  if (type === "INVOICE" && !INVOICEABLE.includes(job.status)) return ["a fatura só pode ser emitida depois da entrega"];
  if (type === "CMR" && !CMR_STATUSES.includes(job.status)) return ["a guia CMR é emitida depois de atribuir viatura e motorista"];
  if (type === "INVOICE" && !(job.rateEur > 0)) return ["o trabalho não tem frete definido"];
  return [];
}

export function buildSnapshot(args: { job: Job; customer?: Customer; company: CompanySnapshot; carrier?: DocumentSnapshot["carrier"]; issuedAt: Date }): DocumentSnapshot {
  const { job, customer, company, issuedAt } = args;
  return structuredClone({
    job,
    company,
    buyer: {
      name: customer?.name ?? job.client,
      ...(customer?.nif || job.buyerNif ? { nif: customer?.nif ?? job.buyerNif } : {}),
      ...(customer?.billingAddress ? { billingAddress: customer.billingAddress } : {}),
    },
    ...(args.carrier ? { carrier: args.carrier } : {}),
    dueAt: new Date(issuedAt.getTime() + company.paymentTermsDays * 86_400_000).toISOString(),
  });
}

export function issueDocument(args: {
  id: string;
  type: DocumentType;
  seq: number;
  job: Job;
  customer?: Customer;
  company: CompanySnapshot;
  carrier?: DocumentSnapshot["carrier"];
  now: Date;
  existing: OpsDocument[];
}): Result<{ document: OpsDocument; events: OperationalEvent[] }> {
  const blockers = issueBlockers(args.type, args.job, args.existing);
  if (blockers.length) return fail(...blockers);
  const at = args.now.toISOString();
  const document: OpsDocument = {
    id: args.id,
    type: args.type,
    number: formatDocumentNumber(args.type, args.seq, args.company, args.now),
    series: documentSeries(args.type, args.company, args.now),
    seq: args.seq,
    jobId: args.job.id,
    jobNumber: args.job.jobNumber,
    ...(args.customer ? { customerId: args.customer.id } : args.job.customerId ? { customerId: args.job.customerId } : {}),
    customerName: args.customer?.name ?? args.job.client,
    issuedAt: at,
    status: "ISSUED",
    snapshot: buildSnapshot({ job: args.job, customer: args.customer, company: args.company, carrier: args.carrier, issuedAt: args.now }),
    ...(args.job.isDemo ? { isDemo: true } : {}),
    createdAt: at,
    updatedAt: at,
  };
  return ok({
    document,
    events: [makeEvent({ entityType: "job", entityId: args.job.id, type: "DOCUMENT_ISSUED", at, source: "LOCAL_USER", data: { documentId: document.id, documentType: document.type, number: document.number } })],
  });
}

export function voidDocument(doc: OpsDocument, reason: string, now: Date): Result<{ document: OpsDocument; events: OperationalEvent[] }> {
  if (doc.status === "VOID") return fail("o documento já está anulado");
  if (reason.trim().length < 3) return fail("indique o motivo da anulação");
  const at = now.toISOString();
  const document: OpsDocument = { ...doc, status: "VOID", voidedAt: at, voidReason: reason.trim(), updatedAt: at };
  return ok({
    document,
    events: [makeEvent({ entityType: "job", entityId: doc.jobId, type: "DOCUMENT_VOIDED", at, source: "LOCAL_USER", reason: reason.trim(), data: { documentId: doc.id, documentType: doc.type, number: doc.number } })],
  });
}

/** Documents missing for a job, derived only from what the lifecycle makes safe to state. */
export function missingDocuments(job: Job, docs: OpsDocument[]): DocumentType[] {
  const has = (t: DocumentType) => docs.some((d) => d.jobId === job.id && d.type === t && d.status === "ISSUED");
  const out: DocumentType[] = [];
  // Every FleetOS job is a road-freight transport: a CMR is expected once resources are assigned.
  if (["loading", "in_transit", "delivered", "invoiced"].includes(job.status) && !has("CMR")) out.push("CMR");
  if (["delivered", "invoiced"].includes(job.status) && job.rateEur > 0 && !has("INVOICE")) out.push("INVOICE");
  return out;
}
