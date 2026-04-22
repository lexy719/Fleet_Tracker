/**
 * Carta de porte (CMR) — modelo alinhado à Convenção CMR e uso corrente em Portugal.
 * Referência: Convenção relativa ao contrato de transporte internacional de mercadorias por estrada (Genebra, 1956).
 */
import type { CargoType, Job } from "../data/types";
import type { CompanySettings } from "../context/SettingsContext";

const CARGO_LABEL: Record<CargoType, string> = {
  dry:          "Seco",
  refrigerated: "Reefer / Frio",
  hazmat:       "ADR / Perigoso",
  bulk:         "Granel",
  automotive:   "Automóvel",
};

/** Transportador — fallback se settings não for passado. */
const CARRIER_DEFAULT = {
  name: "Peninsula Fleet Transportes, Lda.",
  address: "Zona Industrial Norte, Lote 12",
  postalCity: "4470-123 Maia",
  country: "Portugal",
  nif: "500 000 000",
  licenca: "Licença comunitária n.º CM 123456789",
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPtDate(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type CmrCarrierContext = {
  truckPlate?: string;
  truckName?: string;
  driverName?: string;
  driverLicense?: string;
  /** Optional: override carrier info from settings. */
  settings?: CompanySettings;
};

export function buildPortugueseCMRHtml(job: Job, ctx: CmrCarrierContext): string {
  const carrier = ctx.settings
    ? {
        name:     ctx.settings.name,
        address:  ctx.settings.address,
        postalCity: ctx.settings.postalCity,
        country:  ctx.settings.country,
        nif:      ctx.settings.nif,
        licenca:  `Licença comunitária n.º ${ctx.settings.licencaComunitaria}`,
      }
    : CARRIER_DEFAULT;

  const first = job.stops[0];
  const last = job.stops[job.stops.length - 1];
  const issuePlace = first?.city ?? "—";
  const issueDate = formatPtDate(job.createdAt, new Date().toISOString());

  const senderBlock = first
    ? `${escapeHtml(first.clientName)}<br>${escapeHtml(first.address)}<br>${escapeHtml(first.city)}`
    : "—";

  const consigneeBlock = last
    ? `${escapeHtml(last.clientName)}<br>${escapeHtml(last.address)}<br>${escapeHtml(last.city)}`
    : "—";

  const placeDelivery = last
    ? `${escapeHtml(last.address)}, ${escapeHtml(last.city)}`
    : "—";

  const takeOver = first
    ? `${escapeHtml(first.city)}, ${formatPtDateTime(job.pickupDeadline)}`
    : "—";

  const natureGoods = job.stops
    .map((s) => escapeHtml(s.cargoDescription))
    .filter(Boolean)
    .join(" · ") || CARGO_LABEL[job.cargoType];

  const marksPackages = `${escapeHtml(job.id)} · ${job.totalPallets} vol.`;

  const weightBrut = `${job.totalWeightKg.toLocaleString("pt-PT")} kg`;

  const carrierVehicle = [
    ctx.truckPlate && ctx.truckName ? `${escapeHtml(ctx.truckPlate)} (${escapeHtml(ctx.truckName)})` : ctx.truckPlate ? escapeHtml(ctx.truckPlate) : "—",
    ctx.driverName ? `Motorista: ${escapeHtml(ctx.driverName)}` : "",
    ctx.driverLicense ? `CMTVDE/Carta: ${escapeHtml(ctx.driverLicense)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");

  const stopsRows = job.stops
    .map(
      (s) => `
    <tr>
      <td>${s.sequence}</td>
      <td>${escapeHtml(s.city)}</td>
      <td>${s.type === "pickup" ? "Carga" : "Descarga"}</td>
      <td>${escapeHtml(s.cargoDescription)}</td>
      <td>${s.pallets}</td>
      <td>${s.weightKg.toLocaleString("pt-PT")}</td>
      <td>${escapeHtml(s.scheduledTime)}–${escapeHtml(s.windowEnd)}</td>
    </tr>`,
    )
    .join("");

  const notesBlock = job.notes ? escapeHtml(job.notes) : "—";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>CMR — ${escapeHtml(job.id)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Arial", "Helvetica Neue", sans-serif;
    font-size: 8.5pt;
    line-height: 1.25;
    margin: 0;
    padding: 10mm;
    color: #000;
  }
  .cmr-title {
    text-align: center;
    font-weight: bold;
    font-size: 14pt;
    letter-spacing: 0.02em;
    margin: 0 0 2mm;
  }
  .cmr-sub {
    text-align: center;
    font-size: 7.5pt;
    margin: 0 0 6mm;
    max-width: 180mm;
    margin-left: auto;
    margin-right: auto;
  }
  .cmr-carrier-id {
    font-size: 7.5pt;
    margin-bottom: 5mm;
    border: 1px solid #000;
    padding: 3mm 4mm;
  }
  .cmr-carrier-id strong { font-size: 8pt; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid #000;
    border-bottom: none;
  }
  .cell {
    border-bottom: 1px solid #000;
    border-right: 1px solid #000;
    min-height: 14mm;
    padding: 2mm 3mm;
    vertical-align: top;
  }
  .cell:nth-child(2n) { border-right: none; }
  .num {
    font-weight: bold;
    font-size: 7pt;
    margin-bottom: 1mm;
  }
  .num::before { content: attr(data-n) ". "; }
  .wide {
    grid-column: 1 / -1;
  }
  .split-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border: 1px solid #000;
    border-top: none;
  }
  .split-3 .cell { border-bottom: none; min-height: 22mm; }
  .split-3 .cell:not(:last-child) { border-right: 1px solid #000; }
  .split-2-sig {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #000;
    border-top: none;
  }
  .split-2-sig .cell { min-height: 18mm; border-bottom: none; }
  .split-2-sig .cell:first-child { border-right: 1px solid #000; }
  table.stops {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
    margin-top: 4mm;
    border: 1px solid #000;
  }
  table.stops th, table.stops td {
    border: 1px solid #000;
    padding: 1.5mm 2mm;
    text-align: left;
  }
  table.stops th { background: #f0f0f0; font-weight: 600; }
  .footer-legal {
    margin-top: 4mm;
    font-size: 6.5pt;
    text-align: justify;
    border-top: 1px solid #ccc;
    padding-top: 2mm;
  }
  .no-print { margin-top: 8mm; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="cmr-title">CARTA DE PORTE (CMR)</div>
  <p class="cmr-sub">Documento previsto na Convenção relativa ao contrato de transporte internacional de mercadorias por estrada (CMR), ratificada por Portugal. Válido como prova do contrato de transporte entre as partes indicadas.</p>

  <div class="cmr-carrier-id">
    <strong>Transportador (principal)</strong><br>
    ${escapeHtml(carrier.name)}<br>
    ${escapeHtml(carrier.address)} · ${escapeHtml(carrier.postalCity)} · ${escapeHtml(carrier.country)}<br>
    NIF: ${escapeHtml(carrier.nif)} · ${escapeHtml(carrier.licenca)}
  </div>

  <div class="grid">
    <div class="cell"><div class="num" data-n="1">Expedidor (nome, morada, país)</div>${senderBlock}</div>
    <div class="cell"><div class="num" data-n="2">Destinatário (nome, morada, país)</div>${consigneeBlock}</div>
    <div class="cell"><div class="num" data-n="3">Lugar previsto para entrega da mercadoria</div>${placeDelivery}</div>
    <div class="cell"><div class="num" data-n="4">Lugar e data/hora da tomada a cargo</div>${takeOver}</div>
    <div class="cell"><div class="num" data-n="5">Documentos anexos</div>Ref. cliente: ${escapeHtml(job.reference)} · Ref. transporte: ${escapeHtml(job.id)}</div>
    <div class="cell"><div class="num" data-n="6">Sinais e números · n.º de volumes</div>${marksPackages}</div>
    <div class="cell wide"><div class="num" data-n="7">Designação da mercadoria</div>${natureGoods}</div>
    <div class="cell"><div class="num" data-n="8">N.º estatístico</div>—</div>
    <div class="cell"><div class="num" data-n="9">Peso bruto (kg)</div>${weightBrut}</div>
    <div class="cell"><div class="num" data-n="10">Volume (m³)</div>—</div>
    <div class="cell"><div class="num" data-n="11">Instruções do expedidor</div>${notesBlock}</div>
    <div class="cell"><div class="num" data-n="12">Instruções quanto ao pagamento</div>Porte pago (acordado)</div>
    <div class="cell"><div class="num" data-n="13">Contrareembolso</div>—</div>
    <div class="cell"><div class="num" data-n="14">Instruções quanto ao seguro</div>Seguro da mercadoria: conforme acordo comercial entre as partes</div>
    <div class="cell wide"><div class="num" data-n="15">Convenções especiais</div>Tipo de carga: ${escapeHtml(CARGO_LABEL[job.cargoType])} · Prazo entrega: ${formatPtDateTime(job.deliveryDeadline)}</div>
    <div class="cell wide"><div class="num" data-n="16">Transportador (viatura e motorista)</div>${carrierVehicle}</div>
  </div>

  <div class="split-3">
    <div class="cell"><div class="num" data-n="17">Reservas do transportador</div><br><br></div>
    <div class="cell"><div class="num" data-n="18">Contrareembolso (montante)</div>—</div>
    <div class="cell"><div class="num" data-n="19">Lugar e data de emissão</div>${escapeHtml(issuePlace)}, ${issueDate}</div>
  </div>

  <div class="split-2-sig">
    <div class="cell"><div class="num" data-n="20">Assinatura e carimbo do expedidor</div><br><br></div>
    <div class="cell"><div class="num" data-n="21">Assinatura e carimbo do transportador</div><br><br></div>
  </div>

  <div class="grid" style="border-top: none;">
    <div class="cell"><div class="num" data-n="22">Entrega — data/hora e assinatura do destinatário</div><br><br></div>
    <div class="cell"><div class="num" data-n="23">Transportador sucessivo</div>—</div>
    <div class="cell wide"><div class="num" data-n="24">Reservado às autoridades aduaneiras</div><br></div>
  </div>

  <table class="stops" aria-label="Paragens">
    <thead>
      <tr>
        <th>#</th><th>Local</th><th>Operação</th><th>Mercadoria</th><th>Vol.</th><th>Peso kg</th><th>Janela</th>
      </tr>
    </thead>
    <tbody>${stopsRows}</tbody>
  </table>

  <p class="footer-legal">
    O transportador responde nos termos da Convenção CMR pelo transporte das mercadorias desde a tomada a cargo até à entrega.
    Reclamações: conservar este documento e contactar o expedidor ou o transportador no prazo legal.
    Em Portugal, aplica-se o regime da Lei n.º 45/86 (de 24 de setembro), alterada, e normas europeias aplicáveis ao transporte rodoviário.
  </p>

  <button type="button" class="no-print" onclick="window.print()" style="padding:8px 16px;background:#1a4d3a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">Imprimir / Guardar PDF</button>
</body>
</html>`;
}
