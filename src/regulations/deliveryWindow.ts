import type { JobStop } from "../data/types";

/**
 * Delivery / collection window assessment on a DATED time model.
 *
 * - Windows are explicit instants (`windowStartAt` / `windowEndAt`, ISO with offset).
 * - The ETA is a RANGE: earliest = driving time only; latest = driving + mandatory
 *   breaks/rests. A margin covers routing ETA uncertainty.
 * - Legacy clock-only windows ("HH:MM") are never guessed onto a date: they are UNKNOWN.
 */
export type WindowStatus = "achievable" | "at_risk" | "missed" | "unknown" | "no_window";

export type WindowAssessment = {
  stopId: string;
  status: WindowStatus;
  reason: string;
  etaEarliestIso?: string;
  etaLatestIso?: string;
};

export const WINDOW_ETA_MARGIN_MIN = 15;

export function assessStopWindow(
  stop: Pick<JobStop, "id" | "windowStartAt" | "windowEndAt" | "scheduledTime" | "windowEnd">,
  etaEarliestMs: number,
  etaLatestMs: number,
  marginMin: number = WINDOW_ETA_MARGIN_MIN,
): WindowAssessment {
  const base = { stopId: stop.id };
  if (!Number.isFinite(etaEarliestMs) || !Number.isFinite(etaLatestMs) || etaLatestMs < etaEarliestMs) {
    return { ...base, status: "unknown", reason: "ETA indisponível" };
  }
  const eta = { etaEarliestIso: new Date(etaEarliestMs).toISOString(), etaLatestIso: new Date(etaLatestMs).toISOString() };
  if (!stop.windowEndAt) {
    if (stop.windowEnd || stop.scheduledTime) {
      return {
        ...base,
        ...eta,
        status: "unknown",
        reason: `janela sem data (registo antigo ${stop.scheduledTime ?? "?"}–${stop.windowEnd ?? "?"}) — não avaliável`,
      };
    }
    return { ...base, ...eta, status: "no_window", reason: "sem janela definida" };
  }
  const end = Date.parse(stop.windowEndAt);
  const start = stop.windowStartAt ? Date.parse(stop.windowStartAt) : Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(end) || Number.isNaN(start) || start > end) {
    return { ...base, ...eta, status: "unknown", reason: "janela com datas inválidas" };
  }
  const m = marginMin * 60_000;
  if (etaEarliestMs - m > end) {
    return { ...base, ...eta, status: "missed", reason: "mesmo a ETA mais cedo fica depois do fim da janela" };
  }
  if (etaLatestMs + m <= end) {
    const early = Number.isFinite(start) && etaLatestMs < start;
    return {
      ...base,
      ...eta,
      status: "achievable",
      reason: early ? "chegada antes da abertura da janela (espera)" : `ETA dentro da janela com margem de ${marginMin} min`,
    };
  }
  return { ...base, ...eta, status: "at_risk", reason: `ETA a menos de ${marginMin} min do fim da janela, ou intervalo de ETA atravessa o fim` };
}

const RANK: Record<WindowStatus, number> = { missed: 4, at_risk: 3, unknown: 2, achievable: 1, no_window: 0 };

/** Worst status across stops (missed > at_risk > unknown > achievable > no_window). */
export function worstWindow(list: WindowAssessment[]): WindowStatus {
  return list.reduce<WindowStatus>((w, a) => (RANK[a.status] > RANK[w] ? a.status : w), "no_window");
}
