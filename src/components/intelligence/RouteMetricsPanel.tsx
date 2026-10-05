import { useIngestion } from "../../context/IngestionContext";

/*
 * Per-route Road Intelligence metrics (Phase 3C.5 instrumentation). Counts only; AI fields
 * are 0 because no model is called yet and actual cost stays "—" (no billing data).
 */

const km = (m: number) => `${(m / 1000).toFixed(0)} km`;
const mins = (s: number) => `${Math.round(s / 60)} min`;

export function RouteMetricsPanel() {
  const { routeMetrics } = useIngestion();
  const solved = routeMetrics.filter((m) => !m.reused);
  const tasks = solved.reduce((s, m) => s + m.discovery.tasks, 0);
  const hits = solved.reduce((s, m) => s + m.discovery.cacheHits, 0);
  const calls = solved.reduce((s, m) => s + m.solver.routingProviderCalls, 0);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(routeMetrics, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fleetos-route-metrics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-3 text-[11px]" data-testid="route-metrics">
      <div className="rounded-lg bg-[var(--app-elevated)] px-3 py-2 text-[var(--app-muted)]">
        Instrumentação por rota/estratégia para comparar o custo da investigação ao longo do tempo (rota n.º 1 vs n.º 300). Só contagens: sem «% de
        conhecimento de Portugal». Campos de IA a 0 — nenhuma chamada a modelos nesta fase; custo real «—» (sem dados de faturação).
      </div>
      <div className="flex flex-wrap gap-3">
        <span>
          <strong>{routeMetrics.length}</strong> registos ({solved.length} resoluções, {routeMetrics.length - solved.length} reutilizações)
        </span>
        <span>
          Tarefas de descoberta respondidas por conhecimento existente: <strong>{hits}</strong> de {tasks}
        </span>
        <span>
          Pedidos ao fornecedor de rotas (resoluções): <strong>{calls}</strong>
        </span>
        <button type="button" onClick={exportJson} className="rounded-md bg-[var(--app-elevated)] px-2 py-0.5 font-semibold" disabled={routeMetrics.length === 0}>
          Exportar JSON
        </button>
      </div>
      {solved.some((m) => m.timing) && (
        <div className="space-y-1" data-testid="solve-traces">
          <p className="font-bold">Rasto das últimas resoluções (tempo real decorrido)</p>
          {solved.filter((m) => m.timing).slice(0, 8).map((m) => (
            <details key={m.id} className="rounded border border-[var(--app-border)] px-2 py-1">
              <summary className="cursor-pointer">
                {m.jobId} · {m.strategy} · total {Math.round(m.timing!.wallMs)} ms = FleetOS determinístico {m.timing!.deterministicMs} ms + externo {m.timing!.externalMs} ms + descoberta (local){" "}
                {Math.round(m.timing!.trace.filter((t) => t.phase === "discovery").reduce((s, t) => s + t.ms, 0) - m.timing!.trace.filter((t) => t.phase === "discovery:source fetches").reduce((s, t) => s + t.ms, 0))} ms + não explicado {Math.round(m.timing!.unexplainedMs)} ms · persistência depois: {m.timing!.persistMs} ms
              </summary>
              <ol className="ml-4 list-decimal font-mono text-[9px]">
                {m.timing!.trace.map((t, i) => (
                  <li key={i} className={t.phase.includes(":") ? "ml-4 list-none text-[var(--app-muted)]" : ""}>
                    {t.iteration >= 0 ? `it${t.iteration} ` : ""}
                    {t.phase}: {t.ms} ms{t.external ? " (rede)" : ""}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      )}
      {routeMetrics.length === 0 ? (
        <p className="text-[var(--app-muted)]">Sem registos — calcule rotas no planeador.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[10px]">
            <thead className="text-[var(--app-muted)]">
              <tr>
                <th>Quando</th><th>Trabalho</th><th>Estratégia</th><th>Tipo</th><th>Resultado</th><th>Iter.</th><th>Pedidos rota</th>
                <th>Cache (hit/tarefas)</th><th>Fontes (conhecidas/a atualizar)</th><th>Lacunas</th><th>Propostas novas</th>
                <th>Restrições (reutil./novas/encontradas)</th><th>Base → final</th><th>Desvios</th><th>Descoberta local/ext.</th><th>IA (pesq./modelo/custo)</th>
              </tr>
            </thead>
            <tbody>
              {routeMetrics.slice(0, 100).map((m) => (
                <tr key={m.id} className="border-t border-[var(--app-border)]">
                  <td className="pr-2">{m.solvedAt.slice(0, 19).replace("T", " ")}</td>
                  <td className="pr-2 font-mono">{m.jobId}</td>
                  <td className="pr-2">{m.strategy}</td>
                  <td className="pr-2">{m.reused ? "reutilizado" : "resolvido"}</td>
                  <td className="pr-2">{m.solver.outcome}</td>
                  <td className="pr-2">{m.solver.iterations}</td>
                  <td className="pr-2">{m.solver.routingProviderCalls}</td>
                  <td className="pr-2">{m.discovery.cacheHits}/{m.discovery.tasks}</td>
                  <td className="pr-2">{m.discovery.sourcesKnown}/{m.discovery.sourcesRequiringRefresh}</td>
                  <td className="pr-2">{m.discovery.gaps}</td>
                  <td className="pr-2">{m.discovery.newSourceProposals}</td>
                  <td className="pr-2">{m.constraints.reusedAccepted}/{m.constraints.newlyActivated}/{m.constraints.encountered}</td>
                  <td className="pr-2">
                    {km(m.solver.baseline.distanceM)} {mins(m.solver.baseline.durationSec)} → {m.solver.final ? `${km(m.solver.final.distanceM)} ${mins(m.solver.final.durationSec)}` : "—"}
                  </td>
                  <td className="pr-2">{m.solver.deviations}</td>
                  <td className="pr-2">{m.discovery.localMs}/{m.discovery.externalMs} ms</td>
                  <td>{m.future.webSearches}/{m.future.modelCalls}/{m.future.actualAiCostEur ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
