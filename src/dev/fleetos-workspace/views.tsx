import { useMemo, useState, type DragEvent } from "react";
import { DRIVER_POOL, NOW, TRAILERS, type AttentionItem, type JobStatus } from "../fleetos-environment/world";
import { LatitudeMetro, MicroJourney, PortraitMap, StripMap, minOf } from "./graphics";
import { DRIVERS, FREE_TRAILERS, driverName, levelOf, routeLabel, statusLabel, truckPlate, useWs, type Job, type Level } from "./store";

const SEV: Record<AttentionItem["severity"], [Level, string]> = { BLOCKER: ["bad", "Bloqueia"], ACTION_REQUIRED: ["bad", "Ação necessária"], RISK: ["warn", "Risco"], INFORMATION: ["ok", "Informação"] };
const LVL_LABEL: Record<Level, string> = { bad: "Problema", warn: "Atenção", ok: "No plano" };
function useLevels() {
  const { jobs, attention } = useWs();
  return useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, levelOf(j, attention)])) as Record<string, Level>, [jobs, attention]);
}
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("");

/** The one primary action for an attention item, wired to a real change in the workspace. */
function useActionFor() {
  const ws = useWs();
  return (a: AttentionItem) => {
    if (a.lead === "Trucks" && a.subject === a.jobId) return { label: "Escolher reboque", run: () => ws.setOpenJob(a.jobId) };
    if (a.lead === "Drivers" && a.severity !== "RISK") return { label: "Escolher motorista", run: () => ws.setWizard(a.jobId) };
    if (a.lead === "Trucks") return { label: "Trocar viatura", run: () => ws.resolve(a.id, `${a.subject}: viatura trocada no ${a.jobId}`) };
    if (a.lead === "Documents") return { label: "Emitir guia CMR", run: () => ws.resolve(a.id, "Guia CMR emitida") };
    return { label: a.next, run: () => ws.resolve(a.id, `${a.subject}: ${a.next.toLowerCase()} — feito`) };
  };
}

function AttentionRow({ a }: { a: AttentionItem }) {
  const ws = useWs(), act = useActionFor()(a), [lv, lab] = SEV[a.severity];
  return (
    <div className="todo">
      <span className={`dot ${lv}`} style={{ marginTop: 6 }} />
      <div className="body">
        <div style={{ fontWeight: 600 }}>{a.subject} · {a.what}</div>
        <div className="muted" style={{ fontSize: 13 }}>{a.why}</div>
        <div className="acts">
          <button className="btn primary sm" onClick={act.run}>{act.label}</button>
          <button className="btn sm" onClick={() => ws.setOpenJob(a.jobId)}>Abrir {a.jobId}</button>
          <span className={`pill ${lv}`} style={{ alignSelf: "center" }}>{lab}</span>
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>{a.age}</span>
    </div>
  );
}

export function Hoje() {
  const ws = useWs(), lv = useLevels();
  const bad = ws.jobs.filter((j) => lv[j.id] !== "ok").length, unassigned = ws.jobs.filter((j) => j.status === "backlog").length;
  const top = ws.attention[0];
  return (
    <div className="fw-page">
      <div className="muted mono" style={{ fontSize: 12 }}>{NOW.label} · {NOW.clock}</div>
      <div className="welcome" style={{ margin: "6px 0 22px" }}>
        {ws.attention.length ? <>Bom dia. {ws.attention.length} {ws.attention.length === 1 ? "coisa precisa" : "coisas precisam"} de si{top ? <>, a começar por <span style={{ color: "var(--bad)" }}>{top.subject}</span></> : null}.</> : <>Bom dia. Está tudo no plano.</>}
      </div>
      <div className="tiles">
        {[[ws.jobs.length, "transportes hoje", "var(--ink)"], [bad, "precisam de atenção", "var(--bad)"], [unassigned, "por atribuir", "var(--warn)"], [ws.jobs.filter((j) => j.status === "in_transit").length, "em trânsito agora", "var(--ok)"]].map(([n, t, c]) => (
          <div className="fw-card tile" key={t as string}><div className="num" style={{ color: c as string }}>{n}</div><div className="muted">{t}</div></div>
        ))}
      </div>
      <div className="grid2">
        <div className="fw-card fw-pad">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b>A fazer</b><button className="btn sm" onClick={() => ws.setView("inbox")}>Ver tudo</button></div>
          {ws.attention.length ? ws.attention.slice(0, 5).map((a) => <AttentionRow key={a.id} a={a} />) : <div className="muted" style={{ padding: "20px 0" }}>Nada por fazer. Bom trabalho.</div>}
        </div>
        <div className="fw-card fw-pad">
          <b>Entregas de hoje</b>
          <table className="fw-t" style={{ marginTop: 10 }}>
            <tbody>
              {ws.jobs.map((j) => (
                <tr key={j.id} className="click" onClick={() => ws.setOpenJob(j.id)}>
                  <td><b>{routeLabel(j)}</b><div className="muted" style={{ fontSize: 12 }}>{j.id} · {j.client}</div></td>
                  <td>{driverName(j.driverId)}</td>
                  <td className="mono">{j.stops.at(-1)!.eta}</td>
                  <td><span className={`pill ${lv[j.id]}`}>{LVL_LABEL[lv[j.id]]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Inbox() {
  const ws = useWs(), [sel, setSel] = useState(0);
  const a = ws.attention[Math.min(sel, ws.attention.length - 1)];
  const act = useActionFor();
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head"><h1>Precisa de mim</h1><span className="sub">{ws.attention.length} por resolver</span></div>
      <div className="fw-card inbox">
        <div className="list">
          {ws.attention.map((x, i) => (
            <button key={x.id} className="item" aria-current={x === a} onClick={() => setSel(i)}>
              <span className={`dot ${SEV[x.severity][0]}`} style={{ marginTop: 6 }} />
              <span><b>{x.what}</b><br /><span className="muted" style={{ fontSize: 13 }}>{x.subject} · {x.jobId}</span></span>
              <span className="muted" style={{ fontSize: 12 }}>{x.age}</span>
            </button>
          ))}
          {!ws.attention.length && <div className="muted" style={{ padding: 24 }}>Caixa vazia.</div>}
        </div>
        <div className="read">
          {a ? (
            <>
              <span className={`pill ${SEV[a.severity][0]}`}>{SEV[a.severity][1]}</span>
              <h2 style={{ fontSize: 24, margin: "10px 0 6px" }}>{a.subject}: {a.what}</h2>
              <p className="muted" style={{ maxWidth: "62ch" }}>{a.why}</p>
              {a.ifIgnored && <p style={{ maxWidth: "62ch", background: "var(--warn-bg)", padding: "10px 14px", borderRadius: 8 }}>Se ninguém agir: {a.ifIgnored}</p>}
              <div style={{ display: "flex", gap: 8, margin: "20px 0 28px", flexWrap: "wrap" }}>
                <button className="btn primary" onClick={act(a).run}>{act(a).label}</button>
                <button className="btn" onClick={() => ws.setOpenJob(a.jobId)}>Abrir {a.jobId}</button>
                <button className="btn" onClick={() => ws.resolve(a.id, `${a.subject}: marcado como visto`)}>Marcar como visto</button>
              </div>
              <JobFacts job={ws.job(a.jobId)} />
            </>
          ) : <div className="muted">Escolha um item à esquerda.</div>}
        </div>
      </div>
    </div>
  );
}

function JobFacts({ job }: { job: Job }) {
  return (
    <dl className="kv">
      <dt>Transporte</dt><dd>{job.id} · {routeLabel(job)}</dd>
      <dt>Cliente</dt><dd>{job.client}</dd>
      <dt>Motorista</dt><dd>{driverName(job.driverId) || "—"}</dd>
      <dt>Viatura</dt><dd className="mono">{truckPlate(job.truckId)} + {TRAILERS[job.trailerId]?.plate ?? <span style={{ color: "var(--bad)" }}>{job.trailerId} (não existe)</span>}</dd>
      <dt>Entrega</dt><dd>{job.stops.at(-1)!.city} · janela {job.stops.at(-1)!.window.join("–")} · previsto {job.stops.at(-1)!.eta}</dd>
      <dt>Estado</dt><dd>{statusLabel(job.status)}</dd>
    </dl>
  );
}

export function Operacao() {
  const ws = useWs(), lv = useLevels(), [mode, setMode] = useState<"mapa" | "metro">("mapa"), [sel, setSel] = useState<string | null>("J-4217");
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head">
        <h1>Operação</h1><span className="sub">{ws.jobs.length} transportes · {Object.values(lv).filter((x) => x !== "ok").length} com alertas</span>
        <div className="right"><div className="seg"><button aria-pressed={mode === "mapa"} onClick={() => setMode("mapa")}>Mapa</button><button aria-pressed={mode === "metro"} onClick={() => setMode("metro")}>Norte → Sul</button></div></div>
      </div>
      {mode === "mapa" ? (
        <div className="op">
          <div className="fw-card" style={{ padding: 10 }}><PortraitMap jobs={ws.jobs} levels={lv} selected={sel} onSelect={setSel} height={700} /></div>
          <div className="fw-card">
            {ws.jobs.map((j) => (
              <button key={j.id} className="row-j" aria-pressed={sel === j.id} onClick={() => setSel(j.id)} onDoubleClick={() => ws.setOpenJob(j.id)}>
                <span className="mono muted" style={{ fontSize: 12 }}>{j.id}</span>
                <span><b>{routeLabel(j)}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{driverName(j.driverId) || "sem motorista"} · {truckPlate(j.truckId)}</span></span>
                <span><MicroJourney job={j} level={lv[j.id]} /><span style={{ fontSize: 12.5, color: lv[j.id] === "ok" ? "var(--muted)" : `var(--${lv[j.id]})`, fontWeight: lv[j.id] === "ok" ? 400 : 600 }}>{lv[j.id] === "ok" ? "No plano" : j.next}</span></span>
                <span className="btn sm" role="link" onClick={(e) => { e.stopPropagation(); ws.setOpenJob(j.id); }}>Abrir</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fw-card fw-pad">
          <LatitudeMetro jobs={ws.jobs} levels={lv} selected={sel} onSelect={(id) => (sel === id ? ws.setOpenJob(id) : setSel(id))} height={640} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Cada linha é um transporte, de norte (em cima) a sul. Clique duas vezes para abrir.</div>
        </div>
      )}
    </div>
  );
}

export function Dia() {
  const ws = useWs(), lv = useLevels();
  const h0 = 5, h1 = 21, X = (m: number) => `${((m / 60 - h0) / (h1 - h0)) * 100}%`;
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head"><h1>O dia</h1><span className="sub">{NOW.label} · cada barra é um transporte, a linha é agora</span></div>
      <div className="fw-card fw-pad">
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr" }}>
          <div />
          <div style={{ position: "relative", height: 22 }}>{Array.from({ length: h1 - h0 + 1 }, (_, i) => <span key={i} className="mono muted" style={{ position: "absolute", left: X((h0 + i) * 60), fontSize: 11, transform: "translateX(-50%)" }}>{String(h0 + i).padStart(2, "0")}</span>)}</div>
          {ws.jobs.map((j) => {
            const a = minOf(j.stops[0].completedAt ?? j.stops[0].eta), b = minOf(j.stops.at(-1)!.eta) + 30;
            return [
              <button key={j.id + "l"} onClick={() => ws.setOpenJob(j.id)} style={{ border: 0, background: "none", textAlign: "left", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <b>{routeLabel(j)}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{j.id} · {driverName(j.driverId)}</span>
              </button>,
              <div key={j.id + "b"} style={{ position: "relative", borderTop: "1px solid var(--line)", minHeight: 58 }}>
                {j.stops.map((s) => <span key={s.id} title={`${s.city} · janela ${s.window.join("–")}`} style={{ position: "absolute", left: X(minOf(s.window[0])), width: `calc(${X(minOf(s.window[1]))} - ${X(minOf(s.window[0]))})`, top: 40, height: 8, border: "1.5px solid var(--ink)", borderTop: 0 }} />)}
                <button onClick={() => ws.setOpenJob(j.id)} style={{ position: "absolute", left: X(a), width: `calc(${X(b)} - ${X(a)})`, top: 12, height: 24, borderRadius: 6, border: 0, background: lv[j.id] === "ok" ? "var(--brand)" : lv[j.id] === "warn" ? "var(--warn)" : "var(--bad)", color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "left", padding: "0 8px", overflow: "hidden", whiteSpace: "nowrap" }}>{j.stops.map((s) => s.city).join(" → ")}</button>
              </div>,
            ];
          })}
        </div>
        <div style={{ position: "relative", height: 0 }}><span style={{ position: "absolute", left: `calc(240px + (100% - 240px) * ${(NOW.min / 60 - h0) / (h1 - h0)})`, bottom: 0, height: ws.jobs.length * 60 + 30, borderLeft: "2px solid var(--bad)" }} /></div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>A barra é o período em viagem; o colchete por baixo é a janela de cada paragem.</div>
      </div>
    </div>
  );
}

const COLS: [JobStatus, string][] = [["backlog", "Por atribuir"], ["assigned", "Atribuído"], ["loading", "Em carga"], ["in_transit", "Em trânsito"], ["delivered", "Entregue"]];
const colOf = (s: JobStatus): JobStatus => (s === "queued" ? "assigned" : s === "invoiced" ? "delivered" : s);
export function Quadro() {
  const ws = useWs(), lv = useLevels(), [over, setOver] = useState<string | null>(null);
  const drop = (e: DragEvent, s: JobStatus) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id && colOf(ws.job(id).status) !== s) ws.setStatus(id, s); };
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head"><h1>Quadro</h1><span className="sub">Arraste um cartão para mudar de fase</span></div>
      <div className="kanban">
        {COLS.map(([s, t]) => {
          const list = ws.jobs.filter((j) => colOf(j.status) === s);
          return (
            <div key={s} className={`col ${over === s ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, s)}>
              <h3>{t}<span className="muted">{list.length}</span></h3>
              {list.map((j) => (
                <div key={j.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", j.id)} onClick={() => ws.setOpenJob(j.id)}>
                  <div className="muted" style={{ fontSize: 12 }}>{j.id} · {j.client}</div>
                  <div style={{ fontWeight: 650, fontSize: 15, margin: "3px 0 8px" }}>{routeLabel(j)}</div>
                  <span className={`pill ${lv[j.id]}`}>{lv[j.id] === "ok" ? "no plano" : j.next}</span>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 12.5 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="av" style={{ width: 26, height: 26, fontSize: 11 }}>{initials(driverName(j.driverId) || "?")}</span>{driverName(j.driverId)}</span>
                    <span className="mono muted">{j.stops.at(-1)!.eta}</span>
                  </div>
                  {j.positionKm ? <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${(j.positionKm / j.routeKm) * 100}%` }} /></div> : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Tabela() {
  const ws = useWs(), lv = useLevels(), [q, setQ] = useState(""), [only, setOnly] = useState(false);
  const rows = ws.jobs.filter((j) => (!only || lv[j.id] !== "ok") && `${j.id} ${routeLabel(j)} ${j.client} ${driverName(j.driverId)}`.toLowerCase().includes(q.toLowerCase()));
  const csv = () => {
    const head = ["Transporte", "Rota", "Cliente", "Motorista", "Viatura", "Estado", "Chegada", "Janela"];
    const body = rows.map((j) => [j.id, routeLabel(j), j.client, driverName(j.driverId), truckPlate(j.truckId), statusLabel(j.status), j.stops.at(-1)!.eta, j.stops.at(-1)!.window.join("-")]);
    const blob = new Blob([[head, ...body].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "transportes-hoje.csv"; a.click();
    ws.say("Exportado para Excel (CSV)");
  };
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head">
        <h1>Tabela</h1><span className="sub">Edite o motorista diretamente na linha</span>
        <div className="right">
          <input type="search" placeholder="Procurar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar" />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Só com alertas</label>
          <button className="btn" onClick={csv}>Exportar Excel</button>
        </div>
      </div>
      <div className="fw-card" style={{ overflowX: "auto" }}>
        <table className="fw-t">
          <thead><tr><th>Transporte</th><th>Rota</th><th>Cliente</th><th>Motorista</th><th>Viatura</th><th>Estado</th><th>Progresso</th><th>Chegada</th><th>Janela</th><th>Alerta</th></tr></thead>
          <tbody>
            {COLS.map(([s, t]) => {
              const g = rows.filter((j) => colOf(j.status) === s);
              if (!g.length) return null;
              return [
                <tr key={s} className="group"><td colSpan={10}>▾ {t} · {g.length}</td></tr>,
                ...g.map((j) => (
                  <tr key={j.id}>
                    <td><button className="btn sm" onClick={() => ws.setOpenJob(j.id)}>{j.id}</button></td>
                    <td><b>{routeLabel(j)}</b></td><td>{j.client}</td>
                    <td><select value={j.driverId} onChange={(e) => ws.assignDriver(j.id, e.target.value)} aria-label={`Motorista do ${j.id}`}>{DRIVERS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
                    <td className="mono">{truckPlate(j.truckId)}</td>
                    <td><span className={`pill ${s === "backlog" ? "bad" : s === "in_transit" ? "ok" : "mute"}`}>{statusLabel(j.status)}</span></td>
                    <td>{j.positionKm ? <div className="bar" style={{ width: 90 }}><i style={{ width: `${(j.positionKm / j.routeKm) * 100}%` }} /></div> : "—"}</td>
                    <td className="mono">{j.stops.at(-1)!.eta}</td><td className="mono">{j.stops.at(-1)!.window.join("–")}</td>
                    <td style={{ color: lv[j.id] === "ok" ? "var(--muted)" : `var(--${lv[j.id]})` }}>{lv[j.id] === "ok" ? "" : j.next}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Planeamento() {
  const ws = useWs(), lv = useLevels(), [over, setOver] = useState<string | null>(null);
  const h0 = 5, h1 = 21, X = (m: number) => `${((m / 60 - h0) / (h1 - h0)) * 100}%`;
  const backlog = ws.jobs.filter((j) => j.status === "backlog");
  const drop = (e: DragEvent, d: string) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (!id) return; if (d === "D-09") return ws.say("Rui Santos não pode conduzir: CQM caducado"); ws.assignDriver(id, d); if (ws.job(id).status === "backlog") ws.setStatus(id, "assigned"); };
  return (
    <div className="fw-page" style={{ maxWidth: "none" }}>
      <div className="fw-head"><h1>Planeamento</h1><span className="sub">Arraste um transporte para a linha de um motorista</span></div>
      <div className="fw-card fw-pad" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b>Por atribuir:</b>
        {backlog.length ? backlog.map((j) => <span key={j.id} className="backlog-chip" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", j.id)}>{j.id} · {routeLabel(j)}</span>) : <span className="muted">nada — tudo atribuído</span>}
      </div>
      <div className="fw-card">
        <div className="gantt-row" style={{ minHeight: 30 }}><div className="who" /><div className="lane">{Array.from({ length: h1 - h0 + 1 }, (_, i) => <span key={i} className="mono muted" style={{ position: "absolute", left: X((h0 + i) * 60), top: 6, fontSize: 11, transform: "translateX(-50%)" }}>{String(h0 + i).padStart(2, "0")}</span>)}</div></div>
        {DRIVER_POOL.map((d) => {
          const mine = ws.jobs.filter((j) => j.driverId === d.id && j.status !== "backlog"), blocked = d.id === "D-09";
          return (
            <div key={d.id} className="gantt-row">
              <div className="who"><b>{driverName(d.id)}</b><div className="muted" style={{ fontSize: 12 }}>{blocked ? <span style={{ color: "var(--bad)" }}>CQM caducado</span> : d.where}</div></div>
              <div className={`lane ${over === d.id ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(d.id); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, d.id)} style={blocked ? { background: "repeating-linear-gradient(135deg,#fbe6e3 0 6px,transparent 6px 12px)" } : undefined}>
                {mine.map((j) => { const a = minOf(j.stops[0].completedAt ?? j.stops[0].eta), b = minOf(j.stops.at(-1)!.eta) + 30; return <button key={j.id} className="gbar" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", j.id)} onClick={() => ws.setOpenJob(j.id)} style={{ left: X(a), width: `calc(${X(b)} - ${X(a)})`, background: lv[j.id] === "ok" ? "var(--brand)" : lv[j.id] === "warn" ? "var(--warn)" : "var(--bad)" }}>{j.id} · {routeLabel(j)}</button>; })}
                <span style={{ position: "absolute", left: X(NOW.min), top: 0, bottom: 0, borderLeft: "2px solid var(--bad)", opacity: .6 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TransportDetail({ id }: { id: string }) {
  const ws = useWs(), lv = useLevels(), j = ws.job(id), mine = ws.attention.filter((a) => a.jobId === id), [trailer, setTrailer] = useState("");
  const steps: [string, string][] = [[`${id}:carga`, `Carga em ${j.stops[0].city}`], ...j.stops.slice(1).map((s) => [`${id}:${s.id}`, `${s.type === "delivery" ? "Entrega" : "Paragem"} em ${s.city} · ${s.eta}`] as [string, string]), [`${id}:pod`, "Comprovativo de entrega assinado"]];
  const autoDone = (k: string) => (k.endsWith(":carga") && !!j.stops[0].completedAt) || j.stops.some((s) => k.endsWith(":" + s.id) && s.completedAt);
  const missingTrailer = !TRAILERS[j.trailerId];
  return (
    <div className="fw-page">
      <button className="btn sm" onClick={() => ws.setOpenJob(null)}>← Voltar</button>
      <div className="detail-top" style={{ margin: "14px 0 18px" }}>
        <div><div className="muted mono" style={{ fontSize: 12 }}>{j.id} · {j.reference} · {j.client}</div><h1 style={{ fontSize: 28, margin: "4px 0 0" }}>{routeLabel(j)}</h1></div>
        <span className={`pill ${lv[id]}`}>{statusLabel(j.status)}</span>
        <div className="right" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => ws.setWizard(id)}>Trocar motorista</button>
          <button className="btn" onClick={() => ws.say(`Mensagem enviada a ${driverName(j.driverId)} (simulação)`)}>Mensagem ao motorista</button>
        </div>
      </div>
      <div className={`next ${lv[id] === "bad" ? "bad" : ""}`} style={{ borderLeftColor: lv[id] === "ok" ? "var(--ok)" : undefined }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em" }}>PRÓXIMA AÇÃO</div>
        <div style={{ fontSize: 20, fontWeight: 650, margin: "4px 0 10px" }}>{missingTrailer ? j.next : mine[0]?.next ?? "Sem ações pendentes"}</div>
        {missingTrailer ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--bad)" }}>O reboque «{j.trailerId}» não existe.</span>
            <select value={trailer} onChange={(e) => setTrailer(e.target.value)} aria-label="Reboque"><option value="">Escolher reboque livre…</option>{FREE_TRAILERS.map((t) => <option key={t.id} value={t.id}>{t.plate} · {t.type} · {t.location}</option>)}</select>
            <button className="btn primary" disabled={!trailer} onClick={() => trailer && ws.assignTrailer(id, trailer)}>Atribuir reboque</button>
          </div>
        ) : mine.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{mine.map((a) => <button key={a.id} className="btn primary" onClick={() => (a.lead === "Drivers" && a.severity !== "RISK" ? ws.setWizard(id) : ws.resolve(a.id, `${a.subject}: ${a.next.toLowerCase()} — feito`))}>{a.next}</button>)}</div>
        ) : <span className="muted">Nada pendente — segue o plano.</span>}
      </div>
      <div className="fw-card fw-pad" style={{ marginTop: 16 }}>
        <b>Percurso</b><span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>rota real desenrolada · {j.positionKm != null ? `vai no km ${j.positionKm}` : "ainda não saiu"}</span>
        <div style={{ marginTop: 10 }}><StripMap job={j} /></div>
      </div>
      <div className="grid2">
        <div className="fw-card fw-pad">
          <b>Passos</b>
          <div style={{ marginTop: 8 }}>{steps.map(([k, t]) => { const on = autoDone(k) || !!ws.checks[k]; return <button key={k} className="check" role="checkbox" aria-checked={on} onClick={() => !autoDone(k) && ws.toggleCheck(k)}><span className="box">{on ? "✓" : ""}</span><span className="lbl">{t}</span>{autoDone(k) && <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>automático</span>}</button>; })}</div>
        </div>
        <div className="fw-card fw-pad">
          <b>Equipa e carga</b>
          <div style={{ marginTop: 10 }}><JobFacts job={j} /></div>
          <div style={{ marginTop: 14 }}>{j.cargo.map((c) => <div key={c.id} style={{ fontSize: 13, padding: "4px 0" }}>{c.pallets} paletes · {c.description} · {(c.weightKg / 1000).toFixed(1)} t → {c.dropAt}</div>)}</div>
        </div>
      </div>
    </div>
  );
}

export function AssignWizard({ id }: { id: string }) {
  const ws = useWs(), j = ws.job(id), [step, setStep] = useState(1);
  const ranked = useMemo(() => DRIVERS.filter((d) => d.id !== j.driverId).map((d) => {
    const busy = ws.jobs.find((x) => x.driverId === d.id && x.status !== "backlog")?.id ?? null, blocked = d.id === "D-09";
    return { ...d, busy, blocked, score: blocked ? 2 : busy ? 1 : 0 };
  }).sort((a, b) => a.score - b.score), [j.driverId, ws.jobs]);
  const [pick, setPick] = useState(ranked[0]?.id ?? "");
  const p = ranked.find((d) => d.id === pick);
  const confirm = () => { ws.assignDriver(id, pick); ws.attention.filter((a) => a.jobId === id && a.lead === "Drivers").forEach((a) => ws.resolve(a.id, `${driverName(pick)} atribuído ao ${id}`)); ws.setWizard(null); };
  return (
    <div className="modal-bg" onClick={() => ws.setWizard(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Escolher motorista" onClick={(e) => e.stopPropagation()}>
        <div className="steps">{["Transporte", "Escolher motorista", "Confirmar"].map((t, i) => <span key={t} className={i + 1 <= step ? "on" : ""} style={{ display: "flex", gap: 8, alignItems: "center" }}><b>{i + 1 < step ? "✓" : i + 1}</b>{t}{i < 2 && <span style={{ width: 40, borderTop: "1.5px dashed var(--line-2)" }} />}</span>)}</div>
        {step === 1 && <><h2 style={{ margin: "0 0 12px" }}>{j.id} · {routeLabel(j)}</h2><JobFacts job={j} /></>}
        {step === 2 && (
          <>
            <h2 style={{ margin: "0 0 4px" }}>Quem faz o {j.id}?</h2>
            <p className="muted" style={{ marginTop: 0 }}>Os livres aparecem primeiro. Quem não pode conduzir não pode ser escolhido.</p>
            {ranked.map((d, i) => (
              <button key={d.id} className="opt" aria-pressed={pick === d.id} disabled={d.blocked} style={d.blocked ? { opacity: .55, cursor: "not-allowed" } : undefined} onClick={() => setPick(d.id)}>
                <span className="av">{initials(d.name)}</span>
                <span><b>{d.name}</b><br /><span className="muted" style={{ fontSize: 13 }}>{d.where}{d.busy ? ` · ocupado com ${d.busy}` : ""}</span></span>
                <span className={`pill ${d.blocked ? "bad" : d.busy ? "warn" : "ok"}`}>{d.blocked ? "CQM caducado" : d.busy ? "Ocupado" : i === 0 ? "Recomendado" : "Livre"}</span>
              </button>
            ))}
          </>
        )}
        {step === 3 && p && <><h2 style={{ margin: "0 0 12px" }}>Confirmar</h2><p style={{ fontSize: 16 }}><b>{p.name}</b> passa a conduzir o <b>{j.id}</b> ({routeLabel(j)}){driverName(j.driverId) ? <> em vez de {driverName(j.driverId)}</> : null}.</p>{p.busy && <p style={{ background: "var(--warn-bg)", padding: "10px 14px", borderRadius: 8 }}>Atenção: {p.name} já tem o {p.busy} hoje.</p>}</>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
          <button className="btn" onClick={() => (step === 1 ? ws.setWizard(null) : setStep(step - 1))}>{step === 1 ? "Cancelar" : "← Voltar"}</button>
          {step < 3 ? <button className="btn primary" disabled={step === 2 && !pick} onClick={() => setStep(step + 1)}>Continuar →</button> : <button className="btn primary" onClick={confirm}>Atribuir {p?.name}</button>}
        </div>
      </div>
    </div>
  );
}
