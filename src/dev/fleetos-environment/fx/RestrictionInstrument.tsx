import { useState } from "react";
import type {
  GuidedAction,
  GuidedState,
  VehiclePart,
} from "../guidedWorkspace";
import type { Predicate, RestrictionWorld } from "../world";
import { Id, Ref, Status, Tri, type Tone } from "./honesty";
import { labWorld } from "./model";
import { FacetBar, facetOf } from "./Facets";
import { AuthorizationEditor } from "./Editors";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
type O = Predicate["outcome"];
const RESULT: Record<RestrictionWorld["result"], { word: string; tone: Tone }> =
  {
    APPLIES: { word: "Aplica-se", tone: "action" },
    DOES_NOT_APPLY: { word: "Não se aplica", tone: "ok" },
    UNKNOWN: { word: "Desconhecido", tone: "unknown" },
  };
const KIND = {
  LEGAL_RESTRICTION: "Restrição legal",
  ROAD_CLOSURE: "Corte de estrada",
  OPERATIONAL_IMPACT: "Impacto operacional",
};
const VERIFY = {
  VERIFIED: "verificada",
  INTERPRETED: "interpretada",
  UNVERIFIED: "não verificada",
};
const all = (ps: Predicate[]): O =>
  ps.some((p) => p.outcome === "no")
    ? "no"
    : ps.some((p) => p.outcome === "unknown")
      ? "unknown"
      : "yes";
const any = (ps: Predicate[]): O =>
  ps.some((p) => p.outcome === "yes")
    ? "yes"
    : ps.some((p) => p.outcome === "unknown")
      ? "unknown"
      : "no";
const SOURCE_GROUP = (p: Predicate) =>
  p.part
    ? "Viatura"
    : p.fact.startsWith("authorization")
      ? "Autorizações"
      : p.fact.startsWith("passage")
        ? "Plano"
        : "Transporte";

/** Restrictions = causality: facts → conditions → exception → verdict → consequence. */
export function RestrictionInstrument({ state, act }: Props) {
  const w = labWorld(state);
  const r = w.restriction;
  const before =
    labWorld(state, false).restrictions.find((x) => x.id === r.id) ?? r;
  const previewing =
    before.result !== r.result ||
    JSON.stringify(before.all) !== JSON.stringify(r.all) ||
    JSON.stringify(before.exemptions) !== JSON.stringify(r.exemptions);
  const beforeOutcome = new Map(
    [...before.all, ...before.any, ...before.when, ...before.exemptions].map(
      (p) => [p.label, p.outcome],
    ),
  );
  const changed = (p: Predicate) =>
    previewing && beforeOutcome.get(p.label) !== p.outcome;
  const facet = facetOf(state, "Restrictions");
  const [hovered, setHot] = useState<string | null>(null);
  const res = RESULT[r.result];
  const preds = [...r.all, ...r.any, ...r.when, ...r.exemptions];
  const focusedFact =
    state.focus?.kind === "predicate" ? state.focus.fact : null;
  const inspected = preds.find((predicate) => predicate.fact === focusedFact);
  const hot = hovered ?? inspected?.label ?? null;
  const missing = preds.filter((p) => p.outcome === "unknown");
  const facts = new Map<string, Predicate[]>();
  for (const p of preds) {
    const g = SOURCE_GROUP(p);
    facts.set(g, [...(facts.get(g) ?? []), p]);
  }
  const stages: {
    title: string;
    op: string;
    items: Predicate[];
    result: O;
    exempt?: boolean;
  }[] = [];
  if (r.all.length)
    stages.push({
      title: "Se todas",
      op: "E",
      items: r.all,
      result: all(r.all),
    });
  if (r.any.length)
    stages.push({
      title: "e alguma",
      op: "OU",
      items: r.any,
      result: any(r.any),
    });
  if (r.when.length)
    stages.push({
      title: "quando",
      op: "E",
      items: r.when,
      result: all(r.when),
    });
  const exempt = r.exemptions.length ? any(r.exemptions) : null;
  // Every fact and condition opens where its value comes from.
  const passage = /(\d\d):(\d\d)/.exec(r.when[0]?.value ?? "");
  const sourceOf = (
    p: Predicate,
  ): { label: string; go: GuidedAction } | null =>
    p.part
      ? {
          label: "ver na viatura",
          go: {
            type: "follow",
            object: { kind: "fact", part: p.part as VehiclePart },
          },
        }
      : p.fact.startsWith("passage")
        ? {
            label: "ver no dia do motorista",
            go: passage
              ? {
                  type: "follow",
                  object: {
                    kind: "time",
                    at: Number(passage[1]) * 60 + Number(passage[2]),
                    label: `Passagem · ${r.title.split(" — ")[0]}`,
                  },
                }
              : { type: "follow", object: { kind: "driver", id: w.driver.id } },
          }
        : p.fact.startsWith("authorization")
          ? {
              label: "resolver",
              go: { type: "edit", kind: "authorization", target: w.truck.id },
            }
          : p.fact.startsWith("stop")
            ? {
                label: "ver a entrega",
                go: {
                  type: "follow",
                  object: { kind: "delivery", stop: w.job.stops.at(-1)!.id },
                },
              }
            : p.fact.startsWith("route")
              ? {
                  label: "ver o troço no mapa",
                  go: {
                    type: "spatial",
                    intent: {
                      question: "AFFECTED_SEGMENT",
                      target: "restriction",
                      source: "user",
                    },
                  },
                }
              : null;
  const focusPart = (p: Predicate) => {
    const src = sourceOf(p);
    if (src) act(src.go);
    else act({ type: "focus", focus: { kind: "predicate", fact: p.fact } });
  };
  const verdictWhy =
    r.result === "UNKNOWN"
      ? `As condições conhecidas verificam-se, mas ${missing.length === 1 ? "um facto está" : `${missing.length} factos estão`} em falta: o resultado não pode ser «não se aplica».`
      : r.result === "DOES_NOT_APPLY"
        ? exempt === "yes"
          ? "As condições verificam-se, mas a isenção está confirmada."
          : "Uma condição necessária não se verifica."
        : "Todas as condições verificam-se e não há isenção confirmada.";

  return (
    <article
      className="fx-instrument fx-restriction"
      data-tone={res.tone}
      data-facet={facet}
      data-preview={previewing}
    >
      <header className="fx-answer">
        <h1>{r.answer}</h1>
        <p>{r.answerDetail}</p>
        <div className="fx-answer-meta">
          <span className="fx-who" data-object={`restriction:${r.id}`}>
            {r.title} <Id>{r.id}</Id>
          </span>
          <span className="fx-prov-line">
            {KIND[r.kind]} · regra {VERIFY[r.verification]} · {r.window}
          </span>
          <FacetBar
            state={state}
            act={act}
            domain="Restrictions"
            only={
              r.altLines
                ? undefined
                : ["logic", "missing", "physical", "evidence"]
            }
          />
        </div>
        {previewing && (
          <p className="fx-preview-note">
            Pré-visualização da proposta: <s>{RESULT[before.result].word}</s> →{" "}
            <b>{res.word}</b>. Nada muda até confirmar.
          </p>
        )}
      </header>
      {inspected && (
        <section
          className="rw-focused-fact"
          data-inspected-fact={inspected.fact}
        >
          <small>Facto nesta decisão de passagem</small>
          <h2>{inspected.label}</h2>
          <p>
            <b>{inspected.value}</b> · {inspected.source}
          </p>
          <p>
            {r.exemptions.includes(inspected)
              ? "Este facto participa numa possível isenção."
              : r.when.includes(inspected)
                ? "Este facto determina quando a regra pode aplicar-se."
                : "Este facto participa nas condições de aplicabilidade."}{" "}
            {inspected.outcome === "unknown"
              ? "O valor está por confirmar; não é uma permissão de passagem."
              : inspected.outcome === "yes"
                ? "A condição correspondente verifica-se neste cenário."
                : "A condição correspondente não se verifica neste cenário."}
          </p>
          <Status tone={res.tone}>Resultado da regra: {res.word}</Status>
        </section>
      )}

      {facet === "missing" && (
        <div className="fx-missing">
          {[...preds.filter((p) => p.outcome === "unknown" || changed(p))].map(
            (m) => (
              <div
                key={m.fact + m.label}
                className="fx-missing-row"
                data-outcome={m.outcome}
                data-changed={changed(m)}
              >
                <Tri outcome={m.outcome} />
                <div>
                  <b>{m.label}</b>
                  <span>
                    {m.value} · {m.source}
                  </span>
                  <small>
                    {SOURCE_GROUP(m)} · facto necessário para decidir a passagem
                  </small>
                </div>
                {m.part === "firstAxle" ? (
                  <button
                    className="fx-btn"
                    data-kind="quiet"
                    data-ix="edit"
                    onClick={() =>
                      act({ type: "edit", kind: "axle", target: w.truck.id })
                    }
                  >
                    Registar medição na viatura
                  </button>
                ) : m.fact.startsWith("authorization.pt-vci") &&
                  state.edit?.kind !== "authorization" ? (
                  <button
                    className="fx-btn"
                    data-kind="quiet"
                    data-ix="edit"
                    onClick={() =>
                      act({
                        type: "edit",
                        kind: "authorization",
                        target: w.truck.id,
                      })
                    }
                  >
                    Registar habilitação
                  </button>
                ) : null}
              </div>
            ),
          )}
          {missing.length === 0 && !previewing && (
            <p className="fx-quiet">
              Sem factos em falta: o veredito está decidido.
            </p>
          )}
          {state.edit?.kind === "authorization" && (
            <AuthorizationEditor state={state} act={act} />
          )}
          <div className="fx-c-verdict" data-result={r.result}>
            <Status tone={res.tone}>{res.word}</Status>
            <p>{verdictWhy}</p>
          </div>
          {r.altLines && (
            <button
              className="fx-link"
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "alternative", id: r.id },
                })
              }
            >
              Sem resolver, planear pela alternativa {r.alternative} →
            </button>
          )}
        </div>
      )}
      {facet === "physical" && (
        <div className="fx-physical">
          <p className="fx-quiet">
            {w.truck.make} {w.truck.model} · {w.truck.plate}
            {w.trailer ? ` + ${w.trailer.id}` : ""}
          </p>
          {preds
            .filter((p) => p.part)
            .map((p) => (
              <button
                key={p.label}
                className="fx-missing-row"
                data-ix="follow"
                data-outcome={p.outcome}
                data-changed={changed(p)}
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "fact", part: p.part as VehiclePart },
                  })
                }
              >
                <Tri outcome={p.outcome} />
                <div>
                  <b>{p.label}</b>
                  <span>
                    {p.value} · {p.source}
                  </span>
                </div>
                <em>ver na viatura →</em>
              </button>
            ))}
          {preds.filter((p) => p.part).length === 0 && (
            <div>
              <p className="fx-quiet">
                Esta condição não depende de factos físicos da viatura. A
                decisão vem das condições de percurso ou de horário.
              </p>
              <button
                className="fx-link"
                data-ix="inspect"
                onClick={() =>
                  act({ type: "facet", domain: "Restrictions", facet: "logic" })
                }
              >
                Rever o critério que decide esta passagem →
              </button>
            </div>
          )}
        </div>
      )}
      {facet === "alternative" && (
        <div className="fx-alternative">
          <section data-path="current">
            <small>Caminho atual</small>
            <b>{r.title.split(" — ")[0]}</b>
            <Status tone={res.tone}>{res.word}</Status>
            <span>{r.where}</span>
          </section>
          <section data-path="alt">
            <small>Alternativa oficial</small>
            <b>{r.alternative ?? "Sem alternativa registada"}</b>
            <Status tone="neutral">Geometria alternativa registada</Status>
            <span>
              Distância e tempo do desvio completo por calcular · restantes
              condições por validar
            </span>
            {r.altLines && (
              <button
                className="fx-btn"
                data-kind="quiet"
                data-ix="spatial"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "alternative", id: r.id },
                  })
                }
              >
                Comparar no percurso
              </button>
            )}
          </section>
        </div>
      )}
      {facet === "evidence" && (
        <div className="rw-evidence" data-rule-work="evidence">
          <section className="rw-source-register">
            <h2>De onde vem a regra</h2>
            {r.evidence.map((e) => (
              <article key={e.ref}>
                <Ref>{e.ref}</Ref>
                <b>{e.detail}</b>
                <span>{e.trust}</span>
              </article>
            ))}
            <p className="fx-footnote">
              Regra {VERIFY[r.verification]}. A interpretação liga cada condição
              a um facto do transporte; nenhum facto em falta é tratado como
              permitido.
            </p>
            <button
              className="fx-link"
              data-ix="inspect"
              onClick={() =>
                act({ type: "facet", domain: "Restrictions", facet: "logic" })
              }
            >
              Examinar a interpretação da regra →
            </button>
          </section>
          <section className="rw-fact-trace">
            <h2>O que precisa de ser comprovado neste trabalho</h2>
            <p>
              {w.jobId} · {w.truck.plate} · {r.where}
            </p>
            {[...preds]
              .sort(
                (a, b) =>
                  Number(b.outcome === "unknown") -
                  Number(a.outcome === "unknown"),
              )
              .map((p, index) => {
                const source = sourceOf(p);
                const measure =
                  p.outcome === "unknown" && p.part === "firstAxle";
                return (
                  <article
                    key={`${p.fact}-${index}`}
                    data-evidence-fact={p.fact}
                    data-outcome={p.outcome}
                  >
                    <Tri outcome={p.outcome} />
                    <div>
                      <h3>{p.label}</h3>
                      <p>{p.value}</p>
                      <small>
                        {p.source} · {SOURCE_GROUP(p)}
                      </small>
                      {(measure || source) && (
                        <button
                          className="fx-link"
                          data-ix={
                            measure
                              ? "edit"
                              : source!.go.type === "edit"
                                ? "edit"
                                : "follow"
                          }
                          onClick={() =>
                            act(
                              measure
                                ? {
                                    type: "edit",
                                    kind: "axle",
                                    target: w.truck.id,
                                  }
                                : source!.go,
                            )
                          }
                        >
                          {measure
                            ? "Registar a medição que falta"
                            : source!.label}{" "}
                          →
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            <div className="fx-c-verdict" data-result={r.result}>
              <Status tone={res.tone}>{res.word}</Status>
              <p>{verdictWhy}</p>
              <small>{r.consequence}</small>
            </div>
          </section>
        </div>
      )}

      {facet === "logic" && (
        <div className="fx-causal" data-hot={hot ?? ""}>
          <section className="fx-c-col" data-step="facts" aria-label="Factos">
            <h2>
              <span>1</span> Factos
            </h2>
            {[...facts.entries()].map(([group, ps]) => (
              <div key={group} className="fx-c-factgroup">
                <small>{group}</small>
                {ps.map((p) => (
                  <button
                    key={p.fact + p.label}
                    className="fx-c-fact"
                    data-ix={sourceOf(p) ? "follow" : "inspect"}
                    data-changed={changed(p)}
                    data-outcome={p.outcome}
                    data-hot={hot === p.label}
                    onMouseEnter={() => setHot(p.label)}
                    onMouseLeave={() => setHot(null)}
                    onClick={() => focusPart(p)}
                    data-object={
                      p.part === "firstAxle" ? "fact:firstAxle" : undefined
                    }
                  >
                    <b>{p.value}</b>
                    <span>{p.source}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>

          <section
            className="fx-c-col"
            data-step="conditions"
            aria-label="Condições"
          >
            <h2>
              <span>2</span> Aplica-se a este transporte?
            </h2>
            {stages.map((st) => (
              <div key={st.title} className="fx-c-stage">
                <div className="fx-c-stage-head">
                  <em>{st.title}</em>
                  <Tri outcome={st.result} />
                </div>
                {st.items.map((p) => (
                  <button
                    key={p.label + p.value}
                    className="fx-c-pred"
                    data-ix={sourceOf(p) ? "follow" : "inspect"}
                    data-changed={changed(p)}
                    data-outcome={p.outcome}
                    data-hot={hot === p.label}
                    onMouseEnter={() => setHot(p.label)}
                    onMouseLeave={() => setHot(null)}
                    onClick={() => focusPart(p)}
                  >
                    <Tri outcome={p.outcome} />
                    <span>{p.label}</span>
                    {sourceOf(p) && (
                      <i className="fx-c-link">{sourceOf(p)!.label}</i>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </section>

          <section
            className="fx-c-col"
            data-step="exception"
            aria-label="Exceção"
          >
            <h2>
              <span>3</span> Exceto se
            </h2>
            {r.exemptions.length ? (
              <div className="fx-c-stage" data-exempt>
                <div className="fx-c-stage-head">
                  <em>isenção</em>
                  <Tri outcome={exempt!} />
                </div>
                {r.exemptions.map((p) => (
                  <button
                    key={p.label}
                    className="fx-c-pred"
                    data-ix={sourceOf(p) ? "follow" : "inspect"}
                    data-changed={changed(p)}
                    data-outcome={p.outcome}
                    data-hot={hot === p.label}
                    onMouseEnter={() => setHot(p.label)}
                    onMouseLeave={() => setHot(null)}
                    onClick={() => focusPart(p)}
                  >
                    <Tri outcome={p.outcome} />
                    <span>
                      {p.label}
                      <small>{p.value}</small>
                    </span>
                    {sourceOf(p) && (
                      <i className="fx-c-link">{sourceOf(p)!.label}</i>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="fx-quiet">Sem isenções previstas.</p>
            )}
          </section>

          <section
            className="fx-c-col"
            data-step="verdict"
            aria-label="Veredito e consequência"
          >
            <h2>
              <span>4</span> Portanto
            </h2>
            <div className="fx-c-verdict" data-result={r.result}>
              <Status tone={res.tone}>{res.word}</Status>
              <p>{verdictWhy}</p>
            </div>
            <h2 className="fx-sub">
              <span>5</span> Consequência
            </h2>
            <p
              className="fx-consequence"
              data-tone={r.result === "DOES_NOT_APPLY" ? "ok" : "risk"}
            >
              {r.consequence}
            </p>
            {r.altLines && r.result !== "DOES_NOT_APPLY" && (
              <button
                className="fx-link"
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "alternative", id: r.id },
                  })
                }
              >
                Comparar com {r.alternative} no percurso →
              </button>
            )}
            {missing.length > 0 && (
              <div className="fx-c-resolve">
                {missing.map((m) => (
                  <div key={m.fact}>
                    <b>Falta: {m.label.toLowerCase()}</b>
                    <code>{m.fact}</code>
                    <span>
                      Origem:{" "}
                      {m.part ? "registo da viatura" : "dossier do transporte"}{" "}
                      · resolve: registar o facto
                    </span>
                  </div>
                ))}
                <small>
                  Até lá, confirmar a entrega pela VCI exige aceitar a
                  incerteza.
                </small>
                {missing.some((m) => m.part) && (
                  <button
                    className="fx-link"
                    data-ix="follow"
                    onClick={() =>
                      act({
                        type: "follow",
                        object: { kind: "fact", part: "firstAxle" },
                      })
                    }
                  >
                    Ver o 1.º eixo na viatura →
                  </button>
                )}
                <button
                  className="fx-link"
                  data-ix="edit"
                  onClick={() =>
                    act({
                      type: "facet",
                      domain: "Restrictions",
                      facet: "missing",
                    })
                  }
                >
                  Resolver factos em falta →
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {facet === "logic" && (
        <footer className="fx-c-foot">
          <div>
            <h2>Evidência</h2>
            <ul className="fx-evidence">
              {r.evidence.map((e) => (
                <li key={e.ref}>
                  <Ref>{e.ref}</Ref>
                  <small>
                    {e.detail} · {e.trust}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          {w.restrictions.length > 1 && (
            <div>
              <h2>Outras condições na rota</h2>
              <ul className="fx-other">
                {w.restrictions
                  .filter((o) => o.id !== r.id)
                  .map((o) => (
                    <li key={o.id}>
                      <button
                        data-ix="follow"
                        onClick={() =>
                          act({
                            type: "follow",
                            object: { kind: "restriction", id: o.id },
                          })
                        }
                        data-map-entity="restriction"
                        data-entity-id={o.id}
                      >
                        <Status tone={RESULT[o.result].tone}>
                          {RESULT[o.result].word}
                        </Status>
                        <b>{o.title}</b>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
