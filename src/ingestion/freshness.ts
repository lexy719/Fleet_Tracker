import type { Freshness, SourceRecord, SourceState } from "./types";

const MIN = 60_000;

function age(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}

/**
 * Freshness is judged by the SOURCE's own publication/observation dates against the
 * source's cadence — a successful fetch of old data is still STALE. A failed last
 * attempt is FETCH_ERROR even when an older snapshot exists.
 */
export function assessFreshness(source: SourceRecord, state: SourceState | undefined, now: Date): Freshness {
  if (source.access.kind === "STATIC") {
    return { state: "UNKNOWN", reason: "Registos curados — frescura verificada à mão em cada registo (data de consulta)." };
  }
  const base = {
    ...(state?.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
    ...(state?.lastAttemptAt ? { lastAttemptAt: state.lastAttemptAt } : {}),
    ...(state?.publishedAt ? { publishedAt: state.publishedAt, publishedAtBasis: state.publishedAtBasis } : {}),
  };
  if (!state?.lastAttemptAt) return { ...base, state: "UNKNOWN", reason: "Ainda não consultada nesta sessão/dispositivo." };
  const failedLast = state.lastError && (!state.lastSuccessAt || state.lastAttemptAt > state.lastSuccessAt);
  if (failedLast) {
    return {
      ...base,
      state: "FETCH_ERROR",
      lastError: state.lastError,
      reason: `Última consulta falhou: ${state.lastError}${state.lastSuccessAt ? ` (último sucesso ${state.lastSuccessAt})` : " (nunca obtida com sucesso)"}`,
    };
  }
  if (!state.publishedAt) {
    return { ...base, state: "UNKNOWN", reason: "Obtida, mas a fonte não declara data de publicação — frescura não determinável." };
  }
  const ageMs = now.getTime() - Date.parse(state.publishedAt);
  if (!Number.isFinite(ageMs)) return { ...base, state: "UNKNOWN", reason: "Data de publicação ilegível." };
  if (ageMs < -10 * MIN) return { ...base, state: "UNKNOWN", reason: `Data de publicação no futuro (${state.publishedAt}) — inconsistente.` };
  const label = `publicação mais recente há ${age(Math.max(0, ageMs))} (${state.publishedAtBasis ?? "data da fonte"})`;
  if (ageMs >= source.cadence.staleAfterMin * MIN) return { ...base, state: "STALE", reason: `Desatualizada: ${label}; limite ${age(source.cadence.staleAfterMin * MIN)}.` };
  if (ageMs >= source.cadence.agingAfterMin * MIN) return { ...base, state: "AGING", reason: `A envelhecer: ${label}.` };
  return { ...base, state: "FRESH", reason: `Atual: ${label}.` };
}

/** Is a source due for a check? */
export function isDue(source: SourceRecord, state: SourceState | undefined, now: Date): boolean {
  // Research sources are read by the research agent (route-driven), never by the scheduler.
  if (!source.enabled || source.access.kind === "STATIC" || source.access.kind === "RESEARCH") return false;
  if (!state?.lastAttemptAt) return true;
  return now.getTime() - Date.parse(state.lastAttemptAt) >= source.cadence.checkEveryMin * MIN;
}
