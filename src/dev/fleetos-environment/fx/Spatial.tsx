import type { GuidedAction, GuidedLens, GuidedState } from "../guidedWorkspace";
import { NOW, SPELL_LIMIT, dur, hm } from "../world";
import { Id, Plate, Status, Tri, type Tone } from "./honesty";
import { labWorld, LENS_LABEL } from "./model";
import { DriverInstrument } from "./DriverInstrument";
import { TruckInstrument } from "./TruckInstrument";
import { RouteInstrument } from "./RouteInstrument";
import { DossierInstrument } from "./DossierInstrument";
import { RestrictionInstrument } from "./RestrictionInstrument";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
const VERDICT = {
  APPLIES: "Aplica-se",
  DOES_NOT_APPLY: "Não se aplica",
  UNKNOWN: "Desconhecido",
} as const;
const VTONE: Record<keyof typeof VERDICT, Tone> = {
  APPLIES: "action",
  DOES_NOT_APPLY: "ok",
  UNKNOWN: "unknown",
};
const short = (n: string) => n.replace("Área de serviço de ", "");

/**
 * Spatial mode: the lead instrument compresses into an inspector shaped by its
 * lens. Each inspector keeps the instrument's question and its relationships;
 * nothing here is a different page.
 */
export function SpatialInspector({
  state,
  act,
  lens,
}: Props & { lens: GuidedLens | null }) {
  // Expanding the map must retain an explicitly chosen working question.
  // The normal spatial summary is only the default, not a replacement for it.
  if (lens && lens in state.facet) {
    if (lens === "Drivers") return <DriverInstrument state={state} act={act} />;
    if (lens === "Trucks") return <TruckInstrument state={state} act={act} />;
    if (lens === "Fuel") return <RouteInstrument state={state} act={act} />;
    if (lens === "Documents")
      return <DossierInstrument state={state} act={act} />;
    if (lens === "Restrictions")
      return <RestrictionInstrument state={state} act={act} />;
  }
  if (lens === "Drivers") return <DriverSpatial state={state} act={act} />;
  if (lens === "Trucks") return <TruckSpatial state={state} act={act} />;
  if (lens === "Fuel") return <RouteSpatial state={state} act={act} />;
  if (lens === "Restrictions")
    return <RestrictionSpatial state={state} act={act} />;
  if (lens === "Documents") return <DocumentsSpatial state={state} act={act} />;
  return <OverviewSpatial state={state} act={act} />;
}

function Shell({
  kind,
  title,
  sub,
  children,
  kicker,
}: {
  kind: string;
  title: string;
  sub: string;
  children: React.ReactNode;
  kicker?: string;
}) {
  return (
    <article className="fx-spatial" data-kind={kind}>
      <header>
        <small>{kicker ?? `Modo espacial · ${kind}`}</small>
        <h2>{title}</h2>
        <p>{sub}</p>
      </header>
      {children}
    </article>
  );
}

export function DriverSpatial({
  state,
  act,
  kicker,
}: Props & { kicker?: string }) {
  const w = labWorld(state);
  const stop = w.selectedStop ?? w.planned;
  const cpc = w.driver.qualifications.find((q) => q.kind === "cpc")!;
  const pct = Math.min(100, (w.driver.spellMin / SPELL_LIMIT) * 100);
  return (
    <Shell
      kicker={kicker}
      kind="Motorista"
      title={w.driver.name}
      sub={`${w.job.id} · ${w.job.stops[0].city} → ${w.job.stops.at(-1)!.city}`}
    >
      <div className="fx-spatial-meter">
        <span>
          <b>{dur(w.driver.spellMin)}</b> / 4h30
        </span>
        <i style={{ width: `${pct}%` }} data-near={pct > 80} />
        <small>limite às {w.limit}</small>
      </div>
      <ul className="fx-spatial-list">
        {stop && (
          <li>
            <button
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: {
                    kind: "break",
                    stop: stop.id,
                    at: stop.arrivalMin,
                    label: `Pausa · ${short(stop.name)}`,
                  },
                })
              }
            >
              <small>A seguir</small>
              <b>
                {stop.arrival} · pausa em {short(stop.name)}
              </b>
              <span>
                {stop.breakFits
                  ? `${stop.marginMin} min de margem`
                  : "excede o limite"}
              </span>
            </button>
          </li>
        )}
        {w.job.stops
          .filter((s) => !s.completedAt)
          .map((s) => (
            <li key={s.id}>
              <button
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "delivery", stop: s.id },
                  })
                }
              >
                <small>{s.type === "pickup" ? "Carga" : "Entrega"}</small>
                <b>
                  {s.eta} · {s.city}
                </b>
                <span>janela {s.window.join("–")}</span>
              </button>
            </li>
          ))}
        <li>
          <button
            data-ix="follow"
            onClick={() =>
              act({
                type: "follow",
                object: {
                  kind: "qualification",
                  driver: w.driver.id,
                  qual: "cpc",
                },
              })
            }
          >
            <small>CQM</small>
            <b>
              <Status
                tone={
                  cpc.state === "VALID"
                    ? "ok"
                    : cpc.state === "EXPIRED"
                      ? "action"
                      : "risk"
                }
              >
                {cpc.state === "VALID"
                  ? "válido"
                  : cpc.state === "EXPIRED"
                    ? "caducado"
                    : `até ${cpc.until}`}
              </Status>
            </b>
          </button>
        </li>
        <li>
          <button
            data-ix="follow"
            onClick={() =>
              act({ type: "follow", object: { kind: "truck", id: w.truck.id } })
            }
          >
            <small>Conjunto</small>
            <b>
              <Plate small>{w.truck.plate}</Plate>{" "}
              {w.trailer ? <Id>{w.trailer.id}</Id> : "sem reboque"}
            </b>
            {state.active.includes("Trucks") && (
              <span>
                combustível{" "}
                {w.positionKnown
                  ? `≈ ${Math.round(w.fuelNowPct)}%`
                  : `${w.truck.fuel.value}%`}{" "}
                · ≈ {w.rangeKm} km · {w.pallets}/{w.trailer?.pallets ?? "?"}{" "}
                paletes
              </span>
            )}
          </button>
        </li>
      </ul>
      <Context state={state} />
    </Shell>
  );
}

export function TruckSpatial({
  state,
  act,
  kicker,
}: Props & { kicker?: string }) {
  const w = labWorld(state);
  const next = w.job.stops.find((s) => !s.completedAt);
  const road = w.restrictions.filter((r) => r.result !== "DOES_NOT_APPLY");
  return (
    <Shell
      kicker={kicker}
      kind="Viatura"
      title={`${w.truck.plate} · ${w.truck.make} ${w.truck.model}`}
      sub={
        w.trailer
          ? `+ ${w.trailer.type.toLowerCase()} ${w.trailer.id} · ${w.pallets}/${w.trailer.pallets} paletes`
          : `Reboque ${w.job.trailerId} não existe`
      }
    >
      <div className="fx-spatial-facts">
        <button
          data-ix="follow"
          onClick={() => act({ type: "follow", object: { kind: "fuel" } })}
        >
          <small>Combustível</small>
          <b>
            {w.positionKnown
              ? `≈ ${Math.round(w.fuelNowPct)}%`
              : `${w.truck.fuel.value}%`}
          </b>
          <span>
            ≈ {w.rangeKm} km · {w.positionKnown ? "estimado" : "leitura manual"}
          </span>
        </button>
        <button
          data-ix="follow"
          onClick={() =>
            act({ type: "follow", object: { kind: "driver", id: w.driver.id } })
          }
        >
          <small>Motorista</small>
          <b>{w.driver.name}</b>
          <span>{dur(w.driver.spellMin)} de condução</span>
        </button>
        {next && (
          <button
            data-ix="follow"
            onClick={() =>
              act({
                type: "follow",
                object: { kind: "delivery", stop: next.id },
              })
            }
          >
            <small>Próxima paragem</small>
            <b>{next.city}</b>
            <span>ETA {next.eta}</span>
          </button>
        )}
        <button
          data-ix="follow"
          onClick={() =>
            act({ type: "follow", object: { kind: "job", id: w.job.id } })
          }
        >
          <small>Transporte</small>
          <b>{w.job.id}</b>
          <span>
            {w.positionKnown
              ? `km ${w.job.positionKm} · posição simulada`
              : "posição desconhecida"}
          </span>
        </button>
      </div>
      {road.length > 0 && (
        <ul className="fx-spatial-list">
          {road.map((r) => (
            <li key={r.id}>
              <button
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "restriction", id: r.id },
                  })
                }
                data-map-entity="restriction"
                data-entity-id={r.id}
              >
                <small>Na rota</small>
                <b>{r.title.split(" — ")[0]}</b>
                <Status tone={VTONE[r.result]}>{VERDICT[r.result]}</Status>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Context state={state} />
    </Shell>
  );
}

/** Route in spatial mode: a bottom journey strip linked both ways with the map. */
function RouteSpatial({ state, act }: Props) {
  const w = labWorld(state);
  const total = w.route.km;
  const x = (k: number) => `${Math.min(100, Math.max(0, (k / total) * 100))}%`;
  const chosen =
    w.candidates.find((c) => c.id === state.selection.fuel) ?? w.planned;
  return (
    <article className="fx-spatial fx-spatial-strip" data-kind="Percurso">
      <header>
        <small>Modo espacial · Percurso e paragens</small>
        <h2>
          {w.job.stops[0].city} → {w.job.stops.at(-1)!.city} ·{" "}
          {Math.round(total)} km
        </h2>
        <p>
          {chosen
            ? `Pausa em ${short(chosen.name)} às ${chosen.arrival} · `
            : ""}
          entrega {w.job.stops.at(-1)!.eta} · selecionar aqui ou no mapa
        </p>
      </header>
      <div className="fx-spatial-track">
        <span className="fx-spatial-line" />
        {w.positionKnown && (
          <span
            className="fx-spatial-done"
            style={{ width: x(w.job.positionKm ?? 0) }}
          />
        )}
        {w.job.stops.map((s) => (
          <button
            key={s.id}
            className="fx-spatial-node"
            data-ix="follow"
            data-done={!!s.completedAt}
            style={{ left: x(s.km) }}
            onClick={() =>
              act({ type: "follow", object: { kind: "delivery", stop: s.id } })
            }
          >
            <i />
            <b>{s.city}</b>
            <small>{s.completedAt ? `✓ ${s.completedAt}` : s.eta}</small>
          </button>
        ))}
        {w.candidates.map((c, i) => (
          <button
            key={c.id}
            className="fx-spatial-stop"
            data-ix="inspect"
            data-row={i % 2}
            data-chosen={c.id === chosen?.id}
            data-fits={c.breakFits}
            data-map-entity="stop"
            data-entity-id={c.id}
            style={{ left: x(c.km) }}
            onClick={() => act({ type: "fuel", id: c.id })}
          >
            <i />
            <b>{short(c.name)}</b>
            <small>{c.arrival}</small>
          </button>
        ))}
        {w.restrictions.map((r, i) => (
          <button
            key={r.id}
            className="fx-spatial-road"
            data-row={i % 3}
            data-edge={(r.km ?? 0) > total * 0.8 ? "end" : undefined}
            data-ix="follow"
            data-result={r.result}
            data-selected={state.selection.restriction === r.id}
            data-map-entity="restriction"
            data-entity-id={r.id}
            style={{ left: x(r.km ?? 0) }}
            onClick={() =>
              act({ type: "follow", object: { kind: "restriction", id: r.id } })
            }
          >
            <i />
            {r.title.split(" — ")[0].split(" · ")[0]}
          </button>
        ))}
        {w.positionKnown && (
          <span
            className="fx-spatial-now"
            style={{ left: x(w.job.positionKm ?? 0) }}
          >
            {NOW.clock}
          </span>
        )}
      </div>
      <div className="fx-spatial-actions">
        {chosen &&
          w.planned &&
          chosen.id !== w.planned.id &&
          chosen.breakFits && (
            <button
              className="fx-btn"
              data-ix="propose"
              onClick={() =>
                act({ type: "stage-stop", id: chosen.id, from: w.planned!.id })
              }
            >
              Propor {short(chosen.name)}
            </button>
          )}
        {w.restrictions
          .filter((r) => r.altLines)
          .map((r) => (
            <button
              key={r.id}
              className="fx-btn"
              data-kind="quiet"
              data-ix="spatial"
              aria-pressed={
                state.spatial.question === "AFFECTED_SEGMENT" &&
                state.selection.restriction === r.id
              }
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "alternative", id: r.id },
                })
              }
            >
              {r.title.split(" — ")[0]} vs {r.alternative}
            </button>
          ))}
      </div>
    </article>
  );
}

export function RestrictionSpatial({
  state,
  act,
  kicker,
}: Props & { kicker?: string }) {
  const w = labWorld(state);
  const r = w.restriction;
  const facts = [...r.all, ...r.exemptions].filter(
    (p) => p.outcome !== "yes" || p.part,
  );
  return (
    <Shell
      kicker={kicker}
      kind="Restrições"
      title={r.title.split(" — ")[0]}
      sub={r.where}
    >
      <div className="fx-spatial-verdict" data-result={r.result}>
        <Status tone={VTONE[r.result]}>{VERDICT[r.result]}</Status>
        <p>{r.answer}</p>
      </div>
      <ul className="fx-spatial-logic">
        {facts.map((p) => (
          <li key={p.label}>
            <button
              data-ix="follow"
              onClick={() =>
                act(
                  p.part
                    ? { type: "follow", object: { kind: "fact", part: p.part } }
                    : p.fact.startsWith("authorization")
                      ? {
                          type: "edit",
                          kind: "authorization",
                          target: w.truck.id,
                        }
                      : {
                          type: "follow",
                          object: { kind: "restriction", id: r.id },
                        },
                )
              }
            >
              <Tri outcome={p.outcome} />
              <span>
                {p.label}
                <em>{p.value}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="fx-spatial-cons">{r.consequence}</p>
      {r.altLines && (
        <button
          className="fx-btn"
          data-kind="quiet"
          data-ix="follow"
          onClick={() =>
            act({ type: "follow", object: { kind: "alternative", id: r.id } })
          }
        >
          Alternativa {r.alternative} no percurso →
        </button>
      )}
      <Context state={state} />
    </Shell>
  );
}

function DocumentsSpatial({ state, act }: Props) {
  const w = labWorld(state);
  const cmr = w.ledger[0];
  return (
    <Shell
      kind="Documentos"
      title={`${cmr.title} · ${cmr.stateText}`}
      sub={cmr.number ?? cmr.reason ?? ""}
    >
      <ul className="fx-spatial-list">
        {w.job.stops.map((s) => (
          <li key={s.id}>
            <button
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "delivery", stop: s.id },
                })
              }
            >
              <small>
                {s.type === "pickup" ? "Tomada a cargo" : "Entrega"}
              </small>
              <b>{s.city}</b>
              <span>{s.site}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            data-ix="follow"
            onClick={() =>
              act({ type: "follow", object: { kind: "document", id: cmr.id } })
            }
          >
            <small>Dossier</small>
            <b>Abrir o dossier</b>
          </button>
        </li>
      </ul>
      <Context state={state} />
    </Shell>
  );
}

function OverviewSpatial({ state, act }: Props) {
  const w = labWorld(state);
  const next = w.job.stops.find((s) => !s.completedAt);
  const threats = w.restrictions.filter((r) => r.result !== "DOES_NOT_APPLY");
  return (
    <Shell
      kind="Transporte"
      title={`${w.job.id} · ${w.job.stops[0].city} → ${w.job.stops.at(-1)!.city}`}
      sub={w.job.client}
    >
      <ul className="fx-spatial-list">
        <li>
          <button
            data-ix="spatial"
            onClick={() =>
              act({
                type: "spatial",
                intent: {
                  question: "RESOURCE_AND_JOB",
                  target: "resource",
                  source: "user",
                },
              })
            }
          >
            <small>Agora</small>
            <b>
              {w.positionKnown
                ? `${w.context.location} · km ${w.job.positionKm}`
                : "Posição desconhecida"}
            </b>
            <span>
              {w.positionKnown
                ? "posição simulada · enquadrar"
                : "sem telemetria"}
            </span>
          </button>
        </li>
        {next && (
          <li>
            <button
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "delivery", stop: next.id },
                })
              }
            >
              <small>A seguir</small>
              <b>
                {next.city} · ETA {next.eta}
              </b>
              <span>janela {next.window.join("–")}</span>
            </button>
          </li>
        )}
        {w.planned && (
          <li>
            <button
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "stop", id: w.planned!.id },
                })
              }
            >
              <small>Próximo evento</small>
              <b>
                Pausa · {short(w.planned.name)} {w.planned.arrival}
              </b>
            </button>
          </li>
        )}
        <li>
          <button
            data-ix="follow"
            onClick={() =>
              act({
                type: "follow",
                object: { kind: "driver", id: w.driver.id },
              })
            }
          >
            <small>Motorista</small>
            <b>{w.driver.name}</b>
            <span>
              {dur(w.driver.spellMin)} · limite {hm(w.limitMin)}
            </span>
          </button>
        </li>
        <li>
          <button
            data-ix="follow"
            onClick={() =>
              act({ type: "follow", object: { kind: "truck", id: w.truck.id } })
            }
          >
            <small>Viatura</small>
            <b>
              <Plate small>{w.truck.plate}</Plate>
            </b>
          </button>
        </li>
        {threats.map((r) => (
          <li key={r.id}>
            <button
              data-ix="follow"
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "restriction", id: r.id },
                })
              }
              data-map-entity="restriction"
              data-entity-id={r.id}
            >
              <small>Ameaça</small>
              <b>{r.title.split(" — ")[0]}</b>
              <Status tone={VTONE[r.result]}>{VERDICT[r.result]}</Status>
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** Context from other active lenses, phrased for the lead's question. */
function Context({ state }: { state: GuidedState }) {
  const others = state.active.filter(
    (l) =>
      l !== state.lead &&
      l !== "Jobs" &&
      l !== "Pricing DEV" &&
      l !== "Compliance DEV",
  );
  if (!others.length) return null;
  return (
    <div className="fx-spatial-context">
      <small>
        Com {others.map((l) => LENS_LABEL[l].toLowerCase()).join(", ")}
      </small>
    </div>
  );
}

/** A small card for a supporting lens in spatial mode. */
export function ContextCard({
  state,
  act,
  lenses,
}: Props & { lenses: GuidedLens[] }) {
  const w = labWorld(state);
  const cmr = w.ledger[0];
  const cpc = w.driver.qualifications.find((q) => q.kind === "cpc")!;
  const worst =
    w.restrictions.find((r) => r.result === "UNKNOWN") ??
    w.restrictions.find((r) => r.result === "APPLIES") ??
    w.restrictions[0];
  const stop = w.selectedStop ?? w.planned;
  const link = (kind: string, id: string) => {
    const current =
      state.anchor.kind === kind &&
      "id" in state.anchor &&
      state.anchor.id === id;
    return { disabled: current, "data-ix": current ? undefined : "follow" };
  };
  return (
    <aside className="fx-context-card" aria-label="Contexto">
      {lenses.map((l) => (
        <div key={l} data-context-domain={l}>
          <small>{LENS_LABEL[l]}</small>
          {l === "Drivers" && (
            <button
              {...link("driver", w.driver.id)}
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "driver", id: w.driver.id },
                })
              }
            >
              <b>{w.driver.name}</b> · {dur(w.driver.spellMin)} · CQM{" "}
              {cpc.state === "VALID"
                ? "válido"
                : cpc.state === "EXPIRED"
                  ? "caducado"
                  : `até ${cpc.until}`}
            </button>
          )}
          {l === "Trucks" && (
            <button
              {...link("truck", w.truck.id)}
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "truck", id: w.truck.id },
                })
              }
            >
              <b>{w.truck.plate}</b> · {w.trailer?.id ?? "sem reboque"} ·
              combustível{" "}
              {w.positionKnown
                ? `≈ ${Math.round(w.fuelNowPct)}%`
                : `${w.truck.fuel.value}%`}
            </button>
          )}
          {l === "Documents" && (
            <button
              {...link("document", cmr.id)}
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "document", id: cmr.id },
                })
              }
            >
              <b>{cmr.title}</b> ·{" "}
              {cmr.state === "ISSUED" && cmr.diverges
                ? `difere em ${cmr.diverges} campos`
                : cmr.stateText.toLowerCase()}
              {state.lead === "Drivers" &&
                ` · ${w.driver.name.split(" ")[0]} na guia`}
            </button>
          )}
          {l === "Restrictions" && worst && (
            <button
              {...link("restriction", worst.id)}
              onClick={() =>
                act({
                  type: "follow",
                  object: { kind: "restriction", id: worst.id },
                })
              }
              data-map-entity="restriction"
              data-entity-id={worst.id}
            >
              <b>{worst.title.split(" — ")[0]}</b> ·{" "}
              {VERDICT[worst.result].toLowerCase()}
            </button>
          )}
          {l === "Restrictions" && !worst && (
            <p>Sem condições registadas para este percurso.</p>
          )}
          {l === "Fuel" && (
            <button
              {...link("stop", stop?.id ?? "")}
              onClick={() =>
                act(
                  stop
                    ? { type: "follow", object: { kind: "stop", id: stop.id } }
                    : { type: "open", domain: "Fuel" },
                )
              }
            >
              {stop ? (
                <>
                  <b>{short(stop.name)}</b> · {stop.arrival}
                </>
              ) : (
                <>
                  <b>Sem paragem necessária</b>
                </>
              )}
            </button>
          )}
          {l === "Jobs" && (
            <button
              {...link("job", w.job.id)}
              onClick={() =>
                act({ type: "follow", object: { kind: "job", id: w.job.id } })
              }
            >
              <b>{w.job.id}</b> · {w.job.stops.at(-1)!.city}{" "}
              {w.job.stops.at(-1)!.eta}
            </button>
          )}
        </div>
      ))}
    </aside>
  );
}
