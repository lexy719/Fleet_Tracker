import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { readRouteManagement } from "../engine/routeManagement";
import { providerFor, minOf } from "../engine/synthetic";
import type { OperationalValue } from "../engine/contracts";
import { hm, STATUS_LABEL } from "../world";
import { FacetBar, facetOf } from "./Facets";
import { labWorld } from "./model";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
const time = (v: OperationalValue<number>) =>
  v.status === "UNKNOWN" ? "sem previsão" : hm(minOf(v.value));
const number = (v: OperationalValue<number>, f: (n: number) => string) =>
  v.status === "UNKNOWN" ? "por calcular" : f(v.value);
const labels = { truck: "Viatura", driver: "Motorista", trailer: "Reboque" };

/** Route management answers a shared operational question on one continuous canvas. */
export function RouteManagement({ state, act }: Props) {
  const w = labWorld(state);
  const m = readRouteManagement(providerFor(state), w.jobId);
  const compare = facetOf(state, "Fuel") === "comparison";
  const late = m.outstanding.filter((s) => s.window === "FAIL");
  const unknown = m.restrictions.filter((r) => r.impact.status === "UNKNOWN");
  const affected = m.restrictions.filter((r) => r.impact.status === "FAIL");
  const nextWorld = w.job.stops.find((s) => s.id === m.next?.stopId);
  return (
    <article
      className="fx-instrument fx-route-management"
      data-route-status={m.status}
    >
      <header className="fx-answer">
        <div className="fx-route-eyebrow">
          {w.jobId} · {STATUS_LABEL[w.job.status]} · revisão {w.job.revision}
        </div>
        <h1>
          {compare
            ? `Comparar ${m.alternatives.alternatives.length} percursos para este conjunto`
            : m.next
              ? `A seguir: ${m.next.place} · ${time(m.next.arrival)}`
              : m.execution.timeline
                ? "Paragens previstas concluídas"
                : "Rever os dados antes de continuar a rota"}
        </h1>
        <p>
          {w.job.stops[0].city} → {w.job.stops.at(-1)!.city} · {w.job.client}.{" "}
          {late.length
            ? `${late.length} janela${late.length > 1 ? "s" : ""} ultrapassada${late.length > 1 ? "s" : ""}.`
            : ""}{" "}
          {affected.length ? `${affected.length} restrição aplicável.` : ""}{" "}
          {unknown.length
            ? `${unknown.length} ${unknown.length > 1 ? "condições" : "condição"} por validar.`
            : ""}
        </p>
        <div className="fx-answer-meta">
          <span className="fx-prov-line">
            Gestão em demonstração · horas sintéticas · geometria TomTom gravada
          </span>
          <FacetBar state={state} act={act} domain="Fuel" />
        </div>
      </header>

      {!compare && (
        <section
          className="fx-route-itinerary"
          aria-label="Sequência e margem das paragens"
        >
          {w.job.stops.map((s, i) => {
            const read = m.stops.find((t) => t.stopId === s.id);
            const margin = read?.deliveryMarginSec;
            return (
              <button
                key={s.id}
                className="fx-route-destination"
                data-ix="follow"
                data-next={s.id === m.next?.stopId}
                data-done={!!s.completedAt}
                data-tone={read?.window === "FAIL" ? "action" : "neutral"}
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "delivery", stop: s.id },
                  })
                }
              >
                <span className="fx-route-order">
                  {s.completedAt ? "✓" : String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <b>{s.city}</b>
                  <small>
                    {s.type === "pickup" ? "Carga" : "Entrega"} ·{" "}
                    {s.window.join("–")}
                  </small>
                </span>
                <strong>
                  {s.completedAt ??
                    (read ? time(read.arrival) : "sem previsão")}
                </strong>
                <em>
                  {s.completedAt
                    ? "concluída"
                    : !margin || margin.status === "UNKNOWN"
                      ? "margem desconhecida"
                      : `${Math.abs(Math.round(margin.value / 60))} min ${margin.value < 0 ? "de atraso" : "de margem"}`}
                </em>
              </button>
            );
          })}
        </section>
      )}

      <section
        className="fx-route-control"
        aria-label="Decisões para continuar a rota"
      >
        <div className="fx-route-next">
          <span className="fx-route-eyebrow">Decisão seguinte</span>
          {!compare && (
            <h2>
              {m.status === "BLOCKED"
                ? "Resolver o que impede a execução"
                : "Validar a rota com os dados atuais"}
            </h2>
          )}
          {!compare && (
            <p>
              {m.assignment.issues.length
                ? "O conjunto exige revisão. Abra o recurso para ver o impedimento."
                : late.length
                  ? `A chegada a ${late[0].place} ultrapassa a janela. Reveja a partida e o percurso.`
                  : unknown.length
                    ? "A geometria está registada; a aplicabilidade ainda depende de factos do conjunto."
                    : "Tempos e conformidade precisam de uma avaliação atual antes de confirmar."}
            </p>
          )}
          <div className="fx-route-actions">
            <button
              className="fx-btn"
              data-ix="inspect"
              onClick={() =>
                act({ type: "facet", domain: "Fuel", facet: "window" })
              }
            >
              Rever janelas
            </button>
            <button
              className="fx-btn"
              data-kind="quiet"
              data-ix="inspect"
              aria-expanded={compare}
              onClick={() =>
                act({
                  type: "facet",
                  domain: "Fuel",
                  facet: compare ? "management" : "comparison",
                })
              }
            >
              {compare
                ? "Fechar comparação"
                : `Comparar percursos (${m.alternatives.alternatives.length})`}
            </button>
            <button
              className="fx-link"
              data-ix="spatial"
              onClick={() => act({ type: "map", intent: "expand" })}
            >
              Abrir rota no mapa →
            </button>
          </div>
        </div>
        {!compare && (
          <div className="fx-route-conditions">
            <span className="fx-route-eyebrow">Condições do percurso</span>
            {m.restrictions.length ? (
              m.restrictions.map(({ node, impact }) => (
                <button
                  key={node.ref.id}
                  data-ix="follow"
                  data-tone={
                    impact.status === "FAIL"
                      ? "action"
                      : impact.status === "UNKNOWN"
                        ? "unknown"
                        : "ok"
                  }
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "restriction", id: node.ref.id },
                    })
                  }
                >
                  <b>{node.label}</b>
                  <span>
                    {impact.status === "FAIL"
                      ? "Aplica-se"
                      : impact.status === "UNKNOWN"
                        ? "Por validar"
                        : "Não se aplica"}{" "}
                    →
                  </span>
                  <small>
                    {impact.missingFacts.length
                      ? `${impact.missingFacts.length} facto${impact.missingFacts.length > 1 ? "s" : ""} em falta`
                      : impact.passage.status === "UNKNOWN"
                        ? "hora de passagem desconhecida"
                        : `passagem ${time(impact.passage)} · simulada`}
                  </small>
                </button>
              ))
            ) : (
              <p>
                Sem restrições registadas neste percurso. A cobertura não é
                completa.
              </p>
            )}
          </div>
        )}
      </section>

      {compare && (
        <section
          className="fx-route-comparison"
          aria-label="Evidência dos percursos"
        >
          <h2>O que sabemos de cada percurso</h2>
          {m.alternatives.alternatives.map((a) => (
            <div
              key={a.id}
              data-route-alternative={a.id}
              data-feasibility={a.feasibility}
            >
              <b>
                {a.label}
                <small>
                  {a.scope === "official_segment"
                    ? "Segmento oficial · falta ligação ao percurso completo"
                    : `Corredor gravado · ${a.recordedAt?.slice(0, 10) ?? "data desconhecida"}`}
                </small>
              </b>
              <span>
                {number(a.distanceM, (n) => `${Math.round(n / 1000)} km`)}
                <small>
                  tempo{" "}
                  {number(a.durationSec, (n) => `${Math.round(n / 60)} min`)}
                </small>
              </span>
              <span data-tone={a.feasibility === "FAIL" ? "action" : "unknown"}>
                {a.feasibility === "FAIL"
                  ? "Impedimento registado"
                  : "Exige avaliação"}
                <small>{a.unknownReasons.join(" · ")}</small>
              </span>
              {a.scope === "official_segment" && a.avoidedRestrictionIds[0] && (
                <button
                  className="fx-link"
                  data-ix="follow"
                  onClick={() =>
                    act({
                      type: "follow",
                      object: {
                        kind: "alternative",
                        id: a.avoidedRestrictionIds[0],
                      },
                    })
                  }
                >
                  Ver segmento →
                </button>
              )}
            </div>
          ))}
          <p className="fx-footnote">
            Comparação de evidência disponível. A geometria de uma alternativa
            não confirma tempo, custo nem viabilidade do trabalho completo.
          </p>
        </section>
      )}

      <section
        className="fx-route-resources"
        aria-label="Conjunto e disponibilidade após a rota"
      >
        <div>
          <span className="fx-route-eyebrow">Depois da entrega</span>
          <p>
            {nextWorld ? `Próxima janela: ${nextWorld.window.join("–")}. ` : ""}
            Libertar o conjunto depende de concluir a descarga.
          </p>
        </div>
        {m.resources.map((r) => (
          <button
            key={r.kind}
            data-ix={
              state.anchor.kind === r.kind && state.anchor.id === r.id
                ? undefined
                : "follow"
            }
            aria-current={
              state.anchor.kind === r.kind && state.anchor.id === r.id
                ? "true"
                : undefined
            }
            onClick={() =>
              r.id &&
              act({ type: "entity", kind: r.kind, id: r.id, job: w.jobId })
            }
            disabled={
              !r.id ||
              (state.anchor.kind === r.kind && state.anchor.id === r.id)
            }
          >
            <small>{labels[r.kind]}</small>
            <b>{r.node?.label.split(" · ")[0] ?? r.id ?? "por atribuir"}</b>
            <span>
              {r.future?.blocked ??
                (!r.future
                  ? "disponibilidade desconhecida"
                  : r.future.availableAt.status === "UNKNOWN"
                    ? r.future.availableAt.reason
                    : `≈ ${time(r.future.availableAt)} · estimativa`)}
            </span>
          </button>
        ))}
      </section>
      <p className="fx-footnote">
        Disponibilidade estimada inclui 40 min de descarga assumida. Posição
        futura é destino planeado. Recalcular e confirmar a execução requer o
        motor operacional.
      </p>
    </article>
  );
}
