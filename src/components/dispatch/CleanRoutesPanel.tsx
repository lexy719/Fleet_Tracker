import { Loader2, Route, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { RouteCoverage } from "../../ingestion/coverage";
import type { DiscoveryRun } from "../../discovery/types";
import { formatClock, formatWindow } from "../../regulations/evaluate";
import { STRATEGY_LABEL, type RouteStrategy, type StrategyOutcome } from "../../solver/types";
import type { CleanRouteState } from "./useCleanRoutes";

const km = (m: number) => `${(m / 1000).toFixed(0)} km`;
const dur = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`;
};
const dKm = (m: number) => (m === 0 ? "0 km" : `${m > 0 ? "+" : "−"}${(Math.abs(m) / 1000).toFixed(1)} km`);
const dMin = (s: number) => (s === 0 ? "0 min" : `${s > 0 ? "+" : "−"}${Math.round(Math.abs(s) / 60)} min`);

const OUTCOME: Record<StrategyOutcome, { label: string; cls: string }> = {
  UNCHANGED: { label: "Sem alteração necessária", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  UNCHANGED_UNCERTAIN: { label: "Sem alteração · restrições incertas", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  CLEANED: { label: "Rota corrigida pelo FleetOS", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  CLEANED_UNCERTAIN: { label: "Rota corrigida · restrições incertas", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  UNRESOLVED: { label: "Sem rota limpa — por resolver", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  ERROR: { label: "Erro", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
};

const WINDOW_LABEL: Record<string, { label: string; cls: string }> = {
  achievable: { label: "janela de entrega cumprível", cls: "text-[var(--accent)]" },
  at_risk: { label: "janela de entrega em risco", cls: "text-[var(--warn)]" },
  missed: { label: "janela de entrega falhada", cls: "text-[var(--danger)]" },
  unknown: { label: "janela de entrega por confirmar", cls: "text-[var(--text-2)]" },
  no_window: { label: "sem janela de entrega", cls: "text-[var(--text-2)]" },
};

export function CleanRouteCard({
  s,
  coverage,
  discovery,
  selected,
  onUse,
  selectable = true,
  elapsedDurationSec,
  windowStatus,
  confirmed,
}: {
  s: CleanRouteState;
  coverage?: RouteCoverage;
  discovery?: DiscoveryRun;
  selected: boolean;
  onUse: () => void;
  selectable?: boolean;
  elapsedDurationSec?: (driveSec: number) => number;
  windowStatus?: string;
  confirmed?: { at: string };
}) {
  const r = s.result;
  const label = STRATEGY_LABEL[s.strategy];
  if (s.status !== "done" || !r) {
    return (
      <div className="rounded-[var(--r-md)] border border-[var(--app-border)] p-3 text-[11px]" data-testid={`clean-${s.strategy}`}>
        <p className="font-bold">{label}</p>
        {s.status === "solving" || s.status === "idle" ? (
          <p className="mt-1 flex items-center gap-1 text-[var(--app-muted)]">
            <Loader2 className="h-3 w-3 animate-spin" /> Road Intelligence a investigar esta rota…
          </p>
        ) : (
          <p className="mt-1 text-[var(--danger)]">Erro: {s.message}</p>
        )}
      </div>
    );
  }
  const f = r.final;
  // Part of the route outside every supported territory: never shown as a plain green result.
  const outsideKm = coverage?.outsideTerritoryKm ?? r.coverageAtSolve?.outsideTerritoryKm ?? 0;
  const o = outsideKm > 0 && r.outcome === "CLEANED" ? { ...OUTCOME.CLEANED, cls: OUTCOME.CLEANED_UNCERTAIN.cls } : OUTCOME[r.outcome];
  return (
    <div
      className={`space-y-1.5 rounded-[var(--r-md)] border p-3 text-[11px] ${selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/30" : "border-[var(--app-border)]"}`}
      data-testid={`clean-${s.strategy}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-black">{label}</p>
        <span className="flex flex-wrap gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${o.cls}`}>{o.label}</span>
          {outsideKm > 0 && (
            <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--danger)]" data-testid="outside-territory-pill">
              ~{outsideKm} km sem cobertura
            </span>
          )}
          {confirmed && <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold text-white" data-testid="confirmed-badge">Confirmada {new Date(confirmed.at).toLocaleString("pt-PT")}</span>}
          {s.reused && <span className="rounded-full bg-[var(--neutral-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-2)]">resultado guardado</span>}
        </span>
      </div>

      {f ? (
        <p className="text-[18px] font-black leading-none" data-testid="final-summary">
          {km(f.route.distanceM)} · {dur(elapsedDurationSec?.(f.route.durationSec) ?? f.route.durationSec)}
          <span className="ml-1 text-[10px] font-semibold text-[var(--app-muted)]">com pausas · rota FleetOS</span>
        </p>
      ) : (
        <p className="flex items-start gap-1 font-semibold text-[var(--danger)]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> FleetOS não encontrou uma rota sem conflitos conhecidos para esta estratégia.
        </p>
      )}

      <div className="rounded-lg bg-[var(--app-elevated)] px-2 py-1.5" data-testid="ri-impact">
        <p className="font-bold">Road Intelligence</p>
        {r.deviations.length === 0 && f ? (
          <p>Nenhuma restrição conhecida exigiu alteração da rota · desvio 0 km · 0 min</p>
        ) : f && r.total ? (
          <p>
            {r.deviations.length} desvio{r.deviations.length === 1 ? "" : "s"} aplicado{r.deviations.length === 1 ? "" : "s"} · {dKm(r.total.deltaDistanceM)} ·{" "}
            {dMin(r.total.deltaDurationSec)} face à rota base
          </p>
        ) : (
          <p>{r.unresolved.map((u) => u.reason).join(" · ")}</p>
        )}
        {(r.outcome === "UNCHANGED_UNCERTAIN" || r.outcome === "CLEANED_UNCERTAIN") && (
          <p className="flex items-start gap-1 text-[var(--warn)]">
            <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" />
            Restrições incertas mantêm-se (factos ou geometria em falta) — não foram evitadas automaticamente.
          </p>
        )}
        {r.impact?.materiallyWorse && (
          <p className="font-semibold text-[var(--warn)]" data-testid="materially-worse">
            Rota limpa materialmente pior que a base (×{r.impact.durationRatio.toFixed(2)} em tempo, ×{r.impact.distanceRatio.toFixed(2)} em distância) — confirme se é operacionalmente aceitável.
          </p>
        )}
        {windowStatus && (
          <p className={`text-[10px] font-semibold ${WINDOW_LABEL[windowStatus]?.cls ?? ""}`} data-testid="window-impact">
            Impacto na entrega: {WINDOW_LABEL[windowStatus]?.label ?? windowStatus}
          </p>
        )}
        <p className="text-[10px] text-[var(--app-muted)]">
          Rota base do fornecedor: {km(r.baseline.route.distanceM)} · {dur(r.baseline.route.durationSec)} de condução · {r.baseline.route.provenance}
        </p>
      </div>

      <p className="text-[10px]" data-testid="coverage-line">
        <span className="font-bold">Cobertura:</span>{" "}
        {coverage ? (coverage.complete ? "completa para as fontes conhecidas" : "PARCIAL") : "PARCIAL (a calcular)"}
        {coverage && ` · ${coverage.municipalities.filter((m) => m.temporaryEvents === "NO_SOURCE").length} municípios sem fonte operacional · ${coverage.nationalSources.filter((x) => x.freshness !== "FRESH").length} fontes nacionais não atuais`}
        {discovery && ` · ${discovery.gaps.length} lacunas de descoberta`}
      </p>
      {!coverage && (r.coverageAtSolve?.outsideTerritoryKm ?? 0) > 0 && (
        <p className="rounded bg-[var(--danger-soft)] px-1.5 py-1 text-[10px] font-semibold text-[var(--danger)]" data-testid="outside-territory">
          Cobertura de território (registada na resolução): ~{r.coverageAtSolve!.outsideTerritoryKm} km fora do território suportado — sem Road Intelligence nessa parte.
        </p>
      )}
      {coverage && coverage.outsideTerritoryKm > 0 && (
        <p className="rounded bg-[var(--danger-soft)] px-1.5 py-1 text-[10px] font-semibold text-[var(--danger)]" data-testid="outside-territory">
          Cobertura de território: ~{coverage.outsideTerritoryKm} km desta rota ficam fora do território suportado (
          {coverage.territories.map((t) => t.name).join(", ") || "nenhum"}). O FleetOS pode calcular e mostrar a rota, mas não tem Road Intelligence nessa parte —
          nem a dá como conforme, nem como proibida.
        </p>
      )}
      <p className="text-[9px] text-[var(--app-muted)]">
        «Limpa» = sem conflito com as restrições aceites que o FleetOS conhece; não prova a ausência de restrições desconhecidas.
        {s.reused ? ` Resultado guardado de ${new Date(r.solvedAt).toLocaleString("pt-PT")} (mesmas entradas e conjunto ${r.datasetVersion}).` : ""}
      </p>

      {r.deviations.length > 0 && (
        <details open data-testid="why-changed">
          <summary className="cursor-pointer font-bold">Porque é que o FleetOS alterou esta rota?</summary>
          <ol className="mt-1 list-decimal space-y-1.5 pl-4">
            {r.deviations.map((d) => (
              <li key={d.id}>
                {d.triggers.map((t) => (
                  <div key={t.constraintId}>
                    <p className="font-semibold">
                      {t.kind === "ROAD_CLOSURE" ? "Corte" : "Restrição"}: {t.title}
                      {t.basis === "precautionary_unverified_legal_status" && (
                        <span className="ml-1 rounded bg-[var(--warn-soft)] px-1 text-[9px] text-[var(--warn)]">evitado por precaução — estado legal não verificado</span>
                      )}
                      {t.origin?.synthetic && <span className="ml-1 rounded bg-[var(--prov-demo-soft)] px-1 text-[9px] text-[var(--prov-demo)]">TESTE SINTÉTICO</span>}
                    </p>
                    <p className="text-[10px]">Aplica-se a: {t.vehicleScope ?? "—"}</p>
                    <p className="text-[10px]">
                      Fonte: {t.origin?.sourceName ?? t.evidence[0]?.authority ?? "—"}
                      {t.origin?.kind === "ingested_reviewed" ? ` · revisto por ${t.origin.reviewedBy}` : t.origin ? " · aceite pelo trust gate" : " · registo curado"}
                      {t.evidence[0] && (
                        <>
                          {" · "}
                          <a className="underline" href={t.evidence[0].url} target="_blank" rel="noreferrer">
                            evidência
                          </a>
                        </>
                      )}
                    </p>
                    <p className="text-[10px]">
                      Passagem prevista na rota base: {t.passageBefore ? formatWindow(t.passageBefore) : "—"}
                      {t.passageBefore?.window
                        ? ` (possível ${formatClock(t.passageBefore.window.earliestIso, t.passageBefore.timeZone)}–${formatClock(t.passageBefore.window.latestIso, t.passageBefore.timeZone)}: ${t.passageBefore.window.sources.join("; ")})`
                        : ""}{" "}
                      ·{" "}
                      {t.outcomeAfter === "avoided" ? "evitado na nova rota (reavaliado com os novos tempos)" : t.outcomeAfter === "still_applies" ? "O FORNECEDOR NÃO EVITOU" : "incerto na nova rota"}
                    </p>
                  </div>
                ))}
                <p className="text-[10px] text-[var(--app-muted)]">
                  Impacto deste passo: {dKm(d.deltaDistanceM)} · {dMin(d.deltaDurationSec)}
                  {d.perConstraintImpact === "unavailable_multiple_triggers" ? " (várias restrições no mesmo passo — impacto por restrição indisponível)" : ""} · método:{" "}
                  {d.method.provider} {d.method.kind === "avoid_rectangles" ? `avoidAreas (${d.method.rectangles.length})` : d.method.kind}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {r.unresolved.length > 0 && r.final && (
        <p className="text-[10px] text-[var(--warn)]">Por resolver: {r.unresolved.map((u) => `${u.reason} (${u.constraintIds.length})`).join(" · ")}</p>
      )}

      <details className="text-[10px]">
        <summary className="cursor-pointer text-[var(--app-muted)]">Auditoria: tentativas, âmbito de descoberta e lacunas</summary>
        <ul className="mt-1 list-disc pl-4">
          {r.attempts.map((a) => (
            <li key={a.iteration}>
              Tentativa {a.iteration}: {km(a.route.distanceM)} · {dur(a.route.durationSec)} de condução · {a.status} · conjunto {a.datasetVersion}
              {a.applies.length ? ` · aplica-se: ${a.applies.map((x) => x.title).join(", ")}` : ""}
              {a.uncertain.length ? ` · incerto: ${a.uncertain.map((x) => `${x.title} (${x.reasons[0] ?? "?"})`).join("; ")}` : ""}
              {a.requestedAvoiding.length ? ` · a evitar: ${a.requestedAvoiding.length}` : ""}
            </li>
          ))}
        </ul>
        {discovery && (
          <div className="mt-1">
            <p>
              Âmbito: {discovery.scope.municipalities.length} municípios · {discovery.scope.roads.length} vias ({discovery.scope.roads.map((x) => x.ref).slice(0, 12).join(", ")}
              {discovery.scope.roads.length > 12 ? "…" : ""}) · {discovery.scope.authorities.length} autoridades · {discovery.scope.registeredSources.length} fontes registadas
            </p>
            <p>
              Cache: {discovery.cache.hit} hit · {discovery.cache.miss} miss · {discovery.cache.stale} stale · {discovery.cache.error} erro · resultados:{" "}
              {discovery.results.length}
            </p>
            <p>
              Lacunas:{" "}
              {Object.entries(discovery.gaps.reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.kind]: (acc[g.kind] ?? 0) + 1 }), {}))
                .map(([k, n]) => `${k} ×${n}`)
                .join(" · ")}
            </p>
          </div>
        )}
        <p>
          Pedidos ao fornecedor de rotas nesta resolução: {s.providerRequests ?? 0}
        </p>
      </details>

      {f && s.finalOption && selectable && (
        <button
          type="button"
          onClick={onUse}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${selected ? "bg-[var(--accent)] text-white" : "bg-[var(--app-elevated)]"}`}
        >
          <Route className="h-3 w-3" /> {selected ? "Rota selecionada" : "Usar esta rota"}
        </button>
      )}
    </div>
  );
}

export function CleanRoutesPanel({
  states,
  selectableIds,
  coverage,
  discovery,
  selectedOptionId,
  selectedCandidateIds,
  onUse,
  elapsedDurationSec,
  windowStatus,
  confirmed,
}: {
  states: Record<RouteStrategy, CleanRouteState>;
  selectableIds?: string[];
  coverage: Partial<Record<RouteStrategy, RouteCoverage>>;
  discovery: Partial<Record<RouteStrategy, DiscoveryRun>>;
  selectedOptionId: string | null;
  selectedCandidateIds?: string[];
  onUse: (s: RouteStrategy) => void;
  elapsedDurationSec?: (driveSec: number) => number;
  windowStatus?: Partial<Record<RouteStrategy, string>>;
  confirmed?: { strategy: string; at: string } | null;
}) {
  return (
    <div className="mb-3 space-y-2" data-testid="clean-routes">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">Rotas FleetOS (Road Intelligence aplicada)</h4>
      {(Object.keys(states) as RouteStrategy[]).map((k) => (
        <CleanRouteCard
          key={k}
          s={states[k]}
          elapsedDurationSec={elapsedDurationSec}
          coverage={coverage[k]}
          discovery={discovery[k]}
          selected={!!states[k].finalOption && (selectedOptionId === states[k].finalOption!.id || !!selectedCandidateIds?.includes(states[k].finalOption!.id))}
          selectable={!selectableIds || selectableIds.includes(states[k].finalOption?.id ?? "")}
          onUse={() => onUse(k)}
          windowStatus={windowStatus?.[k]}
          confirmed={confirmed && confirmed.strategy === k ? { at: confirmed.at } : undefined}
        />
      ))}
    </div>
  );
}
