// Viagens: the palco whose primary category is the trip. One line per trip, measured in hours ("O dia",
// when) or in km ("A estrada", where): the same lines stretch from one to the other. The palco answers one
// question — do today's trips arrive well? — in one variation at a time:
//   A tempo   — the client's window at the arrival (bracket), late after it closes (red), waiting (amber).
//   Paragens  — the pauses and refuels on the way (the plan merges a refuel into a due pause).
//   Carga     — loading/unloading and the km driven loaded; the engine's proposal shows its empty km.
// People and trucks are not layers here: their names are links to their own palcos (Perfil, Garagem).
import { useEffect, useLayoutEffect, useRef } from "react";
import { allDrivers, clock, driverWorld, initials, span, truckWorld, DAY_LIMIT } from "./model";
import type { Row } from "./types";
import { eurL } from "./fuelui";
import { recentlyAccepted, usePlanProposal } from "./planProposal";
import { W } from "./world/active";
import { plateFlight } from "./Garage";
import { palcoFlight } from "./Layers";
import { Variations, usePalcoEntrance, useRowFlip } from "./palco";

export type ViagensVar = "tempo" | "paragens" | "carga";
export type Measure = "hours" | "km";
export const VIAGENS_VARS: [ViagensVar, string][] = [
  ["tempo", "A tempo"],
  ["paragens", "Paragens"],
  ["carga", "Carga"],
];

const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
/** The client's window at the last stop, placed on the same day as the arrival. */
function windowOf(j: Row): [number, number] | null {
  const w = j.stops.at(-1)?.window;
  if (!w || j.forecast.final == null) return null;
  const f = j.forecast.final;
  let a = Math.floor(f / 1440) * 1440 + toMin(w[0]);
  if (a - f > 720) a -= 1440;
  if (f - a > 720) a += 1440;
  return [a, a + ((toMin(w[1]) - toMin(w[0]) + 1440) % 1440)];
}

type Trip = { id: string; name: string; mono: string; job: Row; win: [number, number] | null; tone: "bad" | "warn" | "ok"; nextStop: number; drive: number };
type Person = { id: string; name: string; mono: string; where: string; left: number };
type Done = { id: string; name: string; mono: string; job: Row; dayMin: number };

export function DayScene({
  jobs,
  now,
  variant,
  measure,
  onVariant,
  onMeasure,
  onOpen,
  onTruck,
  onDriver,
  onFuel,
  onClient,
}: {
  jobs: Row[];
  now: number;
  variant: ViagensVar;
  measure: Measure;
  onVariant: (v: ViagensVar) => void;
  onMeasure: (m: Measure) => void;
  onOpen: (id: string) => void;
  /** Tapping a plate opens the Garagem with that truck in focus. */
  onTruck?: (truckId: string) => void;
  /** Tapping a person opens their Perfil. */
  onDriver?: (driverId: string) => void;
  /** Tapping a refuel stop opens the Combustível palco with it in focus. */
  onFuel?: (stopId: string) => void;
  /** Tapping the client opens the Cliente palco with it in focus. */
  onClient?: (client: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const km = measure === "km";
  // Rows enter one by one when the palco opens; a new variation only cross-fades (no long delays).
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);
  const delay = (first: number, i: number) => `${opened.current ? i * 0.03 : first + i * 0.08}s`;
  usePalcoEntrance(root);

  const trips: Trip[] = [];
  const free: Person[] = [];
  const done: Done[] = [];
  for (const d of allDrivers()) {
    const w = driverWorld(d.id);
    const base = { id: d.id, name: w.name, mono: initials(w.name) };
    const j = jobs.find((x) => x.driverId === d.id);
    if (!j) free.push({ ...base, where: d.where || "—", left: Math.max(0, DAY_LIMIT - w.dayMin) });
    else if (j.status === "delivered" || j.forecast.final == null) done.push({ ...base, job: j, dayMin: w.dayMin });
    else {
      const win = windowOf(j);
      const f = j.forecast.final;
      const ahead = j.forecast.trace.filter((s) => s.to > now);
      const nextStop = ahead.find((s) => s.kind === "break" || s.kind === "fuel")?.from ?? Infinity;
      const drive = ahead.filter((s) => s.kind === "drive").reduce((a, s) => a + s.to - Math.max(s.from, now), 0);
      trips.push({ ...base, job: j, win, tone: win && f > win[1] ? "bad" : win && f < win[0] ? "warn" : "ok", nextStop, drive });
    }
  }
  // Each variation puts first what its question is about.
  if (variant === "tempo") trips.sort((a, b) => Number(b.tone === "bad") - Number(a.tone === "bad") || a.job.forecast.final! - b.job.forecast.final!);
  if (variant === "paragens") trips.sort((a, b) => a.nextStop - b.nextStop || a.job.forecast.final! - b.job.forecast.final!);
  if (variant === "carga") trips.sort((a, b) => b.job.route.km - a.job.route.km);
  const late = trips.filter((t) => t.tone === "bad").length;

  // Two scales for the same lines. Hours: about three hours back, eleven ahead (on even hours).
  // Km: from each route's start to the longest route (on hundreds).
  const t0 = Math.floor((now - 180) / 120) * 120;
  // …and far enough to show every arrival (up to a day).
  const lastArrival = Math.max(0, ...trips.map((t) => t.job.forecast.final ?? 0));
  const t1 = Math.min(t0 + 1440, Math.max(t0 + 840, Math.ceil((lastArrival + 300) / 120) * 120));
  const k1 = Math.max(100, Math.ceil((Math.max(0, ...trips.map((t) => t.job.route.km)) * 1.5) / 100) * 100); // room for the arrival label
  const pT = (m: number) => ((Math.min(Math.max(m, t0), t1) - t0) / (t1 - t0)) * 100;
  const pK = (k: number) => (Math.min(Math.max(k, 0), k1) / k1) * 100;
  /** Where a moment of a trip sits: its time in hours mode, its km in km mode. */
  const P = (t: number, k: number) => (km ? pK(k) : pT(t));
  const at = (t: number, k: number) => ({ left: `${P(t, k)}%` });
  const between = (ta: number, ka: number, tb: number, kb: number) => ({ left: `${P(ta, ka)}%`, width: `${Math.max(0, P(tb, kb) - P(ta, ka))}%` });

  // The engine's proposal for the open transports (organised by driver, fewer empty km).
  const { state: plan, accept, reasons } = usePlanProposal(true);
  const preview = plan.phase === "ready" || plan.phase === "confirming" ? plan.preview : null;
  const base = Date.now() - now * 60_000; // epoch ms of minute 0 of the studio's day
  const minOf = (ms: number) => (ms - base) / 60_000;
  const display = new Map(Object.entries(W().storeIds ?? {}).map(([disp, id]) => [id, disp]));
  const storeJob = (id: string) => W().ops?.service.getState().jobs.find((j) => j.id === id);
  // The engine speaks in store ids: names come from the store, and the studio's person is matched by name.
  const storeName = (id: string) => W().ops?.service.getState().drivers.find((d) => d.id === id)?.name ?? id;
  const proposed = (preview?.trips ?? []).map((t) => ({
    driverId: t.assignment.driverId,
    name: storeName(t.assignment.driverId),
    execs: t.jobIds.map((id) => preview!.executions.find((e) => e.jobId === id)!).filter(Boolean),
  }));
  const proposedNames = new Set(proposed.map((p) => p.name));
  const freeNow = free.filter((p) => !proposedNames.has(p.name));
  const doneNow = done.filter((p) => !proposedNames.has(p.name));
  const monoOf = (name: string) => [...free, ...done].find((p) => p.name === name)?.id ?? name;
  const unplaced = preview?.unassignedJobIds ?? [];
  const fuelStops = trips.flatMap((t) => t.job.forecast.fuelStops.filter((f) => f.at > now));
  const pauses = trips.flatMap((t) => t.job.forecast.trace.filter((s) => s.kind === "break" && s.to > now));
  const merged = fuelStops.filter((f) => f.merged).length;
  const loadedKm = Math.round(trips.reduce((a, t) => a + t.job.route.km, 0));

  // The people come to their place from where they stood in the cast (the leaving Motoristas scene).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.querySelectorAll<HTMLElement>("[data-dy-mono]").forEach((m, i) => {
      const from = document.querySelector<HTMLElement>(`.cn-scene[data-leaving] .cn-person[data-driver="${m.dataset.dyMono}"] .cn-mono`);
      const r = m.getBoundingClientRect();
      if (!from || !r.width) return;
      const f = from.getBoundingClientRect();
      m.animate([{ transform: `translate(${f.left - r.left}px, ${f.top - r.top}px) scale(${f.width / r.width})` }, { transform: "none" }], {
        duration: 1100,
        delay: 80 + i * 45,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        fill: "backwards",
      });
    });
  }, []);
  // A new variation: the rows glide to their new order (the line contents cross-fade by remounting).
  const captureRows = useRowFlip(root, variant);
  const pick = (v: ViagensVar) => {
    if (v === variant) return;
    captureRows();
    onVariant(v);
  };

  const hours = Array.from({ length: Math.floor((t1 - t0) / 120) + 1 }, (_, i) => t0 + i * 120);
  const kms = Array.from({ length: k1 / 100 + 1 }, (_, i) => i * 100);
  const label = VIAGENS_VARS.find((x) => x[0] === variant)![1].toLowerCase();
  const driverLink = (driverId: string, name: string) => (
    <em
      className="lnk"
      role="button"
      tabIndex={0}
      title="Abrir o perfil"
      onClick={(e) => {
        e.stopPropagation();
        palcoFlight.from = e.currentTarget.getBoundingClientRect();
        onDriver?.(driverId);
      }}
    >
      {name}
    </em>
  );
  return (
    <div className="dy-stage" ref={root} data-measure={measure} data-var={variant}>
      <header className="dy-head">
        <span className="cn-eyebrow">
          Viagens de hoje · {label} · em {km ? "km" : "horas"}
        </span>
        <h1>{km ? "A estrada" : "O dia"}</h1>
        <p className="dy-sum" key={variant}>
          {variant === "tempo" && (
            <>
              <b>{trips.length} na estrada</b>
              {late > 0 && (
                <>
                  {" · "}
                  <b data-tone="bad">
                    {late} {late === 1 ? "chega" : "chegam"} depois de fechar
                  </b>
                </>
              )}
              {` · ${trips.length - late} dentro da janela ou à espera`}
              {unplaced.length > 0 && ` · ${unplaced.length} por atribuir`}
            </>
          )}
          {variant === "paragens" && (
            <>
              <b>
                {pauses.length + fuelStops.length} {pauses.length + fuelStops.length === 1 ? "paragem" : "paragens"}
              </b>{" "}
              ainda hoje · {pauses.length} {pauses.length === 1 ? "pausa" : "pausas"} · {fuelStops.length} {fuelStops.length === 1 ? "abastecimento" : "abastecimentos"}
              {merged > 0 && (
                <>
                  {" · "}
                  <b data-tone="ok">
                    {merged} {merged === 1 ? "junta" : "juntam"} pausa e abastecimento
                  </b>
                </>
              )}
            </>
          )}
          {variant === "carga" && (
            <>
              <b>{loadedKm.toLocaleString("pt-PT")} km</b> carregados na estrada
              {preview && (
                <>
                  {" · "}
                  <b data-tone="warn">o motor propõe {Math.round(preview.metrics.emptyKm)} km vazios</b> para o que falta
                </>
              )}
            </>
          )}
        </p>
        <div className="dy-varsrow">
          <Variations options={VIAGENS_VARS} value={variant} onChange={pick} />
          <p className="dy-engine" data-phase={plan.phase} hidden={variant === "paragens"}>
            {recentlyAccepted() > 0 && plan.phase !== "confirmed" && (
              <span className="dy-done-note">
                ✓ {recentlyAccepted()} {recentlyAccepted() === 1 ? "viagem atribuída" : "viagens atribuídas"} ·
              </span>
            )}
            {plan.phase === "planning" && (
              <>
                <i className="dy-spin" /> O motor está a organizar {plan.jobs} viagens por motorista · lote {Math.min(plan.done + 1, plan.total)} de {plan.total}
              </>
            )}
            {preview && (
              <>
                <span>
                  Proposta do motor: <b>{preview.executions.length} de {plan.phase === "ready" || plan.phase === "confirming" ? plan.jobs : 0}</b> viagens cabem ·{" "}
                  <b>{Math.round(preview.metrics.emptyKm)} km vazios</b>
                  {unplaced.length > 0 && ` · ${unplaced.length} ficam por atribuir`}
                </span>
                {preview.executions.length > 0 && (
                  <button className="dy-accept" onClick={() => void accept()} disabled={plan.phase === "confirming"} title="Confirma lote a lote, como na Expedição; reconhece os dados por validar do plano">
                    {plan.phase === "confirming" ? `A confirmar ${Math.min(plan.done + 1, plan.total)} de ${plan.total}…` : "Aceitar proposta"}
                  </button>
                )}
              </>
            )}
            {plan.phase === "confirmed" && (
              <span>
                {plan.outcome.confirmed} {plan.outcome.confirmed === 1 ? "viagem atribuída" : "viagens atribuídas"}
                {plan.outcome.reason ? ` · parou: ${plan.outcome.reason}` : ""}
              </span>
            )}
            {plan.phase === "error" && <span data-tone="bad">O motor não conseguiu planear: {plan.message}</span>}
          </p>
        </div>
      </header>
      <div className="dy-measure" role="group" aria-label="Medir em">
        <button aria-pressed={!km} onClick={() => onMeasure("hours")}>
          Horas
        </button>
        <button aria-pressed={km} onClick={() => onMeasure("km")}>
          Km
        </button>
        <i data-km={km || undefined} />
      </div>

      <div className="dy-grid" style={{ ["--now" as string]: `${pT(now)}%` }}>
        <div className="dy-axis">
          {hours.map((m) => (
            <span key={`h${m}`} data-scale="hours" style={{ left: `${pT(m)}%` }} data-near-now={Math.abs(pT(m) - pT(now)) < 3.5 || undefined}>
              {clock(m)}
            </span>
          ))}
          {kms.map((k) => (
            <span key={`k${k}`} data-scale="km" style={{ left: `${pK(k)}%` }}>
              {k} km
            </span>
          ))}
          <span className="dy-now-tag" data-scale="hours" style={{ left: `${pT(now)}%` }}>
            agora {clock(now)}
          </span>
        </div>
        <div className="dy-rules">
          {hours.map((m) => (
            <i key={`h${m}`} data-scale="hours" style={{ left: `${pT(m)}%` }} />
          ))}
          {kms.map((k) => (
            <i key={`k${k}`} data-scale="km" style={{ left: `${pK(k)}%` }} />
          ))}
          <i className="dy-now" data-scale="hours" style={{ left: `${pT(now)}%` }} />
        </div>

        <div className="dy-trips">
          {trips.map((t, i) => {
            const j = t.job;
            const sc = j.scale;
            const tr = j.forecast.trace;
            const final = j.forecast.final!;
            const endKm = j.route.km;
            const posKm = Math.min(endKm, Math.max(0, j.km));
            const lateFrom = variant === "tempo" && t.tone === "bad" && t.win ? t.win[1] : Infinity;
            const firstSeg = tr.find((s) => s.to > t0) ?? tr[0];
            const first = firstSeg ? Math.max(firstSeg.from, t0) : now;
            const v = j.fuel;
            const stopsAhead = tr.filter((s) => (s.kind === "break" || s.kind === "fuel") && s.to > now).length;
            return (
              <button key={t.id} className="dy-trip" data-row={j.id} data-tone={variant === "tempo" ? t.tone : undefined} onClick={() => onOpen(j.id)} title={`Abrir ${j.id}`} style={{ animationDelay: delay(0.4, i) }}>
                <span className="dy-who">
                  <span className="dy-mono" data-dy-mono={t.id}>
                    {t.mono}
                  </span>
                  <span>
                    <b>
                      {j.stops[0].city} → {j.stops.at(-1)!.city}
                    </b>
                    <small>
                      {j.id} ·{" "}
                      <em
                        className="lnk"
                        role="button"
                        tabIndex={0}
                        title="Abrir o cliente"
                        onClick={(e) => {
                          e.stopPropagation();
                          palcoFlight.from = e.currentTarget.getBoundingClientRect();
                          onClient?.(j.client);
                        }}
                      >
                        {j.client.split(" — ")[0]}
                      </em>
                    </small>
                    <small className="dy-links">
                      {driverLink(t.id, t.name)}
                      {j.truckId && (
                        <>
                          {" · "}
                          <em
                            className="lnk dy-plate"
                            role="button"
                            tabIndex={0}
                            title="Abrir na garagem"
                            onClick={(e) => {
                              e.stopPropagation();
                              plateFlight.from = e.currentTarget.getBoundingClientRect();
                              onTruck?.(j.truckId!);
                            }}
                          >
                            {truckWorld(j.truckId).plate}
                          </em>
                        </>
                      )}
                    </small>
                  </span>
                </span>
                <span className="dy-line" key={variant} style={{ animationDelay: delay(0.6, i) }}>
                  {/* what already happened: a hairline up to "agora" */}
                  <i className="dy-past" style={between(first, 0, now, posKm)} />
                  {/* Carga: loading and unloading as a pale stretch of the line itself */}
                  {variant === "carga" &&
                    tr.map((s, k) => {
                      if (s.kind !== "stop") return null;
                      const firstLoad = tr.findIndex((q) => q.kind === "stop" && q.km0 * sc <= 0.5);
                      const a = Math.max(s.from, t0), b = Math.min(s.to, t1);
                      if (!km && b <= a) return null;
                      const unload = s.km0 * sc > 0.5;
                      return (
                        <span key={`c${k}`}>
                          <i className="dy-cargo" style={between(a, s.km0 * sc, b, s.km1 * sc)} />
                          {!unload && k === firstLoad && !km && (
                            <em className="dy-tag" data-center data-hide={Math.abs(P((a + b) / 2, s.km0 * sc) - P(final, endKm)) < 14 || undefined} style={at((a + b) / 2, s.km0 * sc)}>
                              {s.from < now ? `em carga · ${j.stops[0].city}` : "carga"}
                            </em>
                          )}
                        </span>
                      );
                    })}
                  {/* what is ahead: driving (red once the window has closed), pauses as dotted gaps */}
                  {tr.map((s, k) => {
                    const a = Math.max(s.from, now, t0);
                    const b = Math.min(s.to, t1);
                    if (b <= a) return null;
                    const ka = s.from < now ? posKm : s.km0 * sc, kb = s.km1 * sc;
                    if (s.kind === "drive") {
                      const cut = Math.min(Math.max(lateFrom, a), b);
                      const kc = ka + ((kb - ka) * (cut - a)) / (b - a || 1);
                      return (
                        <span key={k}>
                          {cut > a && <i className="dy-drive" data-loaded={variant === "carga" || undefined} style={between(a, ka, cut, kc)} />}
                          {b > cut && <i className="dy-drive" data-late style={between(cut, kc, b, kb)} />}
                        </span>
                      );
                    }
                    if (s.kind === "break" || s.kind === "wait" || s.kind === "fuel") {
                      const showStop = variant === "paragens" && s.kind !== "wait";
                      const fs = s.kind === "fuel" ? j.forecast.fuelStops.find((f) => Math.abs(f.at - s.from) < 1) : null;
                      const rf = fs ? v?.refuels.find((r) => Math.abs(r.km - fs.km * sc) < 3) : null;
                      return (
                        <span key={k}>
                          <i className="dy-pause" data-late={b > lateFrom || undefined} style={between(a, ka, b, kb)} />
                          {showStop && <i className={s.kind === "fuel" ? "dy-pump" : "dy-pause-node"} data-stop style={at((a + b) / 2, ka)} />}
                          {showStop && (
                            <em
                              className="dy-tag"
                              data-center
                              data-tone={s.kind === "fuel" ? "ok" : undefined}
                              data-go={(s.kind === "fuel" && rf) || undefined}
                              data-hide={Math.abs(P((a + b) / 2, ka) - P(final, endKm)) < 9 || undefined}
                              style={at((a + b) / 2, ka)}
                              title={fs ? `${fs.name}${rf ? ` · ${eurL(rf.pricePerL)} · abrir no Combustível` : ""}` : undefined}
                              onClick={
                                s.kind === "fuel" && rf
                                  ? (e) => {
                                      e.stopPropagation();
                                      palcoFlight.from = e.currentTarget.previousElementSibling?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
                                      onFuel?.(`${j.id}@${Math.round(rf.km)}`);
                                    }
                                  : undefined
                              }
                            >
                              {s.kind === "break"
                                ? `pausa ${span(s.to - s.from)}${s.from <= now ? " · agora" : ` · ${clock(s.from)}`}`
                                : fs?.merged
                                  ? `${clock(s.from)} · pausa + abastece${rf ? ` ${Math.round(rf.litres)} L` : ""}`
                                  : `${clock(s.from)} · abastece${rf ? ` ${Math.round(rf.litres)} L` : ""}`}
                            </em>
                          )}
                        </span>
                      );
                    }
                    return null;
                  })}
                  {/* A tempo: the client's window (hours only), a bracket under the line */}
                  {variant === "tempo" && t.win && t.win[0] < t1 && t.win[1] > t0 && (
                    <i className="dy-win" data-tone={t.tone} data-scale="hours" title={`janela ${clock(t.win[0])}–${clock(t.win[1])}`} style={{ left: `${pT(t.win[0])}%`, width: `${pT(t.win[1]) - pT(t.win[0])}%` }} />
                  )}
                  {variant === "tempo" && t.tone === "warn" && t.win && <i className="dy-wait" data-scale="hours" style={{ left: `${pT(final)}%`, width: `${pT(t.win[0]) - pT(final)}%` }} />}
                  {/* the truck now */}
                  <i className="dy-now-dot" style={at(now, posKm)} />
                  {/* the arrival: a node, the city and the time beside it, what it means below */}
                  <i className="dy-arrive" style={at(final, endKm)} />
                  <span className="dy-dest" data-flip={P(final, endKm) > 74 || undefined} style={at(final, endKm)}>
                    <b>
                      {j.stops.at(-1)!.city} <span>{clock(final)}</span>
                    </b>
                    <small data-tone={variant === "tempo" && t.tone === "bad" ? "bad" : undefined}>
                      {variant === "tempo" &&
                        (!t.win
                          ? "sem janela"
                          : t.tone === "bad"
                            ? `${span(final - t.win[1])} depois de fechar (${clock(t.win[1])})`
                            : t.tone === "warn"
                              ? `${span(t.win[0] - final)} à espera · abre ${clock(t.win[0])}`
                              : `dentro da janela até ${clock(t.win[1])}`)}
                      {variant === "paragens" && (stopsAhead ? `${stopsAhead} ${stopsAhead === 1 ? "paragem" : "paragens"} · ${span(t.drive)} a conduzir` : `sem paragens · ${span(t.drive)} a conduzir`)}
                      {variant === "carga" && `${Math.round(endKm)} km carregado · ${j.stops.length} ${j.stops.length === 2 ? "paragens de carga" : "paragens"}`}
                    </small>
                  </span>
                </span>
              </button>
            );
          })}
          {variant !== "paragens" &&
            proposed.map((p, i) => {
              const last = p.execs.at(-1)!;
              const lastJob = storeJob(last.jobId);
              let kAcc = 0;
              return (
                <div key={p.driverId} className="dy-trip" data-proposed data-row={`prop-${p.driverId}`} style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
                  <span className="dy-who">
                    <span className="dy-mono" data-free data-dy-mono={monoOf(p.name)}>
                      {initials(p.name)}
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>proposta do motor · {p.execs.map((e) => display.get(e.jobId) ?? e.jobId).join(" + ")}</small>
                    </span>
                  </span>
                  <span className="dy-line">
                    {p.execs.map((e) =>
                      e.movements.map((m, k) => {
                        const a = minOf(m.departMs), b = minOf(m.arrivalMs);
                        const d = m.route.distanceM / 1000;
                        const ka = kAcc, kb = (kAcc += d);
                        return m.kind === "EMPTY" ? (
                          <span key={`${e.jobId}-${k}`}>
                            <i className="dy-empty" style={between(a, ka, b, kb)} />
                            {variant === "carga" && (
                              <em className="dy-tag" data-center data-tone="warn" style={at((a + b) / 2, (ka + kb) / 2)}>
                                {Math.round(d)} km em vazio
                              </em>
                            )}
                          </span>
                        ) : (
                          <i key={`${e.jobId}-${k}`} className="dy-ghost" style={between(a, ka, b, kb)} />
                        );
                      }),
                    )}
                    <i className="dy-arrive" data-ghost style={at(minOf(last.endMs), kAcc)} />
                    <span className="dy-dest" data-flip={P(minOf(last.endMs), kAcc) > 74 || undefined} style={at(minOf(last.endMs), kAcc)}>
                      <b>
                        {lastJob?.stops.at(-1)?.city ?? ""} <span>{clock(minOf(last.endMs))}</span>
                      </b>
                      <small data-tone="mute">proposta · ainda não atribuída</small>
                    </span>
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <footer className="dy-people">
        {variant === "tempo" && freeNow.length > 0 && (
          <div>
            <span className="dy-label" data-tone="ok">
              Livres agora · podem conduzir
            </span>
            <div className="dy-row">
              {freeNow.map((p) => (
                <button
                  key={p.id}
                  className="dy-person"
                  title="Abrir o perfil"
                  onClick={(e) => {
                    palcoFlight.from = e.currentTarget.querySelector(".dy-mono")?.getBoundingClientRect() ?? null;
                    onDriver?.(p.id);
                  }}
                >
                  <span className="dy-mono" data-free data-dy-mono={p.id}>
                    {p.mono}
                  </span>
                  <span>
                    <b>{p.name.split(" ")[0]}</b>
                    <small>
                      {p.where} · <em>{span(p.left)}</em>
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {unplaced.length > 0 && (
          <div className="dy-unplaced">
            <span className="dy-label" data-tone="bad">
              Ficam por atribuir · {unplaced.length}
            </span>
            <div className="dy-row">
              {unplaced.slice(0, 4).map((id) => {
                const j = storeJob(id);
                return (
                  <span key={id} className="dy-job">
                    <b>{display.get(id) ?? id}</b>
                    <small>
                      {j?.stops[0]?.city} → {j?.stops.at(-1)?.city}
                    </small>
                  </span>
                );
              })}
              {unplaced.length > 4 && <span className="dy-job dy-more">+{unplaced.length - 4}</span>}
            </div>
            {reasons.length > 0 && <small className="dy-why">porque: {reasons.map((x) => x.label.toLowerCase()).join(" · ")}</small>}
          </div>
        )}
        {variant === "tempo" && doneNow.length > 0 && (
          <div>
            <span className="dy-label">Terminou</span>
            <div className="dy-row">
              {doneNow.map((p) => (
                <button key={p.id} className="dy-person" data-done onClick={() => onOpen(p.job.id)} title={`Abrir ${p.job.id}`}>
                  <span className="dy-mono" data-dy-mono={p.id}>
                    {p.mono}
                  </span>
                  <span>
                    <b>{p.name.split(" ")[0]}</b>
                    <small>
                      {p.job.id} entregue · {span(p.dayMin)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
