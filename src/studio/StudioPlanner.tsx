// Plan & assign inside the studio — the SAME planning session as Expedição
// (useRoutePlanningSession): TomTom truck routes, clean-route solver, Road Intelligence
// compliance, route decisions, EU 561, assignment checks, refuel plan from fuel intelligence,
// and OperationsService.confirmPlan with its compliance record. Only the presentation differs.
import { useCallback } from "react";
import type { Job } from "../data/types";
import { useRoutePlanningSession, fmtDur } from "../components/dispatch/useRoutePlanningSession";
import { riConclusion, WINDOW_TEXT, type CheckVerdict } from "../components/dispatch/DecisionParts";
import { optionWindowStatus } from "../regulations/alternatives";
import { operationalTimeline } from "../regulations/operationalTimeline";
import { trailerTypeLabel } from "../domain/fleet/trailers";
import type { RoutePlanOption, RouteOptionId } from "../tomtom/planRoutes";
import { eurL, money } from "./fuelui";

export type PlannedRoutes = { options: RoutePlanOption[]; selectedId: RouteOptionId | null };

const dot = (v: CheckVerdict) => (v === "OK" ? "ok" : v === "RISK" ? "warn" : v === "BLOCKS" ? "bad" : "idle");

export function StudioPlanner({
  job,
  onRoutes,
  onConfirmed,
  onCancel,
}: {
  job: Job;
  onRoutes: (r: PlannedRoutes) => void;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const onRoutesReady = useCallback((options: RoutePlanOption[], selectedId: RouteOptionId | null) => onRoutes({ options, selectedId }), [onRoutes]);
  const onRouteSelect = useCallback(() => undefined, []);
  const s = useRoutePlanningSession({ job, onRoutesReady, onRouteSelect, onConfirmed });
  const refuel = s.selectedOption?.refuelPlan;
  const checks: { label: string; verdict: CheckVerdict; text: string }[] = [
    {
      label: "Viatura",
      verdict: s.truckVerdict,
      text: s.truckBlockers[0] ?? s.truckWarnings[0] ?? (s.truckIsBusy ? `Em serviço — entra na fila depois de ${s.activeJobOnTruck?.jobNumber}` : s.selectedTruck ? "Disponível e com capacidade para a carga" : "Escolha uma viatura"),
    },
    { label: "Motorista", verdict: s.driverVerdict, text: s.driverBlockers[0] ?? (!s.driverOk ? "Escolha um motorista" : s.eu561.text) },
    { label: "Janela", verdict: s.windowNow.verdict, text: s.windowNow.text },
    { label: "Restrições", verdict: s.selectedOption ? s.ri.verdict : "UNKNOWN", text: s.selectedOption ? s.ri.text : "Por avaliar" },
  ];

  return (
    <section className="planner" aria-label="Planear e atribuir">
      <span className="eyebrow">Planear e atribuir · motor da Expedição</span>

      <div className="pl-res">
        <label>
          <span>Viatura</span>
          <select className="nj-in" value={s.selectedTruckId} onChange={(e) => s.setSelectedTruckId(e.target.value)}>
            <option value="">Escolher viatura</option>
            {s.sortedTrucks.map((t) => (
              <option key={t.id} value={t.id} disabled={s.truckDisabled(t)}>
                {s.truckLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Motorista</span>
          {s.truckIsBusy ? (
            <span className="nj-in pl-locked">{s.effectiveDriver?.name ?? "Motorista em serviço"} · já na viatura</span>
          ) : (
            <select className="nj-in" value={s.selectedDriverId} onChange={(e) => s.setSelectedDriverId(e.target.value)} disabled={!s.availableDrivers.length}>
              <option value="">{s.availableDrivers.length ? "Escolher motorista" : "Nenhum motorista disponível"}</option>
              {s.availableDrivers.map((d) => {
                const h = s.hoursFor(d);
                return (
                  <option key={d.id} value={d.id}>
                    {d.name} · {h.weekKnown ? `${h.hoursWeek.toFixed(1)} h semana` : "horas desconhecidas"}
                  </option>
                );
              })}
            </select>
          )}
        </label>
        <label>
          <span>Reboque</span>
          <select className="nj-in" value={s.selectedTrailerId} onChange={(e) => s.setSelectedTrailerId(e.target.value)}>
            <option value="">Sem reboque</option>
            {s.activeTrailers.map((t) => (
              <option key={t.id} value={t.id} disabled={t.availability !== "AVAILABLE"}>
                {t.plate} · {trailerTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pl-routes">
        <span className="pl-sub">
          Rotas{s.plannedDepartAt ? ` · partida ${s.plannedDepartAt.toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          {!s.loading && (s.options.length > 0 || s.calcError) && (
            <button className="pl-link" onClick={() => void s.calculate(s.selectedTruckId, true)}>
              Recalcular
            </button>
          )}
        </span>
        {s.loading ? (
          <p className="pl-wait">{s.apiKey ? "A calcular rotas TomTom…" : "A estimar rota…"}</p>
        ) : s.calcError ? (
          <p className="pl-err">{s.calcError}</p>
        ) : (
          <>
            {s.routeRows.map((r) => {
              const o = r.option;
              const rep = s.complianceByOption[o.id];
              const riR = riConclusion(rep?.status, false);
              const win = WINDOW_TEXT[optionWindowStatus(o, job, s.departMsForWindows, s.hoursToday)];
              const sched = operationalTimeline(o, s.departMsForWindows, s.hoursToday);
              const stops = o.refuelPlan?.stops.length ?? 0;
              return (
                <button key={r.id} className="option" aria-pressed={r.id === s.selectedOptionId} data-verdict={dot(riR.verdict)} onClick={r.select}>
                  <span className="opt-main">
                    <b>{r.title}</b>
                    <span className="opt-sub">
                      {riR.text}
                      {win.verdict !== "OK" ? ` · ${win.text.toLowerCase()}` : ""}
                    </span>
                    {stops > 0 && <span className="opt-good">{stops === 1 ? "1 paragem de abastecimento" : `${stops} paragens de abastecimento`}</span>}
                  </span>
                  <span className="opt-num">
                    <b>{fmtDur(sched.elapsedSec)}</b>
                    <span>
                      {Math.round(o.distanceM / 1000)} km · {money(s.costOf(o))}
                    </span>
                  </span>
                </button>
              );
            })}
            {s.solving && <p className="pl-wait">O motor de rotas limpas ainda está a avaliar alternativas…</p>}
          </>
        )}
      </div>

      {refuel && refuel.stops.length > 0 && (
        <div className="pl-fuel">
          <span className="pl-sub">Abastecimento calculado com a rota</span>
          <ol className="refuels">
            {refuel.stops.map((st) => (
              <li key={st.stationId}>
                <span className="pump" aria-hidden />
                <span className="rf-main">
                  <b>{[st.brand ?? st.name, st.municipality].filter(Boolean).join(" · ")}</b>
                  <span>
                    km {Math.round(st.alongKm)}
                    {st.pause ? " · dentro da pausa obrigatória" : ""}
                  </span>
                </span>
                <span className="rf-num">
                  <b>{Math.round(st.litres)} L</b>
                  <span>
                    {eurL(st.pricePerL)} · {money(st.fuelEur)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {refuel && refuel.stops.length === 0 && s.selectedOption && <p className="fine">{refuel.explanations[0] ?? "Sem abastecimento necessário nesta rota."}</p>}

      <ul className="pl-checks">
        {checks.map((c) => (
          <li key={c.label} data-v={dot(c.verdict)}>
            <i />
            <b>{c.label}</b>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>

      <div className="pl-commit">
        <span className="commit-txt">
          <b>{s.canConfirmRoute ? "Pronto a confirmar" : "Ainda não pode confirmar"}</b>
          <span>{s.confirmError ?? s.blockReason ?? "Atribui viatura e motorista e guarda a decisão com a análise de restrições."}</span>
        </span>
        <button className="ghost" onClick={onCancel}>
          Fechar
        </button>
        <button className="primary" disabled={!s.canConfirmRoute} onClick={s.handleConfirm}>
          Confirmar rota
        </button>
      </div>
    </section>
  );
}
