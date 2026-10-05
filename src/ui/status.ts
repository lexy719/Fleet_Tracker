import type { AlertSeverity, DriverOperationalState, JobPlanStatus, JobStatus, TruckOperationalState } from "../data/types";
import type { QualificationState } from "../domain/drivers/drivers";

/*
 * Central status → presentation mapping. Domain state is separate from its visual form:
 * every screen renders a given semantic state identically through <StatusBadge>.
 */

export type Tone = "ok" | "warn" | "danger" | "info" | "accent" | "neutral";
export type StatusView = { label: string; tone: Tone };

export const JOB_STATUS: Record<JobStatus, StatusView> = {
  backlog: { label: "Por atribuir", tone: "neutral" },
  queued: { label: "Na fila", tone: "info" },
  assigned: { label: "Atribuído", tone: "accent" },
  loading: { label: "A carregar", tone: "info" },
  in_transit: { label: "Em viagem", tone: "info" },
  delivered: { label: "Entregue", tone: "ok" },
  invoiced: { label: "Faturado", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const PLAN_STATUS: Record<JobPlanStatus, StatusView> = {
  UNPLANNED: { label: "Sem rota", tone: "neutral" },
  PLANNED: { label: "Rota confirmada", tone: "accent" },
  REPLAN_REQUIRED: { label: "Replanear", tone: "warn" },
};

export const TRUCK_STATE: Record<TruckOperationalState, StatusView> = {
  AVAILABLE: { label: "Disponível", tone: "ok" },
  ASSIGNED: { label: "Atribuída", tone: "accent" },
  IN_SERVICE: { label: "Em serviço", tone: "info" },
  MAINTENANCE: { label: "Manutenção", tone: "warn" },
  OUT_OF_SERVICE: { label: "Fora de serviço", tone: "danger" },
  ARCHIVED: { label: "Arquivada", tone: "neutral" },
};

/** Trailer states reuse the truck vocabulary (feminine forms are fine for «viatura»; trailers use masculine). */
export const TRAILER_STATE: Record<TruckOperationalState, StatusView> = {
  AVAILABLE: { label: "Disponível", tone: "ok" },
  ASSIGNED: { label: "Atribuído", tone: "accent" },
  IN_SERVICE: { label: "Em serviço", tone: "info" },
  MAINTENANCE: { label: "Manutenção", tone: "warn" },
  OUT_OF_SERVICE: { label: "Fora de serviço", tone: "danger" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
};

export const DRIVER_STATE: Record<DriverOperationalState, StatusView> = {
  AVAILABLE: { label: "Disponível", tone: "ok" },
  ASSIGNED: { label: "Atribuído", tone: "accent" },
  ON_JOB: { label: "Em trabalho", tone: "info" },
  OFF_DUTY: { label: "Fora de serviço", tone: "neutral" },
  LEAVE: { label: "Ausente", tone: "warn" },
  UNAVAILABLE: { label: "Indisponível", tone: "danger" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
};

export const QUALIFICATION: Record<QualificationState, StatusView> = {
  VALID: { label: "Válido", tone: "ok" },
  EXPIRING: { label: "A caducar", tone: "warn" },
  EXPIRED: { label: "Caducado", tone: "danger" },
  MISSING: { label: "Não registado", tone: "neutral" },
  NOT_HELD: { label: "Não detém", tone: "neutral" },
};

export const ALERT_GROUP: Record<AlertSeverity, { label: string; tone: Tone }> = {
  BLOCKER: { label: "Bloqueio", tone: "danger" },
  ACTION_REQUIRED: { label: "Ação necessária", tone: "danger" },
  RISK: { label: "Risco", tone: "warn" },
  INFORMATION: { label: "Informação", tone: "info" },
};

export const ALERT_ORDER: AlertSeverity[] = ["BLOCKER", "ACTION_REQUIRED", "RISK", "INFORMATION"];

/** CSS variables for a tone: [foreground, soft background]. */
export function toneVars(t: Tone): { fg: string; bg: string } {
  switch (t) {
    case "ok":
      return { fg: "var(--ok)", bg: "var(--ok-soft)" };
    case "warn":
      return { fg: "var(--warn)", bg: "var(--warn-soft)" };
    case "danger":
      return { fg: "var(--danger)", bg: "var(--danger-soft)" };
    case "info":
      return { fg: "var(--info)", bg: "var(--info-soft)" };
    case "accent":
      return { fg: "var(--accent)", bg: "var(--accent-soft)" };
    default:
      return { fg: "var(--neutral)", bg: "var(--neutral-soft)" };
  }
}

/** Provenance of a value — different from an alarm. */
export type Provenance = "MANUAL" | "DEMO" | "UNKNOWN" | "ASSUMED" | "STALE";
export const PROVENANCE: Record<Provenance, { label: string; title: string }> = {
  MANUAL: { label: "Manual", title: "Valor introduzido manualmente (não é telemetria)" },
  DEMO: { label: "Demo", title: "Registo de demonstração — não é um recurso/transporte real" },
  UNKNOWN: { label: "Desconhecido", title: "Valor não registado" },
  ASSUMED: { label: "Assumido", title: "Valor assumido do perfil genérico de rota" },
  STALE: { label: "Desatualizado", title: "Registo antigo — pode não refletir o estado atual" },
};
