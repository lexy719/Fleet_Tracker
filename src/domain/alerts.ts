import type { AlertSeverity, Driver, Job, OpsAlert, Trailer, Truck } from "../data/types";
import { missingDocuments, type OpsDocument } from "./documents/documents";
import { driverQualifications } from "./drivers/drivers";
import { unresolvedReferences } from "./integrity";
import { deriveSla } from "./jobs/sla";
import { formatLocal } from "./time";

/*
 * Operational alerts DERIVED from persisted records — no static alert list. Each alert
 * states the fact it is based on and carries the exact place where it is resolved.
 */

const OPEN = ["backlog", "queued", "assigned", "loading", "in_transit"];

const ptDate = (d: string | undefined) => (d ? d.split("-").reverse().join("/") : "—");

export const ALERT_RANK: Record<AlertSeverity, number> = { BLOCKER: 0, ACTION_REQUIRED: 1, RISK: 2, INFORMATION: 3 };

export function deriveAlerts(s: { jobs: Job[]; trucks: Truck[]; drivers: Driver[]; trailers: Trailer[]; documents?: OpsDocument[] }, now: Date): OpsAlert[] {
  const ts = now.toISOString();
  const out: OpsAlert[] = [];

  for (const j of s.jobs) {
    if (!OPEN.includes(j.status)) continue;
    const sla = deriveSla(j, now);
    if (sla === "breached") out.push({ id: `sla-${j.id}`, severity: "ACTION_REQUIRED", title: `Prazo ultrapassado — ${j.jobNumber}`, detail: `${j.client} · entrega até ${formatLocal(j.deliveryDeadline)}`, entityType: "job", entityId: j.id, ts });
    else if (sla === "at_risk") out.push({ id: `sla-${j.id}`, severity: "RISK", title: `Prazo em risco — ${j.jobNumber}`, detail: `${j.client} · entrega até ${formatLocal(j.deliveryDeadline)}`, entityType: "job", entityId: j.id, ts });
    if (j.planStatus === "REPLAN_REQUIRED") out.push({ id: `replan-${j.id}`, severity: "ACTION_REQUIRED", title: `Replaneamento necessário — ${j.jobNumber}`, detail: j.planInvalidation ? `Alterado: ${j.planInvalidation.fields.join(", ")}` : "A rota confirmada já não corresponde aos dados do trabalho", entityType: "job", entityId: j.id, ts });
  }

  for (const r of unresolvedReferences(s.jobs, s.trucks, s.drivers, s.trailers)) {
    const label = r.kind === "truck" ? "viatura" : r.kind === "driver" ? "motorista" : "reboque";
    out.push({ id: `ref-${r.jobId}-${r.kind}`, severity: "BLOCKER", title: `Referência não resolvida — ${r.jobNumber}`, detail: `O ${label} «${r.refId}» não existe nos registos`, entityType: "job", entityId: r.jobId, ts });
  }

  for (const d of s.drivers) {
    if (d.archivedAt) continue;
    for (const q of driverQualifications(d, now)) {
      if (q.state === "EXPIRED") out.push({ id: `q-${d.id}-${q.kind}`, severity: "ACTION_REQUIRED", title: `${q.label} caducado — ${d.name}`, detail: `Validade: ${ptDate(q.expiresOn)}`, entityType: "driver", entityId: d.id, ts });
      else if (q.state === "EXPIRING") out.push({ id: `q-${d.id}-${q.kind}`, severity: "RISK", title: `${q.label} a caducar — ${d.name}`, detail: `Validade: ${ptDate(q.expiresOn)} (${q.daysLeft} dias)`, entityType: "driver", entityId: d.id, ts });
    }
  }

  for (const t of s.trucks) {
    if (t.archivedAt || t.availability === "AVAILABLE") continue;
    const live = s.jobs.filter((j) => j.assignedTruckId === t.id && ["queued", "assigned", "loading", "in_transit"].includes(j.status));
    if (live.length) out.push({ id: `unavail-${t.id}`, severity: "ACTION_REQUIRED", title: `Viatura indisponível com trabalhos — ${t.plate}`, detail: `${live.map((j) => j.jobNumber).join(", ")}`, entityType: "truck", entityId: t.id, ts });
  }

  // Documents still to issue: one summary line (housekeeping, not per-job noise).
  if (s.documents) {
    let invoices = 0;
    let cmrs = 0;
    for (const j of s.jobs) for (const t of missingDocuments(j, s.documents)) {
      if (t === "INVOICE") invoices++;
      else cmrs++;
    }
    if (invoices || cmrs) {
      const parts = [invoices ? `${invoices} fatura${invoices === 1 ? "" : "s"}` : "", cmrs ? `${cmrs} guia${cmrs === 1 ? "" : "s"} CMR` : ""].filter(Boolean);
      out.push({ id: "docs-pending", severity: "INFORMATION", title: "Documentos por emitir", detail: parts.join(" · "), entityType: "document", entityId: "pending", ts });
    }
  }

  return out.sort((a, b) => ALERT_RANK[a.severity] - ALERT_RANK[b.severity]);
}
