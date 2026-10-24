// The driver, opened from a transport: the second step of a path. It answers the question that
// matters given where you came from ("can they deliver on time?"), shows hours against the law,
// documents that need attention, and only the actions the transport's phase allows.
import { useLayoutEffect, useRef } from "react";
import { clock, driverWorld, initials, span, truckWorld, SPELL_LIMIT, DAY_LIMIT, phaseOf } from "./model";
import { Hours } from "./parts";
import type { Row } from "./types";

const WEEK_LIMIT = 56 * 60;
const FORTNIGHT_LIMIT = 90 * 60;

export function DriverScene({ job, origin, onClose, onException }: { job: Row; origin: DOMRect | null; onClose: () => void; onException: () => void }) {
  const d = driverWorld(job.driverId);
  const t = truckWorld(job.truckId);
  const pl = job.forecast;
  const last = job.stops.at(-1)!;
  const lastPlan = pl.stops.at(-1);
  const phase = phaseOf(job.status);
  const leftToday = Math.max(0, DAY_LIMIT - d.dayMin);
  const late = !!lastPlan?.late;
  const timed = pl.final != null;
  const early = !!lastPlan?.early;
  const answer = !timed ? "Ainda sem hora prevista" : late ? "Não, nesta previsão" : early ? "Sim, com folga" : "Sim";
  const tone = !timed ? "idle" : late ? "bad" : leftToday < 90 ? "warn" : "ok";
  const why = !timed
    ? "O transporte ainda não tem início possível com este plano."
    : `Chega a ${last.city} às ${clock(pl.final!)} · janela ${last.window[0]}–${last.window[1]}${pl.breaks ? ` · ${pl.breaks} pausa${pl.breaks > 1 ? "s" : ""} pelo caminho` : ""}`;
  const docs = d.qualifications.filter((q) => q.state !== "VALID");
  const root = useRef<HTMLElement>(null);

  // Born from the driver row it was opened from: a single transform from that rectangle.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const sx = origin.width / r.width, sy = origin.height / r.height;
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${origin.left - r.left}px, ${origin.top - r.top}px) scale(${sx}, ${sy})`, opacity: 0.4, borderRadius: "14px" },
        { transformOrigin: "0 0", transform: "none", opacity: 1, borderRadius: "22px" },
      ],
      { duration: 520, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
    el.querySelectorAll<HTMLElement>("[data-enter]").forEach((x, i) =>
      x.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 180 + i * 55, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" }),
    );
  }, [origin]);

  return (
    <aside className="scene scene-driver" ref={root} aria-label={`Motorista ${d.name}`} data-tone={tone}>
      <span className="panel-bg" />
      <header className="scene-head">
        <span className="scene-mono">{initials(d.name)}</span>
        <span className="scene-title">
          <span className="scene-kind">Motorista · em {job.id}</span>
          <b>{d.name || "Sem motorista"}</b>
          <span className="scene-sub">{d.employee}</span>
        </span>
        <button className="back" onClick={onClose} aria-label="Fechar motorista (Esc)">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="scene-scroll">
        <section className="scene-answer" data-enter data-tone={tone}>
          <span className="eyebrow">Consegue entregar a tempo?</span>
          <b>{answer}</b>
          <p>{why}</p>
        </section>

        <section className="scene-now" data-enter>
          <span className="eyebrow">Agora</span>
          <p>
            <span className="act-dot" data-moving={job.moving || undefined} /> {job.activity} · {t.plate} · {Math.round(job.km)} de {Math.round(job.route.km)} km
            <em> simulado</em>
          </p>
        </section>

        <section className="scene-hours" data-enter>
          <span className="eyebrow">Tempos de condução</span>
          <Hours used={d.spellMin} limit={SPELL_LIMIT} label="desde a última pausa" />
          <Hours used={d.dayMin} limit={DAY_LIMIT} label="hoje" />
          <Hours used={d.baseline.weekMin} limit={WEEK_LIMIT} label="esta semana" />
          {d.baseline.fortnightMin >= d.baseline.weekMin && <Hours used={d.baseline.fortnightMin} limit={FORTNIGHT_LIMIT} label="em duas semanas" />}
          <p className="scene-note">
            Restam {span(leftToday)} de condução hoje{d.baseline.stale ? ` · registo de ${d.baseline.recordedLabel}` : ""}.
          </p>
        </section>

        {docs.length > 0 && (
          <section className="scene-docs" data-enter>
            <span className="eyebrow">Documentos</span>
            {docs.map((q) => (
              <span key={q.kind} className="qual" data-s={q.state}>
                {q.label} · {q.detail}
              </span>
            ))}
          </section>
        )}

        <section className="scene-truck" data-enter>
          <span className="eyebrow">O camião dele</span>
          <div className="scene-truck-row">
            <span className="plate plate-big">{t.plate}</span>
            <span className="scene-truck-txt">
              {t.make} {t.model}
              <span>
                Combustível {t.fuel.value}% · ≈{Math.round((t.fuel.value / 100) * t.tankL)} L
              </span>
            </span>
          </div>
        </section>

        <section className="scene-actions" data-enter>
          {phase === "planning" ? (
            <p className="scene-note">Antes da carga, o motorista pode ser trocado a partir do transporte.</p>
          ) : (
            <>
              <button className="act act-need" onClick={onException}>
                Registar exceção
              </button>
              <p className="scene-note">
                {phase === "closed" ? "Transporte concluído." : `${phase === "loading" ? "Em carga" : "Em viagem"} · o motorista fica fixo até à entrega.`}
              </p>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
