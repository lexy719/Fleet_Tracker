import { memo, type CSSProperties } from "react";
import {
  anchorJob,
  type GuidedAction,
  type GuidedState,
} from "../guidedWorkspace";
import type { RegionPlacement } from "../entityComposition";
import { ANCHOR_LENS, entityLayers, entityRecipe, isEntity } from "../entityRecipes";
import type { EntityRef, OperationalValue } from "../engine/contracts";
import { minOf, providerFor } from "../engine/synthetic";
import {
  NOW,
  SPELL_LIMIT,
  DAY_LIMIT,
  TRAILERS,
  WORLD_JOBS,
  dur,
  hm,
  stopCandidates,
} from "../world";
import { isProposed } from "../edits";
import { DossierInstrument } from "./DossierInstrument";
import { RestrictionInstrument } from "./RestrictionInstrument";
import { Id, Plate, Status, Tri, type Tone } from "./honesty";
import { labWorld, LENS_LABEL } from "./model";
import { DriverInstrument } from "./DriverInstrument";
import { TruckInstrument } from "./TruckInstrument";
import { RouteInstrument } from "./RouteInstrument";
import { ContextCard, RestrictionSpatial } from "./Spatial";

type Props = { state: GuidedState; act: (a: GuidedAction) => void };
/** Facts named for people, not for the schema. */
const FACT_LABEL: Record<string, string> = {
  "vehicle.firstAxleHeightM": "altura ao 1.º eixo",
  "authorization.pt-vci-habilitacao": "habilitação VCI",
  "authorization.pt-imt-aet": "autorização IMT",
};
const KIND_LABEL: Record<EntityRef["kind"], string> = {
  job: "Transporte",
  driver: "Motorista",
  truck: "Viatura",
  trailer: "Reboque",
  document: "Documento",
  restriction: "Restrição",
  stop: "Paragem",
};
const at = (ms: number) => hm(minOf(ms));
const IMPACT: Record<
  "PASS" | "FAIL" | "UNKNOWN",
  { word: string; tone: Tone }
> = {
  PASS: { word: "Não se aplica", tone: "ok" },
  FAIL: { word: "Aplica-se", tone: "action" },
  UNKNOWN: { word: "Desconhecido", tone: "unknown" },
};
type PassageImpact = {
  r: { title: string };
  i: { status: keyof typeof IMPACT; passage: OperationalValue<number> };
};
function passageHeadline(worst: PassageImpact | undefined) {
  return worst
    ? worst.i.passage.status === "UNKNOWN"
      ? `${worst.r.title.split(" — ")[0]}: ${IMPACT[worst.i.status].word.toLowerCase()}`
      : `Passa na ${worst.r.title.split(" — ")[0].split(" · ")[0]} às ${at(worst.i.passage.value)} · ${IMPACT[worst.i.status].word.toLowerCase()}`
    : "Sem troços condicionados no trajeto";
}
function driverPassageReading(state: GuidedState) {
  const w = labWorld(state),
    p = providerFor(state),
    job = anchorJob(state.anchor)!;
  const impacts = w.restrictions.map((r) => ({
    r,
    i: p.getRestrictionImpact(job, r.id),
  }));
  const worst =
    impacts.find((x) => x.i.status === "UNKNOWN") ??
    impacts.find((x) => x.i.status === "FAIL") ??
    impacts[0];
  return {
    title: passageHeadline(worst),
    detail: `${w.driver.name} · ${dur(w.driver.spellMin)} de condução · cada troço no eixo do dia, à hora a que o motorista lá chega.`,
  };
}
/** An operational value with its honesty: simulated, assumed or unknown with the reason. */
function V({
  v,
  fmt,
}: {
  v: OperationalValue<number>;
  fmt: (n: number) => string;
}) {
  if (v.status === "UNKNOWN")
    return (
      <span className="fx-ev" data-status="unknown" title={v.reason}>
        desconhecido
      </span>
    );
  return (
    <span
      className="fx-ev"
      data-status={v.status === "ASSUMED" ? "assumed" : v.source}
    >
      {fmt(v.value)}
    </span>
  );
}
/** Every named object opens its own entity composition (a transport opens its 5.7K workspace). */
export const entityAct = (
  ref: EntityRef,
  job: string | null,
): GuidedAction | null =>
  ref.kind === "job"
    ? { type: "follow", object: { kind: "job", id: ref.id } }
    : { type: "entity", kind: ref.kind, id: ref.id, job };

/** One region of an entity composition, rendered by its representation. */
export const EntityRegion = memo(
  function EntityRegion({
    region,
    state,
    act,
  }: Props & { region: RegionPlacement }) {
    const layers = entityLayers(state);
    const recipe = entityRecipe(state);
    if (isEntity(state.anchor)) {
      const p = providerFor(state);
      const job = anchorJob(state.anchor);
      const node = p.entity({ kind: state.anchor.kind, id: state.anchor.id });
      if (!node || (job && !p.entity({ kind: "job", id: job })))
        return <EntityUnavailable state={state} region={region} act={act} missing />;
      // Unassigned objects must never inherit J-4217's driver, cargo or journey.
      if (!job && !["trailer-sheet", "trailer-fit", "entity-facts", "restriction-transports"].includes(region.rep))
        return <EntityUnavailable state={state} region={region} act={act} />;
    }
    const joined =
      recipe === "TRUCK_WITH_DRIVER" || recipe === "DRIVER_AND_VEHICLE";
    switch (region.rep) {
      case "driver-strip":
      case "driver-passages":
      case "driver-day":
        return (
          <DriverInstrument
            state={{ ...state, lead: "Drivers" }}
            act={act}
            form={
              region.rep === "driver-strip"
                ? "compact"
                : region.rep === "driver-passages"
                  ? "passages"
                  : joined
                    ? "joined"
                    : "full"
            }
            summary={<DriverStrip state={state} act={act} />}
            passages={<DriverPassages state={state} act={act} />}
            answer={
              region.rep === "driver-passages"
                ? driverPassageReading(state)
                : undefined
            }
          />
        );
      case "vehicle-card":
      case "vehicle-object": {
        // The same object answers the composition's question: fuel next to a driver, rules next to restrictions.
        const facet =
          state.facet.Trucks ??
          (layers.includes("Restrictions") ||
          state.anchor.kind === "restriction"
            ? "restriction"
            : state.anchor.kind === "driver"
              ? "fuel"
              : "load");
        return (
          <TruckInstrument
            state={{
              ...state,
              lead: "Trucks",
              facet: { ...state.facet, Trucks: facet },
            }}
            act={act}
            form={
              region.rep === "vehicle-card"
                ? "compact"
                : joined
                  ? "joined"
                  : "full"
            }
            summary={<VehicleCard state={state} act={act} />}
          />
        );
      }
      case "restriction-logic":
        return (
          <RestrictionSpatial
            state={state}
            act={act}
            kicker="Lógica da restrição"
          />
        );
      case "restriction-impacts":
        return <RestrictionImpacts state={state} act={act} />;
      case "route-strip":
        return <RouteInstrument state={{ ...state, lead: "Fuel" }} act={act} />;
      case "entity-facts":
        return <EntityFacts state={state} act={act} />;
      case "context-cards":
        return (
          <ContextCard
            state={state}
            act={act}
            lenses={
              region.lenses ?? [
                ...layers.filter(
                  (l) =>
                    l === "Documents" ||
                    l === "Fuel" ||
                    l === "Trucks" ||
                    l === "Restrictions" ||
                    l === "Drivers",
                ),
                ...(state.active.includes("Jobs") ? (["Jobs"] as const) : []),
              ]
            }
          />
        );
      case "trailer-sheet":
        return <TrailerSheet state={state} act={act} mode="sheet" />;
      case "trailer-fit":
        return <TrailerSheet state={state} act={act} mode="fit" />;
      case "document-paper":
        return (
          <DossierInstrument
            state={{ ...state, lead: "Documents" }}
            act={act}
          />
        );
      case "restriction-full":
        return (
          <RestrictionInstrument
            state={{ ...state, lead: "Restrictions" }}
            act={act}
          />
        );
      case "restriction-transports":
        return <RestrictionTransports state={state} act={act} />;
      case "stop-sheet":
        return <StopSheet state={state} act={act} />;
      case "stop-compare":
        return <StopCompare state={state} act={act} />;
    }
  },
  (previous, next) =>
    previous.state === next.state &&
    previous.act === next.act &&
    previous.region.rep === next.region.rep &&
    JSON.stringify(previous.region.lenses) === JSON.stringify(next.region.lenses),
);

function EntityUnavailable({ state, region, act, missing = false }: Props & { region: RegionPlacement; missing?: boolean }) {
  if (!isEntity(state.anchor)) return null;
  const node = providerFor(state).entity({ kind: state.anchor.kind, id: state.anchor.id });
  const base = ANCHOR_LENS[state.anchor.kind];
  return <article className="fx-ent fx-unavailable" data-context-status={missing ? "MISSING" : "UNASSIGNED"}>
    <small className="fx-ent-k">{region.role === "lead" ? KIND_LABEL[state.anchor.kind] : "Contexto por completar"}</small>
    <h2>{node?.label ?? state.anchor.id}</h2>
    <Status tone={missing ? "action" : "unknown"}>{missing ? "Objeto ou transporte não encontrado" : "Sem transporte selecionado"}</Status>
    <p>{missing ? "Os dados deste objeto não estão disponíveis nesta demonstração." : "Selecione um transporte para comparar percurso, carga, horários e documentos."}</p>
    {node && <p>{node.detail} · {node.status.text}</p>}
    {region.lenses?.map((lens) => <p key={lens}><b>{LENS_LABEL[lens]}</b> · contexto do transporte indisponível</p>)}
    {region.role === "lead" && <button className="fx-btn" data-ix="follow" onClick={() => act({ type: "lens", domain: base })}>Voltar à lista</button>}
  </article>;
}

/* ─── Trailer: a capacity, where it is, which transports it can serve ───── */

function TrailerSheet({ state, act, mode }: Props & { mode: "sheet" | "fit" }) {
  const p = providerFor(state);
  const id = state.anchor.kind === "trailer" ? state.anchor.id : "";
  const t = TRAILERS[id];
  if (!t) return <p className="fx-quiet">Reboque {id} não existe na frota.</p>;
  const holder = p.currentJob({ kind: "trailer", id });
  const future = p.getResourceFutureState().trailers[id];
  const fits = WORLD_JOBS.map((j) => {
    const w = labWorld({ ...state, anchor: { kind: "job", id: j.id } });
    const adr = j.cargo.some((c) => c.adr),
      cold = j.cargo.some((c) => c.tempC != null);
    const clearance = w.restrictions.find((r) => r.limitM)?.limitM;
    const checks = [
      {
        label: "posições",
        ok: w.pallets <= t.pallets,
        text: `${w.pallets}/${t.pallets}`,
      },
      {
        label: "ADR",
        ok: !adr || t.capabilities.includes("Equipado ADR"),
        text: adr ? "exigido" : "—",
      },
      {
        label: "frio",
        ok: !cold || t.type === "Frigorífico",
        text: cold ? "exigido" : "—",
      },
      {
        label: "altura",
        ok: !clearance || t.heightM <= clearance,
        text: clearance ? `≤ ${clearance.toFixed(2).replace(".", ",")} m` : "—",
      },
    ];
    return {
      j,
      w,
      checks,
      ok: checks.every((c) => c.ok),
      current: w.job.trailerId === id,
    };
  });
  return (
    <article className="fx-instrument fx-trailer" data-mode={mode}>
      <header className="fx-answer">
        <h1>
          {t.id} · {t.type.toLowerCase()} · {t.pallets} posições
        </h1>
        <p>
          {holder
            ? `Atribuído a ${holder}`
            : `Livre · ${t.location ?? "sem posição"}`}{" "}
          · {t.lengthM.toString().replace(".", ",")} m · altura{" "}
          {t.heightM.toFixed(2).replace(".", ",")} m · {t.axles} eixos · tara{" "}
          {(t.tareKg / 1000).toLocaleString("pt-PT")} t
        </p>
        <div className="fx-answer-meta">
          <span className="fx-who">
            Matrícula <Plate small>{t.plate}</Plate>
          </span>
          <span className="fx-prov-line">{t.capabilities.join(" · ")}</span>
          {future && (
            <span className="fx-prov-line">
              livre a partir de <V v={future.availableAt} fmt={at} />
            </span>
          )}
        </div>
      </header>
      <table className="fx-compare fx-trailer-fit">
        <thead>
          <tr>
            <th>Transporte</th>
            {fits[0].checks.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {(mode === "sheet"
            ? fits.filter((f) => f.current || f.ok).slice(0, 4)
            : fits
          ).map((f) => (
            <tr key={f.j.id} data-chosen={f.current} data-conflict={!f.ok}>
              <td>
                <button
                  className="fx-inline"
                  data-ix="follow"
                  onClick={() =>
                    act({ type: "follow", object: { kind: "job", id: f.j.id } })
                  }
                >
                  <Id>{f.j.id}</Id> {f.j.stops[0].city} →{" "}
                  {f.j.stops.at(-1)!.city}
                </button>
              </td>
              {f.checks.map((c) => (
                <td key={c.label}>
                  <Tri outcome={c.ok ? "yes" : "no"} /> <small>{c.text}</small>
                </td>
              ))}
              <td>
                {f.current ? (
                  <span className="fx-quiet">atribuído</span>
                ) : f.ok ? (
                  <button
                    className="fx-btn"
                    data-kind={
                      isProposed(state, "trailer", f.j.id) &&
                      state.pending?.to === id
                        ? "primary"
                        : "quiet"
                    }
                    data-ix="propose"
                    onClick={() =>
                      act({
                        type: "propose",
                        proposal: {
                          kind: "trailer",
                          id: f.j.id,
                          from: f.w.job.trailerId,
                          to: id,
                        },
                      })
                    }
                  >
                    Propor para {f.j.id}
                  </button>
                ) : (
                  <span className="fx-quiet">incompatível</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

/* ─── Restriction: every transport of the day through it ───────────────── */

function RestrictionTransports({ state, act }: Props) {
  const p = providerFor(state);
  const id =
    state.anchor.kind === "restriction"
      ? state.anchor.id
      : (state.selection.restriction ?? "");
  const rows = WORLD_JOBS.map((j) => ({
    j,
    i: p.getRestrictionImpact(j.id, id),
  })).filter((x) => x.i.reason !== "RESTRICTION_MISSING");
  return (
    <section
      className="fx-ent fx-ent-impacts"
      aria-label="Transportes que atravessam a restrição"
    >
      <small className="fx-ent-k">
        Transportes de hoje neste troço · {rows.length}
      </small>
      <ul>
        {rows.map(({ j, i }) => (
          <li key={j.id}>
            <button
              data-ix="follow"
              onClick={() =>
                act({ type: "follow", object: { kind: "job", id: j.id } })
              }
            >
              <b>
                {j.id} · {j.stops[0].city} → {j.stops.at(-1)!.city}
              </b>
              <Status tone={IMPACT[i.status].tone}>
                {IMPACT[i.status].word}
              </Status>
              <small>
                passagem <V v={i.passage} fmt={at} />
                {i.missingFacts.length > 0 &&
                  ` · falta ${i.missingFacts.map((f) => FACT_LABEL[f] ?? f).join(", ")}`}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Stop: a candidate as a decision ──────────────────────────────────── */

function StopSheet({ state, act }: Props) {
  const w = labWorld(state);
  const id =
    state.anchor.kind === "stop"
      ? state.anchor.id
      : (state.selection.fuel ?? "");
  const c = stopCandidates({
    critical: state.exceptions.driverTimeCritical,
  }).find((x) => x.id === id);
  if (!c) return <p className="fx-quiet">Paragem {id} sem dados.</p>;
  const planned = w.planned?.id === c.id;
  return (
    <article
      className="fx-instrument fx-stop-sheet"
      data-tone={c.breakFits ? "ok" : "action"}
    >
      <header className="fx-answer">
        <h1>{c.name.replace("Área de serviço de ", "")}</h1>
        <p>
          {c.breakFits
            ? `Chega às ${c.arrival} com ${c.marginMin} min de margem antes do limite de 4h30 (${w.limit}).`
            : `Chega às ${c.arrival}: ${-c.marginMin} min depois do limite de 4h30 (${w.limit}).`}
        </p>
        <div className="fx-answer-meta">
          <span className="fx-who">
            {c.road} · km {c.km} <Id>{c.id}</Id>
          </span>
          <span className="fx-prov-line">{c.note}</span>
        </div>
      </header>
      <dl className="fx-facts fx-stop-facts">
        <div>
          <dt>Desvio</dt>
          <dd>
            +{c.detourKm.toString().replace(".", ",")} km · referência, não
            calculado
          </dd>
        </div>
        <div>
          <dt>Pausa 4h30</dt>
          <dd>
            <Tri outcome={c.breakFits ? "yes" : "no"} />{" "}
            {c.breakFits ? `${c.marginMin} min de margem` : "excede o limite"}
          </dd>
        </div>
        <div>
          <dt>Seguinte</dt>
          <dd>
            {w.job.stops[1].city} às {c.coimbraEta} · janela até{" "}
            {w.job.stops[1].window[1]}
          </dd>
        </div>
        <div>
          <dt>Abastecer</dt>
          <dd>
            {c.litres} L · {c.priceEurL.toFixed(2).replace(".", ",")} €/L ≈{" "}
            {(c.priceEurL * c.litres).toLocaleString("pt-PT", {
              maximumFractionDigits: 0,
            })}{" "}
            € · sintético
          </dd>
        </div>
        <div>
          <dt>Parque</dt>
          <dd>{c.parking} lugares pesados</dd>
        </div>
        <div>
          <dt>Acesso</dt>
          <dd>
            {c.restriction ? (
              <Status tone="risk">{c.restriction}</Status>
            ) : (
              "sem condições registadas"
            )}
          </dd>
        </div>
      </dl>
      <div className="fx-stop-actions">
        {planned ? (
          <Status tone="ok">No plano</Status>
        ) : c.breakFits ? (
          <button
            className="fx-btn"
            data-ix="propose"
            onClick={() =>
              act({ type: "stage-stop", id: c.id, from: w.planned?.id ?? c.id })
            }
          >
            Propor esta paragem
          </button>
        ) : (
          <Status tone="action">Não serve a pausa</Status>
        )}
        <button
          className="fx-link"
          data-ix="follow"
          onClick={() =>
            act({
              type: "entity",
              kind: "driver",
              id: w.driver.id,
              job: w.jobId,
            })
          }
        >
          {w.driver.name} → abrir o motorista
        </button>
      </div>
    </article>
  );
}

function StopCompare({ state, act }: Props) {
  const w = labWorld(state);
  const id = state.anchor.kind === "stop" ? state.anchor.id : "";
  return (
    <section className="fx-ent fx-ent-impacts" aria-label="Outras paragens">
      <small className="fx-ent-k">Outras candidatas · {w.jobId}</small>
      <ul>
        {w.candidates
          .filter((c) => c.id !== id)
          .map((c) => (
            <li key={c.id}>
              <button
                data-ix="follow"
                onClick={() =>
                  act({ type: "entity", kind: "stop", id: c.id, job: w.jobId })
                }
              >
                <b>{c.name.replace("Área de serviço de ", "")}</b>
                <Status tone={c.breakFits ? "ok" : "action"}>
                  {c.breakFits
                    ? `${c.marginMin} min de margem`
                    : "excede o limite"}
                </Status>
                <small>
                  {c.arrival} · km {c.km} · +
                  {c.detourKm.toString().replace(".", ",")} km
                  {c.recommended ? " · recomendada" : ""}
                </small>
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}

/* ─── Driver: compressed day ─────────────────────────────────────────────── */

const DAY = [5 * 60 + 30, 19 * 60];
const px = (min: number) =>
  `${((Math.max(DAY[0], Math.min(DAY[1], min)) - DAY[0]) / (DAY[1] - DAY[0])) * 100}%`;

function DriverStrip({ state, act }: Props) {
  const p = providerFor(state);
  const w = labWorld(state);
  const job = anchorJob(state.anchor);
  const t = job ? p.getOperationalTimeline(job).timeline : null;
  const limit = t?.spellLimit;
  const pct = Math.min(100, (w.driver.spellMin / SPELL_LIMIT) * 100);
  const next = t?.stops.find(
    (s) => s.arrival.status !== "UNKNOWN" && s.arrival.value > p.nowMs,
  );
  const onTruck = state.anchor.kind === "truck";
  return (
    <article
      className="fx-ent fx-ent-driver"
      data-object={`driver:${w.driver.id}`}
    >
      <header>
        <small>Motorista{onTruck ? " · quem conduz" : ""}</small>
        <h2>
          {onTruck ? (
            <button
              className="fx-inline"
              data-ix="follow"
              onClick={() =>
                act({ type: "entity", kind: "driver", id: w.driver.id, job })
              }
            >
              {w.driver.name}
            </button>
          ) : (
            w.driver.name
          )}{" "}
          <Id>{w.driver.id}</Id>
        </h2>
        <p>
          {job} · {w.job.stops[0].city} → {w.job.stops.at(-1)!.city}
        </p>
      </header>
      <div className="fx-ent-meter" data-near={pct > 80}>
        <span>
          <b>{dur(w.driver.spellMin)}</b> de 4h30 contínuas
        </span>
        <i style={{ width: `${pct}%` }} />
        <small>
          limite {limit ? <V v={limit} fmt={at} /> : "—"} · diária{" "}
          {dur(w.driver.dayMin)} / {dur(DAY_LIMIT)}
        </small>
      </div>
      <div
        className="fx-ent-day"
        style={{ "--now": px(NOW.min) } as CSSProperties}
        aria-label="Dia de trabalho"
      >
        {t?.activities.map((a, i) => (
          <i
            key={i}
            data-kind={a.kind}
            data-planned={a.planned}
            style={{
              left: px(minOf(a.startMs)),
              width: `calc(${px(minOf(a.endMs))} - ${px(minOf(a.startMs))})`,
            }}
            title={`${at(a.startMs)}–${at(a.endMs)} ${a.label ?? a.kind}`}
          />
        ))}
        {limit?.status === "KNOWN" && (
          <em
            className="fx-ent-limit"
            style={{ left: px(minOf(limit.value)) }}
          />
        )}
        <b className="fx-ent-now" />
      </div>
      <ol className="fx-ent-stops">
        {t?.stops.map((s) => (
          <li
            key={s.stopId}
            data-next={next?.stopId === s.stopId}
            data-window={s.window}
          >
            <V v={s.arrival} fmt={at} /> <b>{s.place}</b>
            <small>
              janela até {at(s.windowEndMs)} ·{" "}
              <V
                v={s.deliveryMarginSec}
                fmt={(n) =>
                  n >= 0
                    ? `${Math.round(n / 60)} min de folga`
                    : `${Math.round(-n / 60)} min de atraso`
                }
              />
            </small>
          </li>
        ))}
      </ol>
      {!onTruck && (
        <button
          className="fx-link"
          data-ix="follow"
          onClick={() =>
            act({ type: "entity", kind: "truck", id: w.truck.id, job })
          }
        >
          Conduz {w.truck.plate} → abrir o camião
        </button>
      )}
    </article>
  );
}

/* ─── Driver: when does the person pass the conditioned segments ────────── */

function DriverPassages({ state, act }: Props) {
  const p = providerFor(state);
  const w = labWorld(state);
  const job = anchorJob(state.anchor)!;
  const t = p.getOperationalTimeline(job).timeline;
  const impacts = w.restrictions.map((r) => ({
    r,
    i: p.getRestrictionImpact(job, r.id),
  }));
  const worst =
    impacts.find((x) => x.i.status === "UNKNOWN") ??
    impacts.find((x) => x.i.status === "FAIL") ??
    impacts[0];
  const selected = state.selection.restriction ?? worst?.r.id;
  return (
    <article
      className="fx-instrument fx-ent fx-ent-passages"
      data-tone={
        worst?.i.status === "UNKNOWN"
          ? "unknown"
          : worst?.i.status === "FAIL"
            ? "action"
            : "ok"
      }
    >
      <header className="fx-answer">
        <h1>{passageHeadline(worst)}</h1>
        <p>
          {w.driver.name} · {dur(w.driver.spellMin)} de condução · cada troço no
          eixo do dia, à hora a que o motorista lá chega.
        </p>
      </header>
      <div
        className="fx-pass-axis"
        style={{ "--now": px(NOW.min) } as CSSProperties}
      >
        <div className="fx-pass-hours" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => 6 + i).map((h) => (
            <span key={h} style={{ left: px(h * 60) }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        <div className="fx-pass-lane">
          <small>Condução</small>
          <div>
            {t?.activities.map((a, i) => (
              <i
                key={i}
                data-kind={a.kind}
                data-planned={a.planned}
                style={{
                  left: px(minOf(a.startMs)),
                  width: `calc(${px(minOf(a.endMs))} - ${px(minOf(a.startMs))})`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="fx-pass-lane" data-lane="passages">
          <small>Passagens</small>
          <div>
            {impacts
              .filter((x) => x.i.passage.status !== "UNKNOWN")
              // Passages close in time stack on alternate rows so none hides another.
              .sort(
                (x, y) =>
                  (x.i.passage as { value: number }).value -
                  (y.i.passage as { value: number }).value,
              )
              .map(({ r, i }, k) => (
                <button
                  key={r.id}
                  data-ix="spatial"
                  data-status={i.status}
                  data-row={k % 2}
                  aria-pressed={selected === r.id}
                  style={{
                    left: px(minOf((i.passage as { value: number }).value)),
                  }}
                  onClick={() =>
                    act(
                      selected === r.id
                        ? { type: "entity", kind: "restriction", id: r.id, job }
                        : { type: "restriction", id: r.id },
                    )
                  }
                >
                  <b>{at((i.passage as { value: number }).value)}</b>{" "}
                  {r.title.split(" — ")[0].split(" · ")[0]}
                </button>
              ))}
          </div>
        </div>
        <b className="fx-ent-now" />
      </div>
    </article>
  );
}

/* ─── Restrictions on the route, read through the adapter's impact query ── */

function RestrictionImpacts({ state, act }: Props) {
  const p = providerFor(state);
  const w = labWorld(state);
  const job = anchorJob(state.anchor)!;
  // The restriction the map shows: the selection, or the worst one.
  // Selecting only means something when a map shows the section; otherwise the row opens the restriction.
  const mapped = state.anchor.kind === "driver";
  const shown =
    state.selection.restriction ??
    (
      w.restrictions.find((r) => r.result === "UNKNOWN") ??
      w.restrictions.find((r) => r.result === "APPLIES") ??
      w.restrictions[0]
    )?.id;
  return (
    <section
      className="fx-ent fx-ent-impacts"
      aria-label="Impacto das restrições"
    >
      <small className="fx-ent-k">Impacto por restrição · {job}</small>
      <ul>
        {w.restrictions.map((r) => {
          const i = p.getRestrictionImpact(job, r.id);
          return (
            <li key={r.id}>
              <button
                data-ix={shown === r.id || !mapped ? "follow" : "spatial"}
                aria-pressed={shown === r.id}
                onClick={() =>
                  act(
                    shown === r.id || !mapped
                      ? { type: "entity", kind: "restriction", id: r.id, job }
                      : { type: "restriction", id: r.id },
                  )
                }
              >
                <Status tone={IMPACT[i.status].tone}>
                  {IMPACT[i.status].word}
                </Status>
                <b>{r.title.split(" — ")[0]}</b>
                <small>
                  passagem <V v={i.passage} fmt={at} />
                  {i.missingFacts.length > 0 &&
                    ` · falta ${i.missingFacts.length === 1 ? "1 facto" : `${i.missingFacts.length} factos`}`}
                </small>
              </button>
              <button
                className="fx-link fx-ent-open"
                data-ix="follow"
                onClick={() =>
                  act({ type: "entity", kind: "restriction", id: r.id, job })
                }
              >
                abrir →
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─── Vehicle: compact physical combination ─────────────────────────────── */

function VehicleCard({ state, act }: Props) {
  const w = labWorld(state);
  const job = anchorJob(state.anchor);
  const onDriver = state.anchor.kind === "driver";
  const vci = w.restrictions.find((r) => r.id === "RI-042");
  const axle = vci?.all.find((x) => x.part === "firstAxle");
  return (
    <article
      className="fx-ent fx-ent-vehicle"
      data-object={`truck:${w.truck.plate}`}
    >
      <header>
        <small>Viatura{onDriver ? " · conduzida" : ""}</small>
        <h2>
          <Plate>{w.truck.plate}</Plate>
        </h2>
        <p>
          {w.truck.make} {w.truck.model} +{" "}
          <button
            className="fx-inline"
            data-ix="follow"
            onClick={() =>
              act({ type: "entity", kind: "trailer", id: w.job.trailerId, job })
            }
          >
            {w.trailer
              ? `${w.trailer.type.toLowerCase()} ${w.trailer.id}`
              : `${w.job.trailerId} (não existe)`}
          </button>
        </p>
      </header>
      <dl className="fx-facts">
        <div>
          <dt>Combustível</dt>
          <dd>
            {w.positionKnown
              ? `≈ ${Math.round(w.fuelNowPct)}%`
              : `${w.truck.fuel.value}%`}{" "}
            · ≈ {w.rangeKm} km
          </dd>
        </div>
        <div>
          <dt>Carga</dt>
          <dd>
            {w.pallets}/{w.trailer?.pallets ?? "?"} paletes
          </dd>
        </div>
        {axle && (
          <div>
            <dt>1.º eixo</dt>
            <dd>
              <Tri outcome={axle.outcome} /> {axle.value}
            </dd>
          </div>
        )}
      </dl>
      {onDriver && (
        <button
          className="fx-btn"
          data-kind="quiet"
          data-ix="follow"
          onClick={() =>
            act({ type: "entity", kind: "truck", id: w.truck.id, job })
          }
        >
          Abrir o camião
        </button>
      )}
    </article>
  );
}

/* ─── Facts from the adapter: assignment, availability, links, events ───── */

function EntityFacts({ state, act }: Props) {
  const p = providerFor(state);
  const a = state.anchor as Extract<
    GuidedState["anchor"],
    { id: string; job: string | null }
  >;
  const ref: EntityRef = { kind: a.kind as EntityRef["kind"], id: a.id };
  const job = anchorJob(a);
  const assignment = job ? p.getResourceAssignment(job) : null;
  const pool =
    a.kind === "driver"
      ? "drivers"
      : a.kind === "truck"
        ? "trucks"
        : a.kind === "trailer"
          ? "trailers"
          : null;
  const future = pool ? p.getResourceFutureState()[pool][a.id] : undefined;
  const related = p.related(ref);
  const events = p.events(ref).slice(-4).reverse();
  return (
    <section className="fx-ent fx-ent-facts" aria-label="Factos da entidade">
      <small className="fx-ent-k">
        Atribuição ·{" "}
        {assignment?.status === "CURRENT"
          ? "em dia"
          : assignment?.status === "REVIEW_REQUIRED"
            ? "a rever"
            : "sem transporte"}
      </small>
      {assignment?.issues.map((i) => (
        <Status key={i} tone="action">
          {i.replaceAll("_", " ").toLowerCase()}
        </Status>
      ))}
      <dl className="fx-facts">
        <div>
          <dt>Livre a partir</dt>
          <dd>{future ? <V v={future.availableAt} fmt={at} /> : "—"}</dd>
        </div>
        <div>
          <dt>Posição</dt>
          <dd>
            {future?.position.status === "UNKNOWN" ? (
              <span className="fx-ev" data-status="unknown">
                {future.position.reason}
              </span>
            ) : future ? (
              `conhecida · ${future.position.source}`
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      <small className="fx-ent-k">Ligado a</small>
      <ul className="fx-ent-links">
        {related.map((n) => {
          const go = entityAct(n.ref, p.currentJob(n.ref) ?? job);
          return (
            <li key={`${n.ref.kind}:${n.ref.id}`}>
              <button
                data-ix="follow"
                disabled={!go}
                onClick={() => go && act(go)}
              >
                <small>{KIND_LABEL[n.ref.kind]}</small>
                <b>{n.label}</b>
                <Status tone={n.status.tone}>{n.status.text}</Status>
              </button>
            </li>
          );
        })}
      </ul>
      {events.length > 0 && (
        <>
          <small className="fx-ent-k">Eventos</small>
          <ol className="fx-ent-events">
            {events.map((e, i) => (
              <li key={i} data-origin={e.origin}>
                <time>{e.atMs ? at(e.atMs) : "—"}</time> {e.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
