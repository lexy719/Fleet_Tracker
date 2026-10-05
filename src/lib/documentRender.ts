import type { OpsDocument } from "../domain/documents/documents";
import { buildPortugueseCMRHtml } from "./cmrPortugal";
import { buildPtInvoiceHtml } from "./invoicePt";

/**
 * Render an ISSUED/VOID document from its snapshot only. Opening or reprinting never reads
 * the live job, customer or settings and never allocates a number.
 */
export function renderDocumentHtml(doc: OpsDocument): string {
  const { job, company, buyer, carrier, dueAt } = doc.snapshot;
  const html =
    doc.type === "INVOICE"
      ? buildPtInvoiceHtml(job, { settings: company, invoiceNumber: doc.number, issuedAt: doc.issuedAt, dueAt: dueAt ?? doc.issuedAt, buyer })
      : buildPortugueseCMRHtml(job, { ...carrier, settings: company, number: doc.number, issuedAt: doc.issuedAt });
  if (doc.status !== "VOID") return html;
  const stamp = `<div style="position:fixed;top:40%;left:0;right:0;text-align:center;font:700 64pt Arial,sans-serif;color:rgba(200,0,0,.25);transform:rotate(-18deg);pointer-events:none">ANULADO</div>`;
  return html.replace("<body>", `<body>${stamp}`);
}
