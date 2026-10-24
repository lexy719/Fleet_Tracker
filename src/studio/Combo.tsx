// Combinar, as cinema: every combination of categories is its own scene — the camera flies, tilts
// and turns, the map changes tone, and the whole screen recomposes (titles, cast, split screen).
// Switching a category is a cut between shots, not a list getting longer.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { stageApi } from "./StageMap";
import { placeOf } from "./model";
import { allDrivers, clock, driverWorld, initials, span, truckWorld, DAY_LIMIT } from "./model";
import { eurL, money } from "./fuelui";
import type { Row } from "./types";
import { DayScene, type Measure, type ViagensVar } from "./Day";

export type ComboState = { drivers: boolean; jobs: boolean; fuel: boolean };
export type Scene = "map" | "drivers" | "jobs" | "both" | "fuel" | "jobs-fuel" | "drivers-fuel" | "all";
export const sceneOf = (c: ComboState): Scene =>
  c.drivers && c.jobs && c.fuel ? "all"
  : c.drivers && c.jobs ? "both"
  : c.jobs && c.fuel ? "jobs-fuel"
  : c.drivers && c.fuel ? "drivers-fuel"
  : c.fuel ? "fuel"
  : c.drivers ? "drivers"
  : c.jobs ? "jobs"
  : "map";
/** Scenes that split the screen (map left, cast right). */
export const isSplit = (s: Scene) => s === "both" || s === "all";
/** Right part of the screen taken by the cast in the split scene. */
export const SPLIT_W = 600;

const statusLabel: Record<string, string> = { in_transit: "em viagem", loading: "em carga", assigned: "atribuído", queued: "na fila", backlog: "por atribuir", delivered: "entregue" };

function useScenes(scene: Scene) {
  // The scene that is leaving stays a moment, playing its exit, while the new one enters.
  const [shown, setShown] = useState<{ scene: Scene; leaving: boolean }[]>([{ scene, leaving: false }]);
  const [last, setLast] = useState(scene);
  if (last !== scene) {
    setLast(scene);
    setShown((s) => [...s.filter((x) => x.scene !== scene).map((x) => ({ ...x, leaving: true })), { scene, leaving: false }]);
  }
  useEffect(() => {
    if (!shown.some((x) => x.leaving)) return;
    const slow = (window as unknown as { __slow?: number }).__slow ?? 1;
    const t = window.setTimeout(() => setShown((s) => s.filter((x) => !x.leaving)), 700 * slow);
    return () => window.clearTimeout(t);
  }, [shown]);
  return shown;
}

function Title({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="cn-title">
      <span className="cn-eyebrow" style={{ animationDelay: "0.55s" }}>{eyebrow}</span>
      <h1 style={{ animationDelay: "0.65s" }}>{title}</h1>
      <p style={{ animationDelay: "0.78s" }}>{sub}</p>
    </div>
  );
}

function DriversScene({ jobs }: { jobs: Row[] }) {
  const drivers = allDrivers();
  const cast = useRef<HTMLDivElement>(null);
  // The people come to you: each person leaves their point on the map and flies into the cast.
  useLayoutEffect(() => {
    const root = cast.current;
    const project = stageApi.project;
    if (!root || !project || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.querySelectorAll<HTMLElement>("[data-at]").forEach((el, i) => {
      const [lng, lat] = el.dataset.at!.split(",").map(Number);
      const p = project([lng, lat]);
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      el.animate(
        [
          { transform: `translate(${p.x - r.left - 23}px, ${p.y - r.top - 23}px) scale(0.35)`, opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 1300, delay: 250 + i * 70, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" },
      );
    });
  }, []);
  const jobOf = (id: string) => jobs.find((j) => j.driverId === id) ?? null;
  const working = drivers.filter((d) => jobOf(d.id));
  const free = drivers.filter((d) => !jobOf(d.id));
  return (
    <>
      <div className="cn-scrim" />
      <Title eyebrow="Agora" title="Motoristas" sub={`${working.length} a trabalhar · ${free.length} livres`} />
      <div className="cn-cast cn-cast-fly" ref={cast}>
        {[...working, ...free].map((d, i) => {
          const w = driverWorld(d.id);
          const j = jobOf(d.id);
          const k = Math.min(1, w.dayMin / DAY_LIMIT);
          return (
            <button
              key={d.id}
              className="cn-person"
              data-free={!j || undefined}
              data-driver={d.id}
              data-job={j?.id}
              data-at={(j ? j.at : placeOf(d.where))?.join(",")}
              disabled={!j}
              title={j ? `Abrir ${j.id}` : "Livre"}
              style={{ animationDelay: `${0.9 + i * 0.06}s` }}
            >
              <span className="cn-mono">{initials(w.name)}</span>
              <b>{w.name.split(" ")[0]}</b>
              <span>{j ? j.activity : "livre"}</span>
              <span className="cn-hours" data-tight={k > 0.85 || undefined}>
                <i style={{ width: `${k * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function JobsScene({ jobs, title = "Transportes" }: { jobs: Row[]; title?: string }) {
  const road = jobs.filter((j) => j.status === "in_transit" || j.status === "loading");
  const rest = jobs.filter((j) => !road.includes(j));
  return (
    <>
      <div className="cn-scrim" />
      <Title eyebrow="Hoje" title={title} sub={`${jobs.length} transportes · ${road.length} na estrada · ${rest.filter((j) => j.status === "backlog").length} por atribuir`} />
      <div className="cn-reel">
        {[...road, ...rest].slice(0, 8).map((j, i) => (
          <button key={j.id} className="cn-trip" data-job={j.id} data-road={road.includes(j) || undefined} data-tone={j.tone} title={`Abrir ${j.id}`} style={{ animationDelay: `${0.9 + i * 0.07}s` }}>
            <span className="cn-trip-id">{j.id}</span>
            <b>
              {j.stops[0].city} <i /> {j.stops.at(-1)!.city}
            </b>
            <span>{j.forecast.final != null ? `chega ${clock(j.forecast.final)}` : statusLabel[j.status] ?? j.status}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Scenes where the map leaves the stage (it shrinks into a live window in the corner). */
export const mapAside = (s: Scene) => s === "fuel" || s === "jobs-fuel" || s === "drivers-fuel";

function FuelScene({ jobs, withRoutes }: { jobs: Row[]; withRoutes: boolean }) {
  const trips = jobs.filter((j) => j.fuel && j.truckId).sort((a, b) => Number(b.fuel!.short) - Number(a.fuel!.short) || b.fuel!.refuels.length - a.fuel!.refuels.length || a.fuel!.endL / a.fuel!.tankL - b.fuel!.endL / b.fuel!.tankL);
  const stops = trips.flatMap((j) => j.fuel!.refuels);
  const litres = stops.reduce((a, r) => a + r.litres, 0);
  const cost = stops.reduce((a, r) => a + r.litres * r.pricePerL, 0);
  return (
    <div className="tk-stage">
      <header className="tk-head">
        <span className="cn-eyebrow">{withRoutes ? "Nas rotas de hoje" : "Agora"}</span>
        <h1>Depósitos</h1>
        <p>
          {trips.length} camiões · {stops.length} {stops.length === 1 ? "paragem" : "paragens"} de abastecimento · {Math.round(litres)} L · {money(cost)}
        </p>
      </header>
      <div className="tk-wall">
        {trips.map((j, i) => {
          const v = j.fuel!;
          const now = v.startL / v.tankL;
          const end = v.endL / v.tankL;
          const rf = v.refuels[0];
          const state = v.short ? "short" : rf ? "refuel" : "ok";
          return (
            <button key={j.id} className="tk" data-job={j.id} data-state={state} title={`Abrir ${j.id}`} style={{ animationDelay: `${0.35 + i * 0.07}s`, ["--now" as string]: now, ["--end" as string]: end, ["--d" as string]: `${0.6 + i * 0.07}s` }}>
              <span className="tk-glass">
                <span className="tk-liquid" />
                <span className="tk-end" title="Com quanto chega" />
                <span className="tk-reserve" />
                <b className="tk-pct">{Math.round(now * 100)}%</b>
              </span>
              <span className="tk-plate">{truckWorld(j.truckId).plate}</span>
              <span className="tk-who">{driverWorld(j.driverId).name.split(" ")[0] || "—"}</span>
              {withRoutes && (
                <span className="tk-route">
                  {j.stops[0].city} → {j.stops.at(-1)!.city}
                </span>
              )}
              <span className="tk-verdict">
                {state === "short" ? "não chega · rever" : rf ? `abastece em ${rf.name.split(" · ")[0]}` : `chega com ${Math.round(end * 100)}%`}
              </span>
              {rf && (
                <span className="tk-stop">
                  {eurL(rf.pricePerL)} · {Math.round(rf.litres)} L · {money(rf.litres * rf.pricePerL)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BothScene({ jobs, fuel }: { jobs: Row[]; fuel?: boolean }) {
  const drivers = allDrivers();
  const jobOf = (id: string) => jobs.find((j) => j.driverId === id) ?? null;
  const pairs = drivers.filter((d) => jobOf(d.id)).map((d) => ({ d, j: jobOf(d.id)! }));
  pairs.sort((a, b) => (a.j.forecast.final ?? 9e9) - (b.j.forecast.final ?? 9e9));
  const free = drivers.filter((d) => !jobOf(d.id));
  const orphans = jobs.filter((j) => !j.driverId || !drivers.some((d) => d.id === j.driverId));
  return (
    <aside className="cn-split" style={{ width: SPLIT_W }}>
      <span className="cn-eyebrow" style={{ animationDelay: "0.6s" }}>Quem leva o quê</span>
      <h1 style={{ animationDelay: "0.7s" }}>{pairs.length} motoristas na estrada</h1>
      <div className="cn-credits">
        {pairs.map(({ d, j }, i) => {
          const w = driverWorld(d.id);
          return (
            <button key={d.id} className="cn-credit" data-job={j.id} data-tone={j.tone} title={`Abrir ${j.id}`} style={{ animationDelay: `${0.85 + i * 0.09}s` }}>
              <span className="cn-credit-who">
                <b>{w.name}</b>
                <span>{span(w.dayMin)} de condução hoje</span>
              </span>
              <span className="cn-credit-line" />
              <span className="cn-credit-what">
                <b>
                  {j.stops[0].city} → {j.stops.at(-1)!.city}
                </b>
                <span>
                  {j.id} · {j.forecast.final != null ? `chega ${clock(j.forecast.final)}` : statusLabel[j.status]}
                </span>
                {fuel && (
                  <span className="cn-credit-fuel">
                    {j.fuel?.refuels.length ? `abastece em ${j.fuel.refuels[0].name.split(" · ")[0]} · ${eurL(j.fuel.refuels[0].pricePerL)}` : j.fuel ? `sem paragem · chega com ${Math.round((j.fuel.endL / j.fuel.tankL) * 100)}%` : "sem dados de combustível"}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cn-rest" style={{ animationDelay: `${0.9 + pairs.length * 0.09}s` }}>
        <p>
          <span>Livres</span> {free.map((d) => driverWorld(d.id).name.split(" ")[0]).join(" · ") || "—"}
        </p>
        <p>
          <span>Sem motorista</span> {orphans.length} transportes · {orphans.slice(0, 4).map((j) => j.id).join(" · ")}
          {orphans.length > 4 ? " …" : ""}
        </p>
      </div>
    </aside>
  );
}

export function ComboView({ combo, onToggle, jobs, onOpen }: { combo: ComboState; onToggle: (k: keyof ComboState) => void; jobs: Row[]; onOpen: (jobId: string) => void }) {
  // Keyboard: M, T, C switch the categories (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const k = { m: "drivers", t: "jobs", c: "fuel" }[e.key.toLowerCase()] as keyof ComboState | undefined;
      if (k) onToggle(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);
  return (
    <>
      <nav className="cb-bar" aria-label="Categorias">
        <button className="cb-btn" aria-pressed={combo.drivers} onClick={() => onToggle("drivers")}>
          <span className="cb-ico" data-i="drivers" aria-hidden />
          Motoristas
          <kbd>M</kbd>
        </button>
        <button className="cb-btn" aria-pressed={combo.jobs} onClick={() => onToggle("jobs")}>
          <span className="cb-ico" data-i="jobs" aria-hidden />
          Transportes
          <kbd>T</kbd>
        </button>
        <button className="cb-btn" aria-pressed={combo.fuel} onClick={() => onToggle("fuel")}>
          <span className="cb-ico" data-i="fuel" aria-hidden />
          Combustível
          <kbd>C</kbd>
        </button>
      </nav>
      <SceneStage scene={sceneOf(combo)} jobs={jobs} onOpen={onOpen} />
    </>
  );
}

/** Fuel as a reel under the map: every trip of today, where it will refuel (or why it does not need to). */
function FuelReelScene({ jobs }: { jobs: Row[] }) {
  const trips = jobs
    .filter((j) => j.fuel && j.truckId)
    .sort((a, b) => Number(b.fuel!.short) - Number(a.fuel!.short) || b.fuel!.refuels.length - a.fuel!.refuels.length || a.fuel!.endL / a.fuel!.tankL - b.fuel!.endL / b.fuel!.tankL);
  const stops = trips.flatMap((j) => j.fuel!.refuels);
  const litres = stops.reduce((a, r) => a + r.litres, 0);
  const cost = stops.reduce((a, r) => a + r.litres * r.pricePerL, 0);
  const short = trips.filter((j) => j.fuel!.short).length;
  return (
    <>
      <div className="cn-scrim" />
      <Title
        eyebrow="Nas rotas de hoje"
        title="Combustível"
        sub={`${stops.length} ${stops.length === 1 ? "paragem" : "paragens"} para abastecer · ${Math.round(litres)} L · ${money(cost)}${short ? ` · ${short} não ${short === 1 ? "chega" : "chegam"}` : ""}`}
      />
      <div className="cn-reel">
        {trips.slice(0, 8).map((j, i) => {
          const v = j.fuel!;
          const rf = v.refuels[0];
          return (
            <button key={j.id} className="cn-trip cn-fuel" data-job={j.id} data-stop={rf ? "" : undefined} data-tone={v.short ? "bad" : undefined} title={`Abrir ${j.id}`} style={{ animationDelay: `${0.9 + i * 0.07}s` }}>
              <span className="cn-trip-id">
                {j.id} · {truckWorld(j.truckId).plate}
              </span>
              <b>
                {j.stops[0].city} <i /> {j.stops.at(-1)!.city}
              </b>
              <span className="cn-fuel-what">{v.short ? "não chega · rever" : rf ? `abastece em ${rf.name.split(" · ")[0]}` : `sem paragem · chega com ${Math.round((v.endL / v.tankL) * 100)}%`}</span>
              <span>{rf ? `${eurL(rf.pricePerL)} · ${Math.round(rf.litres)} L · ${money(rf.litres * rf.pricePerL)}` : `sai com ${Math.round((v.startL / v.tankL) * 100)}% no depósito`}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The scene on top of the map (titles, cast, reel, split screen); the leaving scene plays its exit. */
export function SceneStage({ scene, jobs, onOpen, routesTitle, fuelReel, viagens }: { scene: Scene; jobs: Row[]; onOpen: (jobId: string) => void; routesTitle?: string; fuelReel?: boolean; /** Mapa: the Viagens palco (full page) instead of the split credits. */ viagens?: { now: number; variant: ViagensVar; measure: Measure; onVariant: (v: ViagensVar) => void; onMeasure: (m: Measure) => void; onTruck?: (truckId: string) => void; onDriver?: (driverId: string) => void; onFuel?: (stopId: string) => void; onClient?: (client: string) => void } }) {
  const scenes = useScenes(scene);
  const open = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-job]")?.dataset.job;
    if (id) onOpen(id);
  };
  return (
    <>
      {scenes.map(({ scene, leaving }) => (
        <div key={scene} className="cn-scene" data-scene={scene} data-leaving={leaving || undefined} onClick={open} aria-live="polite">
          {scene === "drivers" && <DriversScene jobs={jobs} />}
          {scene === "jobs" && <JobsScene jobs={jobs} title={routesTitle} />}
          {scene === "both" && (viagens ? <DayScene jobs={jobs} onOpen={onOpen} {...viagens} /> : <BothScene jobs={jobs} />)}
          {scene === "all" && (viagens ? <DayScene jobs={jobs} onOpen={onOpen} {...viagens} /> : <BothScene jobs={jobs} fuel />)}
          {scene === "fuel" && fuelReel && <FuelReelScene jobs={jobs} />}
          {((scene === "fuel" && !fuelReel) || scene === "drivers-fuel") && <FuelScene jobs={jobs} withRoutes={false} />}
          {scene === "jobs-fuel" && <FuelScene jobs={jobs} withRoutes />}
        </div>
      ))}
    </>
  );
}
