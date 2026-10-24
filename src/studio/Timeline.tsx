import { W } from "./world/active";
import { useRef, useState } from "react";
import { NOW, clock, span, dayStart, dayEnd, kmAt, segAt } from "./model";
import { litresAt } from "./fuel";
import { Row, Lens } from "./types";

/* ─── Timeline (the day as a scrubbable board) ─────────────────────────── */

export const hours = () => Array.from({ length: Math.floor((dayEnd() - dayStart()) / 60) + 1 }, (_, i) => dayStart() + i * 60);
export const xOf = (m: number) => ((m - dayStart()) / (dayEnd() - dayStart())) * 100;
export const toMinS = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export function Timeline({
  jobs,
  t,
  setT,
  playing,
  onPlay,
  onNow,
  tense,
  openId,
  hoverId,
  onHover,
  onOpen,
  left,
  right,
  labelOf,
  lens,
}: {
  jobs: Row[];
  t: number;
  setT: (m: number) => void;
  playing: boolean;
  onPlay: () => void;
  onNow: () => void;
  tense: "now" | "past" | "future";
  openId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  left: number;
  right: number;
  labelOf: (j: Row) => string;
  lens: Lens;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const fuelMode = lens === "fuel";
  const expanded = open || !!openId;
  const scrub = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setT(dayStart() + k * (dayEnd() - dayStart()));
  };
  const rows = (openId ? jobs.filter((j) => j.id === openId) : jobs).filter((j) => !fuelMode || j.fuel);
  const delta = t - NOW.min;
  // Collapsed summary: how many trucks are driving in each quarter hour of the day.
  const bins = (() => {
    const n = Math.ceil((dayEnd() - dayStart()) / 15);
    return Array.from({ length: n }, (_, i) => {
      const m = dayStart() + i * 15 + 7;
      return jobs.filter((j) => segAt(j.forecast, m)?.kind === "drive").length;
    });
  })();
  const peak = Math.max(1, ...bins);
  const fuelLine = (j: Row) => {
    const v = j.fuel;
    const tr = j.forecast.trace;
    if (!v || !tr.length) return null;
    const a = Math.max(dayStart(), tr[0].from);
    const b = Math.min(dayEnd(), tr.at(-1)!.to);
    const pts: string[] = [];
    for (let m = a; m <= b; m += 5) pts.push(`${xOf(m) * 10},${(1 - litresAt(v, kmAt(j.forecast, m)) / v.tankL) * 100}`);
    return pts.join(" ");
  };
  return (
    <section className="timeline" style={{ left, right }} aria-label="Dia de operação" data-tense={tense}>
      <div className="tl-head">
        <button className="tl-play" onClick={onPlay} aria-label={playing ? "Pausar" : "Reproduzir o dia"}>
          {playing ? (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <rect x="3.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="9.5" y="3" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="tl-title">
          O dia
          <em>{expanded ? "faixas por transporte" : "arraste ou ▶ para ver onde vão estar"}</em>
        </span>
        <span className="tl-clock">{clock(t)}</span>
        <span className="tl-tense">
          {tense === "now" ? W().source === "ops" ? "agora · hora de abertura" : "agora · relógio demo" : tense === "future" ? `projeção · +${span(delta)}` : `reconstituição · −${span(delta)}`}
        </span>
        {tense !== "now" && (
          <button className="tl-now" onClick={onNow}>
            Voltar a agora
          </button>
        )}
        {expanded && !fuelMode && (
          <span className="tl-legend" aria-hidden>
            <i data-k="drive" /> condução <i data-k="break" /> pausa <i data-k="stop" /> carga/descarga <i data-k="fuel" /> abastecer <i data-k="win" /> janela
          </span>
        )}
        {expanded && fuelMode && (
          <span className="tl-legend" aria-hidden>
            <i data-k="level" /> combustível no depósito <i data-k="reserve" /> reserva 10%
          </span>
        )}
        {!openId && (
          <button className="tl-toggle" aria-expanded={expanded} onClick={() => setOpen((x) => !x)}>
            {expanded ? "Fechar faixas" : `Faixas · ${rows.length}`}
          </button>
        )}
      </div>
      <div className="tl-body" data-expanded={expanded || undefined}>
        <div className="tl-labels">
          <span className="tl-ruler-pad" />
          {!expanded && <span className="tl-label tl-label-sum">na estrada</span>}
          {expanded && rows.map((j) => (
            <button
              key={j.id}
              className="tl-label"
              data-hot={hoverId === j.id || undefined}
              data-tone={j.tone}
              onMouseEnter={() => onHover(j.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onOpen(j.id)}
            >
              {labelOf(j)}
            </button>
          ))}
        </div>
        <div
          className="tl-track"
          ref={track}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            scrub(e.clientX);
          }}
          onPointerMove={(e) => {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) scrub(e.clientX);
          }}
        >
          <div className="tl-ruler">
            {hours().map((h) => (
              <span key={h} style={{ left: `${xOf(h)}%` }}>
                {String(h / 60).padStart(2, "0")}
              </span>
            ))}
          </div>
          {!expanded && (
            <div className="tl-lane tl-sum" title="Camiões a conduzir em cada quarto de hora">
              {bins.map((b, i) => (
                <span key={i} style={{ left: `${(i / bins.length) * 100}%`, width: `${100 / bins.length}%`, height: `${(b / peak) * 100}%` }} />
              ))}
            </div>
          )}
          {expanded && rows.map((j) => (
            <div
              key={j.id}
              className="tl-lane"
              data-fuel={fuelMode || undefined}
              data-hot={hoverId === j.id || undefined}
              onMouseEnter={() => onHover(j.id)}
              onMouseLeave={() => onHover(null)}
            >
              {fuelMode && (
                <svg className="tl-fuel" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden>
                  <line x1={0} x2={1000} y1={90} y2={90} className="tl-fuel-res" />
                  {fuelLine(j) && <polyline points={fuelLine(j)!} />}
                </svg>
              )}
              {!fuelMode && j.stops.map((s) => (
                <span
                  key={s.id}
                  className="tl-win"
                  data-late={j.forecast.stops.find((x) => x.id === s.id)?.late || undefined}
                  style={{ left: `${xOf(toMinS(s.window[0]))}%`, width: `${xOf(toMinS(s.window[1])) - xOf(toMinS(s.window[0]))}%` }}
                  title={`${s.city} · janela ${s.window[0]}–${s.window[1]}`}
                />
              ))}
              {!fuelMode && j.forecast.trace.map((g, i) => (
                <span
                  key={i}
                  className="tl-seg"
                  data-k={g.kind}
                  data-past={g.past || undefined}
                  style={{
                    left: `${xOf(Math.max(dayStart(), g.from))}%`,
                    width: `${Math.max(0.25, xOf(Math.min(dayEnd(), g.to)) - xOf(Math.max(dayStart(), g.from)))}%`,
                  }}
                />
              ))}
            </div>
          ))}
          <span className="tl-nowline" style={{ left: `${xOf(NOW.min)}%` }} title="Relógio demo" />
          <span className="tl-cursor" style={{ left: `${xOf(t)}%` }}>
            <span className="tl-knob" />
          </span>
        </div>
      </div>
      <input
        className="tl-range"
        type="range"
        min={dayStart()}
        max={dayEnd()}
        step={5}
        value={Math.round(t)}
        onChange={(e) => setT(Number(e.target.value))}
        aria-label="Hora do dia"
        aria-valuetext={clock(t)}
      />
    </section>
  );
}
