import type { ReactNode } from "react";
import type { GuidedAction, GuidedState } from "../guidedWorkspace";
import { LIFECYCLE, PLAN_LABEL, SLA_LABEL, STATUS_LABEL, NOW } from "../world";
import { Id, Plate, Status, type Tone } from "./honesty";
import { kg, labWorld } from "./model";
import { snapshotDiff } from "../world";
import { impactOf } from "./impact";
import { dur } from "../world";
import { LENS_LABEL } from "./model";
import type { GuidedLens } from "../guidedWorkspace";

/**
 * Content lenses switched on while the transport is the main perspective:
 * each one adds a band saying what that lens knows about this transport.
 */
function ContentBands({ state, act }: { state: GuidedState; act: (a: GuidedAction) => void }) {
  const w = labWorld(state);
  const on = state.active.filter((l): l is GuidedLens => l !== "Jobs" && l !== state.lead && l !== "Pricing DEV" && l !== "Compliance DEV");
  if (!on.length) return null;
  const worst = w.restrictions.find((r) => r.result === "UNKNOWN") ?? w.restrictions.find((r) => r.result === "APPLIES");
  const stop = w.selectedStop ?? w.planned;
  const cmr = w.ledger[0];
  const band = (l: GuidedLens) => {
    switch (l) {
      case "Drivers":
        return (
          <button className="fx-inline" data-ix="follow" onClick={() => act({ type: "entity", kind: "driver", id: w.driver.id, job: w.jobId })}>
            <b>{w.driver.name}</b> · {dur(w.driver.spellMin)} de condução · limite {w.limit} ·{" "}
            {w.driver.qualifications.find((q) => q.state !== "VALID" && q.state !== "NOT_HELD")?.label ?? "habilitações em dia"}
          </button>
        );
      case "Trucks":
        return (
          <button className="fx-inline" data-ix="follow" onClick={() => act({ type: "entity", kind: "truck", id: w.truck.id, job: w.jobId })}>
            <Plate small>{w.truck.plate}</Plate> {w.trailer ? `+ ${w.trailer.id}` : `· reboque ${w.job.trailerId} não existe`} · {w.pallets}/{w.trailer?.pallets ?? "?"} paletes ·
            combustível {w.positionKnown ? `≈ ${Math.round(w.fuelNowPct)}%` : `${w.truck.fuel.value}% (leitura)`}
          </button>
        );
      case "Fuel":
        return stop ? (
          <button className="fx-inline" data-ix="follow" onClick={() => act({ type: "entity", kind: "stop", id: stop.id, job: w.jobId })}>
            Pausa em <b>{stop.name.replace("Área de serviço de ", "")}</b> às {stop.arrival} · {stop.marginMin} min de margem · {w.job.stops.at(-1)!.city} às {w.job.stops.at(-1)!.eta}
          </button>
        ) : (
          <span>
            Sem paragem necessária · {w.job.stops.at(-1)!.city} às {w.job.stops.at(-1)!.eta} · janela {w.job.stops.at(-1)!.window.join("–")}
          </span>
        );
      case "Documents":
        return (
          <button className="fx-inline" data-ix="follow" onClick={() => act({ type: "entity", kind: "document", id: cmr.id, job: w.jobId })}>
            <b>{cmr.title}</b> {cmr.number ?? ""} · {cmr.state === "ISSUED" && cmr.diverges ? `difere em ${cmr.diverges} campos` : cmr.stateText.toLowerCase()} · fatura após entrega
          </button>
        );
      case "Restrictions":
        return worst ? (
          <button className="fx-inline" data-ix="follow" onClick={() => act({ type: "entity", kind: "restriction", id: worst.id, job: w.jobId })}>
            <b>{worst.title.split(" — ")[0]}</b> · {worst.answer} · {w.restrictions.length - 1} outras na rota
          </button>
        ) : (
          <span>{w.restrictions.length} restrições na rota · nenhuma se aplica</span>
        );
      default:
        return null;
    }
  };
  return (
    <section className="fx-content-bands" aria-label="Conteúdo das lentes ligadas">
      {on.map((l) => (
        <div key={l} className="fx-content-band" data-lens={l}>
          <small>{LENS_LABEL[l]}</small>
          {band(l)}
        </div>
      ))}
    </section>
  );
}

type Props = { state: GuidedState; act: (a: GuidedAction) => void; deep?: boolean };

/**
 * One transport's operational truth told as a story:
 * where it started → where it is → what happens next → what threatens it → what to decide.
 */
export function TransportOverview({ state, act }: Props) {
  const w = labWorld(state);
  const { job, route } = w;
  const now = LIFECYCLE.indexOf(job.status === "queued" ? "assigned" : job.status);
  const first = job.stops[0];
  const nextStops = job.stops.filter((s) => !s.completedAt);
  const progress = job.positionKm == null ? null : job.positionKm / route.km;
  const focusStop = state.focus?.kind === "delivery" ? state.focus.stop : null;
  const revision = state.focus?.kind === "revision" ? state.focus.field : null;
  const proposal = impactOf(state);
  const diffRow = revision ? snapshotDiff(job.id).find((d) => d.field === revision) : null;
  const threats: { tone: Tone; text: ReactNode; go: GuidedAction; object?: string }[] = [];
  if (job.plan === "REPLAN_REQUIRED")
    threats.push({ tone: "action", text: <>Plano já não serve: {job.planNote}</>, go: { type: "facet", domain: "Fuel", facet: "stops" } });
  for (const b of job.blockers.filter((b) => !b.startsWith("Plano") && !b.startsWith("Reboque")))
    threats.push({
      tone: "blocker",
      text: b,
      go: w.truck.availability === "MAINTENANCE" ? { type: "follow", object: { kind: "maintenance", id: w.truck.id } } : { type: "follow", object: { kind: "truck", id: w.truck.id } },
    });
  for (const r of w.restrictions.filter((x) => x.result === "UNKNOWN" || x.result === "APPLIES"))
    threats.push({
      tone: r.result === "UNKNOWN" ? "unknown" : "risk",
      text: (
        <>
          {r.title.split(" — ")[0]} · {r.answer.charAt(0).toLowerCase() + r.answer.slice(1)}
        </>
      ),
      go: { type: "follow", object: { kind: "restriction", id: r.id } },
      object: `restriction:${r.id}`,
    });
  if (w.trailerMissing)
    threats.push({
      tone: "blocker",
      text: <>Reboque {job.trailerId} não existe na frota</>,
      go: { type: "edit", kind: "trailer", target: job.id },
    });
  if (w.ledger[0]?.state === "MISSING")
    threats.push({
      tone: "action",
      text: <>Guia CMR em falta — carga a decorrer sem guia</>,
      go: { type: "edit", kind: "issue", target: w.ledger[0].id },
    });
  if (w.ledger[0]?.diverges)
    threats.push({
      tone: "risk",
      text: <>Guia CMR emitida com {snapshotDiff(job.id)[0].issued} paletes; o transporte tem {w.pallets}</>,
      go: { type: "facet", domain: "Documents", facet: "diff" },
      object: `doc:${w.ledger[0].id}`,
    });
  const exp = w.driver.qualifications.find((q) => q.state === "EXPIRED" || q.state === "EXPIRING");
  if (exp)
    threats.push({
      tone: exp.state === "EXPIRED" ? "action" : "risk",
      text: (
        <>
          {w.driver.name} · {exp.label} {exp.state === "EXPIRED" ? "caducado" : `a caducar (${exp.until})`}
        </>
      ),
      go: { type: "follow", object: { kind: "qualification", driver: w.driver.id, qual: exp.kind } },
    });
  // The decision opens the instrument that can actually answer it.
  const decision: { text: string; go: GuidedAction } =
    job.id === "J-4217"
      ? { text: `Confirmar a paragem da pausa obrigatória até ${w.limit}`, go: { type: "facet", domain: "Fuel", facet: "stops" } }
      : w.trailerMissing
        ? { text: job.next, go: { type: "edit", kind: "trailer", target: job.id } }
        : w.truck.availability === "MAINTENANCE"
          ? { text: job.next, go: { type: "follow", object: { kind: "maintenance", id: w.truck.id } } }
          : exp?.state === "EXPIRED"
            ? { text: job.next, go: { type: "follow", object: { kind: "qualification", driver: w.driver.id, qual: exp.kind } } }
            : { text: job.next, go: { type: "open", domain: "Fuel" } };
  const headline =
    job.status === "in_transit"
      ? job.id === "J-4217"
        ? `Em trânsito, no plano · decisão de pausa até ${w.limit}`
        : `Em trânsito · chega a ${nextStops[0]?.city} às ${nextStops[0]?.eta}`
      : job.plan === "REPLAN_REQUIRED"
        ? "O plano confirmado já não serve esta janela"
        : (job.blockers[0] ?? `${STATUS_LABEL[job.status]} · ${job.next}`);

  return (
    <article className="fx-instrument fx-overview fx-story-wrap" data-focus={state.focus?.kind ?? undefined}>
      <header className="fx-answer">
        <h1>{headline}</h1>
        <div className="fx-story-states">
          <ol className="fx-life">
            {LIFECYCLE.map((s, i) => (
              <li key={s} data-state={i < now ? "done" : i === now ? "now" : "next"}>
                <i />
                <span>{STATUS_LABEL[s]}</span>
              </li>
            ))}
          </ol>
          <span className="fx-story-badges">
            <Status tone={job.sla === "on_track" ? "ok" : "risk"}>{SLA_LABEL[job.sla]}</Status>
            <Status tone={job.plan === "PLANNED" ? "ok" : job.plan === "REPLAN_REQUIRED" ? "action" : "neutral"}>
              {PLAN_LABEL[job.plan]} · rev. {job.revision}
            </Status>
            {job.priority !== "normal" && <Status tone="risk">Urgente</Status>}
          </span>
        </div>
      </header>

      <div className="fx-story-rail">
        <span className="fx-story-line" />
        {progress != null && <span className="fx-story-progress" style={{ width: `${progress * 100}%` }} />}
        {job.stops.map((s, i) => (
          <button
            key={s.id}
            className="fx-story-stop"
            data-ix={focusStop === s.id ? undefined : "follow"}
            disabled={focusStop === s.id}
            data-focused={focusStop === s.id}
            onClick={() => act({ type: "follow", object: { kind: "delivery", stop: s.id } })}
            data-done={!!s.completedAt}
            data-type={s.type}
            data-edge={i === 0 ? "start" : i === job.stops.length - 1 ? "end" : undefined}
            style={{ left: `${(s.km / route.km) * 100}%` }}
          >
            <i />
            <b>{s.city}</b>
            <small>{s.completedAt ? `✓ ${s.completedAt}` : `ETA ${s.eta}`}</small>
          </button>
        ))}
        {progress != null && (
          <span className="fx-story-now" style={{ left: `${progress * 100}%` }}>
            <b>{NOW.clock}</b>
          </span>
        )}
      </div>

      {focusStop && (() => {
        const st = job.stops.find((x) => x.id === focusStop)!;
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const eta = st.completedAt ?? st.eta;
        const slack = /\d/.test(eta) ? toMin(st.window[1]) - toMin(eta) : null;
        const lines = job.cargo.filter((c) => (st.type === "pickup" ? true : c.dropAt === st.city));
        const pallets = lines.reduce((n, c) => n + c.pallets, 0);
        return (
          <section className="fx-delivery" aria-label={`Entrega em ${st.city}`}>
            <div className="fx-delivery-head">
              <span className="fx-story-k">{st.type === "pickup" ? "Carga" : st.type === "stop" ? "Descarga parcial" : "Entrega final"}</span>
              <b>
                {st.site} · {st.city}
              </b>
              <Status tone={st.completedAt ? "ok" : slack == null ? "unknown" : slack < 0 ? "action" : slack < 20 ? "risk" : "ok"}>
                {st.completedAt
                  ? `concluída ${st.completedAt}`
                  : slack == null
                    ? "sem estimativa"
                    : slack >= 0
                      ? `ETA ${eta} · ${slack} min de folga`
                      : `ETA ${eta} · ${-slack} min depois da janela`}
              </Status>
            </div>
            <dl className="fx-facts">
              <div>
                <dt>Janela</dt>
                <dd>{st.window.join("–")}</dd>
              </div>
              <div>
                <dt>{st.type === "pickup" ? "Carrega" : "Descarrega"}</dt>
                <dd>
                  {pallets} paletes · {lines.map((c) => c.description.toLowerCase()).join(" · ")}
                </dd>
              </div>
              <div>
                <dt>Na guia CMR</dt>
                <dd>{st.type === "pickup" ? "Lugar da tomada a cargo (casa 4)" : "Lugar previsto para entrega (casa 3)"}</dd>
              </div>
            </dl>
            <div className="fx-delivery-links">
              <button className="fx-link" data-ix="follow" onClick={() => act({ type: "focus", focus: { kind: "delivery", stop: st.id } })}>
                Ver estas paletes na viatura →
              </button>
              <button className="fx-link" data-ix="follow" onClick={() => act({ type: "facet", domain: "Fuel", facet: "window" })}>
                Ver a janela no percurso →
              </button>
              <button className="fx-link" data-ix="follow" onClick={() => act({ type: "follow", object: { kind: "document", id: w.ledger[0].id } })}>
                Ver a guia →
              </button>
            </div>
          </section>
        );
      })()}
      {(proposal || revision) && (
        <div className="fx-story-proposal" data-kind={proposal ? "proposal" : "revision"}>
          {proposal ? (
            <>
              <span className="fx-story-k">Proposto</span>
              <p>
                {proposal.title}: <s>{proposal.from}</s> → <b>{proposal.to}</b> · por confirmar
              </p>
            </>
          ) : (
            <>
              <span className="fx-story-k">Revisão {job.revision}</span>
              <p>
                {revision}: <s>{diffRow?.issued}</s> → <b>{diffRow?.current}</b> · alterado às 09:05, depois da guia emitida às 06:52
              </p>
              <button className="fx-link" data-ix="follow" onClick={() => act({ type: "facet", domain: "Documents", facet: "diff" })}>
                Ver o diff da guia →
              </button>
            </>
          )}
        </div>
      )}
      <ContentBands state={state} act={act} />
      <ol className="fx-story">
        <li data-step="started">
          <span className="fx-story-k">{first.completedAt ? "Começou" : "Origem"}</span>
          <p>
            {first.completedAt ? (
              <>
                Carregou <b data-focused={revision === "Paletes" || revision === "Peso bruto da carga"}>{w.pallets} paletes · {kg(w.cargoKg)}</b> em {first.site}, {first.city}, concluído às {first.completedAt}.
              </>
            ) : job.status === "loading" ? (
              <>
                Em carga: <b>{w.pallets} paletes · {kg(w.cargoKg)}</b> em {first.site}, {first.city} (janela {first.window.join("–")}).
              </>
            ) : (
              <>
                Ainda não começou. Carga prevista: <b>{w.pallets} paletes · {kg(w.cargoKg)}</b> em {first.site}, {first.city}, janela{" "}
                {first.window.join("–")}.
              </>
            )}
          </p>
          <small>
            {job.client} · ref. {job.reference}
          </small>
        </li>
        <li data-step="now">
          <span className="fx-story-k">Agora</span>
          <p>
            {job.positionKm != null ? (
              <>
                Em <b>{w.context.location}</b>, km {job.positionKm} de {Math.round(route.km)} <em>· posição simulada</em>
              </>
            ) : (
              <>Posição desconhecida — sem telemetria</>
            )}
          </p>
          <small className="fx-story-who">
            <button className="fx-inline" data-ix="follow" data-object={`driver:${w.driver.id}`} onClick={() => act({ type: "follow", object: { kind: "driver", id: w.driver.id } })}>
              {w.driver.name} <Id>{w.driver.id}</Id>
            </button>
            <button className="fx-inline" data-ix="follow" data-object={`truck:${w.truck.plate}`} onClick={() => act({ type: "follow", object: { kind: "truck", id: w.truck.id } })}>
              <Plate small>{w.truck.plate}</Plate>
            </button>
            {w.trailer && (
              <button className="fx-inline" data-ix="edit" onClick={() => act({ type: "edit", kind: "trailer", target: job.id })}>
                + <Id>{w.trailer.id}</Id>
              </button>
            )}
            {job.positionKm != null && (
              <button className="fx-inline" data-ix="spatial" onClick={() => act({ type: "spatial", intent: { question: "RESOURCE_AND_JOB", target: "resource", source: "user" } })}>
                ver no mapa
              </button>
            )}
          </small>
        </li>
        <li data-step="next">
          <span className="fx-story-k">A seguir</span>
          {nextStops.map((s) => (
            <p key={s.id} data-focused={focusStop === s.id}>
              <button
                className="fx-inline"
                data-ix={focusStop === s.id ? undefined : "follow"}
                disabled={focusStop === s.id}
                onClick={() => act({ type: "follow", object: { kind: "delivery", stop: s.id } })}
              >
                <b>{s.city}</b>
              </button>{" "}
              ETA {s.eta} · janela {s.window.join("–")} <em>· {s.cargo.toLowerCase()}</em>
            </p>
          ))}
          {job.id === "J-4217" && w.planned && (
            <button className="fx-inline fx-story-stoplink" data-ix="follow" data-object={`stop:${w.planned.id}`} onClick={() => act({ type: "follow", object: { kind: "stop", id: w.planned!.id } })}>
              Antes: pausa e abastecimento em {w.planned.name.replace("Área de serviço de ", "")} às {w.planned.arrival} →
            </button>
          )}
        </li>
        <li data-step="threats">
          <span className="fx-story-k">O que ameaça</span>
          {threats.length ? (
            threats.map((t, i) => (
              <button key={i} className="fx-inline fx-story-threat" data-ix={t.go.type === "edit" ? "edit" : "follow"} onClick={() => act(t.go)} data-object={t.object}>
                <Status tone={t.tone}>{t.text}</Status>
              </button>
            ))
          ) : (
            <p className="fx-quiet">Nada em aberto.</p>
          )}
        </li>
        <li data-step="decide">
          <span className="fx-story-k">O que precisa de decidir</span>
          <p>
            <b>{decision.text}</b>
          </p>
          <button className="fx-btn" data-ix={decision.go.type === "edit" ? "edit" : "follow"} onClick={() => act(decision.go)}>
            {decision.go.type === "edit" ? "Resolver →" : "Abrir →"}
          </button>
        </li>
      </ol>
    </article>
  );
}
