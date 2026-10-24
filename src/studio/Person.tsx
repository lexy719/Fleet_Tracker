// Perfil: the palco whose primary category is the driver. It answers "how much more can this person work,
// and when?", in one variation at a time:
//   Horas            — this week day by day (today from the plan; earlier days simulated) and the EU 561/2006
//                      limits: 4h30 before a 45-min pause, 9h a day (10h twice a week), 56h a week, 90h in two.
//   Disponibilidade  — the next four weeks: working, free to plan, weekly rest (time off is simulated).
//   Documentos       — licence, CQM/CPC, ADR and tachograph card with their dates (from the driver's record).
// Trucks and trips are links to their own palcos. The other drivers stay at the bottom; tapping one changes
// the profile.
import { useRef } from "react";
import { allDrivers, clock, driverWorld, initials, span, truckWorld, DAY_LIMIT, SPELL_LIMIT } from "./model";
import type { Row } from "./types";
import { palcoFlight } from "./Layers";
import { plateFlight } from "./Garage";
import { Variations, usePalcoEntrance, useRowFlip } from "./palco";

export type PersonVar = "horas" | "disp" | "docs";
export const PERSON_VARS: [PersonVar, string][] = [
  ["horas", "Horas"],
  ["disp", "Disponibilidade"],
  ["docs", "Documentos"],
];
const WEEK_LIMIT = 56 * 60, FORTNIGHT_LIMIT = 90 * 60, DAILY_REST = 11 * 60;
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const hash = (s: string) => {
  let h = 11;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
};
/** "14 mar 2031" (lab) or an ISO date (store). */
function parseUntil(s?: string): Date | null {
  if (!s) return null;
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  const m = /(\d{1,2})\s+([a-zç]{3})\w*\s+(\d{4})/i.exec(s);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[2].toLowerCase());
  return mo < 0 ? null : new Date(Number(m[3]), mo, Number(m[1]));
}
type Block = { kind: "drive" | "work" | "break" | "rest"; from: number; to: number; planned?: boolean };

export function PersonScene({
  driverId,
  jobs,
  now,
  variant,
  onVariant,
  onDriver,
  onTruck,
  onOpen,
}: {
  driverId: string;
  jobs: Row[];
  now: number;
  variant: PersonVar;
  onVariant: (v: PersonVar) => void;
  onDriver: (driverId: string) => void;
  onTruck: (truckId: string) => void;
  onOpen: (jobId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePalcoEntrance(root);
  const captureRows = useRowFlip(root, variant);
  const w = driverWorld(driverId);
  const job = jobs.find((j) => j.driverId === driverId && j.status !== "delivered");
  const h = hash(driverId);

  // Today from the plan: what is ahead (and the part of today already behind, as recorded driving).
  const trace = job?.forecast.trace ?? [];
  const today: Block[] = trace
    .filter((s) => s.to > now - 600 && s.from < now + 1440)
    .map((s) => ({ kind: s.kind === "drive" ? "drive" : s.kind === "break" || s.kind === "fuel" ? "break" : "work", from: s.from, to: s.to, planned: s.from >= now }));
  const aheadDrive = trace.filter((s) => s.kind === "drive" && s.to > now).reduce((a, s) => a + s.to - Math.max(s.from, now), 0);
  const dayTotal = w.dayMin + aheadDrive;
  const tenHour = dayTotal > DAY_LIMIT;
  const nextBreak = trace.find((s) => (s.kind === "break" || (s.kind === "fuel" && job?.forecast.fuelStops.find((f) => Math.abs(f.at - s.from) < 1)?.merged)) && s.from >= now);
  const final = job?.forecast.final ?? null;
  const restUntil = final != null ? final + DAILY_REST : null;
  const weekMin = w.baseline.weekMin + aheadDrive;
  const fortnight = w.baseline.fortnightMin ? w.baseline.fortnightMin + aheadDrive : null;

  // The week: Monday to Sunday. Days before today are simulated (no tachograph history in the store yet).
  const date = new Date();
  const wd = date.getDay();
  const mondayOffset = (wd + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() - mondayOffset + i);
    const rel = i - mondayOffset;
    const name = `${WD[d.getDay()]} ${d.getDate()}`;
    let blocks: Block[] = [];
    let note = "";
    if (rel < 0 && i < 5) {
      const s = 360 + ((h + i * 37) % 120);
      blocks = [
        { kind: "work", from: s, to: s + 50 },
        { kind: "drive", from: s + 50, to: s + 320 },
        { kind: "break", from: s + 320, to: s + 365 },
        { kind: "drive", from: s + 365, to: s + 365 + 120 + ((h + i * 13) % 140) },
      ];
    } else if (rel === 0) blocks = today.map((b) => ({ ...b, from: b.from - (now - (now % 1440)), to: b.to - (now - (now % 1440)) }));
    else if (rel > 0 && i >= 5) note = "descanso semanal (previsto)";
    else if (rel === 1 && restUntil != null) note = `pode sair às ${clock(restUntil)} · sem plano ainda`;
    else if (rel > 0) note = "sem plano ainda";
    const drove = blocks.filter((b) => b.kind === "drive").reduce((a, b) => a + b.to - b.from, 0);
    return { i, rel, name, blocks, note, drove, rest: i >= 5 && rel > 0 };
  });

  // Four weeks of availability: worked days this week, weekly rest at the weekend, free days to plan,
  // one simulated request (time off) so the office sees how it would show.
  const off = 7 + (h % 14);
  const weeks = Array.from({ length: 4 }, (_, k) => {
    const start = new Date(date);
    start.setDate(date.getDate() - mondayOffset + k * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const cells = Array.from({ length: 7 }, (_, i) => {
      const n = k * 7 + i - mondayOffset;
      if (i >= 5) return "rest";
      if (n < 0) return "work";
      if (n === 0) return job ? "work" : "free";
      if (n === off) return "ask";
      if (k === 3 && h % 2 === 0) return "leave";
      return "free";
    });
    return { k, title: k === 0 ? "esta semana" : `semana de ${start.getDate()} ${MONTHS[start.getMonth()]}`, sub: `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`, cells };
  });
  const freeDays = weeks.flatMap((x) => x.cells).filter((c) => c === "free").length;
  const askDay = (() => {
    const d = new Date(date);
    d.setDate(date.getDate() + off);
    return `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  })();
  const CELL: Record<string, string> = { work: "trabalho", rest: "descanso", free: "livre", ask: "folga pedida", leave: "férias" };

  // Documents from the record.
  const docs = w.qualifications.map((q) => ({ ...q, date: parseUntil(q.until) }));
  const y0 = date.getFullYear(), years = [y0, y0 + 1, y0 + 2, y0 + 3, y0 + 4, y0 + 5];
  const pY = (d: Date) => Math.min(100, Math.max(0, ((d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365 - y0) / 5) * 100));
  const nowY = pY(date);
  const missing = docs.filter((d) => d.state !== "VALID" && d.state !== "NOT_HELD");

  const pH = (m: number) => (Math.min(Math.max(m, 0), 1440) / 1440) * 100;
  const others = allDrivers().filter((d) => d.id !== driverId);
  const activity = (id: string) => {
    const j = jobs.find((x) => x.driverId === id && x.status !== "delivered");
    return j ? j.activity : "livre";
  };
  const truckLink = job?.truckId ? (
    <em
      className="lnk"
      role="button"
      tabIndex={0}
      onClick={(e) => {
        plateFlight.from = e.currentTarget.getBoundingClientRect();
        onTruck(job.truckId!);
      }}
    >
      {truckWorld(job.truckId).plate}
    </em>
  ) : null;

  return (
    <div className="pf-stage" ref={root} data-var={variant}>
      <header className="pf-head">
        <span className="pf-ava" data-pf-ava>
          {initials(w.name)}
        </span>
        <span className="cn-eyebrow">Motorista · {{ horas: "horas de condução esta semana", disp: "disponibilidade, 4 semanas", docs: "documentos e validades" }[variant]}</span>
        <h1>{w.name}</h1>
        <p className="dy-sum" key={variant}>
          {variant === "horas" &&
            (job ? (
              <>
                <b>{job.activity}</b> ·{" "}
                <em className="lnk" role="button" tabIndex={0} onClick={() => onOpen(job.id)}>
                  {job.id}
                </em>{" "}
                {job.stops[0].city} → {job.stops.at(-1)!.city}
                {truckLink && <> · {truckLink}</>}
                {restUntil != null && ` · pode voltar a sair às ${clock(restUntil)}${restUntil >= now - (now % 1440) + 1440 ? " de amanhã" : ""}`}
              </>
            ) : (
              <>
                <b>livre</b> · {span(Math.max(0, DAY_LIMIT - w.dayMin))} de condução disponíveis hoje
              </>
            ))}
          {variant === "disp" && (
            <>
              <b>{job ? (restUntil != null ? `livre a partir das ${clock(restUntil)}` : "a trabalhar") : "livre agora"}</b> · {freeDays} dias livres para planear · <b data-tone="warn">folga pedida {askDay}</b> · <span data-tone="warn">pedidos simulados</span>
            </>
          )}
          {variant === "docs" && (
            <>
              <b>
                {docs.filter((d) => d.state === "VALID").length} de {docs.length} em dia
              </b>
              {missing.length > 0 && (
                <>
                  {" · "}
                  <b data-tone={missing.some((d) => d.state === "EXPIRED" || d.state === "MISSING") ? "bad" : "warn"}>{missing.map((d) => `${d.label} ${d.detail}`).join(" · ")}</b>
                </>
              )}
            </>
          )}
        </p>
        <Variations
          options={PERSON_VARS}
          value={variant}
          onChange={(v) => {
            if (v === variant) return;
            captureRows();
            onVariant(v);
          }}
        />
      </header>

      <div className="pf-body">
        <div className="pf-grid" key={variant}>
          <div className="pf-axis">
            {variant === "horas" &&
              [0, 3, 6, 9, 12, 15, 18, 21, 24].map((x) => (
                <span key={x} style={{ left: `${pH(x * 60)}%` }}>
                  {String(x).padStart(2, "0")}h
                </span>
              ))}
            {variant === "disp" &&
              ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d, i) => (
                <span key={d} style={{ left: `${(i + 0.5) * (100 / 7)}%` }}>
                  {d}
                </span>
              ))}
            {variant === "docs" &&
              years.map((y) => (
                <span key={y} style={{ left: `${((y - y0) / 5) * 100}%` }}>
                  {y}
                </span>
              ))}
          </div>
          {variant === "horas" &&
            week.map((d) => (
              <div key={d.i} className="pf-row" data-row={`r${d.i}`} data-today={d.rel === 0 || undefined}>
                <span className="pf-k">
                  <b>{d.name}</b>
                  <small>{d.rel === 0 ? `hoje · ${span(dayTotal)} previstas` : d.rel < 0 && d.blocks.length ? "simulado" : ""}</small>
                </span>
                <span className="pf-lane">
                  {d.rest && <i className="pf-rest" style={{ left: "0%", width: "100%" }} />}
                  {d.blocks.map((b, k) => (
                    <i key={k} className="pf-blk" data-kind={b.kind} data-planned={b.planned || undefined} style={{ left: `${pH(b.from)}%`, width: `${pH(b.to) - pH(b.from)}%` }} />
                  ))}
                  {d.rel === 0 && <i className="pf-now" style={{ left: `${pH(now % 1440)}%` }} />}
                  {d.rel === 0 && <em className="pf-now-tag" style={{ left: `${pH(now % 1440)}%` }}>{clock(now)}</em>}
                  {(d.note || (d.drove > 0 && d.rel !== 0)) && (
                    <em className="pf-note" style={{ left: `${d.blocks.length ? pH(Math.max(...d.blocks.map((b) => b.to))) : 0}%` }} data-left={(d.blocks.length ? pH(Math.max(...d.blocks.map((b) => b.to))) : 0) > 78 || undefined}>
                      {d.note || span(d.drove)}
                    </em>
                  )}
                </span>
              </div>
            ))}
          {variant === "disp" &&
            weeks.map((x) => (
              <div key={x.k} className="pf-row" data-row={`r${x.k}`}>
                <span className="pf-k">
                  <b>{x.title}</b>
                  <small>{x.sub}</small>
                </span>
                <span className="pf-cells">
                  {x.cells.map((c, i) => (
                    <i key={i} className="pf-cell" data-c={c} style={{ animationDelay: `${(x.k * 7 + i) * 0.012}s` }}>
                      {CELL[c]}
                    </i>
                  ))}
                </span>
              </div>
            ))}
          {variant === "docs" &&
            docs.map((d, i) => (
              <div key={d.kind + i} className="pf-row" data-row={`r${i}`}>
                <span className="pf-k">
                  <b>{d.label}</b>
                  <small>{d.detail}</small>
                </span>
                <span className="pf-lane">
                  <i className="pf-now" style={{ left: `${nowY}%` }} />
                  {d.date && <i className="pf-doc" data-state={d.state} style={{ left: `${nowY}%`, width: `${Math.max(0.6, pY(d.date) - nowY)}%` }} />}
                  <em className="pf-note" data-tone={d.state === "VALID" ? undefined : d.state === "EXPIRING" ? "warn" : d.state === "NOT_HELD" ? "mute" : "bad"} style={{ left: `${d.date ? pY(d.date) : nowY}%` }} data-left={(d.date ? pY(d.date) : 0) > 78 || undefined}>
                    {d.state === "NOT_HELD" ? "não tem" : d.state === "MISSING" ? "em falta" : d.date ? `válido até ${MONTHS[d.date.getMonth()]} ${d.date.getFullYear()}` : d.until ? `válido até ${d.until}` : d.detail}
                  </em>
                </span>
              </div>
            ))}
        </div>

        <aside className="pf-side" key={`s${variant}`}>
          {variant === "horas" && (
            <>
              <span className="pf-eye">Reg. 561/2006 · o que ainda pode</span>
              {(
                [
                  ["Hoje", `${span(dayTotal)} de ${tenHour ? "10h" : "9h"}`, dayTotal / (tenHour ? 600 : DAY_LIMIT), tenHour ? "dia de 10h (só 2 por semana)" : `${span(Math.max(0, DAY_LIMIT - dayTotal))} livres`],
                  ["Sem pausa", `${span(w.spellMin)} de 4h30`, w.spellMin / SPELL_LIMIT, nextBreak ? `próxima pausa às ${clock(nextBreak.from)}` : "sem pausa prevista hoje"],
                  ["Semana", `${span(weekMin)} de 56h`, weekMin / WEEK_LIMIT, w.baseline.stale ? "sem registo de condução" : w.baseline.recordedLabel],
                  ["Duas semanas", fortnight != null ? `${span(fortnight)} de 90h` : "sem registo", fortnight != null ? fortnight / FORTNIGHT_LIMIT : 0, ""],
                ] as const
              ).map(([k, v, f, n]) => (
                <div key={k} className="pf-gauge">
                  <span>
                    <b>{k}</b>
                    <em>{v}</em>
                  </span>
                  <i>
                    <i data-tone={f >= 1 ? "bad" : f > 0.8 ? "warn" : undefined} style={{ width: `${Math.min(1, f) * 100}%` }} />
                  </i>
                  {n && <small>{n}</small>}
                </div>
              ))}
              {restUntil != null && (
                <p className="pf-line">
                  <b>Descanso diário</b> {clock(final!)} → {clock(restUntil)} · 11h
                </p>
              )}
            </>
          )}
          {variant === "disp" && (
            <>
              <span className="pf-eye">Para planear</span>
              <p className="pf-answer">{job ? (restUntil != null ? `Livre às ${clock(restUntil)}` : "A trabalhar") : "Livre agora"}</p>
              <p className="pf-line">descanso semanal ao fim de semana · 45h</p>
              <p className="pf-line" data-tone="warn">
                folga pedida {askDay} (simulado)
              </p>
              <p className="pf-line">{freeDays} dias livres nas próximas 4 semanas</p>
            </>
          )}
          {variant === "docs" && (
            <>
              <span className="pf-eye">O que falta</span>
              {missing.length ? (
                missing.map((d) => (
                  <p key={d.kind} className="pf-answer" data-tone={d.state === "EXPIRING" ? "warn" : "bad"}>
                    {d.label} <small>{d.detail}</small>
                  </p>
                ))
              ) : (
                <p className="pf-answer" data-tone="ok">
                  Tudo em dia
                </p>
              )}
              {missing.some((d) => d.kind === "tacho" || d.kind === "licence" || d.kind === "cpc") && <p className="pf-line">sem estes documentos válidos não pode conduzir</p>}
            </>
          )}
        </aside>
      </div>

      <footer className="pf-others">
        <span className="pf-eye">Os outros · tocar muda o perfil</span>
        <div>
          {others.map((d) => (
            <button
              key={d.id}
              className="pf-other"
              data-free={!d.holder || undefined}
              onClick={(e) => {
                palcoFlight.from = e.currentTarget.querySelector(".pf-mini")?.getBoundingClientRect() ?? null;
                onDriver(d.id);
              }}
            >
              <span className="pf-mini">{initials(d.name)}</span>
              <span>
                <b>{d.name.split(" ")[0]}</b>
                <small>{activity(d.id)}</small>
              </span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
