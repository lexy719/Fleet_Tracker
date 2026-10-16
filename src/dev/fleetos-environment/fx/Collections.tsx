import type { GuidedAction, GuidedLens, GuidedState } from "../guidedWorkspace";
import {
  NOW,
  ROUTES,
  PLAN_LABEL,
  SLA_LABEL,
  STATUS_LABEL,
  TRAILERS,
  WORLD_JOBS,
  driverWorld,
  hm,
  ledger,
  restrictionsFor,
  truckWorld,
  type WorldJob,
} from "../world";
import { Id, Plate, Status, Val, type Tone } from "./honesty";
import { VehicleDrawing } from "./VehicleDrawing";
import { providerFor } from "../engine/synthetic";
import { sharedWorkRows } from "../sharedReadModel";

/**
 * Operation-wide views: a domain chosen with no transport anchored. The same
 * instrument geometry, applied to every transport of the day. A row enters that
 * transport with the domain as lead.
 */
type Props = { state: GuidedState; act: (a: GuidedAction) => void };
const enter = (act: Props["act"], jobId: string, lead: GuidedLens) => () =>
  act({ type: "enter", jobId, lead });
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const sorted = () =>
  [...WORLD_JOBS].sort(
    (a, b) =>
      ["in_transit", "loading", "assigned", "queued", "backlog"].indexOf(
        a.status,
      ) -
      ["in_transit", "loading", "assigned", "queued", "backlog"].indexOf(
        b.status,
      ),
  );

/* ─── Cross-lens context: what every other active lens says about a transport ─ */

const LENS_SHORT: Partial<Record<GuidedLens, string>> = {
  Jobs: "Transporte",
  Drivers: "Motorista",
  Trucks: "Viatura",
  Fuel: "Percurso",
  Restrictions: "Restrições",
  Documents: "Documentos",
};
export function cmrState(job: WorldJob): {
  tone: Tone;
  text: string;
  number: string | null;
} {
  const l = ledger(job.id);
  const departed = ["in_transit", "delivered", "invoiced"].includes(job.status);
  if (job.status === "loading")
    return {
      tone: "action",
      text: "CMR em falta — carga sem guia",
      number: null,
    };
  if (departed)
    return l[0].diverges
      ? {
          tone: "risk",
          text: `CMR difere do atual em ${l[0].diverges} campos`,
          number: l[0].number,
        }
      : { tone: "ok", text: `CMR emitida ${l[0].at}`, number: l[0].number };
  return {
    tone: "neutral",
    text: "CMR a emitir antes da partida",
    number: null,
  };
}
function lensFact(lens: GuidedLens, job: WorldJob) {
  if (lens === "Jobs")
    return (
      <Status
        tone={
          job.blockers.length
            ? "blocker"
            : job.plan === "REPLAN_REQUIRED"
              ? "action"
              : job.sla !== "on_track"
                ? "risk"
                : "ok"
        }
      >
        {STATUS_LABEL[job.status]} · {PLAN_LABEL[job.plan]} ·{" "}
        {SLA_LABEL[job.sla]}
      </Status>
    );
  if (lens === "Drivers") {
    const d = driverWorld(job.driverId);
    const q = d.qualifications.find(
      (x) => x.state === "EXPIRED" || x.state === "EXPIRING",
    );
    const day = dayOf(job);
    return (
      <>
        <b>{d.name}</b> <Status tone={day.tone}>{day.note}</Status>
        {q && (
          <Status tone={q.state === "EXPIRED" ? "action" : "risk"}>
            {q.label} {q.state === "EXPIRED" ? "caducado" : "a caducar"}
          </Status>
        )}
      </>
    );
  }
  if (lens === "Trucks") {
    const t = truckWorld(job.truckId);
    return (
      <>
        <Plate small>{t.plate}</Plate>{" "}
        {t.availability === "MAINTENANCE" ? (
          <Status tone="action">Em manutenção</Status>
        ) : (
          <span className="fx-quiet">
            {t.fuel.value}% · manual {t.fuel.prov.at}
          </span>
        )}
        {t.firstAxleHeightM == null && (
          <span className="fx-fleet-gap">1.º eixo ?</span>
        )}
      </>
    );
  }
  if (lens === "Fuel")
    return job.id === "J-4217" ? (
      <Status tone="risk">Pausa até 10:50 · Santarém recomendada</Status>
    ) : job.status === "in_transit" ? (
      <Status tone="ok">Sem pausa antes da entrega</Status>
    ) : job.status === "loading" ? (
      <Status tone="neutral">Em carga em {job.stops[0].city}</Status>
    ) : (
      <Status tone="neutral">Parte às {job.stops[0].window[0]}</Status>
    );
  if (lens === "Documents") {
    const c = cmrState(job);
    return <Status tone={c.tone}>{c.text}</Status>;
  }
  if (lens === "Restrictions") {
    const rs = restrictionsFor(job.id);
    const worst =
      rs.find((r) => r.result === "UNKNOWN") ??
      rs.find((r) => r.result === "APPLIES");
    return worst ? (
      <Status tone={worst.result === "UNKNOWN" ? "unknown" : "risk"}>
        {worst.title.split(" — ")[0].split(" · ")[0]} ·{" "}
        {worst.result === "UNKNOWN" ? "desconhecido" : "aplica-se"}
      </Status>
    ) : (
      <Status tone="ok">Sem restrições aplicáveis</Status>
    );
  }
  return null;
}
/** Compact facts from every other active lens, attached to one transport's row. */
export function OpContext({
  state,
  job,
  exclude,
}: {
  state: GuidedState;
  job: WorldJob;
  exclude: GuidedLens;
}) {
  const lenses = state.active.filter((l) => l !== exclude && LENS_SHORT[l]);
  if (!lenses.length) return null;
  return (
    <span className="fx-opctx">
      {lenses.map((l) => (
        <span key={l} className="fx-opctx-item" data-lens={l}>
          <small>{LENS_SHORT[l]}</small>
          <span>{lensFact(l, job)}</span>
        </span>
      ))}
    </span>
  );
}
export const contextLenses = (state: GuidedState, exclude: GuidedLens) =>
  state.active.filter((l) => l !== exclude && LENS_SHORT[l]);

/* ─── Drivers: every driver's day on one shared time axis ───────────────── */

type Seg = {
  kind: "drive" | "work" | "break";
  from: number;
  to: number;
  planned?: boolean;
};
function dayOf(job: WorldJob): {
  segs: Seg[];
  spell: number;
  limit: number | null;
  note: string;
  tone: Tone;
} {
  const first = toMin(job.stops[0].window[0]);
  const lastEta = job.stops.at(-1)!.eta;
  const end = /\d/.test(lastEta) ? toMin(lastEta) + 30 : first + 300;
  if (job.id === "J-4217") {
    const d = driverWorld(job.driverId);
    return {
      segs: d.duty.map((x) => ({
        kind: x.kind === "rest" ? "break" : x.kind,
        from: x.from,
        to: x.to,
        planned: x.planned,
      })),
      spell: d.spellMin,
      limit: NOW.min + (270 - d.spellMin),
      note: "Pausa obrigatória até 10:50",
      tone: "risk",
    };
  }
  if (job.status === "in_transit") {
    const start = toMin(job.stops[0].completedAt ?? job.stops[0].window[0]);
    const spell = NOW.min - start;
    return {
      segs: [
        { kind: "work", from: start - 30, to: start },
        { kind: "drive", from: start, to: NOW.min },
        {
          kind: "drive",
          from: NOW.min,
          to: toMin(job.stops.at(-1)!.eta),
          planned: true,
        },
        {
          kind: "work",
          from: toMin(job.stops.at(-1)!.eta),
          to: toMin(job.stops.at(-1)!.eta) + 40,
          planned: true,
        },
      ],
      spell,
      limit: start + 270,
      note: `Entrega ${job.stops.at(-1)!.eta} · ${hm(270 - spell)} de condução contínua disponível`,
      tone: "ok",
    };
  }
  if (job.status === "loading")
    return {
      segs: [
        { kind: "work", from: first, to: NOW.min },
        {
          kind: "drive",
          from: NOW.min + 10,
          to: Math.min(end, NOW.min + 270),
          planned: true,
        },
      ],
      spell: 0,
      limit: null,
      note: "Em carga · parte com 0 h de condução hoje",
      tone: "neutral",
    };
  if (job.status === "backlog")
    return {
      segs: [],
      spell: 0,
      limit: null,
      note: "Sem transporte atribuído hoje",
      tone: "neutral",
    };
  return {
    segs: [
      { kind: "work", from: first, to: first + 40, planned: true },
      { kind: "drive", from: first + 40, to: end - 30, planned: true },
    ],
    spell: 0,
    limit: null,
    note: `Inicia às ${job.stops[0].window[0]}`,
    tone: "neutral",
  };
}

function DriverScheduleGrid({ state, act }: Props) {
  const from = 5 * 60 + 30,
    to = 19 * 60;
  const x = (m: number) =>
    `${((Math.max(from, Math.min(to, m)) - from) / (to - from)) * 100}%`;
  const jobs = sorted();
  const reads = sharedWorkRows({ ...state, filter: "all" });
  return (
    <article className="fx-instrument fx-roster">
      <header className="fx-answer">
        <h1>Comparar os turnos de hoje</h1>
        <p>
          Seis motoristas no mesmo eixo do dia. Horas a partir de bases manuais
          e do plano sintético do laboratório — não são leituras de tacógrafo.
        </p>
      </header>
      <div
        className="fx-roster-axis"
        style={
          { "--now-f": (NOW.min - from) / (to - from) } as React.CSSProperties
        }
      >
        <div className="fx-roster-hours" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => 6 + i).map((h) => (
            <span key={h} style={{ left: x(h * 60) }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
          <b style={{ left: x(NOW.min) }}>{NOW.clock}</b>
        </div>
        {jobs.map((job) => {
          const reading = reads.find((row) => row.world.jobId === job.id)!;
          const d = reading.world.driver;
          const day: ReturnType<typeof dayOf> = {
            segs: d.duty.map((block) => ({
              ...block,
              kind: block.kind === "rest" ? "break" : block.kind,
            })),
            spell: d.spellMin,
            limit: d.baseline.stale ? null : reading.world.limitMin,
            note: d.baseline.stale
              ? "Base de horas por confirmar"
              : `Limite no cenário ${reading.world.limit}`,
            tone: d.baseline.stale ? "unknown" : "neutral",
          };
          const qual = d.qualifications.find(
            (q) => q.state === "EXPIRED" || q.state === "EXPIRING",
          );
          return (
            <button
              data-ix="follow"
              key={job.id}
              className="fx-roster-row"
              onClick={() =>
                act({
                  type: "entity",
                  kind: "driver",
                  id: d.id,
                  job: job.id,
                })
              }
              data-map-entity="job"
              data-entity-id={job.id}
            >
              <span className="fx-roster-who" data-object={`driver:${d.id}`}>
                <b>{d.name}</b>
                <small>
                  <Id>{job.id}</Id> {job.stops[0].city} →{" "}
                  {job.stops.at(-1)!.city}
                </small>
              </span>
              <span className="fx-roster-track">
                {day.segs.map((s, i) => (
                  <i
                    key={i}
                    data-kind={s.kind}
                    data-planned={!!s.planned}
                    style={{
                      left: x(s.from),
                      width: `calc(${x(s.to)} - ${x(s.from)})`,
                    }}
                  />
                ))}
                {day.limit && (
                  <em
                    className="fx-roster-limit"
                    style={{ left: x(day.limit) }}
                    title={`4h30 → ${hm(day.limit)}`}
                  />
                )}
                {!day.segs.length && (
                  <span className="fx-roster-empty">sem turno</span>
                )}
              </span>
              <span className="fx-roster-note">
                <Status tone={day.tone}>{day.note}</Status>
                {qual && (
                  <Status tone={qual.state === "EXPIRED" ? "action" : "risk"}>
                    {qual.label}{" "}
                    {qual.state === "EXPIRED" ? "caducado" : "a caducar"}
                  </Status>
                )}
              </span>
              <OpContext state={state} job={job} exclude="Drivers" />
            </button>
          );
        })}
      </div>
      <p className="fx-footnote">
        Selecionar um motorista abre o seu dia no transporte atribuído.
      </p>
    </article>
  );
}

/** The collection starts with people and their next decision. Comparing all
 * shifts is an explicit question rather than the default reading burden. */
export function DriversRoster({ state, act }: Props) {
  if (state.facet.Drivers === "corridor")
    return (
      <div className="ds-schedule">
        <button
          className="fx-link"
          data-ix="inspect"
          onClick={() =>
            act({ type: "facet", domain: "Drivers", facet: "execution" })
          }
        >
          ← Voltar aos motoristas
        </button>
        <DriverScheduleGrid state={state} act={act} />
      </div>
    );
  const provider = providerFor(state);
  const journeys = sharedWorkRows({ ...state, filter: "all" });
  const people = provider.list("driver").map((node) => {
    const jobId = provider.currentJob(node.ref);
    const row = journeys.find(
      (r) => r.world.jobId === jobId && r.world.driver.id === node.ref.id,
    );
    const expired = row?.world.driver.qualifications.find(
      (q) => q.state === "EXPIRED",
    );
    const stale = row?.world.driver.baseline.stale;
    const pause =
      row?.world.planned &&
      ["loading", "in_transit"].includes(row.world.job.status);
    const group =
      expired || stale || pause ? "review" : row ? "working" : "unassigned";
    const decision = expired
      ? `${expired.label} caducado · rever habilitação`
      : stale
        ? "Atualizar a base de horas"
        : pause
          ? `Rever a pausa antes de ${row!.world.limit}`
          : row?.next
            ? `${row.next.type === "pickup" ? "Preparar a carga" : "Próxima entrega"} em ${row.next.city}`
            : row
              ? "Rever o trabalho atribuído"
              : "Escolher um trabalho compatível";
    return { node, jobId, row, group, decision };
  });
  return (
    <article
      className="fx-instrument ds-roster"
      data-driver-reading="decisions"
    >
      <header className="ds-heading">
        <div>
          <h1>Motoristas</h1>
          <p>Quem precisa de uma decisão e o que cada pessoa tem a seguir.</p>
        </div>
        <button
          className="fx-link"
          data-ix="inspect"
          onClick={() =>
            act({ type: "facet", domain: "Drivers", facet: "corridor" })
          }
        >
          Comparar os turnos →
        </button>
      </header>
      {(
        [
          ["review", "Precisam de uma decisão"],
          ["working", "Com trabalho atribuído"],
          ["unassigned", "Sem transporte atribuído"],
        ] as const
      ).map(([group, title]) => {
        const rows = people.filter((p) => p.group === group);
        if (!rows.length) return null;
        return (
          <section className="ds-group" key={group} data-driver-group={group}>
            <h2>
              {title} <span>{rows.length}</span>
            </h2>
            <div className="ds-column-labels" aria-hidden="true">
              <span>Motorista</span>
              <span>Trabalho de hoje</span>
              <span>Próxima decisão</span>
            </div>
            {rows.map(({ node, row, jobId, decision }) => (
              <button
                key={node.ref.id}
                className="ds-person"
                data-ix="follow"
                data-object={`driver:${node.ref.id}`}
                onClick={() =>
                  act({
                    type: "entity",
                    kind: "driver",
                    id: node.ref.id,
                    job: jobId,
                  })
                }
              >
                <span className="ds-person-name">
                  <b>{node.label}</b>
                  <small>{node.ref.id}</small>
                </span>
                <span className="ds-work">
                  {row ? (
                    <>
                      <b>
                        {row.world.job.stops[0].city} →{" "}
                        {row.world.job.stops.at(-1)!.city}
                      </b>
                      <small>
                        {row.world.jobId} · {STATUS_LABEL[row.world.job.status]}
                      </small>
                    </>
                  ) : (
                    <>
                      <b>Sem transporte</b>
                      <small>{node.detail}</small>
                    </>
                  )}
                </span>
                <span className="ds-next">
                  <b>{decision}</b>
                  <small>
                    {row
                      ? "Horas e registos do cenário"
                      : "Sem localização operacional confirmada"}
                  </small>
                </span>
                <span className="ds-open">Ver motorista →</span>
              </button>
            ))}
          </section>
        );
      })}
      <p className="fx-footnote">
        Demonstração · registos manuais e horários do cenário. Atribuição não
        significa disponibilidade nem leitura de tacógrafo.
      </p>
    </article>
  );
}

/* ─── Trucks: the fleet as physical combinations ────────────────────────── */

export function FleetRoster({ state, act }: Props) {
  const jobs = sorted();
  return (
    <article className="fx-instrument fx-fleet">
      <header className="fx-answer">
        <h1>1 viatura em manutenção tem trabalho às 14:00</h1>
        <p>
          Seis conjuntos com a carga de hoje. Combustível e odómetro são
          leituras manuais com hora; não há telemetria.
        </p>
      </header>
      <div className="fx-fleet-grid">
        {jobs.map((job) => {
          const t = truckWorld(job.truckId);
          const trailer = TRAILERS[job.trailerId];
          const pallets = job.cargo.reduce((s, c) => s + c.pallets, 0);
          const groups = job.cargo.map((c, i) => ({
            city: c.dropAt,
            pallets: c.pallets,
            kg: c.weightKg,
            order: i + 1,
            adr: c.adr,
            tempC: c.tempC,
          }));
          const maint = t.availability === "MAINTENANCE";
          return (
            <button
              data-ix="follow"
              key={job.id}
              className="fx-fleet-item"
              data-maint={maint}
              onClick={() =>
                act({
                  type: "entity",
                  kind: "truck",
                  id: job.truckId,
                  job: job.id,
                })
              }
              data-map-entity="job"
              data-entity-id={job.id}
            >
              <span className="fx-fleet-head">
                <span data-object={`truck:${t.plate}`}>
                  <Plate small>{t.plate}</Plate>
                </span>
                <b>
                  {t.make} {t.model}
                </b>
                <Status
                  tone={
                    maint
                      ? "action"
                      : job.status === "backlog"
                        ? "neutral"
                        : "ok"
                  }
                >
                  {maint ? "Em manutenção" : STATUS_LABEL[job.status]}
                </Status>
              </span>
              <span className="fx-fleet-draw">
                <VehicleDrawing
                  aspect="load"
                  groups={groups}
                  capacity={trailer?.pallets ?? 33}
                  grossKg={
                    t.tareKg +
                    6900 +
                    job.cargo.reduce((s, c) => s + c.weightKg, 0)
                  }
                  firstAxleKnown={t.firstAxleHeightM != null}
                  firstAxleM={t.firstAxleHeightM}
                  fuelReadPct={t.fuel.value}
                  fuelNowPct={t.fuel.value}
                  rules={{}}
                  annotations={false}
                />
              </span>
              <span className="fx-fleet-facts">
                <span>
                  <Id>{job.id}</Id> {pallets}/{trailer?.pallets ?? 33} paletes
                  {job.cargo.some((c) => c.adr) && " · ADR"}
                  {job.cargo.some((c) => c.tempC) && " · frio"}
                </span>
                <Val value={`${t.fuel.value}%`} size="s" prov={t.fuel.prov} />
                {t.firstAxleHeightM == null && (
                  <span className="fx-fleet-gap">1.º eixo não registado</span>
                )}
              </span>
              <OpContext state={state} job={job} exclude="Trucks" />
            </button>
          );
        })}
      </div>
    </article>
  );
}

/* ─── Documents: the register across the day ────────────────────────────── */

export function DocumentRegister({ state, act }: Props) {
  const rows = sorted().map((job) => {
    const l = ledger(job.id);
    const departed = ["in_transit", "delivered", "invoiced"].includes(
      job.status,
    );
    const cmr =
      job.status === "loading"
        ? {
            tone: "action" as Tone,
            text: "Em falta — carga a decorrer sem guia",
          }
        : departed
          ? l[0].diverges
            ? {
                tone: "risk" as Tone,
                text: `Emitida ${l[0].at} · difere do atual em ${l[0].diverges} campos`,
              }
            : { tone: "ok" as Tone, text: `Emitida ${l[0].at}` }
          : { tone: "neutral" as Tone, text: "Emitir antes da partida" };
    return { job, cmr, number: departed ? l[0].number : null };
  });
  const open = rows.filter(
    (r) => r.cmr.tone === "action" || r.cmr.tone === "risk",
  ).length;
  return (
    <article className="fx-instrument fx-register">
      <header className="fx-answer">
        <h1>{open} guias precisam de atenção</h1>
        <p>
          Registo documental do dia: guia CMR antes da partida, fatura só depois
          da entrega. Documentos emitidos são snapshots imutáveis.
        </p>
      </header>
      <table className="fx-grid fx-register-grid">
        <thead>
          <tr>
            <th>Transporte</th>
            <th>Guia CMR</th>
            <th>Fatura</th>
            <th>Estado do transporte</th>
            {contextLenses(state, "Documents").length > 0 && <th>Contexto</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, cmr, number }) => (
            <tr
              key={job.id}
              data-ix="follow"
              onClick={enter(act, job.id, "Documents")}
              data-tone={cmr.tone}
              data-map-entity="job"
              data-entity-id={job.id}
            >
              <td>
                <Id>{job.id}</Id>
                <small>{job.client}</small>
              </td>
              <td>
                {number && (
                  <span
                    className="fx-ref"
                    data-object={`doc:CMR-${job.id.slice(2)}`}
                  >
                    {number}
                  </span>
                )}
                <Status tone={cmr.tone}>{cmr.text}</Status>
              </td>
              <td>
                <Status tone="unknown">Após entrega</Status>
              </td>
              <td>
                {STATUS_LABEL[job.status]}
                <small>
                  {job.stops[0].city} → {job.stops.at(-1)!.city}
                </small>
              </td>
              {contextLenses(state, "Documents").length > 0 && (
                <td>
                  <OpContext state={state} job={job} exclude="Documents" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fx-footnote">
        Séries: CMR 2026 próximo n.º 000413 · FT 2026 próximo n.º 000231.
      </p>
    </article>
  );
}

/* ─── Route & Stops: each moving transport as a journey ─────────────────── */

export function JourneysOverview({ state, act }: Props) {
  const moving = sorted().filter(
    (j) => j.positionKm != null || j.status === "loading",
  );
  return (
    <article className="fx-instrument fx-journeys">
      <header className="fx-answer">
        <h1>Uma paragem por decidir antes das 10:50</h1>
        <p>
          Transportes em curso como viagens: posição simulada, próxima pausa
          obrigatória e entregas. Rotas TomTom gravadas.
        </p>
      </header>
      {moving.map((job) => {
        const r = ROUTES[job.routeId];
        const pos = job.positionKm ?? 0;
        const x = (k: number) => `${(k / r.km) * 100}%`;
        const day = dayOf(job);
        const breakKm = day.limit
          ? Math.min(r.km, pos + ((day.limit - NOW.min) / 60) * 84)
          : null;
        return (
          <button
            data-ix="follow"
            key={job.id}
            className="fx-jr-row"
            onClick={enter(act, job.id, "Fuel")}
            data-map-entity="job"
            data-entity-id={job.id}
          >
            <span className="fx-jr-who">
              <Id>{job.id}</Id>
              <b>
                {job.stops[0].city} → {job.stops.at(-1)!.city}
              </b>
              <small>{Math.round(r.km)} km</small>
            </span>
            <span className="fx-jr-track">
              <i className="fx-jr-line" />
              <i className="fx-jr-done" style={{ width: x(pos) }} />
              {breakKm != null && breakKm > pos && (
                <i
                  className="fx-jr-break"
                  style={{
                    left: x(pos),
                    width: `calc(${x(breakKm)} - ${x(pos)})`,
                  }}
                />
              )}
              {job.stops.map((s) => (
                <i
                  key={s.id}
                  className="fx-jr-stop"
                  data-done={!!s.completedAt}
                  style={{ left: x(s.km) }}
                  title={s.city}
                />
              ))}
              <i className="fx-jr-pos" style={{ left: x(pos) }} />
            </span>
            <span className="fx-jr-note">
              {job.id === "J-4217" ? (
                <Status tone="risk">
                  Pausa até 10:50 · Santarém recomendada
                </Status>
              ) : job.status === "loading" ? (
                <Status tone="neutral">Em carga em {job.stops[0].city}</Status>
              ) : (
                <Status tone="ok">Sem pausa necessária antes da entrega</Status>
              )}
            </span>
            <OpContext state={state} job={job} exclude="Fuel" />
          </button>
        );
      })}
      <p className="fx-footnote">
        Postos e paragens são sintéticos; a posição é simulada.
      </p>
    </article>
  );
}

/* ─── Restrictions: verdicts per transport ──────────────────────────────── */

export function RestrictionsOverview({ state, act }: Props) {
  const rows = sorted().flatMap((job) =>
    restrictionsFor(job.id).map((r) => ({ job, r })),
  );
  const unknown = rows.filter((x) => x.r.result === "UNKNOWN").length;
  const word = {
    APPLIES: "Aplica-se",
    DOES_NOT_APPLY: "Não se aplica",
    UNKNOWN: "Desconhecido",
  } as const;
  const tone = {
    APPLIES: "risk",
    DOES_NOT_APPLY: "ok",
    UNKNOWN: "unknown",
  } as const;
  return (
    <article className="fx-instrument fx-register">
      <header className="fx-answer">
        <h1>
          {unknown} {unknown === 1 ? "restrição" : "restrições"} com
          aplicabilidade desconhecida
        </h1>
        <p>
          Cada restrição na rota de cada transporte, com o veredito e a razão.
          Desconhecido nunca é tratado como permitido.
        </p>
      </header>
      <table className="fx-grid fx-register-grid">
        <thead>
          <tr>
            <th>Transporte</th>
            <th>Restrição</th>
            <th>Veredito</th>
            {contextLenses(state, "Restrictions").length > 0 && (
              <th>Contexto</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, r }) => (
            <tr
              key={job.id + r.id}
              data-ix="follow"
              onClick={() =>
                act({
                  type: "enter",
                  jobId: job.id,
                  lead: "Restrictions",
                  restriction: r.id,
                })
              }
              data-tone={tone[r.result]}
              data-map-entity="job"
              data-entity-id={job.id}
            >
              <td>
                <Id>{job.id}</Id>
                <small>
                  {job.stops[0].city} → {job.stops.at(-1)!.city}
                </small>
              </td>
              <td>
                <b>{r.title}</b>
                <small>{r.where}</small>
              </td>
              <td>
                <Status tone={tone[r.result]}>{word[r.result]}</Status>
                <small>{r.answer.split(" — ")[1] ?? r.answerDetail}</small>
              </td>
              {contextLenses(state, "Restrictions").length > 0 && (
                <td>
                  <OpContext state={state} job={job} exclude="Restrictions" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
