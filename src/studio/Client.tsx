// Cliente: the palco whose primary category is the client. It answers "is each client well served?", in one
// variation at a time:
//   Entregas  — today's deliveries on the hours: the client's window (bracket) and the forecast arrival (dot).
//   Prazos    — the service level of the client's transports: on track, at risk, missed; urgent ones.
//   Volume    — what the client ships: pallets, weight, transports and km.
// Trips, drivers and trucks are links to their own palcos. The tapped client comes first, open.
import { useRef } from "react";
import { clock, span } from "./model";
import type { Row } from "./types";
import { Variations, usePalcoEntrance, useRowFlip } from "./palco";

export type ClientVar = "entregas" | "prazos" | "volume";
export const CLIENT_VARS: [ClientVar, string][] = [
  ["entregas", "Entregas"],
  ["prazos", "Prazos"],
  ["volume", "Volume"],
];
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
/** The window at the last stop, on the day of the arrival (or of now, when there is no arrival yet). */
function windowOf(j: Row, now: number): [number, number] | null {
  const w = j.stops.at(-1)?.window;
  if (!w) return null;
  const f = j.forecast.final ?? now;
  let a = Math.floor(f / 1440) * 1440 + toMin(w[0]);
  if (a - f > 720) a -= 1440;
  if (f - a > 720) a += 1440;
  return [a, a + ((toMin(w[1]) - toMin(w[0]) + 1440) % 1440)];
}
const shortName = (c: string) => c.split(" — ")[0].replace(/\s+(Portugal|Ibérica|Iberia|S\.A\.|Lda\.?)$/i, "");

export function ClientScene({
  jobs,
  now,
  focus,
  variant,
  onVariant,
  onOpen,
}: {
  jobs: Row[];
  now: number;
  /** The tapped client (first, open); null when opened from the sidebar. */
  focus: string | null;
  variant: ClientVar;
  onVariant: (v: ClientVar) => void;
  onOpen: (jobId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePalcoEntrance(root);
  const captureRows = useRowFlip(root, variant);

  const t0 = Math.floor((now - 360) / 120) * 120, t1 = t0 + 1440;
  const pT = (m: number) => ((Math.min(Math.max(m, t0), t1) - t0) / (t1 - t0)) * 100;

  const groups = new Map<string, Row[]>();
  for (const j of jobs) {
    if (j.status === "cancelled" || j.status === "invoiced") continue;
    const k = j.client || "Sem cliente";
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  const clients = [...groups.entries()].map(([name, js]) => {
    const deliveries = js.map((j) => {
      const win = windowOf(j, now);
      const f = j.forecast.final;
      const open = f == null || j.status === "backlog";
      const tone: "bad" | "warn" | "ok" | "open" = open ? "open" : win && f! > win[1] ? "bad" : win && f! < win[0] ? "warn" : "ok";
      return { j, win, f, tone };
    });
    const late = deliveries.filter((d) => d.tone === "bad");
    const open = deliveries.filter((d) => d.tone === "open");
    const sla = { on: js.filter((j) => j.sla === "on_track").length, risk: js.filter((j) => j.sla === "at_risk").length, miss: js.filter((j) => j.sla === "breached").length };
    const urgent = js.filter((j) => j.priority !== "normal").length;
    const pallets = js.reduce((a, j) => a + j.cargo.reduce((b, c) => b + c.pallets, 0), 0);
    const kg = js.reduce((a, j) => a + j.cargo.reduce((b, c) => b + c.weightKg, 0), 0);
    const km = js.reduce((a, j) => a + j.route.km, 0);
    return { name, js, deliveries, late, open, sla, urgent, pallets, kg, km };
  });
  type C = (typeof clients)[number];
  const order: Record<ClientVar, (a: C, b: C) => number> = {
    entregas: (a, b) => b.late.length - a.late.length || b.open.length - a.open.length || b.js.length - a.js.length,
    prazos: (a, b) => b.sla.miss - a.sla.miss || b.sla.risk - a.sla.risk || b.urgent - a.urgent,
    volume: (a, b) => b.pallets - a.pallets || b.kg - a.kg,
  };
  clients.sort((a, b) => Number(b.name === focus) - Number(a.name === focus) || order[variant](a, b));
  const maxPal = Math.max(1, ...clients.map((c) => c.pallets));
  const lateAll = clients.reduce((a, c) => a + c.late.length, 0);
  const openAll = clients.reduce((a, c) => a + c.open.length, 0);
  const missAll = clients.reduce((a, c) => a + c.sla.miss, 0), riskAll = clients.reduce((a, c) => a + c.sla.risk, 0);
  const palAll = clients.reduce((a, c) => a + c.pallets, 0), kgAll = clients.reduce((a, c) => a + c.kg, 0);
  const hours = Array.from({ length: 13 }, (_, i) => t0 + i * 120);

  const verdict = (c: C) => {
    if (c.late.length) return { ok: false, text: `Não: ${c.late.map((d) => `${d.j.id} chega ${span(d.f! - d.win![1])} depois de fechar`).join(" · ")}` };
    if (c.sla.miss) return { ok: false, text: `Não: ${c.sla.miss} ${c.sla.miss === 1 ? "transporte falhou" : "transportes falharam"} o prazo` };
    if (c.open.length) return { ok: false, text: `Ainda não: ${c.open.length} ${c.open.length === 1 ? "transporte por atribuir" : "transportes por atribuir"}` };
    return { ok: true, text: "Sim: tudo dentro das janelas e dos prazos" };
  };

  return (
    <div className="cl-stage gar-stage fu-stage" ref={root} data-var={variant}>
      <header className="dy-head">
        <span className="cn-eyebrow">Clientes · {{ entregas: "entregas de hoje", prazos: "prazos dos transportes", volume: "volume que expedem" }[variant]}</span>
        <h1>Os clientes</h1>
        <p className="dy-sum" key={variant}>
          {variant === "entregas" && (
            <>
              <b>{clients.length} clientes</b> · {jobs.length} transportes
              {lateAll > 0 && (
                <>
                  {" · "}
                  <b data-tone="bad">{lateAll} depois de fechar</b>
                </>
              )}
              {openAll > 0 && ` · ${openAll} por atribuir`}
            </>
          )}
          {variant === "prazos" && (
            <>
              <b>{clients.reduce((a, c) => a + c.sla.on, 0)} no prazo</b>
              {riskAll > 0 && (
                <>
                  {" · "}
                  <b data-tone="warn">{riskAll} em risco</b>
                </>
              )}
              {missAll > 0 && (
                <>
                  {" · "}
                  <b data-tone="bad">{missAll} falhados</b>
                </>
              )}
            </>
          )}
          {variant === "volume" && (
            <>
              <b>{palAll} paletes</b> · {Math.round(kgAll / 1000)} t · {clients.length} clientes
            </>
          )}
        </p>
        <Variations
          options={CLIENT_VARS}
          value={variant}
          onChange={(v) => {
            if (v === variant) return;
            captureRows();
            onVariant(v);
          }}
        />
      </header>

      <div className="cl-grid">
        <div className="cl-axis" key={variant}>
          {variant === "entregas" && (
            <>
              {hours.filter((m) => Math.abs(pT(m) - pT(now)) > 4).map((m) => (
                <span key={m} style={{ left: `${pT(m)}%` }}>
                  {clock(m)}
                </span>
              ))}
              <span className="cl-now-tag" style={{ left: `${pT(now)}%` }}>
                {clock(now)}
              </span>
            </>
          )}
          {variant === "prazos" && (
            <>
              <span style={{ left: "0%" }} data-start>
                transportes por prazo
              </span>
              <span style={{ left: "64%" }} data-start>
                urgentes · próximo prazo
              </span>
            </>
          )}
          {variant === "volume" && (
            <>
              <span style={{ left: "0%" }} data-start>
                paletes
              </span>
              <span style={{ left: "64%" }} data-start>
                peso · transportes · km
              </span>
            </>
          )}
        </div>
        {variant === "entregas" && <i className="cl-now" style={{ left: `calc(var(--who) + (100% - var(--who)) * ${pT(now) / 100})` }} />}
        <div className="cl-rows" key={`r${variant}`}>
          {clients.map((c) => {
            const foc = c.name === focus || (focus == null && c === clients[0] && variant === "entregas" && c.late.length > 0);
            const v = verdict(c);
            const next = c.deliveries.filter((d) => d.win && d.win[1] > now).sort((a, b) => a.win![1] - b.win![1])[0];
            return (
              <div key={c.name} className="cl-row" data-row={c.name} data-focus={foc || undefined}>
                <span className="cl-who">
                  <b>{clients.filter((x) => shortName(x.name) === shortName(c.name)).length > 1 ? `${shortName(c.name)} · ${c.js[0].id}` : shortName(c.name)}</b>
                  <small>
                    {c.js.length} {c.js.length === 1 ? "transporte" : "transportes"}
                    {c.late.length ? ` · ${c.late.length} fora da janela` : c.open.length ? ` · ${c.open.length} por atribuir` : ""}
                  </small>
                </span>
                <span className="cl-lane">
                  {variant === "entregas" &&
                    c.deliveries.map((d, i) => (
                      <span key={d.j.id}>
                        {d.win && <i className="cl-win" data-tone={d.tone} style={{ left: `${pT(d.win[0])}%`, width: `${Math.max(0.5, pT(d.win[1]) - pT(d.win[0]))}%` }} title={`${d.j.id} · janela ${clock(d.win[0])}–${clock(d.win[1])}`} />}
                        {d.f != null && d.tone !== "open" && (
                          <button className="cl-dot" data-tone={d.tone} style={{ left: `${pT(d.f)}%` }} onClick={() => onOpen(d.j.id)} title={`${d.j.id} · chega ${clock(d.f)} a ${d.j.stops.at(-1)!.city}`} />
                        )}
                        {(d.tone === "bad" || d.tone === "open" || c.deliveries.length === 1) && i === c.deliveries.findIndex((x) => x.tone === d.tone) && (
                          <em className="cl-lab" data-tone={d.tone} data-left={(d.f != null ? pT(d.f) : d.win ? pT(d.win[1]) : 0) > 66 || undefined} style={{ left: `${d.f != null && d.tone !== "open" ? pT(d.f) : d.win ? pT(d.win[1]) : 0}%` }}>
                            {d.tone === "bad" ? `${d.j.id} · +${span(d.f! - d.win![1])}` : d.tone === "open" ? `${d.j.id} · por atribuir` : `${d.j.stops.at(-1)!.city} ${clock(d.f!)}`}
                          </em>
                        )}
                      </span>
                    ))}
                  {variant === "prazos" && (
                    <>
                      <i className="cl-seg" data-tone="ok" style={{ left: "0%", width: `${(c.sla.on / Math.max(1, c.js.length)) * 56}%` }} />
                      <i className="cl-seg" data-tone="warn" style={{ left: `${(c.sla.on / Math.max(1, c.js.length)) * 56}%`, width: `${(c.sla.risk / Math.max(1, c.js.length)) * 56}%` }} />
                      <i className="cl-seg" data-tone="bad" style={{ left: `${((c.sla.on + c.sla.risk) / Math.max(1, c.js.length)) * 56}%`, width: `${(c.sla.miss / Math.max(1, c.js.length)) * 56}%` }} />
                      <em className="cl-col" style={{ left: "64%" }}>
                        {c.urgent > 0 ? <b data-tone="bad">{c.urgent} urgente{c.urgent === 1 ? "" : "s"}</b> : "sem urgentes"}
                        {next ? ` · próximo fecha às ${clock(next.win![1])}` : ""}
                      </em>
                      <em className="cl-col" data-sub style={{ left: "64%" }}>
                        {c.sla.on} no prazo{c.sla.risk ? ` · ${c.sla.risk} em risco` : ""}
                        {c.sla.miss ? ` · ${c.sla.miss} falhado${c.sla.miss === 1 ? "" : "s"}` : ""}
                      </em>
                    </>
                  )}
                  {variant === "volume" && (
                    <>
                      <i className="cl-seg" style={{ left: "0%", width: `${Math.max(0.6, (c.pallets / maxPal) * 56)}%` }} />
                      <em className="cl-col" style={{ left: `${Math.max(0.6, (c.pallets / maxPal) * 56) + 1}%`, translate: "8px -50%" }}>
                        <b>{c.pallets}</b>
                      </em>
                      <em className="cl-col" style={{ left: "64%" }}>
                        {(c.kg / 1000).toFixed(1).replace(".", ",")} t · {c.js.length} transp. · {Math.round(c.km).toLocaleString("pt-PT")} km
                      </em>
                    </>
                  )}
                </span>
                {foc && (
                  <p className="cl-q">
                    Está bem servido hoje? <b data-tone={v.ok ? "ok" : "bad"}>{v.text}</b>
                    <span className="cl-links">
                      {c.js.slice(0, 6).map((j) => (
                        <em key={j.id} className="lnk" role="button" tabIndex={0} onClick={() => onOpen(j.id)}>
                          {j.id}
                        </em>
                      ))}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="fu-foot">{variant === "entregas" ? "faixa = janela de receção · ponto = chegada prevista (verde dentro, vermelho fora, amarelo à espera)" : variant === "prazos" ? "verde no prazo · amarelo em risco · vermelho falhado" : "barra = paletes de hoje"}</p>
    </div>
  );
}
