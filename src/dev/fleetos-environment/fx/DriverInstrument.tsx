import type { CSSProperties, ReactNode } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import {
  DAY_LIMIT,
  NOW,
  SPELL_LIMIT,
  WEEK_LIMIT,
  dur,
  hm,
  type DutyBlock,
} from "../world";
import { Id, Plate, Status, Tri, Val, ClockGlyph, type Tone } from "./honesty";
import { labWorld, LENS_LABEL } from "./model";
import { FacetBar, facetOf } from "./Facets";
import { BaselineEditor, DriverAssignment } from "./Editors";
import { isProposed } from "../edits";
import { ObjectSlot } from "./PersistentObjects";

type Props = {
  state: GuidedState;
  act: (a: GuidedAction) => void;
  form?: "full" | "compact" | "passages" | "joined";
  summary?: ReactNode;
  passages?: ReactNode;
  answer?: { title: string; detail: string };
};
const QUAL_TONE: Record<string, Tone> = {
  VALID: "ok",
  EXPIRING: "risk",
  EXPIRED: "action",
  MISSING: "unknown",
  NOT_HELD: "neutral",
};
const QUAL_WORD: Record<string, string> = {
  VALID: "Válida",
  EXPIRING: "A caducar",
  EXPIRED: "Caducada",
  MISSING: "Em falta",
  NOT_HELD: "Não detém",
};

/** Driver = time. The axis is the instrument; everything else hangs from it. */
export function DriverInstrument(props: Props) {
  const w = labWorld(props.state);
  return <ObjectSlot id={`driver:${w.driver.id}:job:${w.jobId}`}>
    <DriverInstrumentBody {...props} />
  </ObjectSlot>;
}
function DriverInstrumentBody({
  state,
  act,
  form = "full",
  summary,
  passages,
  answer,
}: Props) {
  const w = labWorld(state);
  const { driver, candidates, job } = w;
  const plannedStop = w.selectedStop ?? w.planned;
  const stale = driver.baseline.stale;
  const shiftStart = Math.min(...driver.duty.map((d) => d.from)) - 20;
  const shiftEnd = Math.max(...driver.duty.map((d) => d.to)) + 25;
  const span = shiftEnd - shiftStart;
  const x = (m: number) => `${((m - shiftStart) / span) * 100}%`;
  const plannedDrive = driver.duty
    .filter((d) => d.kind === "drive")
    .reduce((s, d) => s + (d.to - d.from), 0);
  const fits = plannedStop ? plannedStop.breakFits : false;
  const margin = plannedStop?.marginMin ?? 0;
  const tone: Tone = stale
    ? "unknown"
    : w.critical || margin < 10
      ? "action"
      : margin < 25
        ? "risk"
        : "ok";
  const facet = facetOf(state, "Drivers");
  const overview =
    facet === "execution" && form === "full" && !answer && !state.edit;
  const expiredQualification = driver.qualifications.find(
    (q) => q.state === "EXPIRED",
  );
  const timeFocus = state.focus?.kind === "time" ? state.focus : null;
  const editing = state.edit?.kind;
  const proposedDriver = isProposed(state, "driver", w.jobId);
  // Margin notes: supporting lenses annotate the axis where they matter.
  const notes: {
    at: number;
    place: string;
    lens: string;
    text: ReactNode;
    onClick?: () => void;
  }[] = [];
  // Notes name an entity; clicking opens exactly that entity, never the previous selection.
  const roadNote =
    w.restrictions.find((r) => r.result === "UNKNOWN") ??
    w.restrictions.find((r) => r.result === "APPLIES") ??
    w.restrictions[0];
  if (state.active.includes("Fuel") && plannedStop)
    notes.push({
      at: plannedStop.arrivalMin,
      place: plannedStop.name.replace("Área de serviço de ", ""),
      lens: "Percurso e paragens",
      text: fits ? (
        <>
          {margin} min de margem até {w.limit} · parque {plannedStop.parking}{" "}
          lugares
        </>
      ) : (
        <>Chega {-margin} min depois do limite</>
      ),
      onClick: () =>
        act({ type: "follow", object: { kind: "stop", id: plannedStop.id } }),
    });
  if (state.active.includes("Trucks") && plannedStop)
    notes.push({
      at: plannedStop.arrivalMin,
      place: plannedStop.name.replace("Área de serviço de ", ""),
      lens: "Viatura",
      text: (
        <>
          Combustível ≈ {Math.round(w.fuelNowPct)}% <em>estimado</em> ·
          abastecer {plannedStop.litres} L
        </>
      ),
      onClick: () => act({ type: "follow", object: { kind: "fuel" } }),
    });
  const toMin = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const remaining = job.stops.filter((st) => !st.completedAt);
  const firstDrop =
    remaining.find((st) => st.type !== "pickup") ?? job.stops.at(-1)!;
  const lastStop = job.stops.at(-1)!;
  const lastEta = /\d/.test(lastStop.eta) ? toMin(lastStop.eta) : null;
  if (state.active.includes("Documents"))
    notes.push({
      at: /\d/.test(firstDrop.eta) ? toMin(firstDrop.eta) : NOW.min,
      place: firstDrop.city,
      lens: "Documentos",
      text: (
        <>
          {w.ledger[0].state === "ISSUED"
            ? `Guia CMR emitida${w.ledger[0].diverges ? ` · difere em ${w.ledger[0].diverges} campos` : " · identidade conferida"}`
            : w.ledger[0].state === "MISSING"
              ? "Guia CMR em falta"
              : "Guia CMR a emitir antes da partida"}
        </>
      ),
      onClick: () =>
        act({
          type: "follow",
          object: { kind: "document", id: w.ledger[0].id },
        }),
    });
  if (state.active.includes("Restrictions"))
    notes.push({
      at: lastEta ? lastEta - 7 : NOW.min,
      place: `${lastStop.city} · ${roadNote.title.split(" — ")[0].split(" · ")[0]}`,
      lens: "Restrições",
      text: <>{roadNote.answer}</>,
      onClick: () =>
        act({
          type: "follow",
          object: { kind: "restriction", id: roadNote.id },
        }),
    });
  const moments = [...new Set(notes.map((n) => n.at))]
    .sort((a, b) => a - b)
    .map((at) => ({
      at,
      place: notes.find((n) => n.at === at)!.place,
      items: notes.filter((n) => n.at === at),
    }));
  const started = job.status === "in_transit" || job.status === "loading";
  const deliversFirst =
    !plannedStop && lastEta != null && lastEta <= w.limitMin;
  const headline =
    facet === "assignment"
      ? `Motorista de ${job.id}`
      : facet === "qualifications"
        ? (() => {
            const bad =
              driver.qualifications.find((q) => q.state === "EXPIRED") ??
              driver.qualifications.find((q) => q.state === "EXPIRING");
            return bad
              ? `${bad.label} ${bad.state === "EXPIRED" ? "caducado" : `caduca a ${bad.until}`}`
              : "Habilitações em dia";
          })()
        : facet === "legality"
          ? `${dur(Math.max(0, SPELL_LIMIT - driver.spellMin))} de condução contínua disponível`
          : stale
            ? "Horas de condução incertas"
            : !started
              ? `Turno começa às ${job.stops[0].window[0]}`
              : deliversFirst
                ? "Entrega antes do limite de condução"
                : `Pausa obrigatória até ${w.limit}`;
  const sub =
    facet === "assignment"
      ? `Quem conduz ${job.id}: tempo disponível, habilitações e onde está cada motorista. Escolher cria uma proposta.`
      : facet === "qualifications"
        ? `Habilitações de ${driver.name} contra o que ${job.id} exige. Cada uma abre o seu registo no dossier.`
        : facet === "legality"
          ? `Contínua ${dur(driver.spellMin)} de 4h30 · diária ${dur(driver.dayMin)} de 9h · semanal ${dur(driver.baseline.weekMin + driver.dayMin)} de 56h. Limite de 4h30 às ${w.limit}.`
          : stale
            ? `A base foi registada ${driver.baseline.recordedLabel}. O planeador assume 0 h antes das 06:45 — o limite de 4h30 pode chegar antes das ${w.limit}.`
            : plannedStop
              ? fits
                ? `${plannedStop.name.replace("Área de serviço de ", "")} às ${plannedStop.arrival} deixa ${margin} min de margem · ${dur(driver.spellMin)} de condução desde a última pausa`
                : `${plannedStop.name.replace("Área de serviço de ", "")} (${plannedStop.arrival}) já não cabe — excede o limite em ${-margin} min`
              : !started
                ? `Ainda sem condução hoje · ${job.stops[0].city} → ${lastStop.city}, janela ${lastStop.window.join("–")}`
                : deliversFirst
                  ? `${lastStop.city} às ${lastStop.eta}, antes do limite de 4h30 (${w.limit}) · ${dur(driver.spellMin)} de condução contínua`
                  : `${dur(driver.spellMin)} de condução desde a última pausa`;
  const quals = (
    <ul className="fx-quals">
      {driver.qualifications.map((q) => (
        <li key={q.kind}>
          <button
            className="fx-inline"
            data-ix="follow"
            data-proposed={
              q.kind === "cpc" &&
              isProposed(state, "qualification", `${driver.id}:cpc`)
            }
            onClick={() =>
              act({
                type: "follow",
                object: {
                  kind: "qualification",
                  driver: driver.id,
                  qual: q.kind,
                },
              })
            }
          >
            <span>{q.label}</span>
            <Status tone={QUAL_TONE[q.state]}>{QUAL_WORD[q.state]}</Status>
            <small>{q.until ? `${q.until} · ${q.detail}` : q.detail}</small>
          </button>
        </li>
      ))}
    </ul>
  );
  const assigned = (
    <button
      className="fx-resource"
      data-ix="follow"
      onClick={() =>
        act({ type: "follow", object: { kind: "truck", id: w.truck.id } })
      }
    >
      <span>
        {w.truck.make} {w.truck.model}{" "}
        <span data-object={`truck:${w.truck.plate}`}>
          <Plate small>{w.truck.plate}</Plate>
        </span>
      </span>
      <small>
        {w.trailer ? (
          <>
            Reboque {w.trailer.type.toLowerCase()} <Id>{w.trailer.id}</Id> ·{" "}
            {w.pallets}/{w.trailer.pallets} paletes
          </>
        ) : (
          <>Reboque {w.job.trailerId} não existe na frota</>
        )}
      </small>
    </button>
  );
  const counters = (
    <>
      <Meter
        label="Condução contínua"
        used={driver.spellMin}
        limit={SPELL_LIMIT}
        stale={stale}
        note={stale ? "≥ 3h20 · base de ontem" : `limite às ${w.limit}`}
      />
      <Meter
        label="Condução diária"
        used={driver.dayMin}
        limit={DAY_LIMIT}
        stale={stale}
        note={`prevista ${dur(plannedDrive + driver.baseline.drivenBeforeMin)} até ao fim`}
      />
      <Meter
        label="Condução semanal"
        used={driver.baseline.weekMin + driver.dayMin}
        limit={WEEK_LIMIT}
        stale={stale}
        note="limite 56h · quinzenal 66h25 / 90h"
      />
    </>
  );
  return (
    <article
      className="fx-instrument fx-driver"
      data-morph-form={form}
      data-tone={tone}
      data-facet={facet}
      data-editing={editing ?? undefined}
      data-driver-reading={overview ? "overview" : "detail"}
    >
      <div className="fx-compact-summary" hidden={form !== "compact"}>
        {form === "compact" ? summary : null}
      </div>
      <header
        className="fx-answer"
        aria-hidden={form === "compact"}
        inert={form === "compact"}
      >
        <h1>{overview ? driver.name : (answer?.title ?? headline)}</h1>
        <p>
          {overview
            ? `Hoje · ${job.stops[0].city} → ${lastStop.city} · ${job.id}`
            : (answer?.detail ?? sub)}
        </p>
        <div className="fx-answer-meta">
          <span
            className="fx-who"
            data-object={`driver:${driver.id}`}
            data-proposed={proposedDriver}
          >
            {driver.name} <Id>{driver.id}</Id>
            {proposedDriver && <em className="fx-proposed-tag">proposto</em>}
            <span className="fx-relations">
              <button
                className="fx-rel"
                data-object={`truck:${w.truck.plate}`}
                data-ix="follow"
                onClick={() =>
                  act({
                    type: "follow",
                    object: { kind: "truck", id: w.truck.id },
                  })
                }
              >
                {w.truck.plate}
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
          <span className="fx-prov-line" data-stale={stale}>
            {stale && <ClockGlyph />}
            Base de horas {stale ? "desatualizada" : "manual"} ·{" "}
            {driver.baseline.recordedLabel}
            <em> · não é leitura de tacógrafo</em>
          </span>
          <FacetBar state={state} act={act} domain="Drivers" />
        </div>
      </header>
      {overview && (
        <section
          className="ds-driver-decision"
          data-tone={
            expiredQualification || (plannedStop && !fits)
              ? "action"
              : stale
                ? "unknown"
                : "neutral"
          }
        >
          <div>
            <small>Próxima decisão</small>
            <h2>
              {expiredQualification
                ? `${expiredQualification.label} caducado`
                : headline}
            </h2>
            <p>
              {expiredQualification
                ? "Rever o registo e os requisitos do trabalho antes de alterar a atribuição."
                : sub}
            </p>
          </div>
          <button
            className="fx-btn"
            data-kind="primary"
            data-ix="inspect"
            onClick={() =>
              act(
                expiredQualification
                  ? {
                      type: "facet",
                      domain: "Drivers",
                      facet: "qualifications",
                    }
                  : stale
                    ? { type: "facet", domain: "Drivers", facet: "legality" }
                    : {
                        type: "facet",
                        domain: plannedStop ? "Fuel" : "Drivers",
                        facet: plannedStop ? "stops" : "corridor",
                      },
              )
            }
          >
            {expiredQualification
              ? "Rever a habilitação"
              : stale
                ? "Rever as horas registadas"
                : plannedStop
                  ? "Rever a paragem da pausa"
                  : "Ver o turno completo"}{" "}
            →
          </button>
          <div className="ds-driver-facts">
            <span>
              <small>Condução desde a pausa</small>
              <b>{stale ? "Por confirmar" : dur(driver.spellMin)}</b>
            </span>
            <span>
              <small>Até ao limite no cenário</small>
              <b>
                {stale
                  ? "Por confirmar"
                  : dur(Math.max(0, SPELL_LIMIT - driver.spellMin))}
              </b>
            </span>
            <span>
              <small>Base manual</small>
              <b>{driver.baseline.recordedLabel}</b>
            </span>
          </div>
        </section>
      )}

      {facet === "assignment" && (
        <div className="fx-assign-stage" data-kind="driver">
          <div className="fx-assign-current">
            <span className="fx-assign-caption" data-proposed={proposedDriver}>
              {proposedDriver ? "Motorista proposto" : "Motorista atual"}
            </span>
            <b className="fx-assign-name">{driver.name}</b>
            {quals}
            {assigned}
          </div>
          {editing === "driver" ? (
            <DriverAssignment state={state} act={act} />
          ) : (
            <div className="fx-edit-choices">
              <button
                className="fx-choice"
                data-ix="edit"
                onClick={() =>
                  act({ type: "edit", kind: "driver", target: w.jobId })
                }
              >
                <b>Mudar motorista</b>
                <span>
                  Comparar tempo disponível, habilitações e localização
                </span>
              </button>
            </div>
          )}
        </div>
      )}
      {facet === "qualifications" && (
        <div className="fx-qualgrid">
          {driver.qualifications.map((q) => {
            const needed =
              q.kind === "adr" ? job.cargo.some((c) => c.adr) : true;
            return (
              <button
                key={q.kind}
                className="fx-qualcard"
                data-ix="follow"
                data-state={q.state}
                data-proposed={
                  q.kind === "cpc" &&
                  isProposed(state, "qualification", `${driver.id}:cpc`)
                }
                onClick={() =>
                  act({
                    type: "follow",
                    object: {
                      kind: "qualification",
                      driver: driver.id,
                      qual: q.kind,
                    },
                  })
                }
              >
                <span className="fx-qualcard-label">{q.label}</span>
                <Status tone={QUAL_TONE[q.state]}>{QUAL_WORD[q.state]}</Status>
                <b>{q.until ?? "—"}</b>
                <small>{q.detail}</small>
                <em>
                  {needed
                    ? `Exigida para ${job.id}`
                    : `Não exigida para ${job.id}`}{" "}
                  · ver no dossier →
                </em>
              </button>
            );
          })}
          <div className="fx-qual-assign">
            <h2>Conjunto atribuído</h2>
            {assigned}
          </div>
        </div>
      )}

      {!overview && facet !== "qualifications" && facet !== "assignment" && (
        <section
          className="fx-axis"
          aria-label="Turno de hoje"
          data-compact={facet === "legality"}
          style={{ "--now": x(NOW.min) } as CSSProperties}
        >
          <div className="fx-axis-hours" aria-hidden>
            {Array.from({ length: Math.ceil(span / 60) + 1 }, (_, i) => {
              const m = Math.ceil(shiftStart / 60) * 60 + i * 60;
              return m <= shiftEnd ? (
                <span key={m} style={{ left: x(m) }}>
                  {hm(m).slice(0, 2)}
                </span>
              ) : null;
            })}
          </div>
          <span
            className="fx-past"
            style={{
              left: "var(--gutter)",
              width: `calc((100% - var(--gutter)) * ${(NOW.min - shiftStart) / span})`,
            }}
            aria-hidden
          />
          <span
            className="fx-future-uncertain"
            data-on={stale || w.critical}
            style={{
              left: `calc(var(--gutter) + (100% - var(--gutter)) * ${(Math.max(w.limitMin, NOW.min) - shiftStart) / span})`,
              right: 0,
            }}
            aria-hidden
          />
          <div className="fx-lane" data-lane="activity">
            <span className="fx-lane-label">Atividade</span>
            <div className="fx-lane-track">
              {driver.duty.map((d: DutyBlock, i) => (
                <span
                  key={i}
                  className="fx-duty"
                  data-kind={d.kind}
                  data-planned={!!d.planned}
                  data-unknown={stale && i === 0}
                  style={{
                    left: x(d.from),
                    width: `calc(${x(d.to)} - ${x(d.from)})`,
                  }}
                  title={`${hm(d.from)}–${hm(d.to)} · ${d.label ?? d.kind}`}
                >
                  {d.to - d.from >= 75 && d.label ? <em>{d.label}</em> : null}
                </span>
              ))}
            </div>
          </div>
          <div className="fx-lane" data-lane="spell">
            <span className="fx-lane-label">Condução contínua</span>
            <div className="fx-lane-track">
              <span
                className="fx-spell"
                data-unknown={stale}
                style={{
                  left: x(driver.duty[0].from),
                  width: `calc(${x(Math.min(w.limitMin, plannedStop?.arrivalMin ?? NOW.min))} - ${x(driver.duty[0].from)})`,
                }}
              />
              {plannedStop && lastEta && (
                <span
                  className="fx-spell-reset"
                  style={{
                    left: x(plannedStop.arrivalMin + 55),
                    width: `calc(${x(lastEta)} - ${x(plannedStop.arrivalMin + 55)})`,
                  }}
                />
              )}
            </div>
          </div>
          <div className="fx-lane" data-lane="stops">
            <span className="fx-lane-label">Paragens</span>
            <div className="fx-lane-track">
              {job.stops.map((s) => {
                const [a, b] = s.window.map(
                  (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
                );
                const eta = s.completedAt ?? s.eta;
                const etaMin =
                  Number(eta.slice(0, 2)) * 60 + Number(eta.slice(3));
                return (
                  <span key={s.id} className="fx-window-wrap">
                    <span
                      className="fx-window"
                      data-done={!!s.completedAt}
                      style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }}
                    />
                    <span
                      className="fx-stop"
                      data-done={!!s.completedAt}
                      style={{ left: x(etaMin) }}
                    >
                      <b>{s.city}</b>
                      <small>
                        {s.completedAt ? `✓ ${s.completedAt}` : `ETA ${s.eta}`}
                      </small>
                    </span>
                  </span>
                );
              })}
              {plannedStop && (
                <span
                  className="fx-stop"
                  data-kind="break"
                  style={{ left: x(plannedStop.arrivalMin) }}
                  data-object={`stop:${plannedStop.id}`}
                >
                  <b>{plannedStop.name.replace("Área de serviço de ", "")}</b>
                  <small>pausa {plannedStop.arrival}</small>
                </span>
              )}
            </div>
          </div>
          <span
            className="fx-rule"
            data-kind="limit"
            style={{ left: x(w.limitMin) }}
          >
            <b>4h30 → {w.limit}</b>
          </span>
          <span className="fx-now" style={{ left: x(NOW.min) }}>
            <b>{NOW.clock}</b>
          </span>
          {moments.map((m, i) => (
            <span
              key={m.at}
              className="fx-note-tick"
              style={{ left: x(m.at) }}
              aria-hidden
            >
              {i + 1}
            </span>
          ))}
          {timeFocus && (
            <span className="fx-focus-time" style={{ left: x(timeFocus.at) }}>
              <b>
                {hm(timeFocus.at)} · {timeFocus.label}
              </b>
            </span>
          )}
        </section>
      )}
      {facet === "legality" && (
        <div className="fx-legal">
          <section className="fx-legal-counters">{counters}</section>
          <section className="fx-legal-base">
            <h2>Base de horas</h2>
            {editing === "baseline" ? (
              <BaselineEditor state={state} act={act} />
            ) : (
              <>
                <Val
                  label="Condução antes do turno"
                  value={dur(driver.baseline.drivenBeforeMin)}
                  state={stale ? "STALE" : "KNOWN"}
                  prov={`registo manual · ${driver.baseline.recordedLabel}`}
                  size="l"
                />
                <p className="fx-footnote">
                  O limite de 4h30 ({w.limit}) depende desta base. Não é leitura
                  de tacógrafo.
                </p>
                <button
                  className="fx-btn"
                  data-kind="quiet"
                  data-ix="edit"
                  onClick={() =>
                    act({ type: "edit", kind: "baseline", target: driver.id })
                  }
                >
                  Corrigir base de horas
                </button>
              </>
            )}
            <h2 className="fx-sub">Regras aplicadas</h2>
            <ul className="fx-rules-list">
              <li>4h30 de condução contínua → pausa de 45 min (ou 15 + 30)</li>
              <li>9 h por dia · até 10 h duas vezes por semana</li>
              <li>56 h por semana · 90 h em duas semanas</li>
            </ul>
          </section>
        </div>
      )}
      {!overview && facet === "execution" && moments.length > 0 && (
        <div
          className="fx-moments"
          aria-label="O que as lentes de apoio dizem sobre cada momento"
        >
          {moments.map((m, i) => (
            <div key={m.at} className="fx-moment">
              <span className="fx-moment-head">
                <i>{i + 1}</i>
                <time>{hm(m.at)}</time> {m.place}
              </span>
              {m.items.map((n) => (
                <button
                  data-ix="follow"
                  key={n.lens}
                  className="fx-moment-item"
                  onClick={n.onClick}
                >
                  <span className="fx-moment-lens">↳ {n.lens}</span>
                  <span className="fx-moment-text">{n.text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {(facet === "execution" || facet === "corridor") && (
        <div
          className="fx-columns"
          data-cols={overview ? "2" : facet === "corridor" ? "1" : "3"}
        >
          <section className="fx-col">
            <h2>A seguir</h2>
            <ol className="fx-sequence">
              {plannedStop && (
                <li
                  data-tone={fits ? "ok" : "action"}
                  data-focused={timeFocus?.stop === plannedStop.id}
                >
                  <time>{plannedStop.arrival}</time>
                  <div>
                    <b>
                      Abastecer e iniciar pausa ·{" "}
                      {plannedStop.name.replace("Área de serviço de ", "")}
                    </b>
                    <span>
                      10 min de abastecimento contam como outro trabalho · pausa
                      de 45 min
                    </span>
                    <button
                      className="fx-link"
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "stop", id: plannedStop.id },
                        })
                      }
                    >
                      Ver paragem no percurso →
                    </button>
                  </div>
                </li>
              )}
              {remaining.map((st) => (
                <li key={st.id}>
                  <time>{st.eta}</time>
                  <div>
                    <b
                      className="fx-follow-text"
                      role="button"
                      tabIndex={0}
                      data-ix="follow"
                      onClick={() =>
                        act({
                          type: "follow",
                          object: { kind: "delivery", stop: st.id },
                        })
                      }
                    >
                      {st.type === "pickup"
                        ? "Carga"
                        : st.type === "stop"
                          ? "Descarga parcial"
                          : "Entrega final"}{" "}
                      em {st.city}
                    </b>
                    <span>
                      {st.cargo} · janela {st.window.join("–")}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            {candidates.length > 0 && !plannedStop?.breakFits && (
              <p className="fx-consequence" data-tone="action">
                Nenhuma paragem escolhida cabe no limite.{" "}
                <button
                  className="fx-link"
                  data-ix="follow"
                  onClick={() =>
                    act({ type: "facet", domain: "Fuel", facet: "stops" })
                  }
                >
                  Escolher paragem →
                </button>
              </p>
            )}
          </section>
          {facet === "execution" && !overview && (
            <section className="fx-col">
              <h2>Contadores UE 561</h2>
              {counters}
              <p className="fx-footnote">
                Base manual {driver.baseline.recordedLabel} + condução do plano
                do laboratório.
              </p>
            </section>
          )}
          {facet === "execution" && (
            <section className="fx-col">
              <h2>Habilitações</h2>
              {overview ? (
                <>
                  <p>
                    {driver.qualifications.some((q) => q.state === "EXPIRED")
                      ? "Existe uma habilitação caducada para rever."
                      : "Consultar validade e requisitos da carga."}
                  </p>
                  <button
                    className="fx-link"
                    data-ix="inspect"
                    onClick={() =>
                      act({
                        type: "facet",
                        domain: "Drivers",
                        facet: "qualifications",
                      })
                    }
                  >
                    Rever habilitações →
                  </button>
                </>
              ) : (
                quals
              )}
              <h2 className="fx-sub">Conjunto atribuído</h2>
              {assigned}
              <button
                className="fx-link"
                data-ix="edit"
                onClick={() =>
                  act({ type: "edit", kind: "driver", target: w.jobId })
                }
              >
                Mudar motorista
              </button>
            </section>
          )}
        </div>
      )}
      <div className="fx-passage-summary" hidden={form !== "passages"}>
        {form === "passages" ? passages : null}
      </div>
    </article>
  );
}

function Meter({
  label,
  used,
  limit,
  note,
  stale,
}: {
  label: string;
  used: number;
  limit: number;
  note: string;
  stale: boolean;
}) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="fx-meter" data-near={pct > 85} data-stale={stale}>
      <div className="fx-meter-head">
        <span>{label}</span>
        <Val value={dur(used)} state={stale ? "UNCERTAIN" : "KNOWN"} size="s" />
        <small>/ {dur(limit)}</small>
      </div>
      <div className="fx-meter-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <small className="fx-meter-note">{note}</small>
    </div>
  );
}
export const driverLensName = LENS_LABEL.Drivers;
export { Tri };
