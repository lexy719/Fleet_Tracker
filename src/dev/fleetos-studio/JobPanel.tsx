import { ROUTES, strategyLabel, distinctRoads, allDrivers, alternatives, clock, driverWorld, initials, span, trailerWorld, truckWorld, SPELL_LIMIT, DAY_LIMIT, truckReady, trailerFit, allTrucks, freeTrailers, windowOptions, noticeText, seedOf, type Edit, type Need, type Plan } from "./model";
import { Draft, Mode, Row } from "./types";
import { Status, Strip, delta, Fact, Hours } from "./parts";
import { W } from "./world/active";
import { StudioPlanner, type PlannedRoutes } from "./StudioPlanner";
import { phaseOf, canReassign } from "./model";
import { FUEL_SOURCE_LABEL } from "./fuel";
import { FuelChart, fuelVerdict, RefuelList } from "./fuelui";
import { useState } from "react";
import { forwardStep } from "../../domain/jobs/lifecycle";

export function describe(job: Row, e: Edit): string[] {
  const seed = seedOf(job.id);
  const cur = { ...seed, ...job.edit };
  const out: string[] = [];
  if (e.driverId && e.driverId !== job.driverId) out.push(`${driverWorld(e.driverId).name} atribuído`);
  if (e.routeId && e.routeId !== job.route.id) out.push(`rota ${strategyLabel(ROUTES[e.routeId].strategy).toLowerCase()}`);
  if (e.truckId && e.truckId !== cur.truckId) out.push(`viatura ${truckWorld(e.truckId).plate}`);
  if (e.trailerId && e.trailerId !== cur.trailerId) out.push(`reboque ${trailerWorld(e.trailerId)?.plate ?? e.trailerId}`);
  if (e.windows)
    for (const [id, w] of Object.entries(e.windows)) {
      const st = seed.stops.find((x) => x.id === id);
      out.push(`janela ${st?.city ?? id} ${w[0]}–${w[1]}`);
    }
  if (e.notified && !job.notified) out.push("cliente avisado (simulado)");
  if (e.exception && !job.exception) out.push("exceção registada (simulado)");
  return out;
}

/* ─── Panel ─────────────────────────────────────────────────────────────── */

export const NEED_ACTION: Record<Exclude<Need, null>, { mode: Mode; label: string }> = {
  plan: { mode: "plan", label: "Planear rota e atribuir" },
  driver: { mode: "driver", label: "Atribuir motorista" },
  exception: { mode: "exception", label: "Registar exceção" },
  truck: { mode: "truck", label: "Trocar viatura" },
  trailer: { mode: "trailer", label: "Atribuir reboque" },
  window: { mode: "window", label: "Rever janela" },
  notify: { mode: "notify", label: "Avisar cliente" },
};

export function JobPanel({
  job,
  mode,
  setMode,
  draft,
  setDraft,
  setPeek,
  preview,
  trial,
  onBack,
  onConfirm,
  onPlanRoutes,
  onPlanConfirmed,
  onStation,
  spotId,
  onExecuted,
}: {
  job: Row;
  mode: Mode;
  setMode: (m: Mode) => void;
  draft: Draft;
  setDraft: (d: Draft) => void;
  setPeek: (d: Draft) => void;
  preview: Plan | null;
  trial: (e: Edit) => Plan | null;
  onBack: () => void;
  onConfirm: () => void;
  onPlanRoutes: (r: PlannedRoutes) => void;
  onPlanConfirmed: () => void;
  onStation: (stationId: string) => void;
  spotId: string | null;
  onExecuted: (msg: string) => void;
}) {
  const storeId = W().storeIds?.[job.id];
  const storeJob = storeId ? W().ops?.service.getState().jobs.find((x) => x.id === storeId) : undefined;
  const d = driverWorld(job.driverId);
  const t = truckWorld(job.truckId);
  const tr = trailerWorld(job.trailerId);
  const alts = alternatives(seedOf(job.id));
  const pl = preview ?? job.forecast;
  const changes = describe(job, draft);
  const draftPlan = changes.length ? trial(draft) : null;
  const pallets = job.cargo.reduce((a, c) => a + c.pallets, 0);
  const kg = job.cargo.reduce((a, c) => a + c.weightKg, 0);
  const started = job.positionKm != null;
  const timed = (p: Plan | null) => !!p && (started || p.start != null);
  const need = job.need ? NEED_ACTION[job.need] : null;
  const phase = phaseOf(job.status);
  // Execution: the same lifecycle command as Expedição (assigned → loading → in_transit → delivered).
  const stopStep = (() => {
    if (!storeJob || (storeJob.status !== "loading" && storeJob.status !== "in_transit")) return null;
    const want = (x: { type: string }) => (storeJob.status === "loading" ? x.type === "pickup" : x.type !== "pickup");
    const st = [...storeJob.stops].sort((x, y) => x.sequence - y.sequence).find((x) => want(x) && !x.completed);
    if (!st) return null;
    const what = st.type === "pickup" ? "Carga concluída" : st.type === "delivery" ? "Entrega concluída" : "Paragem concluída";
    return { id: st.id, label: `${what} · ${st.city || st.address}` };
  })();
  const step = storeJob && !stopStep ? forwardStep(storeJob.status) : null;
  const [busy, setBusy] = useState(false);
  const [execErr, setExecErr] = useState<string[]>([]);
  const execute = async () => {
    if (!storeJob || !step || !W().ops) return;
    setBusy(true);
    setExecErr([]);
    const r = await W().ops!.service.transition(storeJob.id, step.to);
    setBusy(false);
    if (r.ok) onExecuted(`${job.id} · ${step.label.replace(/^Confirmar /, "").replace(/^Marcar como /, "")} confirmado`);
    else setExecErr(r.errors);
  };
  const completeStop = async () => {
    if (!storeJob || !stopStep || !W().ops) return;
    setBusy(true);
    setExecErr([]);
    const r = await W().ops!.service.setStopCompleted(storeJob.id, stopStep.id, true);
    setBusy(false);
    if (r.ok) onExecuted(`${job.id} · ${stopStep.label}`);
    else setExecErr(r.errors);
  };
  const peekProps = (e: Edit) => ({
    onMouseEnter: () => setPeek(e),
    onMouseLeave: () => setPeek({}),
    onFocus: () => setPeek(e),
    onBlur: () => setPeek({}),
  });
  const outcome = (p: Plan | null) =>
    !p ? "—" : !timed(p) ? "sem início possível" : p.final != null ? clock(p.final) : "—";
  const shift = (p: Plan | null) =>
    !p || !timed(p) || p.final == null
      ? p?.issues[0] ?? ""
      : job.forecast.final != null && timed(job.forecast)
        ? delta(p.final - job.forecast.final)
        : `início ${clock(p.start ?? p.trace[0]?.from ?? 0)}`;

  return (
    <aside className="panel" aria-label={`Transporte ${job.id}`} data-tone={job.tone}>
      <span className="panel-bg" data-flip={`bg-${job.id}`} data-flip-mode="box" />
      <div className="panel-head">
        <button className="back" onClick={onBack} aria-label="Voltar à operação (Esc)">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="panel-title">
          <span className="ref ref-big" data-flip={`ref-${job.id}`}>
            {job.id}
          </span>
          <span className="panel-client" data-flip-enter="120">
            {job.client} · {job.reference}
          </span>
        </div>
        <Status job={job} />
      </div>

      <div className="panel-scroll">
        <div className="panel-strip" data-flip={`strip-${job.id}`} data-flip-mode="box">
          <Strip job={job} plan={pl} big />
        </div>
        {(job.route as { recorded?: boolean }).recorded === false && (
          <p className="route-note" data-flip-enter="140">
            Rota de estrada por calcular · linha direta entre paragens, distâncias e tempos estimados (×1,25, 72 km/h).
          </p>
        )}
        {(job.route as { preview?: boolean }).preview && (
          <p className="route-note route-note-soft" data-flip-enter="140">
            Percurso pela estrada (TomTom, camião) · ainda sem plano confirmado: portagens, pausas e restrições entram ao planear.
          </p>
        )}
        <div className="panel-facts" data-flip-enter="160">
          <Fact k="Percurso" v={`${Math.round((preview ? ROUTES[preview.routeId] : job.route).km)} km`} />
          <Fact k="Condução" v={span(pl.driveMin)} changed={!!preview && Math.round(preview.driveMin) !== Math.round(job.forecast.driveMin)} />
          <Fact
            k={started ? "Pausas" : "Início"}
            v={started ? String(pl.breaks) : pl.start != null ? clock(pl.start) : "—"}
            changed={!!preview && (started ? preview.breaks !== job.forecast.breaks : preview.start !== job.forecast.start)}
          />
          <Fact
            k="Chegada final"
            v={timed(pl) && pl.final != null ? clock(pl.final) : "—"}
            changed={!!preview && preview.final !== job.forecast.final}
            tone={pl.stops.at(-1)?.late ? "bad" : undefined}
          />
        </div>

        <section className="decision" data-flip-enter="200" data-solved={!job.need && Object.keys(job.edit).length > 0 ? "" : undefined}>
          <span className="eyebrow">{!job.need && Object.keys(job.edit).length > 0 ? "Resolvido" : "Próxima decisão"}</span>
          <p>{job.blockers[0] ?? job.next}</p>
          {job.planNote && <p className="sub">{job.planNote}</p>}
          {!job.blockers.length && pl.issues[0] && !job.notified && <p className="sub">{pl.issues[0]}</p>}
          <div className="actions">
            {stopStep && (
              <button className="act act-exec" disabled={busy} onClick={() => void completeStop()}>
                <span className="exec-dot" aria-hidden />
                {busy ? "A registar…" : stopStep.label}
              </button>
            )}
            {step && step.to !== "invoiced" && (
              <button className="act act-exec" disabled={busy} data-step={step.to} onClick={() => void execute()}>
                <span className="exec-dot" aria-hidden />
                {busy ? "A registar…" : step.label}
              </button>
            )}
            {need && (
              <button className="act act-need" aria-pressed={mode === need.mode} onClick={() => setMode(mode === need.mode ? null : need.mode)}>
                {need.label}
              </button>
            )}
            {canReassign(job.status) && W().source === "ops" && need?.mode !== "plan" && (
              <button className="act" aria-pressed={mode === "plan"} onClick={() => setMode(mode === "plan" ? null : "plan")}>
                Replanear
              </button>
            )}
            {canReassign(job.status) && W().source !== "ops" && need?.mode !== "driver" && (
              <button className="act" aria-pressed={mode === "driver"} onClick={() => setMode(mode === "driver" ? null : "driver")}>
                Trocar motorista
              </button>
            )}
            {canReassign(job.status) && W().source !== "ops" && (
              <button
                className="act"
                aria-pressed={mode === "route"}
                disabled={alts.length < 2}
                title={alts.length < 2 ? "Só há uma rota registada para este percurso" : undefined}
                onClick={() => setMode(mode === "route" ? null : "route")}
              >
                Rotas {alts.length > 1 && <b>{alts.length}</b>}
              </button>
            )}
          </div>
          {execErr.length > 0 && (
            <ul className="exec-err" role="alert">
              {execErr.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {phase !== "planning" && (
            <p className="phase-note">
              {phase === "closed"
                ? "Transporte concluído · só documentos e faturação."
                : `${phase === "loading" ? "Em carga" : "Em viagem"} · motorista, viatura, reboque e rota ficam fixos até à entrega.`}
            </p>
          )}
        </section>

        {mode === "plan" && storeJob && (
          <StudioPlanner job={storeJob} onRoutes={onPlanRoutes} onConfirmed={onPlanConfirmed} onCancel={() => setMode(null)} />
        )}

        {mode === "exception" && (
          <section className="unfold" aria-label="Registar exceção">
            <div className="notice">
              <span className="notice-to">
                Exceção para <b>{d.name}</b> · fica no registo do transporte
              </span>
              <textarea
                className="notice-text"
                defaultValue={draft.exception ?? exceptionText(job, pl)}
                rows={4}
                onChange={(e) => setDraft({ ...draft, exception: e.target.value })}
                onFocus={(e) => setDraft({ ...draft, exception: e.target.value })}
              />
              <span className="fine">Simulado: nada é gravado fora desta sessão. A troca de motorista só é possível antes da carga.</span>
            </div>
          </section>
        )}

        {job.fuel && phase !== "closed" && (
          <section className="fuelsec" aria-label="Combustível" data-flip-enter="230">
            <span className="eyebrow">Combustível · calculado com a rota</span>
            <FuelChart v={job.fuel} nowKm={job.km} />
            <span className="f-ends">
              <span>
                {Math.round((job.fuel.startL / job.fuel.tankL) * 100)}% · {Math.round(job.fuel.startL)} L ({job.fuel.reading})
              </span>
              <span>{job.stops.at(-1)!.city}</span>
            </span>
            <p className="f-verdict" data-tone={fuelVerdict(job.fuel).tone}>
              {fuelVerdict(job.fuel).text}
            </p>
            <RefuelList v={job.fuel} pl={pl} onSpot={onStation} spotId={spotId} />
            <p className="fine">
              {FUEL_SOURCE_LABEL}. Motor de abastecimento da expedição · regra: chegar com ≥25% · paragem de 20 min ou dentro da pausa de 45 min.
            </p>
          </section>
        )}

        {mode === "notify" && (
          <section className="unfold" aria-label="Aviso ao cliente">
            <div className="notice">
              <span className="notice-to">
                Para <b>{job.client}</b> · logística
              </span>
              <textarea
                className="notice-text"
                defaultValue={draft.notified ?? noticeText(job, pl)}
                rows={5}
                onChange={(e) => setDraft({ ...draft, notified: e.target.value })}
                onFocus={(e) => setDraft({ ...draft, notified: e.target.value })}
              />
              <span className="fine">Simulado: o aviso fica registado no transporte, nada é enviado.</span>
            </div>
          </section>
        )}

        {mode === "route" && (
          <section className="unfold" aria-label="Rotas registadas">
            {alts.map((r) => {
              const p = trial({ ...draft, routeId: r.id });
              const sel = (draft.routeId ?? job.route.id) === r.id;
              return (
                <button key={r.id} className="option" aria-pressed={sel} {...peekProps({ routeId: r.id })} onClick={() => setDraft({ ...draft, routeId: r.id })}>
                  <span className="opt-main">
                    <b>{strategyLabel(r.strategy)}</b>
                    {r.id === job.route.id && <em>atual</em>}
                    <span className="opt-sub">via {distinctRoads(r, alts).join(" · ")}</span>
                  </span>
                  <span className="opt-num">
                    <b>{Math.round(r.km)} km</b>
                    <span>{timed(p) && p?.final != null ? `chega ${clock(p.final)}` : span(r.hours * 60)}</span>
                  </span>
                </button>
              );
            })}
            <p className="fine">Geometria registada TomTom · {job.route.retrievedAt.slice(0, 10)}. Tempos estimados pela velocidade média registada.</p>
          </section>
        )}

        <section className="stops" aria-label="Paragens">
          <span className="eyebrow">Paragens</span>
          <ol className="metro">
            {job.stops.map((s, i) => {
              const now = job.forecast.stops[i];
              const nxt = pl.stops[i];
              const win = draft.windows?.[s.id] ?? s.window;
              const moved = preview && now.eta != null && nxt.eta != null && Math.round(now.eta) !== Math.round(nxt.eta);
              return (
                <li key={s.id} data-done={s.completedAt ? "" : undefined} data-late={nxt.late || undefined} data-tether={`stop-${job.id}-${s.id}`}>
                  <span className="m-node" />
                  <span className="m-body">
                    <span className="m-city">
                      {s.city}
                      <span className="m-type">{s.type === "pickup" ? "Carga" : s.type === "delivery" ? "Entrega" : "Paragem"}</span>
                    </span>
                    <span className="m-site">{s.site}</span>
                    <span className="m-cargo">{s.cargo}</span>
                  </span>
                  <span className="m-time">
                    {s.completedAt ? (
                      <b className="t-done">{s.completedAt}</b>
                    ) : timed(pl) && nxt.eta != null ? (
                      <>
                        {moved && timed(job.forecast) && <s>{clock(now.eta!)}</s>}
                        <b key={Math.round(nxt.eta)} className={moved ? "t-moved" : undefined}>
                          {clock(nxt.eta)}
                        </b>
                      </>
                    ) : (
                      <b className="t-done">—</b>
                    )}
                    <span className="m-win" data-changed={win !== s.window || undefined}>
                      janela {win[0]}–{win[1]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {mode === "window" && (
            <div className="unfold" aria-label="Propostas de janela">
              {windowOptions(job, job.forecast).map((o) => {
                const p = trial({ ...draft, windows: o.windows });
                const sel = JSON.stringify(draft.windows) === JSON.stringify(o.windows);
                const ok = p && !p.stops.some((x) => x.late);
                return (
                  <button key={o.label} className="option" aria-pressed={sel} data-verdict={ok ? "ok" : "warn"} {...peekProps({ windows: o.windows })} onClick={() => setDraft({ ...draft, windows: o.windows })}>
                    <span className="opt-main">
                      <b>{o.label}</b>
                      <span className="opt-sub">{o.detail}</span>
                      {!ok && <span className="opt-issue">Continua fora de uma janela</span>}
                    </span>
                    <span className="opt-num">
                      <b>{outcome(p)}</b>
                      <span>{ok ? "cumpre as janelas" : shift(p)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="crew" aria-label="Equipa e viatura">
          <span className="eyebrow">Quem e o quê</span>
          <div className="unit">
            <div className="person" data-flip={`drv-${job.driverId}`}>
              <span className="mono mono-big">{initials(d.name)}</span>
              <span className="p-name">
                {d.name || "Sem motorista"}
                <span>{d.employee}</span>
              </span>
            </div>
            {d.qualifications.some((q) => q.state === "EXPIRED" || q.state === "EXPIRING") && (
              <span className="quals">
                {d.qualifications
                  .filter((q) => q.state === "EXPIRED" || q.state === "EXPIRING")
                  .map((q) => (
                    <span key={q.kind} className="qual" data-s={q.state}>
                      {q.label} · {q.detail}
                    </span>
                  ))}
              </span>
            )}
            <Hours used={d.spellMin} limit={SPELL_LIMIT} label="desde a última pausa" />
            <Hours used={d.dayMin} limit={DAY_LIMIT} label="condução hoje" />
          </div>

          {mode === "driver" && (
            <div className="unfold" aria-label="Motoristas disponíveis">
              {allDrivers()
                .filter((x) => x.id !== job.driverId)
                .map((x) => ({ x, p: trial({ ...draft, driverId: x.id }) }))
                .sort((a, b) => (a.p?.issues.length ?? 9) - (b.p?.issues.length ?? 9) || (a.p?.final ?? 0) - (b.p?.final ?? 0))
                .map(({ x, p }) => {
                  const bad = p?.issues.some((i) => /Ultrapassa|caducou|sem motorista/.test(i));
                  return (
                    <button
                      key={x.id}
                      className="option"
                      aria-pressed={draft.driverId === x.id}
                      data-verdict={bad ? "bad" : p?.issues.length ? "warn" : "ok"}
                      {...peekProps({ driverId: x.id })}
                      onClick={() => setDraft({ ...draft, driverId: x.id })}
                    >
                      <span className="mono">{initials(x.name)}</span>
                      <span className="opt-main">
                        <b>{x.name}</b>
                        <span className="opt-sub">
                          {x.where}
                          {p && p.handoverMin > 0 && ` · ${span(p.handoverMin)} até ao camião`}
                        </span>
                        {p?.issues[0] && <span className="opt-issue">{p.issues[0]}</span>}
                      </span>
                      <span className="opt-num">
                        <b>{outcome(p)}</b>
                        <span>{p && !p.issues.length ? shift(p) || "ok" : shift(p)}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          )}

          <div className="vehicle">
            <div className="v-plate-row">
              <span className="plate plate-big" data-flip={`plate-${job.truckId}`}>
                {t.plate}
              </span>
              <span className="v-model">
                {t.make} {t.model}
                <span>
                  {t.emission} · {t.axles} eixos
                </span>
              </span>
              {t.availability !== "AVAILABLE" && <span className="v-flag">Em oficina</span>}
            </div>
            {t.availability !== "AVAILABLE" && <span className="v-service">{t.service}</span>}
            <div className="fuel" title={`Leitura ${t.fuel.prov.source} · ${t.fuel.prov.at ?? ""}`}>
              <span className="fuel-bar">
                <span style={{ width: `${t.fuel.value}%` }} />
              </span>
              <span className="fuel-txt">
                Combustível <b>{t.fuel.value}%</b> · ≈{Math.round((t.fuel.value / 100) * t.tankL)} L de {t.tankL} L
                <em>{t.fuel.prov.source}</em>
              </span>
            </div>
            {mode === "truck" && (
              <div className="unfold unfold-in" aria-label="Viaturas">
                {allTrucks()
                  .filter((x) => x.id !== job.truckId)
                  .map((x) => ({ x, r: truckReady(job, x.id), p: trial({ ...draft, truckId: x.id }) }))
                  .sort((a, b) => a.r.issues.length - b.r.issues.length || a.r.at - b.r.at)
                  .map(({ x, r, p }) => (
                    <button
                      key={x.id}
                      className="option"
                      aria-pressed={draft.truckId === x.id}
                      data-verdict={r.issues.length ? "bad" : p?.issues.length ? "warn" : "ok"}
                      {...peekProps({ truckId: x.id })}
                      onClick={() => setDraft({ ...draft, truckId: x.id })}
                    >
                      <span className="plate">{x.plate}</span>
                      <span className="opt-main">
                        <b>
                          {x.make} {x.model}
                        </b>
                        <span className="opt-sub">
                          {x.where} · {r.travel ? `${span(r.travel)} até ${job.stops[0].city}` : "no local"} · {x.fuel.value}% gasóleo
                        </span>
                        {(r.issues[0] ?? p?.issues[0]) && <span className="opt-issue">{r.issues[0] ?? p?.issues[0]}</span>}
                      </span>
                      <span className="opt-num">
                        <b>{p?.start != null ? clock(p.start) : "—"}</b>
                        <span>início</span>
                      </span>
                    </button>
                  ))}
              </div>
            )}
            <div className="trailer">
              {tr ? (
                <>
                  <span className="tr-plate">{tr.plate}</span> {tr.type} · {tr.lengthM} m · {pallets}/{tr.pallets} paletes · {(kg / 1000).toFixed(1)} t
                </>
              ) : (
                <span className="tr-missing">Reboque «{job.trailerId}» não existe na frota</span>
              )}
            </div>
            {mode === "trailer" && (
              <div className="unfold unfold-in" aria-label="Reboques livres">
                {freeTrailers()
                  .map((x) => ({ x, f: trailerFit(job, x.id), p: trial({ ...draft, trailerId: x.id }) }))
                  .sort((a, b) => a.f.issues.length - b.f.issues.length || a.f.travel - b.f.travel)
                  .map(({ x, f, p }) => (
                    <button
                      key={x.id}
                      className="option"
                      aria-pressed={draft.trailerId === x.id}
                      data-verdict={f.issues.length ? "bad" : p?.issues.length ? "warn" : "ok"}
                      {...peekProps({ trailerId: x.id })}
                      onClick={() => setDraft({ ...draft, trailerId: x.id })}
                    >
                      <span className="tr-chip">{x.type}</span>
                      <span className="opt-main">
                        <b>{x.plate}</b>
                        <span className="opt-sub">
                          {x.location?.replace("livre · ", "")} · {x.pallets} paletes · {f.travel ? `${span(f.travel)} até ${job.stops[0].city}` : "no local"}
                        </span>
                        {(f.issues[0] ?? p?.issues[0]) && <span className="opt-issue">{f.issues[0] ?? p?.issues[0]}</span>}
                      </span>
                      <span className="opt-num">
                        <b>{p?.start != null ? clock(p.start) : "—"}</b>
                        <span>início</span>
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {changes.length > 0 && (
        <div className="commit" role="region" aria-label="Confirmar alteração">
          <span className="commit-txt">
            <b>{changes.join(" · ")}</b>
            <span>
              {draftPlan && timed(draftPlan) && draftPlan.final != null
                ? `chegada ${clock(draftPlan.final)}${timed(job.forecast) && job.forecast.final != null ? ` · ${delta(draftPlan.final - job.forecast.final)}` : ""}`
                : "plano atualizado"}
              {draftPlan?.issues[0] && !draft.notified && ` · ${draftPlan.issues[0]}`}
            </span>
          </span>
          <button className="ghost" onClick={() => setMode(null)}>
            Cancelar
          </button>
          <button className="primary" onClick={onConfirm}>
            {draft.notified ? "Registar aviso" : draft.exception ? "Registar exceção" : "Confirmar"}
          </button>
        </div>
      )}
    </aside>
  );
}

function exceptionText(job: Row, pl: Plan) {
  const d = driverWorld(job.driverId);
  const issue = pl.issues.find((i) => /caducou|caducad/i.test(i)) ?? "qualificação em falta";
  return `${d.name}: ${issue}. Transporte ${job.id} já em viagem — conclui a entrega em ${job.stops.at(-1)!.city} e fica indisponível para novas atribuições até regularizar.`;
}
