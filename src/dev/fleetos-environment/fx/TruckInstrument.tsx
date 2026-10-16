import type { ReactNode } from "react";
import type {
  GuidedAction,
  GuidedState,
  VehiclePart,
} from "../guidedWorkspace";
import { isProposed } from "../edits";
import { ObjectSlot } from "./PersistentObjects";
import { TRAILERS, holderOf } from "../world";
import { Id, Plate, Status, Tri, Val } from "./honesty";
import { kg, labWorld } from "./model";
import { LoadPlan, VehicleDrawing, type Aspect } from "./VehicleDrawing";
import { FacetBar, facetOf } from "./Facets";
import {
  AssignmentSurface,
  AxleEditor,
  FuelReadingEditor,
  MaintenanceEditor,
} from "./Editors";

type Props = {
  state: GuidedState;
  act: (a: GuidedAction) => void;
  form?: "full" | "compact" | "joined";
  summary?: ReactNode;
};
const PART_LABEL: Record<VehiclePart, string> = {
  firstAxle: "altura ao 1.º eixo",
  axles: "número de eixos",
  weight: "peso bruto",
  height: "altura do conjunto",
  body: "tipo de viatura",
};
const VERDICT = {
  APPLIES: "Aplica-se",
  DOES_NOT_APPLY: "Não se aplica",
  UNKNOWN: "Desconhecido",
} as const;

/** Truck = the physical combination. The same object answers different questions. */
export function TruckInstrument(props: Props) {
  const w = labWorld(props.state);
  return <ObjectSlot id={`truck:${w.truck.id}:job:${w.jobId}`}>
    <TruckInstrumentBody {...props} />
  </ObjectSlot>;
}
function TruckInstrumentBody({ state, act, form = "full", summary }: Props) {
  const w = labWorld(state);
  const committed = labWorld(state, false);
  const { truck, trailer, job } = w;
  const facet = facetOf(state, "Trucks");
  const aspect: Aspect =
    facet === "restriction" || facet === "fuel" ? facet : "load";
  const part = state.focus?.kind === "vehicle" ? state.focus.part : undefined;
  const deliveryFocus =
    state.focus?.kind === "delivery"
      ? job.stops.find((s) => s.id === (state.focus as { stop: string }).stop)
          ?.city
      : undefined;
  const vci = w.restrictions.find((r) => r.id === "RI-042");
  const vciBefore = committed.restrictions.find((r) => r.id === "RI-042");
  const clearance = w.restrictions.find((r) => r.limitM);
  const missing = truck.firstAxleHeightM == null;
  const capacity = trailer?.pallets ?? 33;
  const grossKg = truck.tareKg + (trailer?.tareKg ?? 0) + w.cargoKg;
  const maintenance = truck.availability === "MAINTENANCE";
  const editing = state.edit?.kind;
  const proposedTrailer = isProposed(state, "trailer", w.jobId);
  const proposedAxle = isProposed(state, "axle", truck.id);
  const groups = job.cargo
    .map((c) => ({
      city: c.dropAt,
      pallets: c.pallets,
      kg: c.weightKg,
      order: job.stops.findIndex(
        (s) => s.city === c.dropAt && s.type !== "pickup",
      ),
      adr: c.adr,
      tempC: c.tempC,
    }))
    .sort((a, b) => a.order - b.order)
    .map((g, i) => ({ ...g, order: i + 1 }));
  const rules: Partial<
    Record<
      VehiclePart,
      { outcome: "yes" | "no" | "unknown"; label: string; value: string }
    >
  > = {};
  for (const p of vci?.all ?? []) if (p.part) rules[p.part as VehiclePart] = p;
  const focus = (next: Aspect, p?: VehiclePart) =>
    act({ type: "focus", focus: { kind: "vehicle", aspect: next, part: p } });
  const firstDrop = groups[0];
  const freeTrailers = Object.values(TRAILERS).filter(
    (t) => !holderOf("trailerId", t.id) && t.pallets >= w.pallets,
  );
  const deliveryOf = (city: string) =>
    job.stops.find((s) => s.city === city && s.type !== "pickup");

  const headline =
    facet === "assignment"
      ? editing === "truck"
        ? `Escolher viatura para ${job.id}`
        : `Escolher reboque para ${job.id}`
      : facet === "maintenance"
        ? maintenance
          ? `${truck.plate} em oficina — ${job.id} carrega às ${job.stops[0].window[0]}`
          : `${truck.plate} disponível`
        : !trailer && aspect !== "fuel"
          ? `Sem reboque válido — ${job.id.replace("-", "‑")} não pode ser planeado`
          : maintenance && aspect === "load"
            ? `${truck.plate} está em manutenção com trabalho atribuído`
            : aspect === "fuel"
              ? w.positionKnown
                ? `Abastecer antes de ~km ${Math.round((job.positionKm ?? 0) + w.rangeKm)}`
                : `Combustível: ${truck.fuel.value}% na última leitura manual`
              : aspect === "restriction"
                ? vci && vci.result !== "UNKNOWN"
                  ? `VCI Porto: ${VERDICT[vci.result].toLowerCase()} a esta viatura`
                  : missing
                    ? "Um facto da viatura decide a VCI"
                    : "A viatura cumpre as condições conhecidas"
                : `${w.pallets}/${capacity} posições · ${firstDrop?.city ?? "—"} sai primeiro`;
  const sub =
    facet === "assignment"
      ? "Conjunto atual à esquerda; candidatos comparados pelo que a carga e as restrições exigem."
      : facet === "maintenance"
        ? maintenance
          ? `${truck.service}. A viatura está atribuída a ${job.id}; ou a reparação termina antes da carga, ou o transporte muda de viatura.`
          : "Sem trabalho de oficina pendente."
        : !trailer && aspect !== "fuel"
          ? `O reboque «${job.trailerId}» atribuído não existe na frota. As ${w.pallets} paletes não têm onde ser carregadas até ser atribuído um reboque existente.`
          : maintenance && aspect === "load"
            ? `Disponibilidade manual: manutenção. ${job.id} carrega às ${job.stops[0].window[0]} em ${job.stops[0].city}${job.cargo.some((c) => c.adr) ? " com mercadoria ADR" : ""}; é preciso reatribuir a viatura.`
            : aspect === "fuel"
              ? w.positionKnown
                ? `Leitura manual de ${truck.fuel.value}% (${truck.fuel.prov.at}); após ${job.positionKm} km o depósito estimado está em ≈ ${Math.round(w.fuelNowPct)}%. O consumo é assumido, não medido.`
                : `Leitura manual de ${truck.fuel.value}% (${truck.fuel.prov.at}). A posição é desconhecida, por isso não há estimativa de consumo desde a leitura.`
              : aspect === "restriction"
                ? missing
                  ? "Peso, eixos e tipo de viatura satisfazem a regra; a altura ao 1.º eixo não está registada, por isso a aplicabilidade fica desconhecida."
                  : (vci?.answerDetail ??
                    "Todos os factos usados pelas restrições estão registados.")
                : groups.length > 1
                  ? `As ${firstDrop.pallets} paletes de ${firstDrop.city} estão junto às portas; as ${groups[1].pallets} de ${groups[1].city} ocupam a frente. Massa estimada dentro da MMA.`
                  : "Carga numa única descarga. Massa estimada dentro da MMA.";

  return (
    <article
      className="fx-instrument fx-truck"
      data-morph-form={form}
      data-aspect={aspect}
      data-facet={facet}
      data-editing={editing ?? undefined}
      data-tone={
        facet === "maintenance" && maintenance
          ? "action"
          : aspect === "restriction" && vci?.result === "UNKNOWN"
            ? "unknown"
            : aspect === "fuel"
              ? "risk"
              : "ok"
      }
    >
      <div className="fx-compact-summary" hidden={form !== "compact"}>
        {form === "compact" ? summary : null}
      </div>
      <header
        className="fx-answer"
        aria-hidden={form === "compact"}
        inert={form === "compact"}
      >
        <h1>{headline}</h1>
        <p>{sub}</p>
        <div className="fx-answer-meta">
          <span
            className="fx-who"
            data-object={`truck:${truck.plate}`}
            data-proposed={isProposed(state, "truck", w.jobId)}
          >
            {truck.make} {truck.model} <Plate>{truck.plate}</Plate>
            {trailer ? (
              <button
                className="fx-quiet fx-inline"
                data-ix={editing === "trailer" ? undefined : "edit"}
                disabled={editing === "trailer"}
                data-proposed={proposedTrailer}
                onClick={() =>
                  act({ type: "edit", kind: "trailer", target: w.jobId })
                }
              >
                + {trailer.type.toLowerCase()} <Id>{trailer.id}</Id>
                {proposedTrailer && (
                  <em className="fx-proposed-tag">proposto</em>
                )}
              </button>
            ) : (
              <button
                className="fx-inline"
                data-ix="edit"
                onClick={() =>
                  act({ type: "edit", kind: "trailer", target: w.jobId })
                }
              >
                <Status tone="blocker">
                  Reboque {job.trailerId} não existe
                </Status>
              </button>
            )}
            <span className="fx-relations">
              <button
                className="fx-rel"
                data-object={`driver:${w.driver.id}`}
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "driver", id: w.driver.id },
                  })
                }
              >
                {w.driver.name}
              </button>
              <button
                className="fx-rel"
                data-ix="follow"
                onClick={() =>
                  act({ type: "follow", object: { kind: "job", id: job.id } })
                }
              >
                {job.id}
              </button>
            </span>
          </span>
          <FacetBar state={state} act={act} domain="Trucks" />
        </div>
      </header>

      {facet === "assignment" ? (
        <div className="fx-assign-stage">
          <div className="fx-assign-current">
            <VehicleDrawing
              aspect="load"
              groups={groups}
              capacity={capacity}
              trailerMissing={!trailer}
              grossKg={grossKg}
              firstAxleKnown={!missing}
              firstAxleM={truck.firstAxleHeightM}
              clearanceM={clearance?.limitM}
              fuelReadPct={truck.fuel.value}
              fuelNowPct={w.fuelNowPct}
              rules={rules}
              onPart={(p) => focus("restriction", p)}
            />
            <p
              className="fx-assign-caption"
              data-proposed={
                proposedTrailer || isProposed(state, "truck", w.jobId)
              }
            >
              {proposedTrailer || isProposed(state, "truck", w.jobId)
                ? "Conjunto proposto"
                : "Conjunto atual"}{" "}
              · {truck.plate} + {trailer?.id ?? "sem reboque"}
            </p>
          </div>
          {editing === "trailer" || editing === "truck" ? (
            <AssignmentSurface state={state} act={act} />
          ) : (
            <div className="fx-edit-choices">
              <button
                className="fx-choice"
                data-ix="edit"
                onClick={() =>
                  act({ type: "edit", kind: "trailer", target: w.jobId })
                }
              >
                <b>Mudar reboque</b>
                <span>Comparar reboques compatíveis com a carga</span>
              </button>
              <button
                className="fx-choice"
                data-ix="edit"
                onClick={() =>
                  act({ type: "edit", kind: "truck", target: w.jobId })
                }
              >
                <b>Mudar viatura</b>
                <span>Comparar tratores livres</span>
              </button>
            </div>
          )}
        </div>
      ) : facet === "maintenance" ? (
        <div className="fx-maint">
          <section
            className="fx-maint-day"
            aria-label="Oficina e trabalho atribuído"
          >
            <h2>
              {maintenance
                ? "Indisponibilidade e trabalho afetado"
                : "Disponibilidade e acompanhamento"}
            </h2>
            <ol className="fx-sequence">
              <li data-tone={maintenance ? "action" : "ok"}>
                <span>Registo atual</span>
                <div>
                  <b>
                    {maintenance
                      ? "Viatura indisponível"
                      : "Viatura disponível no registo"}
                  </b>
                  <span>
                    {truck.service}
                    {maintenance && truck.service.includes("previsão") && (
                      <small>
                        {" "}
                        · previsão da nota, sem libertação confirmada
                      </small>
                    )}
                  </span>
                </div>
              </li>
              <li data-tone={maintenance ? "action" : "ok"}>
                <time>{job.stops[0].window[0]}</time>
                <div>
                  <button
                    className="fx-inline"
                    data-ix="follow"
                    onClick={() =>
                      act({
                        type: "follow",
                        object: { kind: "job", id: job.id },
                      })
                    }
                  >
                    <b>
                      Carga {job.id} em {job.stops[0].city}
                    </b>
                  </button>
                  <span>
                    {maintenance
                      ? "a viatura atribuída está indisponível para este trabalho"
                      : "viatura disponível"}
                  </span>
                </div>
              </li>
              {maintenance && (
                <li data-tone="unknown">
                  <span>Por confirmar</span>
                  <div>
                    <b>Libertação da oficina</b>
                    <span>
                      Sem hora de saída registada. Não atribuir uma
                      disponibilidade futura com base no fim previsto do
                      transporte.
                    </span>
                  </div>
                </li>
              )}
            </ol>
          </section>
          <section className="rw-maintenance-actions">
            <h2>Decidir sobre o trabalho</h2>
            <p>
              {maintenance
                ? "O registo da oficina e a atribuição do transporte são decisões distintas. Rever outro conjunto permite manter a carga ligada ao mesmo trabalho."
                : "Não há indisponibilidade de oficina registada. A revisão prevista e as condições do trabalho continuam a precisar de acompanhamento."}
            </p>
            <button
              className="fx-link"
              data-ix="inspect"
              onClick={() =>
                act({ type: "facet", domain: "Trucks", facet: "assignment" })
              }
            >
              Rever a atribuição e os recursos do conjunto →
            </button>
            <button
              className="fx-link"
              data-ix="follow"
              onClick={() =>
                act({ type: "follow", object: { kind: "job", id: job.id } })
              }
            >
              Abrir o transporte afetado →
            </button>
          </section>
          {editing === "maintenance" ? (
            <MaintenanceEditor state={state} act={act} />
          ) : (
            maintenance && (
              <div className="fx-edit-choices">
                <button
                  className="fx-choice"
                  data-ix="edit"
                  onClick={() =>
                    act({ type: "edit", kind: "maintenance", target: truck.id })
                  }
                >
                  <b>Resolver manutenção</b>
                  <span>
                    Registar reparação concluída ou reatribuir {job.id}
                  </span>
                </button>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="fx-vehicle-stage" data-rule={aspect === "restriction"}>
          <VehicleDrawing
            aspect={aspect}
            part={part}
            groups={groups}
            capacity={capacity}
            trailerMissing={!trailer}
            grossKg={grossKg}
            firstAxleKnown={!missing}
            firstAxleM={truck.firstAxleHeightM}
            clearanceM={clearance?.limitM}
            fuelReadPct={truck.fuel.value}
            fuelNowPct={w.fuelNowPct}
            rules={rules}
            onPart={(p) => focus("restriction", p)}
          />
          {aspect === "restriction" && (
            <aside
              className="fx-bound-rules"
              aria-label="Condições ligadas a peças da viatura"
            >
              <span className="fx-bound-title">
                VCI Porto · condições sobre a viatura
              </span>
              {part && (
                <p className="fx-focus-line" data-part={part}>
                  Em foco: {PART_LABEL[part]} ·{" "}
                  {rules[part]
                    ? `${rules[part]!.value} → ${rules[part]!.outcome === "yes" ? "verifica-se" : rules[part]!.outcome === "no" ? "falha" : "por registar"}`
                    : part === "height" && clearance
                      ? `gabarito ${clearance.limitM?.toFixed(2).replace(".", ",")} m`
                      : "sem condição associada"}
                </p>
              )}
              {(vci?.all ?? [])
                .filter((p) => p.part)
                .map((p) => (
                  <button
                    key={p.label}
                    className="fx-bound"
                    data-ix="inspect"
                    data-outcome={p.outcome}
                    data-proposed={p.part === "firstAxle" && proposedAxle}
                    aria-pressed={part === p.part}
                    onClick={() => focus("restriction", p.part as VehiclePart)}
                    data-object={
                      p.part === "firstAxle" ? "fact:firstAxle" : undefined
                    }
                  >
                    <Tri outcome={p.outcome} />
                    <span>
                      {p.label}
                      <em>{p.value}</em>
                    </span>
                  </button>
                ))}
              {clearance && (
                <button
                  className="fx-bound"
                  data-ix="inspect"
                  data-outcome="yes"
                  aria-pressed={part === "height"}
                  onClick={() => focus("restriction", "height")}
                >
                  <Tri outcome="yes" />
                  <span>
                    Altura ≤ gabarito 4,30 m
                    <em>
                      {(trailer?.heightM ?? 4).toFixed(2).replace(".", ",")} m ·
                      levantamento sintético
                    </em>
                  </span>
                </button>
              )}
              {vci && (
                <button
                  className="fx-mini-verdict"
                  data-ix="follow"
                  data-result={vci.result}
                  data-changed={!!vciBefore && vciBefore.result !== vci.result}
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "restriction", id: "RI-042" },
                    })
                  }
                >
                  <small>
                    Veredito
                    {vciBefore && vciBefore.result !== vci.result
                      ? " · pré-visualização"
                      : ""}
                  </small>
                  <b>
                    {vciBefore && vciBefore.result !== vci.result && (
                      <s>{VERDICT[vciBefore.result]}</s>
                    )}{" "}
                    {VERDICT[vci.result]}
                  </b>
                  <span>Ver lógica da VCI →</span>
                </button>
              )}
              {editing === "axle" ? (
                <AxleEditor state={state} act={act} />
              ) : (
                missing && (
                  <button
                    className="fx-btn"
                    data-kind="quiet"
                    data-ix="edit"
                    onClick={() =>
                      act({ type: "edit", kind: "axle", target: truck.id })
                    }
                  >
                    Registar medição do 1.º eixo
                  </button>
                )
              )}
            </aside>
          )}
          {aspect === "fuel" && (
            <aside
              className="fx-bound-rules"
              aria-label="Leitura de combustível"
            >
              {editing === "fuel-reading" ? (
                <FuelReadingEditor state={state} act={act} />
              ) : (
                <>
                  <span className="fx-bound-title">Proveniência</span>
                  <Val
                    label="Última leitura"
                    value={`${truck.fuel.value}%`}
                    prov={truck.fuel.prov}
                    size="m"
                  />
                  <button
                    className="fx-btn"
                    data-kind="quiet"
                    data-ix="edit"
                    onClick={() =>
                      act({
                        type: "edit",
                        kind: "fuel-reading",
                        target: truck.id,
                      })
                    }
                  >
                    Atualizar leitura manual
                  </button>
                  {w.candidates.length > 0 && (
                    <button
                      className="fx-link"
                      data-ix="follow"
                      onClick={() =>
                        act({ type: "follow", object: { kind: "range" } })
                      }
                    >
                      Próxima paragem viável →
                    </button>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
      )}

      {aspect === "load" && facet === "load" && trailer && (
        <LoadPlan
          groups={groups}
          capacity={capacity}
          focusCity={deliveryFocus}
          onGroup={(city) => {
            const st = deliveryOf(city);
            // First click focuses the pallets; a second click on the same group follows the delivery.
            if (st)
              act(
                deliveryFocus === city
                  ? {
                      type: "follow",
                      object: { kind: "delivery", stop: st.id },
                    }
                  : { type: "focus", focus: { kind: "delivery", stop: st.id } },
              );
          }}
        />
      )}
      {facet === "load" &&
        deliveryFocus &&
        (() => {
          const st = deliveryOf(deliveryFocus)!;
          return (
            <p className="fx-focus-line">
              <b>{deliveryFocus}</b> · {st.cargo} · ETA {st.eta} · janela{" "}
              {st.window.join("–")}{" "}
              <button
                className="fx-link"
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "delivery", stop: st.id },
                  })
                }
              >
                Ver a entrega no transporte →
              </button>
            </p>
          );
        })()}
      {facet === "load" && !trailer && (
        <p className="fx-consequence" data-tone="action">
          Sem reboque não há plano de carga. Reboques livres com {w.pallets}+
          posições:{" "}
          {freeTrailers.map((t, i) => (
            <span key={t.id}>
              {i > 0 && " · "}
              <Id>{t.id}</Id> ({t.type.toLowerCase()})
            </span>
          ))}
          .{" "}
          <button
            className="fx-link"
            data-ix="edit"
            onClick={() =>
              act({ type: "edit", kind: "trailer", target: w.jobId })
            }
          >
            Atribuir reboque →
          </button>
        </p>
      )}

      {facet !== "assignment" && facet !== "maintenance" && (
        <div className="fx-columns" data-cols="3">
          {aspect !== "fuel" ? (
            <section className="fx-col">
              <h2>Carga e massa</h2>
              <div className="fx-figure-row">
                <Val
                  label="Posições"
                  value={
                    trailer ? `${w.pallets}/${capacity}` : `${w.pallets}/?`
                  }
                  state={trailer ? "KNOWN" : "UNKNOWN"}
                  size="l"
                  prov={trailer ? "carga declarada" : "sem reboque válido"}
                />
                <Val
                  label="Massa estimada"
                  value={kg(grossKg)}
                  unit="/ 40 t"
                  size="l"
                  prov={{
                    kind: "ASSUMED",
                    source: "taras de registo + carga declarada",
                  }}
                />
              </div>
              <ul className="fx-lines">
                {job.cargo.map((c) => (
                  <li key={c.id}>
                    <b>{c.description}</b>
                    <span>
                      {c.pallets} paletes · {kg(c.weightKg)} · descarga{" "}
                      {c.dropAt}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="fx-col">
              <h2>Relação com o percurso</h2>
              <RangeBar
                pos={job.positionKm ?? 0}
                range={w.rangeKm}
                total={Math.round(w.route.km)}
                stop={w.recommended?.km ?? null}
                known={w.positionKnown}
              />
            </section>
          )}
          <section className="fx-col">
            <h2>Leituras</h2>
            <div className="fx-figure-row">
              <button
                className="fx-inline"
                data-ix="follow"
                onClick={() =>
                  act({ type: "follow", object: { kind: "fuel" } })
                }
              >
                <Val
                  label="Combustível"
                  value={truck.fuel.value}
                  unit="%"
                  size="l"
                  prov={truck.fuel.prov}
                />
              </button>
              {w.positionKnown ? (
                <Val
                  label="Agora, estimado"
                  value={`≈ ${Math.round(w.fuelNowPct)}`}
                  unit="%"
                  size="l"
                  prov={{
                    kind: "ASSUMED",
                    source: `${job.positionKm} km desde a leitura · ${truck.consumptionL100.value} L/100 km`,
                  }}
                />
              ) : (
                <Val
                  label="Agora, estimado"
                  value="sem estimativa"
                  state="UNKNOWN"
                  size="m"
                  prov="posição desconhecida"
                />
              )}
            </div>
            <dl className="fx-facts">
              <div>
                <dt>Autonomia</dt>
                <dd>
                  <Val
                    value={`≈ ${w.rangeKm} km`}
                    prov={{
                      kind: "ASSUMED",
                      source: w.positionKnown
                        ? "consumo do cenário"
                        : "a partir da leitura manual",
                    }}
                    size="s"
                  />
                </dd>
              </div>
              <div>
                <dt>Odómetro</dt>
                <dd>
                  <Val
                    value={`${truck.odometer.value.toLocaleString("pt-PT")} km`}
                    prov={truck.odometer.prov}
                    size="s"
                  />
                </dd>
              </div>
            </dl>
            <p className="fx-footnote">
              Sem telemetria: leituras introduzidas manualmente.
            </p>
          </section>
          <section className="fx-col">
            <h2>Especificação e atenção</h2>
            <dl className="fx-facts">
              <div>
                <dt>Eixos</dt>
                <dd>
                  {trailer ? (
                    <>
                      {truck.axles} + {trailer.axles} <small>conjunto</small>
                    </>
                  ) : (
                    <>
                      {truck.axles} <small>trator · sem reboque</small>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>1.º eixo</dt>
                <dd>
                  {missing ? (
                    <button
                      className="fx-inline"
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "restriction", id: "RI-042" },
                        })
                      }
                    >
                      <Val
                        value="não registado"
                        state="UNKNOWN"
                        size="s"
                        prov="facto usado pela VCI →"
                      />
                    </button>
                  ) : (
                    <span data-proposed={proposedAxle}>
                      {truck.firstAxleHeightM?.toFixed(2).replace(".", ",")} m
                      {proposedAxle && (
                        <em className="fx-proposed-tag">proposto</em>
                      )}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Emissões · ADR</dt>
                <dd>
                  {truck.emission} ·{" "}
                  {truck.adrEquipped ? "ADR equipado" : "sem ADR"}
                </dd>
              </div>
              <div>
                <dt>Execução</dt>
                <dd>
                  {maintenance ? (
                    <button
                      className="fx-inline"
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "maintenance", id: truck.id },
                        })
                      }
                    >
                      <Status tone="action">Em manutenção</Status>{" "}
                      <small>atribuída a {job.id} · ver oficina →</small>
                    </button>
                  ) : (
                    <>
                      {job.status === "in_transit" || job.status === "loading"
                        ? "Em serviço em"
                        : "Atribuída a"}{" "}
                      <Id>{job.id}</Id>{" "}
                      <small>disponibilidade manual: disponível</small>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Manutenção</dt>
                <dd>
                  <Status tone={maintenance ? "action" : "neutral"}>
                    {truck.service}
                  </Status>{" "}
                  {truck.id === "T-08" && <small>faltam 7 620 km</small>}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </article>
  );
}

function RangeBar({
  pos,
  range,
  total,
  stop,
  known,
}: {
  pos: number;
  range: number;
  total: number;
  stop: number | null;
  known: boolean;
}) {
  if (!known)
    return (
      <p className="fx-consequence" data-tone="neutral">
        Posição desconhecida: sem relação com o percurso até haver uma posição.
        Autonomia a partir da leitura manual ≈ {range} km para {total} km de
        rota.
      </p>
    );
  const x = (k: number) => `${Math.min(100, (k / total) * 100)}%`;
  return (
    <div className="fx-rangebar">
      <div className="fx-rangebar-track">
        <span className="fx-rangebar-done" style={{ width: x(pos) }} />
        <span
          className="fx-rangebar-range"
          style={{ left: x(pos), width: `calc(${x(pos + range)} - ${x(pos)})` }}
        />
        {stop != null && (
          <span
            className="fx-rangebar-mark"
            data-kind="stop"
            style={{ left: x(stop) }}
          />
        )}
        <span
          className="fx-rangebar-mark"
          data-kind="out"
          style={{ left: x(pos + range) }}
        />
      </div>
      <div className="fx-rangebar-labels">
        <span style={{ left: x(pos) }}>km {pos} · agora</span>
        {stop != null && (
          <span style={{ left: x(stop) }}>Paragem km {stop}</span>
        )}
        <span style={{ left: x(pos + range) }}>esgota ~km {pos + range}</span>
      </div>
      <p className="fx-footnote">
        Faltam {total - pos} km até ao destino; a autonomia estimada cobre{" "}
        {range} km.
        {range >= total - pos
          ? " Chega sem abastecer."
          : " Abastecer na paragem da pausa resolve."}
      </p>
    </div>
  );
}
