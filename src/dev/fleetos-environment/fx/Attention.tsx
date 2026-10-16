import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { PLAN_LABEL, SLA_LABEL, STATUS_LABEL, WORLD_JOBS, NOW } from "../world";
import { Id, Status } from "./honesty";
import { OpContext, contextLenses } from "./Collections";

import { sharedWorkRows } from "../sharedReadModel";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };

/** Today's work stays close to its geography; decisions belong to journeys. */
export function AttentionBase({ state, act }: Props) {
  const rows = sharedWorkRows(state);
  return (
    <article className="fx-instrument sw-day">
      <header className="sw-heading">
        <div>
          <h1>O dia em movimento</h1>
          <p>Próximas etapas e decisões para fazer avançar os transportes</p>
        </div>
        <div className="sw-scope-controls" aria-label="Âmbito da operação">
          <button
            data-ix="inspect"
            aria-pressed={state.filter === "all"}
            onClick={() => act({ type: "filter", value: "all" })}
          >
            Todos · {WORLD_JOBS.length}
          </button>
          <button
            data-ix="inspect"
            aria-pressed={state.filter === "moving"}
            onClick={() => act({ type: "filter", value: "moving" })}
          >
            Em curso
          </button>
        </div>
      </header>
      <div className="sw-day-journeys" data-guided-scroll="attention">
        {rows.map(({ world: w, next, decisions }) => {
          const decision = decisions[0];
          return (
            <section
              key={w.jobId}
              data-map-entity="job"
              data-entity-id={w.jobId}
            >
              <button
                className="sw-link sw-journey-open"
                data-ix="follow"
                onClick={() => act({ type: "job", id: w.jobId })}
              >
                <span>
                  <Id>{w.jobId}</Id> · {STATUS_LABEL[w.job.status]}
                </span>
                <b>
                  {w.job.stops[0].city} → {w.job.stops.at(-1)!.city}
                </b>
              </button>
              <small>
                {next
                  ? `A seguir: ${next.city} · janela ${next.window.join("–")}`
                  : "Etapas concluídas"}
              </small>
              {decision && (
                <button
                  className="sw-link sw-decision"
                  data-ix="follow"
                  onClick={() => act(decision.action)}
                >
                  {decision.label} →
                </button>
              )}
            </section>
          );
        })}
      </div>
      <footer className="sw-provenance">
        Demonstração · {NOW.label} {NOW.clock} · posições simuladas; posições
        desconhecidas fora do mapa · sem telemetria
      </footer>
    </article>
  );
}
/** Jobs collection: the production lifecycle, SLA and plan state per transport. */
export function JobsCollection({ state, act }: Props) {
  const ctx = contextLenses(state, "Jobs").length > 0;
  return (
    <article className="fx-instrument fx-collection">
      <header className="fx-answer">
        <h1>{WORLD_JOBS.length} transportes hoje</h1>
        <p>
          {WORLD_JOBS.filter((j) => j.plan === "REPLAN_REQUIRED").length} a
          replanear · {WORLD_JOBS.filter((j) => j.blockers.length).length} com
          bloqueio · {WORLD_JOBS.filter((j) => j.sla !== "on_track").length} com
          prazo em risco
        </p>
      </header>
      <table className="fx-grid fx-jobs" data-guided-scroll="collection">
        <thead>
          <tr>
            <th>Transporte</th>
            <th>Paragens</th>
            <th>Estado</th>
            <th>Plano</th>
            <th>Prazo</th>
            <th>Carga</th>
            {ctx && <th>Contexto</th>}
          </tr>
        </thead>
        <tbody>
          {WORLD_JOBS.map((j) => (
            <tr
              data-ix="follow"
              key={j.id}
              onClick={() => act({ type: "job", id: j.id })}
              data-blocked={j.blockers.length > 0}
              data-map-entity="job"
              data-entity-id={j.id}
            >
              <td>
                <Id>{j.id}</Id>
                <small>
                  {j.client} ·{" "}
                  {j.priority !== "normal" && (
                    <b className="fx-prio">urgente · </b>
                  )}
                  {j.reference}
                </small>
              </td>
              <td>
                <span className="fx-stopchain">
                  {j.stops.map((s, i) => (
                    <span key={s.id} data-done={!!s.completedAt}>
                      {i > 0 && <i>→</i>}
                      {s.city}
                      <small>{s.window[0]}</small>
                    </span>
                  ))}
                </span>
              </td>
              <td>
                <span className="fx-lifechip" data-status={j.status}>
                  {STATUS_LABEL[j.status]}
                </span>
                {j.blockers[0] && (
                  <small className="fx-blocker-note">{j.blockers[0]}</small>
                )}
              </td>
              <td>
                <Status
                  tone={
                    j.plan === "PLANNED"
                      ? "ok"
                      : j.plan === "REPLAN_REQUIRED"
                        ? "action"
                        : "neutral"
                  }
                >
                  {PLAN_LABEL[j.plan]}
                </Status>
              </td>
              <td>
                <Status
                  tone={
                    j.sla === "on_track"
                      ? "ok"
                      : j.sla === "at_risk"
                        ? "risk"
                        : "action"
                  }
                >
                  {SLA_LABEL[j.sla]}
                </Status>
              </td>
              <td className="fx-num">
                {j.cargo.reduce((s, c) => s + c.pallets, 0)} p.
                {j.cargo.some((c) => c.adr) && <small> · ADR</small>}
                {j.cargo.some((c) => c.tempC) && <small> · frio</small>}
              </td>
              {ctx && (
                <td>
                  <OpContext state={state} job={j} exclude="Jobs" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
