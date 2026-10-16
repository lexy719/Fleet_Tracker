import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FileText, Signpost, Truck, Users, BriefcaseBusiness, ArrowLeft } from "lucide-react";
import { initialGuidedState, type GuidedAction, type GuidedLens, type GuidedState } from "../guidedWorkspace";
import { DRIVER_POOL, NOW, ROUTES, WORLD_JOBS, driverWorld, dur, hm } from "../world";
import { labWorld } from "./model";
import { Id, Plate, Status } from "./honesty";
import { DriverInstrument } from "./DriverInstrument";
import { TruckInstrument } from "./TruckInstrument";
import { TransportOverview } from "./TransportOverview";
import "../guided.css";
import "../product.css";
import "./fleetos.css";
import "./fidelity.css";
import "./living.css";
import "./world.css";

/**
 * The operation as ONE world. Nothing here navigates:
 * - a layer paints information onto the objects already on screen;
 * - the arrangement regroups the same objects (by transport / by driver);
 * - focus brings one object close while the rest of the world stays visible.
 * Every transport is one persistent object keyed by its id, so it moves and
 * grows instead of being replaced.
 */
type Layer = "Drivers" | "Trucks" | "Restrictions" | "Documents";
type Arrange = "transport" | "driver";
type Focus = { kind: "job" | "driver" | "truck"; job: string } | null;
type WorldState = { layers: Layer[]; arrange: Arrange; focus: Focus };
type Rect = { x: number; y: number; w: number; h: number };

const LAYERS: { id: Layer; label: string; icon: typeof Users }[] = [
  { id: "Drivers", label: "Motorista", icon: Users },
  { id: "Trucks", label: "Viatura", icon: Truck },
  { id: "Restrictions", label: "Restrições", icon: Signpost },
  { id: "Documents", label: "Documentos", icon: FileText },
];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const DAY = [5 * 60 + 30, 19 * 60];

function worldOf(jobId: string) {
  return labWorld({ ...initialGuidedState(), anchor: { kind: "job", id: jobId } });
}
type JW = ReturnType<typeof worldOf>;
const risky = (w: JW) => w.restrictions.some((r) => r.result !== "DOES_NOT_APPLY");

/* ─── Geometry: the same objects, three readings ────────────────────────── */

function arrange(ws: WorldState, worlds: Record<string, JW>, vw: number, vh: number) {
  const x0 = 112,
    y0 = 74,
    W = vw - x0 - 24,
    H = vh - y0 - 24;
  const cards: Record<string, Rect & { mode: "full" | "mini" | "lane" | "focus" }> = {};
  const labels: Record<string, Rect & { name: string; free: boolean }> = {};
  const layerH = ws.layers.length;
  if (ws.focus) {
    // Focus: the chosen object comes close; the rest of the world waits on the edge, still alive.
    const others = WORLD_JOBS.filter((j) => j.id !== ws.focus!.job);
    cards[ws.focus.job] = { x: x0 + 236, y: y0, w: W - 236, h: H, mode: "focus" };
    others.forEach((j, i) => (cards[j.id] = { x: x0, y: y0 + i * 70, w: 220, h: 62, mode: "mini" }));
    return { cards, labels, axis: null as null | { x: number; w: number } };
  }
  if (ws.arrange === "transport") {
    const order = [...WORLD_JOBS].sort((a, b) =>
      ws.layers.includes("Restrictions") ? Number(risky(worlds[b.id])) - Number(risky(worlds[a.id])) : 0,
    );
    const h = 92 + layerH * 30;
    order.forEach((j, i) => (cards[j.id] = { x: x0, y: y0 + i * (h + 10), w: W, h, mode: "full" }));
    return { cards, labels, axis: null };
  }
  // By driver: every person is a lane on the day's axis; their transport becomes a bar in time.
  const labelW = 190;
  const ax = x0 + labelW,
    aw = W - labelW;
  const tx = (m: number) => ax + ((Math.max(DAY[0], Math.min(DAY[1], m)) - DAY[0]) / (DAY[1] - DAY[0])) * aw;
  const laneH = Math.max(64, Math.min(110, (H - 30) / DRIVER_POOL.length));
  DRIVER_POOL.forEach((d, i) => {
    const y = y0 + 30 + i * laneH;
    const job = WORLD_JOBS.find((j) => j.driverId === d.id);
    labels[d.id] = { x: x0, y, w: labelW - 10, h: laneH - 8, name: driverWorld(d.id).name, free: !job };
    if (job) {
      const w = worlds[job.id];
      const start = Math.min(...w.driver.duty.map((b) => b.from));
      const end = Math.max(...w.driver.duty.map((b) => b.to));
      cards[job.id] = { x: tx(start), y, w: Math.max(150, tx(end) - tx(start)), h: laneH - 8, mode: "lane" };
    }
  });
  return { cards, labels, axis: { x: ax, w: aw } };
}

/* ─── The object: one transport, painted by the active layers ─────────── */

function TransportObject({ w, ws, mode, set }: { w: JW; ws: WorldState; mode: "full" | "mini" | "lane" | "focus"; set: (f: Focus) => void }) {
  const job = w.job;
  const total = ROUTES[job.routeId].km;
  const pct = (km: number) => `${Math.min(100, (km / total) * 100)}%`;
  const last = job.stops.at(-1)!;
  const slack = /\d/.test(last.eta) ? toMin(last.window[1]) - toMin(last.eta) : null;
  const on = (l: Layer) => ws.layers.includes(l);
  const worst = w.restrictions.find((r) => r.result === "UNKNOWN") ?? w.restrictions.find((r) => r.result === "APPLIES");
  if (mode === "mini")
    return (
      <button className="w-mini" onClick={() => set({ kind: "job", job: job.id })}>
        <Id>{job.id}</Id>
        <b>
          {job.stops[0].city} → {last.city}
        </b>
        <i data-tone={job.blockers.length ? "blocker" : job.sla === "on_track" ? "ok" : "risk"} />
      </button>
    );
  const head = (
    <header className="w-head">
      <button className="w-id" onClick={() => set({ kind: "job", job: job.id })}>
        <Id>{job.id}</Id>
        <b>
          {job.stops[0].city} → {last.city}
        </b>
      </button>
      <Status tone={job.blockers.length ? "blocker" : job.plan === "REPLAN_REQUIRED" ? "action" : job.sla === "on_track" ? "ok" : "risk"}>
        {job.blockers[0] ?? (job.plan === "REPLAN_REQUIRED" ? "A replanear" : job.status === "in_transit" ? "Em trânsito" : job.status === "loading" ? "Em carga" : "Por partir")}
      </Status>
    </header>
  );
  const track = (
    <div className="w-track">
      <span className="w-line" />
      {w.positionKnown && <span className="w-done" style={{ width: pct(job.positionKm ?? 0) }} />}
      {job.stops.map((s) => (
        <span key={s.id} className="w-stop" data-done={!!s.completedAt} style={{ left: pct(s.km) }} title={`${s.city} · ${s.eta}`} />
      ))}
      {on("Restrictions") &&
        w.restrictions.map((r) => (
          <span key={r.id} className="w-road" data-result={r.result} style={{ left: pct(r.km ?? 0) }} title={r.title}>
            <i />
          </span>
        ))}
      {on("Drivers") && w.planned && (
        <span className="w-break" style={{ left: pct(w.planned.km) }} title={`Pausa ${w.planned.arrival}`}>
          <i />
        </span>
      )}
      {w.positionKnown && <span className="w-now" style={{ left: pct(job.positionKm ?? 0) }} />}
    </div>
  );
  const eta = (
    <span className="w-eta" data-tone={slack == null ? "unknown" : slack < 0 ? "action" : slack < 20 ? "risk" : "ok"}>
      {last.city} {last.eta} · {slack == null ? "sem estimativa" : slack >= 0 ? `${slack} min de folga` : `${-slack} min depois da janela`}
    </span>
  );
  const bands: ReactNode[] = [];
  if (on("Drivers"))
    bands.push(
      <button key="d" className="w-band" data-layer="Drivers" onClick={() => set({ kind: "driver", job: job.id })}>
        <small>Motorista</small>
        <b>{w.driver.name}</b>
        <span className="w-meter">
          <i style={{ width: `${Math.min(100, (w.driver.spellMin / 270) * 100)}%` }} data-near={w.driver.spellMin > 220} />
        </span>
        <span>
          {dur(w.driver.spellMin)} · limite {w.limit}
          {w.planned ? ` · pausa ${w.planned.name.replace("Área de serviço de ", "")} ${w.planned.arrival}` : ""}
        </span>
      </button>,
    );
  if (on("Trucks"))
    bands.push(
      <button key="t" className="w-band" data-layer="Trucks" onClick={() => set({ kind: "truck", job: job.id })}>
        <small>Viatura</small>
        <Plate small>{w.truck.plate}</Plate>
        <span>
          {w.trailer ? `+ ${w.trailer.id}` : `reboque ${job.trailerId} não existe`} · {w.pallets}/{w.trailer?.pallets ?? "?"} paletes · combustível{" "}
          {w.positionKnown ? `≈ ${Math.round(w.fuelNowPct)}%` : `${w.truck.fuel.value}%`}
          {w.truck.availability === "MAINTENANCE" ? " · em oficina" : ""}
        </span>
      </button>,
    );
  if (on("Restrictions"))
    bands.push(
      <div key="r" className="w-band" data-layer="Restrictions">
        <small>Restrições</small>
        {worst ? (
          <span>
            <b>{worst.title.split(" — ")[0]}</b> · {worst.answer}
          </span>
        ) : (
          <span>nenhuma se aplica · {w.restrictions.length} na rota</span>
        )}
      </div>,
    );
  if (on("Documents")) {
    const c = w.ledger[0];
    bands.push(
      <div key="c" className="w-band" data-layer="Documents">
        <small>Documentos</small>
        <Status tone={c.state === "MISSING" ? "action" : c.diverges ? "risk" : c.state === "ISSUED" ? "ok" : "neutral"}>
          {c.title} {c.state === "ISSUED" && c.diverges ? `difere em ${c.diverges} campos` : c.stateText.toLowerCase()}
        </Status>
      </div>,
    );
  }
  if (mode === "lane")
    return (
      <div className="w-lane-card">
        <button className="w-id" onClick={() => set({ kind: "job", job: job.id })}>
          <Id>{job.id}</Id> {job.stops[0].city} → {last.city}
        </button>
        {track}
        <div className="w-lane-bands">{bands}</div>
      </div>
    );
  return (
    <>
      {head}
      <div className="w-body">
        {track}
        {eta}
      </div>
      {bands.length > 0 && <div className="w-bands">{bands}</div>}
    </>
  );
}

/* ─── Focus: the instrument of the object, inside the same world ───────── */

function FocusContent({ w, ws, set }: { w: JW; ws: WorldState; set: (f: Focus) => void }) {
  const focus = ws.focus!;
  const active: GuidedLens[] = ["Jobs", ...ws.layers];
  const gs: GuidedState = {
    ...initialGuidedState(),
    anchor: { kind: "job", id: w.jobId },
    active,
    lead: focus.kind === "driver" ? "Drivers" : focus.kind === "truck" ? "Trucks" : "Jobs",
  };
  // Instrument links stay in the world: people and machines shift the focus.
  const act = (a: GuidedAction) => {
    if (a.type === "follow" && a.object.kind === "driver") set({ kind: "driver", job: w.jobId });
    else if (a.type === "follow" && (a.object.kind === "truck" || a.object.kind === "fact" || a.object.kind === "fuel")) set({ kind: "truck", job: w.jobId });
    else if (a.type === "follow" && a.object.kind === "job") set({ kind: "job", job: a.object.id });
    else if (a.type === "entity" && (a.kind === "driver" || a.kind === "truck")) set({ kind: a.kind, job: w.jobId });
  };
  const related = (
    <nav className="w-related" aria-label="Ligado a este transporte">
      {(["job", "driver", "truck"] as const).map((k) => (
        <button key={k} aria-pressed={focus.kind === k} onClick={() => set({ kind: k, job: w.jobId })}>
          <small>{k === "job" ? "Transporte" : k === "driver" ? "Motorista" : "Viatura"}</small>
          <b>{k === "job" ? w.jobId : k === "driver" ? w.driver.name : w.truck.plate}</b>
        </button>
      ))}
    </nav>
  );
  return (
    <div className="w-focus">
      {related}
      <div className="w-focus-body" key={focus.kind}>
        {focus.kind === "driver" ? (
          <DriverInstrument state={gs} act={act} />
        ) : focus.kind === "truck" ? (
          <TruckInstrument state={gs} act={act} />
        ) : (
          <TransportOverview state={gs} act={act} />
        )}
      </div>
    </div>
  );
}

/* ─── The environment ──────────────────────────────────────────────────── */

export default function WorldEnvironment() {
  const [ws, setWs] = useState<WorldState>({ layers: [], arrange: "transport", focus: null });
  const [history, setHistory] = useState<WorldState[]>([]);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const worlds = useMemo(() => Object.fromEntries(WORLD_JOBS.map((j) => [j.id, worldOf(j.id)])), []);
  const change = (next: WorldState) => {
    if (JSON.stringify(next) === JSON.stringify(ws)) return;
    setHistory((h) => [...h, ws]);
    setWs(next);
  };
  const toggle = (l: Layer) => change({ ...ws, layers: ws.layers.includes(l) ? ws.layers.filter((x) => x !== l) : [...ws.layers, l] });
  const setFocus = (f: Focus) => change({ ...ws, focus: f });
  const back = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setWs(prev);
  };
  const backRef = useRef(back);
  const changeRef = useRef(change);
  useLayoutEffect(() => {
    backRef.current = back;
    changeRef.current = change;
  });
  useEffect(() => {
    const r = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const k = (e: KeyboardEvent) => e.key === "Escape" && backRef.current();
    window.addEventListener("resize", r);
    window.addEventListener("keydown", k);
    const g = window as unknown as Record<string, unknown>;
    g.__fleetosLab = {
      act: (a: Partial<WorldState> & { toggle?: Layer }) => {
        const cur = (g.__fleetosWorldState as WorldState) ?? { layers: [], arrange: "transport", focus: null };
        if (a.toggle) changeRef.current({ ...cur, layers: cur.layers.includes(a.toggle) ? cur.layers.filter((x) => x !== a.toggle) : [...cur.layers, a.toggle] });
        else changeRef.current({ ...cur, ...a });
      },
      settled: () => new Promise((res) => setTimeout(() => res(true), 900)),
    };
    return () => {
      window.removeEventListener("resize", r);
      window.removeEventListener("keydown", k);
      delete g.__fleetosLab;
    };
  }, []);
  useLayoutEffect(() => {
    (window as unknown as Record<string, unknown>).__fleetosWorldState = ws;
  }, [ws]);
  const g = arrange(ws, worlds, size.w, size.h);
  const reading = [
    ws.arrange === "transport" ? "Organizado por transporte" : "Organizado por motorista",
    ws.layers.length ? `com ${ws.layers.map((l) => LAYERS.find((x) => x.id === l)!.label.toLowerCase()).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const focused = ws.focus ? worlds[ws.focus.job] : null;
  return (
    <main className="fleetos-environment guided-workspace fx w-world" data-arrange={ws.arrange} data-focus={ws.focus?.kind ?? "none"}>
      <div className="w-strip">
        <span>
          <b>Operação</b> · {WORLD_JOBS.length} transportes hoje
          {focused && (
            <>
              {" "}
              ›{" "}
              <b>
                {ws.focus!.kind === "driver" ? focused.driver.name : ws.focus!.kind === "truck" ? focused.truck.plate : focused.jobId}
              </b>
            </>
          )}
        </span>
        <span className="w-reading">{reading}</span>
        <span>
          {NOW.label} · <b>{NOW.clock}</b>
        </span>
      </div>

      <aside className="w-rail" aria-label="Como ler o mundo">
        <span className="fx-mark">F</span>
        <small>Organizar</small>
        <button aria-pressed={ws.arrange === "transport"} onClick={() => change({ ...ws, arrange: "transport", focus: null })}>
          <BriefcaseBusiness size={16} />
          <span>Transporte</span>
        </button>
        <button aria-pressed={ws.arrange === "driver"} onClick={() => change({ ...ws, arrange: "driver", focus: null })}>
          <Users size={16} />
          <span>Motorista</span>
        </button>
        <small>Mostrar</small>
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button key={id} data-layer aria-pressed={ws.layers.includes(id)} onClick={() => toggle(id)}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
        <button className="w-back" disabled={!history.length} onClick={back} aria-label="Voltar">
          <ArrowLeft size={16} />
          <span>Esc</span>
        </button>
      </aside>

      {g.axis && (
        <div className="w-axis" style={{ left: g.axis.x, width: g.axis.w }}>
          {Array.from({ length: 14 }, (_, i) => 6 + i).map((h) => (
            <span key={h} style={{ left: `${((h * 60 - DAY[0]) / (DAY[1] - DAY[0])) * 100}%` }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
          <b style={{ left: `${((NOW.min - DAY[0]) / (DAY[1] - DAY[0])) * 100}%` }}>{NOW.clock}</b>
        </div>
      )}
      {Object.entries(g.labels).map(([id, r]) => (
        <div key={`lab-${id}`} className="w-lane" data-free={r.free} style={{ left: r.x, top: r.y, width: r.w, height: r.h } as CSSProperties}>
          <b>{r.name}</b>
          <small>{r.free ? "sem transporte hoje" : DRIVER_POOL.find((d) => d.id === id)?.where}</small>
        </div>
      ))}
      {WORLD_JOBS.map((j) => {
        const r = g.cards[j.id];
        if (!r) return null;
        return (
          <section
            key={j.id}
            className="w-card"
            data-mode={r.mode}
            data-risky={risky(worlds[j.id])}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h } as CSSProperties}
          >
            {r.mode === "focus" ? (
              <FocusContent w={worlds[j.id]} ws={ws} set={setFocus} />
            ) : (
              <TransportObject w={worlds[j.id]} ws={ws} mode={r.mode} set={setFocus} />
            )}
          </section>
        );
      })}
      <span className="w-hint">{hm(NOW.min)} · Esc volta ao estado anterior</span>
    </main>
  );
}
