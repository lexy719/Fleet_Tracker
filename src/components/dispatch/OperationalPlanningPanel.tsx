import { formatLocal } from "../../domain/time";
import { Button, Notice } from "../../ui/kit";
import { useOperationalPlanning, type OperationalPlanningInput, euro, hour, reasonLabels } from "./useOperationalPlanning";

type Props = OperationalPlanningInput;
export function OperationalPlanningPanel(props: Props) {
  const { overrideJobId, onPlan } = props;
  const {
    departure,
    setDeparture,
    truckId,
    setTruckId,
    driverId,
    setDriverId,
    trailerId,
    setTrailerId,
    result,
    selectedId,
    setSelectedId,
    busy,
    error,
    ack,
    setAck,
    confirmed,
    impact,
    stats,
    cancel,
    plannedInputs,
    inputs,
    state,
    plans,
    selected,
    run,
    confirm,
  } = useOperationalPlanning(props);
  return (
    <section
      className="space-y-4 p-5 text-[13px]"
      aria-label="Planeamento operacional automático"
    >
      <div>
        <h2 className="font-semibold text-[var(--text)]">
          Planeamento automático
        </h2>
        <p className="mt-1 text-[var(--text-2)]">
          O motor escolhe viatura, motorista e reboque, considerando
          compromissos, deslocações em vazio, janelas, horas e restrições
          conhecidas.
        </p>
      </div>
      <label className="block">
        Partida mínima · Lisboa
        <input
          type="datetime-local"
          aria-label="Partida mínima"
          className="ui-input mt-1 block"
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
          disabled={busy}
        />
      </label>
      {overrideJobId ? (
        <details>
          <summary className="cursor-pointer text-[var(--accent)]">
            Impor recursos (override)
          </summary>
          <div className="mt-2 grid gap-2">
            <label>
              Viatura imposta
              <select
                aria-label="Viatura imposta"
                className="ui-input block w-full"
                value={truckId}
                disabled={busy}
                onChange={(e) => setTruckId(e.target.value)}
              >
                <option value="">Escolha automática</option>
                {state.trucks
                  .filter((t) => !t.archivedAt)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plate}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Motorista imposto
              <select
                aria-label="Motorista imposto"
                className="ui-input block w-full"
                value={driverId}
                disabled={busy}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Escolha automática</option>
                {state.drivers
                  .filter((d) => !d.archivedAt)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Reboque imposto
              <select
                aria-label="Reboque imposto"
                className="ui-input block w-full"
                value={trailerId}
                disabled={busy}
                onChange={(e) => setTrailerId(e.target.value)}
              >
                <option value="">Escolha automática</option>
                {state.trailers
                  .filter((t) => !t.archivedAt)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plate}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              Restrições explícitas; uma combinação inviável é recusada. Para
              comparar o impacto, calcule primeiro sem impor recursos.
            </p>
          </div>
        </details>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={() => void run()} disabled={busy}>
          {busy
            ? "A planear…"
            : confirmed
              ? "Replanear trabalhos futuros"
              : "Planear automaticamente"}
        </Button>
        {busy ? (
          <Button variant="ghost" onClick={() => cancel.current?.abort()}>
            Cancelar cálculo
          </Button>
        ) : null}
      </div>
      {error ? (
        <Notice tone="danger" title="Não foi possível concluir">
          {error}
        </Notice>
      ) : null}
      {result ? (
        <>
          <p data-testid="planning-summary">
            {result.recommended?.executions.length ?? 0} trabalhos planeados ·{" "}
            {result.unassignedJobIds.length} por atribuir · {plans.length}{" "}
            decisões
          </p>
          {!result.recommended ? (
            <Notice tone="warn" title="Nenhum plano executável encontrado">
              Consulte os motivos de rejeição abaixo. O motor não força uma
              atribuição.
            </Notice>
          ) : null}
          {plans.length > 1 ? (
            <label>
              Decisão operacional
              <select
                className="ui-input block w-full"
                aria-label="Decisão operacional"
                value={selectedId ?? ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setAck(false);
                  onPlan?.(plans.find((p) => p.id === e.target.value) ?? null);
                }}
              >
                {plans.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {i === 0 ? "Recomendado" : `Alternativa ${i}`} ·{" "}
                    {p.metrics.emptyKm.toFixed(1)} km vazios · custo comparável{" "}
                    {euro(p.metrics.generalizedCostEur)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selected ? (
            <>
              <p data-testid="planning-metrics">
                {selected.metrics.loadedKm.toFixed(1)} km carregados ·{" "}
                {selected.metrics.emptyKm.toFixed(1)} km vazios ·{" "}
                {hour(selected.metrics.totalDrivingSec)} de condução ·{" "}
                {hour(selected.metrics.restSec)} de descanso ·{" "}
                {hour(selected.metrics.breakSec)} de pausas ·{" "}
                {hour(selected.metrics.waitingSec)} de espera
              </p>
              <p>
                Combustível/portagens:{" "}
                {euro(selected.metrics.providerFuelTollEur)} · outros custos/km:{" "}
                {euro(selected.metrics.nonFuelEur)} · custo de oportunidade:{" "}
                {euro(selected.metrics.opportunityCostEur)} · comparação:{" "}
                {euro(selected.metrics.generalizedCostEur)}
              </p>
              <p className="text-[var(--text-3)]">
                Tempo valorizado pela política de comparação a{" "}
                {selected.economics.opportunityEurPerHour} €/h; outros custos a{" "}
                {selected.economics.nonFuelEurPerKm} €/km. Componentes não
                registadas não estão valorizadas.{" "}
                {selected.metrics.revenueEur === null
                  ? "Receita desconhecida; sem cálculo de lucro."
                  : `Receita registada: ${euro(selected.metrics.revenueEur)}; não representa lucro líquido.`}{" "}
                Cobertura rodoviária parcial. Pesquisa limitada; sem garantia de
                ótimo global.
              </p>
              <ul className="space-y-2" data-testid="planning-sequences">
                {selected.trips.map((t) => (
                  <li
                    key={`${t.assignment.truckId}/${t.assignment.driverId}/${t.assignment.trailerId}`}
                    className="rounded border border-[var(--border)] p-3"
                  >
                    <strong>
                      {state.trucks.find((v) => v.id === t.assignment.truckId)
                        ?.plate ?? t.assignment.truckId}{" "}
                      ·{" "}
                      {state.drivers.find((v) => v.id === t.assignment.driverId)
                        ?.name ?? t.assignment.driverId}{" "}
                      ·{" "}
                      {t.assignment.trailerId
                        ? (state.trailers.find(
                            (v) => v.id === t.assignment.trailerId,
                          )?.plate ?? t.assignment.trailerId)
                        : "sem reboque"}
                    </strong>
                    <p>
                      {t.jobIds
                        .map(
                          (id) =>
                            state.jobs.find((j) => j.id === id)?.jobNumber ??
                            id,
                        )
                        .join(" → ")}
                    </p>
                  </li>
                ))}
              </ul>
              {selected.executions.map((e) => (
                <details key={e.jobId}>
                  <summary className="cursor-pointer">
                    Motivos e factos ·{" "}
                    {state.jobs.find((j) => j.id === e.jobId)?.jobNumber ??
                      e.jobId}{" "}
                    · {formatLocal(new Date(e.startMs).toISOString())} →{" "}
                    {formatLocal(new Date(e.endMs).toISOString())}
                  </summary>
                  <ul className="my-2 space-y-1">
                    {e.reasons.map((reason, i) => (
                      <li key={i}>
                        {reasonLabels[reason.code] ?? reason.code}
                        {reason.data ? ` · ${JSON.stringify(reason.data)}` : ""}
                      </li>
                    ))}
                  </ul>
                  {e.movements.map((m, i) => (
                    <details key={i}>
                      <summary>
                        {m.kind === "EMPTY" ? "Vazio" : "Carregado"} ·{" "}
                        {m.route.title} · {m.report.status} ·{" "}
                        {m.route.distanceM / 1000 > 0
                          ? (m.route.distanceM / 1000).toFixed(1)
                          : "0"}{" "}
                        km
                      </summary>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px]">
                        {JSON.stringify(
                          {
                            departure: new Date(m.departMs).toISOString(),
                            actualFacts: m.evaluationInput.facts,
                            driver: m.drivingBefore,
                            restrictions: m.report.results.map((r) => ({
                              id: r.regulationId,
                              outcome: r.outcome,
                              reasons: r.reasons,
                            })),
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                </details>
              ))}
              {selected.status === "REVIEW_REQUIRED" ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    aria-label="Reconheço os dados por validar"
                  />
                  <span>
                    Reconheço os dados por validar indicados no plano. A
                    confirmação não transforma esses dados em factos conhecidos.
                  </span>
                </label>
              ) : null}
              {plannedInputs !== inputs ? (
                <p className="text-[var(--warn)]">
                  Partida/override alterado: volte a planear antes de confirmar.
                </p>
              ) : null}
              <Button
                onClick={() => void confirm()}
                disabled={
                  busy ||
                  !!confirmed ||
                  plannedInputs !== inputs ||
                  (selected.status === "REVIEW_REQUIRED" && !ack)
                }
              >
                Confirmar plano operacional
              </Button>
            </>
          ) : null}
          {confirmed ? (
            <Notice tone="ok" title="Plano confirmado e guardado">
              {confirmed.id} · recomendação e decisão humana preservadas
              separadamente.
            </Notice>
          ) : null}
          <details>
            <summary className="cursor-pointer">
              Pesquisa e motivos de rejeição
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(
                {
                  search: result.search,
                  provider: stats,
                  unassigned: result.unassignedJobIds,
                  diagnostics: result.diagnostics,
                  overrideImpact: impact,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      ) : null}
    </section>
  );
}
