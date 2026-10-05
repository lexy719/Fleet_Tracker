/**
 * Fatura simplificada — conforme Código do IVA (CIVA) e regime do SAFT-PT.
 * Emitida no estado «Faturado» de um trabalho.
 *
 * NOTA: Para produção substitua por um software de faturação certificado pela AT
 * (Art.º 123.º CIVA / Portaria 363/2010).  Esta implementação é para demonstração.
 */
import type { CompanySnapshot } from "../domain/documents/documents";
import type { CargoType, Job } from "../data/types";

const CARGO_LABEL: Record<CargoType, string> = {
  dry:          "Transporte rodoviário de mercadorias — carga seca",
  refrigerated: "Transporte rodoviário de mercadorias — carga refrigerada",
  hazmat:       "Transporte rodoviário de mercadorias perigosas (ADR)",
  bulk:         "Transporte rodoviário de mercadorias a granel",
  automotive:   "Transporte rodoviário de veículos / carga automóvel",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtEur(n: number): string {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type InvoiceContext = {
  settings:      CompanySnapshot;
  invoiceNumber: string;
  /** Issue / due dates as recorded on the issued document (never "now" on reprint). */
  issuedAt:      string;
  dueAt:         string;
  buyer:         { name: string; nif?: string; billingAddress?: string };
};

export function buildPtInvoiceHtml(job: Job, ctx: InvoiceContext): string {
  const { settings, invoiceNumber, buyer } = ctx;

  const issueDate   = ctx.issuedAt;
  const dueDate     = ctx.dueAt;

  const baseAmount  = job.rateEur;
  const vatAmount   = Math.round(baseAmount * settings.vatPct) / 100;
  const totalAmount = baseAmount + vatAmount;

  const firstStop   = job.stops[0];
  const lastStop    = job.stops[job.stops.length - 1];
  const routeDesc   = firstStop && lastStop
    ? `${esc(firstStop.city)} → ${esc(lastStop.city)}`
    : esc(job.reference);

  const serviceDesc = CARGO_LABEL[job.cargoType];

  const adrLine = job.adrClass
    ? `<tr><td colspan="3" style="padding:2px 0;font-size:8pt;color:#666">
        ADR: ${esc(job.adrClass)}${job.adrUnNumber ? ` · ${esc(job.adrUnNumber)}` : ""}
       </td></tr>`
    : "";
  const intlLine = job.isInternational
    ? `<tr><td colspan="3" style="padding:2px 0;font-size:8pt;color:#666">
        Transporte internacional — destino: ${esc(job.destinationCountryCode ?? "—")}
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>Fatura ${esc(invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Arial", "Helvetica Neue", sans-serif;
    font-size: 9pt;
    line-height: 1.4;
    color: #111;
    margin: 0;
    padding: 0;
  }
  .page { padding: 10mm; max-width: 190mm; margin: 0 auto; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a4d3a; padding-bottom: 6mm; margin-bottom: 6mm; }
  .company-name { font-size: 14pt; font-weight: 700; color: #1a4d3a; }
  .company-meta { font-size: 7.5pt; color: #555; margin-top: 2px; line-height: 1.5; }
  .invoice-title { text-align: right; }
  .invoice-title .label { font-size: 18pt; font-weight: 900; color: #1a4d3a; letter-spacing: -0.5px; }
  .invoice-title .num { font-size: 11pt; font-weight: 700; color: #333; margin-top: 2px; }
  .invoice-title .dates { font-size: 7.5pt; color: #555; margin-top: 4px; line-height: 1.6; }

  /* Parties */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 6mm; }
  .party-box { border: 1px solid #ddd; border-radius: 4px; padding: 4mm; }
  .party-box .role { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 2mm; }
  .party-box .name { font-weight: 700; font-size: 10pt; }
  .party-box .detail { font-size: 8pt; color: #444; line-height: 1.5; }

  /* Lines table */
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  table.lines thead th { background: #1a4d3a; color: #fff; padding: 3mm 4mm; text-align: left; font-size: 7.5pt; font-weight: 600; }
  table.lines thead th:last-child { text-align: right; }
  table.lines tbody td { border-bottom: 1px solid #eee; padding: 3mm 4mm; font-size: 8.5pt; vertical-align: top; }
  table.lines tbody td:last-child { text-align: right; white-space: nowrap; }
  table.lines .sub-row td { padding: 1mm 4mm; font-size: 7.5pt; color: #666; border-bottom: none; }

  /* Totals */
  .totals { display: flex; justify-content: flex-end; margin-bottom: 6mm; }
  .totals-box { border: 1px solid #ddd; border-radius: 4px; width: 64mm; }
  .totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; font-size: 8.5pt; }
  .totals-row.total { background: #1a4d3a; color: #fff; font-weight: 700; font-size: 11pt; border-radius: 0 0 3px 3px; }
  .totals-row.subtotal { border-top: 1px solid #ddd; }

  /* Payment */
  .payment-box { border: 1px solid #ddd; border-radius: 4px; padding: 4mm; margin-bottom: 6mm; }
  .payment-box .title { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 2mm; }
  .payment-box .iban { font-family: "Courier New", monospace; font-size: 9pt; font-weight: 700; color: #1a4d3a; }
  .payment-box .detail { font-size: 7.5pt; color: #555; margin-top: 2px; }

  /* Footer */
  .footer { border-top: 1px solid #ccc; padding-top: 3mm; font-size: 6.5pt; color: #888; text-align: center; }

  /* Draft watermark */
  .draft-mark { color: #ccc; font-size: 7pt; text-align: right; margin-bottom: 2mm; }

  /* Print button */
  .no-print { margin-top: 8mm; text-align: center; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="page">

  <p class="draft-mark">⚠ Documento de demonstração — emitir via software certificado AT em produção</p>

  <div class="header">
    <div>
      <div class="company-name">${esc(settings.name)}</div>
      <div class="company-meta">
        ${esc(settings.address)} · ${esc(settings.postalCity)}<br>
        NIF: <strong>${esc(settings.nif)}</strong> · ${esc(settings.country)}<br>
        ${esc(settings.phone)} · ${esc(settings.email)}<br>
        Licença comunitária n.º ${esc(settings.licencaComunitaria)}
      </div>
    </div>
    <div class="invoice-title">
      <div class="label">FATURA</div>
      <div class="num">${esc(invoiceNumber)}</div>
      <div class="dates">
        Emissão: <strong>${fmtDate(issueDate)}</strong><br>
        Vencimento: <strong>${fmtDate(dueDate)}</strong> (${settings.paymentTermsDays} dias)
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="role">Emitente (prestador de serviço)</div>
      <div class="name">${esc(settings.name)}</div>
      <div class="detail">NIF: ${esc(settings.nif)}<br>${esc(settings.address)}<br>${esc(settings.postalCity)}</div>
    </div>
    <div class="party-box">
      <div class="role">Adquirente (cliente)</div>
      <div class="name">${esc(buyer.name)}</div>
      <div class="detail">
        NIF: ${buyer.nif ? esc(buyer.nif) : "—"}<br>
        ${buyer.billingAddress ? `${esc(buyer.billingAddress)}<br>` : ""}
        Ref. cliente: ${esc(job.reference)}
      </div>
    </div>
  </div>

  <table class="lines" aria-label="Linhas de fatura">
    <thead>
      <tr>
        <th style="width:50%">Descrição</th>
        <th style="width:12%;text-align:right">Qtd</th>
        <th style="width:18%;text-align:right">Preço unit. €</th>
        <th style="width:10%;text-align:right">IVA %</th>
        <th style="width:10%">Total €</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>${esc(serviceDesc)}</strong><br>
          <span style="font-size:7.5pt;color:#555">Rota: ${routeDesc} · Ref. transporte: ${esc(job.jobNumber)} · Ref: ${esc(job.reference)}</span>
        </td>
        <td style="text-align:right">1</td>
        <td style="text-align:right">${fmtEur(baseAmount)}</td>
        <td style="text-align:right">${settings.vatPct}%</td>
        <td>${fmtEur(baseAmount)}</td>
      </tr>
      ${adrLine}
      ${intlLine}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Base tributável</span><span>${fmtEur(baseAmount)} €</span></div>
      <div class="totals-row subtotal"><span>IVA ${settings.vatPct}%</span><span>${fmtEur(vatAmount)} €</span></div>
      <div class="totals-row total"><span>Total</span><span>${fmtEur(totalAmount)} €</span></div>
    </div>
  </div>

  <div class="payment-box">
    <div class="title">Dados de pagamento</div>
    <div class="iban">${esc(settings.iban)}</div>
    <div class="detail">Referência de pagamento: <strong>${esc(invoiceNumber)}</strong> · Vencimento: ${fmtDate(dueDate)}</div>
  </div>

  <div class="footer">
    Processado por Peninsula Fleet OS · ${esc(settings.name)} · NIF ${esc(settings.nif)} ·
    Sujeito a IVA nos termos do artigo 9.º do CIVA (prestações de serviços de transporte).
    Documento de demonstração — não substitui fatura emitida por software certificado AT (Portaria 363/2010).
  </div>

  <div class="no-print">
    <button type="button" onclick="window.print()" style="padding:8px 20px;background:#1a4d3a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">
      Imprimir / Guardar PDF
    </button>
  </div>

</div>
</body>
</html>`;
}
