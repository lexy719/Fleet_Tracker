import { useState, type CSSProperties } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { NOW, hm } from "../world";
import { Id, Status, Tri } from "./honesty";
import { labWorld } from "./model";
import { FacetBar, facetOf } from "./Facets";
import { RouteManagement } from "./RouteManagement";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
// Reference places on recorded corridors (stops carry their own labels); other
// routes get plain km ticks rather than borrowed place names.
const PLACES_BY_ROUTE: Record<string, [string, number][]> = {
  faro__porto__fastest: [
    ["0", 0],
    ["Grândola", 168],
    ["Marateca", 219],
    ["Carregado", 280],
    ["Aveiro", 487],
    ["556 km", 556],
  ],
};
function axisPlaces(routeId: string, total: number): [string, number][] {
  if (PLACES_BY_ROUTE[routeId]) return PLACES_BY_ROUTE[routeId];
  const step = total > 400 ? 100 : 50;
  const out: [string, number][] = [["0", 0]];
  for (let k = step; k < total - step / 2; k += step) out.push([`${k} km`, k]);
  out.push([`${Math.round(total)} km`, Math.round(total)]);
  return out;
}
/** 340 → "5 h 40"; under an hour stays in minutes. */
const late = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`
    : `${m} min`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Route & Stops = progression along the road and the stop decision on it. */
export function RouteInstrument({ state, act }: Props) {
  const w = labWorld(state);
  const { route, job, candidates } = w;
  const total = route.km;
  const pos = job.positionKm ?? 0;
  const started = job.status === "in_transit" || job.status === "loading";
  const moving = job.status === "in_transit";
  const last = job.stops.at(-1)!;
  const lastEta = /\d/.test(last.eta) ? toMin(last.eta) : null;
  const lateMin = lastEta != null ? lastEta - toMin(last.window[1]) : null;
  const needsBreak = moving && lastEta != null && lastEta > w.limitMin;
  const places = axisPlaces(job.routeId, total);
  const facet = facetOf(state, "Fuel");
  const [why, setWhy] = useState<string | null>(null);
  const breakAt: number | null = w.limitMin;
  // Road labels take the first row where they don't collide with a neighbour
  // (a label is ~30% of the strip wide; end-anchored labels grow leftwards).
  const roadRows = new Map<string, number>();
  const rowEnds: [number, number][][] = [];
  const labelKm = total * 0.3;
  for (const r of [...w.restrictions].sort(
    (a, b) => (a.km ?? 0) - (b.km ?? 0),
  )) {
    const k = r.km ?? 0;
    const span: [number, number] =
      k > total * 0.75 ? [k - labelKm, k] : [k, k + labelKm];
    let row = rowEnds.findIndex((spans) =>
      spans.every(([a, b]) => span[1] < a || span[0] > b),
    );
    if (row < 0 || row > 2) row = Math.min(rowEnds.length, 2);
    (rowEnds[row] ??= []).push(span);
    roadRows.set(r.id, row);
  }
  const unknownRoad = w.restrictions.find((r) => r.result === "UNKNOWN");
  const x = (km: number) => `${(km / total) * 100}%`;
  // Where the break must start: driving left before 4h30, at ~84 km/h on the A1.
  const breakEndKm = pos + ((w.limitMin - NOW.min) / 60) * 84;
  const fuelOutKm = pos + w.rangeKm;
  const rec = w.recommended;
  const chosen = w.selectedStop;
  const lead = chosen ?? rec;
  const segRoad =
    w.restrictions.find((r) => r.id === state.selection.restriction) ??
    unknownRoad ??
    w.restrictions[0];
  const headline =
    facetOf(state, "Fuel") === "stops" && candidates.length
      ? `Escolher a paragem da pausa: ${candidates.filter((c) => c.breakFits).length} de ${candidates.length} cabem antes das ${w.limit}`
      : facetOf(state, "Fuel") === "window"
        ? lateMin != null && lateMin > 0
          ? `Janela de ${last.city}: ${late(lateMin)} de atraso`
          : `Janelas cumpridas · ${last.city} às ${last.eta}`
        : facetOf(state, "Fuel") === "segment" && segRoad
          ? `${segRoad.title.split(" — ")[0]}: ${segRoad.result === "UNKNOWN" ? "aplicabilidade desconhecida" : segRoad.result === "APPLIES" ? "aplica-se" : "não se aplica"}${segRoad.alternative ? ` · alternativa ${segRoad.alternative}` : ""}`
          : rec
            ? chosen && chosen.id !== rec.id
              ? `${short(chosen.name)} escolhida; ${short(rec.name)} é a recomendada`
              : `${short(rec.name)} é a melhor paragem antes da pausa`
            : lateMin != null && lateMin > 0
              ? `Chegada a ${last.city} às ${last.eta}: ${late(lateMin)} depois da janela`
              : !started
                ? `Ainda não partiu · saída de ${job.stops[0].city} às ${job.stops[0].window[0]}`
                : job.status === "loading"
                  ? `Em carga em ${job.stops[0].city} · entrega prevista às ${last.eta}`
                  : needsBreak
                    ? `Pausa obrigatória até ${w.limit} antes da entrega`
                    : `Entrega em ${last.city} às ${last.eta}, sem pausa necessária`;
  const sub = lead
    ? lead.breakFits
      ? `Chega às ${lead.arrival} com ${lead.marginMin} min de margem, abastece ${lead.litres} L e chega a ${job.stops[1].city} às ${lead.coimbraEta}, dentro da janela.`
      : `Chegada às ${lead.arrival} excede o limite de 4h30 em ${-lead.marginMin} min.`
    : lateMin != null && lateMin > 0
      ? `A janela de entrega em ${last.city} é ${last.window.join("–")}. ${job.plan === "REPLAN_REQUIRED" ? `O plano confirmado já não serve: ${job.planNote}.` : "Sem alteração, a entrega fica fora da janela."}`
      : !started
        ? `${Math.round(total)} km previstos até ${last.city}, janela ${last.window.join("–")}. Ainda sem condução nem posição.`
        : needsBreak
          ? "Não há paragens candidatas registadas para esta viagem no laboratório."
          : `O limite de 4h30 chega às ${w.limit}, depois da entrega. Janela ${last.window.join("–")}.`;
  const tone = lead
    ? lead.breakFits
      ? "ok"
      : "action"
    : lateMin != null && lateMin > 0
      ? "action"
      : "ok";
  if (facet === "management" || facet === "comparison")
    return <RouteManagement state={state} act={act} />;
  return (
    <article
      className="fx-instrument fx-route"
      data-tone={tone}
      data-facet={facet}
    >
      <header className="fx-answer">
        <h1>{headline}</h1>
        <p>{sub}</p>
        <div className="fx-answer-meta">
          <span className="fx-who">
            {job.stops[0].city} → {job.stops.at(-1)!.city} · {Math.round(total)}{" "}
            km
          </span>
          <span className="fx-prov-line">
            Rota TomTom gravada {route.retrievedAt.slice(8)} set ·{" "}
            {route.roads.filter((r) => /^A\d/.test(r)).join(" · ")} ·
            <em> postos, preços e parques sintéticos</em>
          </span>
          <FacetBar
            state={state}
            act={act}
            domain="Fuel"
            only={
              candidates.length
                ? undefined
                : ["management", "comparison", "journey", "window", "segment"]
            }
          />
        </div>
      </header>

      <section className="fx-journey" aria-label="Percurso por camadas">
        <div className="fx-guides" aria-hidden>
          {started && <span data-kind="now" style={{ left: x(pos) }} />}
          {candidates.map((c) => (
            <span
              key={c.id}
              data-kind="stop"
              data-chosen={c.id === chosen?.id}
              data-recommended={c.id === rec?.id}
              data-fits={c.breakFits}
              style={{ left: x(c.km) }}
            />
          ))}
          {job.stops
            .filter((st) => !st.completedAt)
            .map((st) => (
              <span
                key={st.id}
                data-kind="delivery"
                style={{ left: x(st.km) }}
              />
            ))}
        </div>

        <Layer name="Motorista" note="tempo legal">
          {!started ? (
            <span
              className="fx-j-band"
              data-kind="after"
              style={{ left: 0, right: 0 }}
            >
              <em>sem condução hoje · início às {job.stops[0].window[0]}</em>
            </span>
          ) : rec || needsBreak ? (
            <>
              <button
                className="fx-j-band"
                data-kind="break"
                data-ix="follow"
                style={{
                  left: x(pos),
                  width: `calc(${x(Math.min(total, breakEndKm))} - ${x(pos)})`,
                }}
                onClick={() =>
                  act(
                    (w.planned ?? rec)
                      ? {
                          type: "follow",
                          object: {
                            kind: "break",
                            stop: (w.planned ?? rec)!.id,
                            at: (w.planned ?? rec)!.arrivalMin,
                            label: `Pausa · ${short((w.planned ?? rec)!.name)}`,
                          },
                        }
                      : {
                          type: "follow",
                          object: {
                            kind: "time",
                            at: breakAt ?? NOW.min,
                            label: "Limite de 4h30",
                          },
                        },
                  )
                }
              >
                <em>pausa até {w.limit} · ver no dia →</em>
              </button>
              <span
                className="fx-j-band"
                data-kind="after"
                style={{ left: x(Math.min(total, breakEndKm)), right: 0 }}
              >
                <em>só depois de 45 min de pausa</em>
              </span>
            </>
          ) : (
            <span
              className="fx-j-band"
              data-kind="range"
              style={{ left: x(pos), right: 0 }}
            >
              <em>chega antes do limite de 4h30 ({w.limit})</em>
            </span>
          )}
        </Layer>
        <Layer name="Viatura" note="autonomia assumida">
          <button
            className="fx-j-band"
            data-kind="range"
            data-ix="follow"
            style={{
              left: x(pos),
              width: `calc(${x(Math.min(fuelOutKm, total))} - ${x(pos)})`,
            }}
            onClick={() => act({ type: "follow", object: { kind: "fuel" } })}
          >
            <em>
              ≈ {w.rangeKm} km com o combustível{" "}
              {w.positionKnown
                ? "estimado"
                : `da leitura manual (${w.truck.fuel.value}%)`}
            </em>
          </button>
          {fuelOutKm < total && (
            <span
              className="fx-j-band"
              data-kind="empty"
              style={{ left: x(fuelOutKm), right: 0 }}
            >
              <em>sem abastecer</em>
            </span>
          )}
        </Layer>
        <Layer name="Rota" note={`${Math.round(total)} km · TomTom`} strong>
          <span className="fx-j-line" />
          <span className="fx-j-done" style={{ width: x(pos) }} />
          {job.stops.map((st, i) => (
            <span
              key={st.id}
              className="fx-j-node"
              data-type={st.type}
              data-done={!!st.completedAt}
              data-edge={
                i === 0
                  ? "start"
                  : i === job.stops.length - 1
                    ? "end"
                    : undefined
              }
              style={{ left: x(st.km) }}
            >
              <b>{st.city}</b>
              <i />
            </span>
          ))}
          {started && (
            <button
              className="fx-j-pos"
              data-ix="follow"
              style={{ left: x(pos) }}
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "driver", id: w.driver.id },
                })
              }
            >
              <b>
                {NOW.clock} · km {pos}
              </b>
              <i />
              <small>posição simulada · {w.driver.name.split(" ")[0]}</small>
            </button>
          )}
          {candidates.map((c, i) => (
            <button
              key={c.id}
              className="fx-j-stop"
              data-row={i % 2}
              data-fits={c.breakFits}
              data-recommended={c.id === rec?.id}
              data-chosen={c.id === chosen?.id}
              data-suitability={c.restriction ? "unknown" : "known"}
              style={
                {
                  left: x(c.km),
                  "--spur": `${18 + c.detourKm * 26}px`,
                } as CSSProperties
              }
              onClick={() => act({ type: "fuel", id: c.id })}
              data-ix="inspect"
              data-map-entity="stop"
              data-entity-id={c.id}
              data-object={`stop:${c.id}`}
            >
              <i className="fx-j-diamond" />
              <span className="fx-j-spur" />
              <span className="fx-j-area" />
              <b>{short(c.name)}</b>
              <small>
                {c.arrival} · +{c.detourKm.toString().replace(".", ",")} km
              </small>
            </button>
          ))}
        </Layer>
        <Layer name="Estrada" note="Road Intelligence">
          {w.restrictions.map((r) => (
            <button
              key={r.id}
              className="fx-j-road"
              data-row={roadRows.get(r.id)}
              data-edge={(r.km ?? 0) > total * 0.75 ? "end" : undefined}
              data-result={r.result}
              data-selected={state.selection.restriction === r.id}
              style={{ left: x(r.km ?? 0) }}
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "restriction", id: r.id },
                })
              }
              data-map-entity="restriction"
              data-entity-id={r.id}
              data-object={`restriction:${r.id}`}
            >
              <i />
              <span>
                {r.title.split(" — ")[0].split(" · ")[0]}
                <em>
                  {r.result === "UNKNOWN"
                    ? "desconhecido"
                    : r.result === "APPLIES"
                      ? "aplica-se"
                      : "não se aplica"}
                </em>
              </span>
            </button>
          ))}
        </Layer>
        <Layer name="Entrega" note="janelas">
          {job.stops
            .filter((st) => !st.completedAt)
            .map((st, i) => {
              const lead =
                st.id === "S2" && chosen ? chosen.coimbraEta : st.eta;
              const end =
                Number(st.window[1].slice(0, 2)) * 60 +
                Number(st.window[1].slice(3));
              const etaMin =
                Number(lead.slice(0, 2)) * 60 + Number(lead.slice(3));
              const slack = end - etaMin;
              return (
                <button
                  key={st.id}
                  data-ix="follow"
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "delivery", stop: st.id },
                    })
                  }
                  className="fx-j-window"
                  data-row={i % 2}
                  data-edge={
                    st.km < total * 0.12
                      ? "start"
                      : st.type === "delivery" || st.km > total * 0.8
                        ? "end"
                        : undefined
                  }
                  data-tone={slack < 0 ? "action" : slack < 20 ? "risk" : "ok"}
                  style={{ left: x(st.km) }}
                >
                  <b>
                    {st.city} · ETA {lead}
                  </b>
                  <em>
                    janela até {st.window[1]} ·{" "}
                    {slack >= 0
                      ? `${slack} min de folga`
                      : `${late(-slack)} de atraso`}
                  </em>
                </button>
              );
            })}
        </Layer>
        <div className="fx-j-axis" aria-hidden>
          {places.map(([name, k]) => (
            <span key={name} style={{ left: x(k) }}>
              <b>{/^\d/.test(name) ? "" : name}</b>
              <small>{/^\d/.test(name) ? name : k}</small>
            </span>
          ))}
        </div>
      </section>

      {facet === "window" && (
        <section className="fx-windows" aria-label="Janelas de entrega">
          <h2>Janelas de entrega</h2>
          {job.stops.map((st) => {
            const eta =
              st.completedAt ??
              (st.id === "S2" && chosen ? chosen.coimbraEta : st.eta);
            const known = /\d/.test(eta);
            const slack = known ? toMin(st.window[1]) - toMin(eta) : null;
            const a = toMin(st.window[0]),
              b = toMin(st.window[1]);
            const span = [6 * 60, 20 * 60];
            const px = (m: number) =>
              `${((m - span[0]) / (span[1] - span[0])) * 100}%`;
            return (
              <button
                key={st.id}
                className="fx-window-row"
                data-ix="follow"
                data-done={!!st.completedAt}
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "delivery", stop: st.id },
                  })
                }
              >
                <span className="fx-window-name">
                  <b>{st.city}</b>
                  <small>
                    {st.type === "pickup"
                      ? "carga"
                      : st.type === "stop"
                        ? "descarga parcial"
                        : "entrega final"}
                  </small>
                </span>
                <span className="fx-window-track">
                  <i
                    className="fx-window-span"
                    style={{ left: px(a), width: `calc(${px(b)} - ${px(a)})` }}
                  />
                  {known && (
                    <i
                      className="fx-window-eta"
                      data-tone={
                        slack! < 0 ? "action" : slack! < 20 ? "risk" : "ok"
                      }
                      style={{ left: px(toMin(eta)) }}
                    />
                  )}
                  <i className="fx-window-now" style={{ left: px(NOW.min) }} />
                </span>
                <span className="fx-window-text">
                  {st.completedAt ? `✓ ${st.completedAt}` : `ETA ${eta}`} ·
                  janela {st.window.join("–")}
                  <small>
                    {slack == null
                      ? "sem estimativa"
                      : st.completedAt
                        ? "concluída"
                        : slack >= 0
                          ? `${slack} min de folga`
                          : `${late(-slack)} de atraso`}
                  </small>
                </span>
              </button>
            );
          })}
          <p className="fx-footnote">
            ETA do laboratório (sem motor de tempo): ver o efeito da paragem
            escolhida em Paragens.
          </p>
        </section>
      )}
      {facet === "segment" && (
        <section className="fx-segments" aria-label="Troços com condições">
          <h2>Troços com condições nesta rota</h2>
          {w.restrictions.map((r) => (
            <div
              key={r.id}
              className="fx-segment-row"
              data-result={r.result}
              data-selected={state.selection.restriction === r.id}
            >
              <button
                className="fx-inline"
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "restriction", id: r.id },
                  })
                }
              >
                <b>{r.title.split(" — ")[0]}</b>
                <small>
                  km {r.km ?? "—"} ·{" "}
                  {r.result === "UNKNOWN"
                    ? "desconhecido"
                    : r.result === "APPLIES"
                      ? "aplica-se"
                      : "não se aplica"}
                </small>
              </button>
              {r.altLines ? (
                <button
                  className="fx-btn"
                  data-kind="quiet"
                  data-ix="spatial"
                  aria-pressed={state.selection.restriction === r.id}
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "alternative", id: r.id },
                    })
                  }
                >
                  Ver {r.alternative} no mapa
                </button>
              ) : (
                <small className="fx-quiet">sem alternativa registada</small>
              )}
            </div>
          ))}
          <p className="fx-footnote">
            A alternativa é geometria oficial gravada; o tempo da alternativa
            exige recálculo e não é inventado.
          </p>
        </section>
      )}
      {facet === "window" || facet === "segment" ? null : candidates.length ===
        0 ? (
        <section className="fx-decision">
          <p
            className="fx-consequence"
            data-tone={lateMin != null && lateMin > 0 ? "action" : "neutral"}
          >
            {lateMin != null && lateMin > 0
              ? `Para cumprir a janela ${last.window.join("–")} é preciso rever a partida ou a rota.`
              : needsBreak
                ? "Esta viagem precisa de uma pausa, mas o laboratório não tem paragens candidatas registadas para esta rota."
                : "Não é necessária nenhuma paragem para pausa ou abastecimento antes da entrega."}
            {unknownRoad && (
              <>
                {" "}
                {unknownRoad.title.split(" — ")[0]}: aplicabilidade
                desconhecida.{" "}
                <button
                  className="fx-link"
                  data-ix="follow"
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "restriction", id: unknownRoad.id },
                    })
                  }
                >
                  Ver restrição →
                </button>
              </>
            )}
          </p>
        </section>
      ) : (
        <section className="fx-decision">
          <div className="fx-decision-head">
            <h2>Paragens para pausa e abastecimento</h2>
            <span className="fx-legend">
              <span data-mark="recommended">Recomendada pelo sistema</span>
              <span data-mark="chosen">Escolha do operador</span>
            </span>
            {state.pending?.kind === "stop" ? (
              <button
                className="fx-btn"
                data-kind="quiet"
                data-ix="propose"
                onClick={() => act({ type: "discard" })}
              >
                Retirar proposta
              </button>
            ) : (
              rec &&
              w.planned &&
              w.planned.id !== rec.id && (
                <button
                  className="fx-btn"
                  data-kind="quiet"
                  data-ix="propose"
                  onClick={() =>
                    act({ type: "stage-stop", id: rec.id, from: w.planned!.id })
                  }
                >
                  Voltar à recomendada
                </button>
              )
            )}
          </div>
          <table className="fx-grid">
            <thead>
              <tr>
                <th>Paragem</th>
                <th>Chegada</th>
                <th>km · desvio</th>
                <th>Pausa 4h30</th>
                <th>{job.stops[1].city}</th>
                <th>300 L</th>
                <th>Restrições</th>
                <th aria-label="Ação" />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  data-ix="inspect"
                  data-proposed={
                    state.pending?.kind === "stop" && state.pending.id === c.id
                  }
                  data-recommended={c.id === rec?.id}
                  data-chosen={c.id === chosen?.id}
                  data-fits={c.breakFits}
                  data-map-entity="stop"
                  data-entity-id={c.id}
                  onClick={() => act({ type: "fuel", id: c.id })}
                >
                  <td>
                    <b>{short(c.name)}</b>
                    <small>
                      {c.road.replace(" · sentido norte", "")} · {c.parking}{" "}
                      lugares · <Id>{c.id}</Id>
                    </small>
                    {c.id === rec?.id && (
                      <span className="fx-rec">Recomendada</span>
                    )}
                    {c.id === chosen?.id && (
                      <span className="fx-chosen">✓ Escolhida</span>
                    )}
                  </td>
                  <td className="fx-num">{c.arrival}</td>
                  <td className="fx-num">
                    {c.km}
                    <small>+{c.detourKm.toString().replace(".", ",")} km</small>
                  </td>
                  <td className="fx-nowrap">
                    <Tri outcome={c.breakFits ? "yes" : "no"} />{" "}
                    {c.breakFits
                      ? `${c.marginMin} min`
                      : `+${-c.marginMin} min`}
                    <small>
                      {c.breakFits ? "de margem" : "além do limite"}
                    </small>
                    {!c.breakFits && (
                      <button
                        className="fx-link"
                        data-ix="inspect"
                        aria-expanded={why === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setWhy(why === c.id ? null : c.id);
                        }}
                      >
                        porquê?
                      </button>
                    )}
                    {why === c.id && (
                      <small className="fx-why">
                        Chega às {c.arrival}; o limite de 4h30 é às {w.limit}.
                        Conduzir até lá excede a condução contínua em{" "}
                        {-c.marginMin} min.
                      </small>
                    )}
                  </td>
                  <td className="fx-num">
                    {c.coimbraEta}
                    <small>até {job.stops[1].window[1]}</small>
                  </td>
                  <td className="fx-num">
                    {(c.priceEurL * c.litres).toLocaleString("pt-PT", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    €
                    <small>
                      {c.priceEurL.toFixed(2).replace(".", ",")} €/L
                    </small>
                  </td>
                  <td>
                    {c.restriction ? (
                      <Status tone="risk">Acesso saída 11</Status>
                    ) : (
                      <span className="fx-quiet">—</span>
                    )}
                  </td>
                  <td>
                    {c.id !== (w.planned?.id ?? rec?.id) && c.breakFits && (
                      <button
                        className="fx-btn"
                        data-ix="propose"
                        onClick={(e) => {
                          e.stopPropagation();
                          act({
                            type: "stage-stop",
                            id: c.id,
                            from: w.planned?.id ?? rec?.id ?? c.id,
                          });
                        }}
                      >
                        {state.pending?.kind === "stop" &&
                        state.pending.id === c.id
                          ? "Proposta"
                          : "Propor"}
                      </button>
                    )}
                    {c.id === (w.planned?.id ?? rec?.id) && (
                      <span className="fx-quiet">No plano</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fx-consequence" data-tone="neutral">
            A pausa às {(w.planned ?? lead)?.arrival ?? hm(NOW.min)} reinicia a
            condução contínua; a chegada a {last.city} fica às {last.eta},{" "}
            {lateMin != null && lateMin > 0
              ? `${late(lateMin)} depois`
              : "antes"}{" "}
            da janela {last.window.join("–")}.
            {unknownRoad && (
              <>
                {" "}
                Na {unknownRoad.title.split(" — ")[0].split(" · ")[0]}, a
                aplicabilidade continua desconhecida.{" "}
                <button
                  className="fx-link"
                  data-ix="follow"
                  onClick={() =>
                    act({
                      type: "follow",
                      object: { kind: "restriction", id: unknownRoad.id },
                    })
                  }
                >
                  Ver restrição →
                </button>
              </>
            )}
          </p>
        </section>
      )}
    </article>
  );
}
const short = (name: string) => name.replace("Área de serviço de ", "");

/** One layer of the same journey: a label gutter and a track on the shared km axis. */
function Layer({
  name,
  note,
  strong,
  children,
}: {
  name: string;
  note: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fx-j-layer" data-strong={!!strong} data-layer={name}>
      <span className="fx-j-label">
        {name}
        <small>{note}</small>
      </span>
      <div className="fx-j-track">{children}</div>
    </div>
  );
}
