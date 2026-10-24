import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pointAtKm } from "../world/world";
import { W } from "./world/active";
import { StageMap, type MapSpot, type MapStyle } from "./StageMap";
import { fuelView, stationPoints, loadLiveFuel, FUEL_SOURCE_LABEL, corridorOf } from "./fuel";
import { FuelCard, eurL, money } from "./fuelui";
import { NewJobPanel, type DraftPreview } from "./NewJobPanel";
import { fixLine, locateStation } from "./world/fuelPoi";
import type { PlannedRoutes } from "./StudioPlanner";
import { AutoPlanPanel } from "./AutoPlanPanel";
import type { OperationalPlan } from "../domain/planning/types";
import { Tethers, type Tether } from "./Tethers";
import { captureFlip, playFlip } from "./flip";
import { phaseOf, NOW, ROUTES, allDrivers, clock, driverWorld, place, placeOf, plan, toneOf, trailerWorld, truckWorld, worldJobs, applyEdit, needOf, allTrucks, freeTrailers, truckPlace, stopPoint, seedOf, type Edit, type Edited, type RecordedRoute, kmAt, segAt, type Seg, type Plan } from "./model";
import { Draft, Mode, Filter, Lens, LENS, PANEL_W, DECK_W, Extra, BoardRow, Row, placeOfPath, placePath } from "./types";
import { useWork, WORK_CHIPS } from "./work";
import type { Job } from "../data/types";
import { DriverCard, TruckCard, StopRow, JobCard } from "./cards";
import { describe, JobPanel } from "./JobPanel";
import { AttentionStack } from "./Attention";
import { DriverScene } from "./DriverScene";
import { ComboView, SceneStage, sceneOf, isSplit, mapAside, SPLIT_W, type ComboState, type Scene } from "./Combo";
import { Sidebar, NO_LAYERS, palcoFlight, type LayerState, type PalcoKey } from "./Layers";
import type { Measure, ViagensVar } from "./Day";
import { GarageScene, type GarageVar } from "./Garage";
import { PersonScene, type PersonVar } from "./Person";
import { FuelScene, type FuelVar } from "./FuelStage";
import { ClientScene, type ClientVar } from "./Client";
import { LiveMap } from "./v2/LiveMap";
import { toMinS } from "./Timeline";


export const bearing = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

export function activityOf(pl: Plan, seg: Seg | null, t: number, lastKm: number) {
  if (!pl.trace.length) return "sem plano possível";
  if (!seg) return t < pl.trace[0].from ? "aguarda carga" : "entregue";
  if (seg.kind === "drive") return "a conduzir";
  if (seg.kind === "break") return "pausa 45 min";
  if (seg.kind === "handover") return "troca de motorista";
  if (seg.kind === "wait") return "à espera da janela";
  if (seg.km0 < 0.5) return "em carga";
  return seg.km0 >= lastKm - 0.5 ? "em descarga" : "paragem";
}
/** A transport's plan with the refuel stops its route calculation produces (same engine as routing). */
function planWithFuel(job: Edited, driverId: string, routeId: string) {
  const placed = place(job, routeId);
  const phase = phaseOf(job.status);
  const fuel = phase === "closed" || (phase === "planning" && !job.truckId) ? null : fuelView(placed);
  const pl = plan(job, driverId, routeId, fuel?.refuels ?? []);
  return { pl, placed, fuel };
}

/** Office preferences of this browser (map style, layout); storage may be unavailable. */
function pref<T extends string>(k: string, d: T, ok: readonly T[]): T {
  try {
    const v = localStorage.getItem(`fleetos-studio.${k}`) as T | null;
    return v && ok.includes(v) ? v : d;
  } catch {
    return d;
  }
}
function keep(k: string, v: string) {
  try {
    localStorage.setItem(`fleetos-studio.${k}`, v);
  } catch {
    /* preference only */
  }
}
export type View = "map" | "wide" | "list";
/** A palco of the Mapa page: the map itself, Viagens, the Garagem (one truck in focus, or none when opened
 *  from the sidebar) or a driver's Perfil. */
type Palco = { k: "mapa" } | { k: "viagens" } | { k: "garagem"; truck: string | null } | { k: "perfil"; driver: string } | { k: "combustivel"; stop: string | null } | { k: "cliente"; client: string | null };
/** Each combination of categories has its own shot: pitch, bearing, duration, arc (flyTo curve: high = crane out and back in, low = skim). */
const LOOK: Record<ReturnType<typeof sceneOf>, [number, number, number, number]> = { map: [0, 0, 1800, 1.6], drivers: [56, -38, 2600, 1.1], jobs: [50, 24, 2200, 0.6], both: [44, 10, 2000, 0.9], fuel: [62, -14, 2800, 0.45], "drivers-fuel": [58, -26, 2400, 0.8], "jobs-fuel": [55, 40, 2600, 0.5], all: [46, 16, 2200, 0.9] };
const boundsOf = (pts: [number, number][]): [[number, number], [number, number]] | null =>
  pts.length ? [[Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1]))], [Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))]] : null;
const STYLES: [MapStyle, string, string][] = [
  ["streets", "Ruas", "OpenStreetMap, como no FleetOS normal"],
  ["tomtom", "TomTom", "Mapa TomTom original"],
  ["paper", "Papel", "TomTom em papel, só o trabalho tem cor"],
];

export function Studio({ version = 0 }: { version?: number }) {
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => pref("map", "tomtom", ["streets", "tomtom", "paper"]));
  const [traffic, setTraffic] = useState(() => pref("traffic", "off", ["on", "off"]) === "on");
  const [follow, setFollow] = useState(false);
  const [combo, setCombo] = useState<ComboState>({ drivers: false, jobs: false, fuel: false });
  const toggleCombo = useCallback((k: keyof ComboState) => setCombo((c) => ({ ...c, [k]: !c[k] })), []);
  const [layers, setLayers] = useState<LayerState>(NO_LAYERS);
  // Palcos: the map is the first one; two categories together open Viagens (whose primary category is the
  // trip). Inside a palco the categories are layers and never close it: Esc or the crumb goes back.
  const [palcos, setPalcos] = useState<Palco[]>([{ k: "mapa" }]);
  const [measure, setMeasure] = useState<Measure>("hours");
  // Each palco shows one variation at a time; the choice is kept while moving between palcos.
  const [viagensVar, setViagensVar] = useState<ViagensVar>("tempo");
  const [garageVar, setGarageVar] = useState<GarageVar>("ocup");
  const [personVar, setPersonVar] = useState<PersonVar>("horas");
  const [fuelVar, setFuelVar] = useState<FuelVar>("preco");
  const [clientVar, setClientVar] = useState<ClientVar>("entregas");
  const mainCount = (l: LayerState) => [l.drivers, l.routes, l.fuel].filter(Boolean).length;
  const toggleLayer = useCallback(
    (k: keyof LayerState, from?: DOMRect) => {
      const n = { ...layers, [k]: !layers[k] };
      setLayers(n);
      if (palcos.at(-1)!.k === "mapa" && (k === "drivers" || k === "routes" || k === "fuel") && n[k] && mainCount(n) >= 2) {
        setMeasure(n.routes && n.fuel && !n.drivers ? "km" : "hours");
        palcoFlight.from = from ?? null;
        setPalcos([{ k: "mapa" }, { k: "viagens" }]);
      }
    },
    [layers, palcos],
  );
  // Mapa: the scene over the map follows the people and the routes; fuel only adds its stop on the map
  // (both together with fuel also gets the fuel line in the credits).
  // Second step of a path: the driver opened from the open transport (origin = the row it came from).
  const [driverStep, setDriverStep] = useState<{ id: string; origin: DOMRect | null } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [spot, setSpot] = useState<MapSpot | null>(null);
  const [first] = useState(() => placeOfPath(window.location.pathname));
  const [openId, setOpenId] = useState<string | null>(first.openId);
  const [creating, setCreating] = useState(first.creating && !!W().ops);
  const [autoPlanning, setAutoPlanning] = useState(first.planning && !!W().ops);
  const [autoPlan, setAutoPlan] = useState<Pick<OperationalPlan, "executions"> | null>(null);
  const onAutoPlan = useCallback((p: Pick<OperationalPlan, "executions"> | null) => setAutoPlan(p), []);
  const [planned, setPlanned] = useState<PlannedRoutes>({ options: [], selectedId: null });
  const onPlanRoutes = useCallback((r: PlannedRoutes) => setPlanned(r), []);
  const [draftPreview, setDraftPreview] = useState<DraftPreview>({ points: [] });
  const onDraftPreview = useCallback((p: DraftPreview) => setDraftPreview(p), []);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [mode, setMode] = useState<Mode>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [peek, setPeek] = useState<Draft>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [lens, setLens] = useState<Lens>(first.lens);
  const layered = lens === "layers" && !openId;
  const top = lens === "layers" && !openId ? palcos.at(-1)! : null;
  const inViagens = top?.k === "viagens";
  const inGaragem = top?.k === "garagem";
  const inPerfil = top?.k === "perfil";
  const inCombustivel = top?.k === "combustivel";
  const inCliente = top?.k === "cliente";
  const inPalco = inViagens || inGaragem || inPerfil || inCombustivel || inCliente;
  /** Go to another palco (the tapped thing in focus); Esc comes back. */
  const goPalco = useCallback((p: Palco) => setPalcos((s) => [...s, p]), []);
  /** From the sidebar: the palco opens out of its row (Precisa de mim = Viagens, A tempo). */
  const openPalco = useCallback((k: PalcoKey, from: DOMRect) => {
    palcoFlight.from = from;
    if (k === "atencao") setViagensVar("tempo");
    setPalcos([{ k: "mapa" }, k === "garagem" ? { k: "garagem", truck: null } : k === "combustivel" ? { k: "combustivel", stop: null } : k === "clientes" ? { k: "cliente", client: null } : { k: "viagens" }]);
  }, []);
  const openPerson = useCallback((driver: string) => setPalcos((s) => (s.at(-1)?.k === "perfil" ? [...s.slice(0, -1), { k: "perfil", driver }] : [...s, { k: "perfil", driver }])), []);
  const openTruck = useCallback((truck: string) => goPalco({ k: "garagem", truck }), [goPalco]);
  const openFuel = useCallback((stop: string) => goPalco({ k: "combustivel", stop }), [goPalco]);
  const openClient = useCallback((client: string) => goPalco({ k: "cliente", client }), [goPalco]);
  // On the map one category has its own shot (title + reel); several together are just the map.
  const layerScene: Scene = inViagens ? "both" : inGaragem || inPerfil || inCombustivel || inCliente ? "map" : mainCount(layers) === 1 ? (layers.drivers ? "drivers" : layers.routes ? "jobs" : "fuel") : "map";
  const [tether, setTether] = useState<{ key: string; jobId?: string; at?: [number, number] } | null>(null);
  const [pulse, setPulse] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // The office works in the present: the clock runs from the moment the data was opened, and the
  // simulated positions move with it (live view; positions stay labelled "simulado").
  const [opened] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(opened);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);
  const t = NOW.min + (nowMs - opened) / 60000;
  const listScroll = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const flipPending = useRef(false);

  // Live fuel prices (same collector as the app); the sample is used until they arrive.
  const [fuelVersion, setFuelVersion] = useState(0);
  const [fuelMsg, setFuelMsg] = useState<string | null>("A verificar preços de combustível…");
  useEffect(() => {
    let alive = true;
    void loadLiveFuel(
      (m) => alive && setFuelMsg(m),
      () => {
        if (!alive) return;
        setFuelMsg(null);
        setFuelVersion((v) => v + 1);
      },
    ).then((ok) => {
      if (!alive) return;
      setFuelMsg(ok ? null : "Sem acesso aos preços oficiais · a usar a amostra do repositório");
      if (ok) setFuelVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  const allJobs = useMemo(
    () =>
      worldJobs().map((j) => {
        const e = edits[j.id] ?? {};
        const job = applyEdit(j.id, e);
        const routeId = e.routeId ?? j.routeId;
        const { pl, placed, fuel } = planWithFuel(job, job.driverId, routeId);
        const short = !!fuel && fuel.short;
        return {
          ...placed,
          notified: job.notified,
          exception: job.exception,
          edit: e,
          forecast: pl,
          fuel,
          tone: toneOf(job, pl, short),
          need: needOf(job, pl),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edits, fuelVersion, version],
  );
  // Today's operation: everything not invoiced or cancelled (Trabalhos shows all).
  const jobs = useMemo(() => allJobs.filter((j) => j.status !== "invoiced" && j.status !== "cancelled"), [allJobs]);
  // The same transports, placed at the scrubbed minute.
  const allLive: Row[] = useMemo(
    () =>
      allJobs.map((j) => {
        const km = kmAt(j.forecast, t);
        const seg = segAt(j.forecast, t);
        const at = pointAtKm(j.route, km);
        const next = pointAtKm(j.route, Math.min(j.route.km, km + 3));
        return {
          ...j,
          km,
          at,
          heading: bearing(at, next),
          moving: seg?.kind === "drive",
          activity: activityOf(j.forecast, seg, t, j.route.km),
        };
      }),
    [allJobs, t],
  );
  const live = useMemo(() => allLive.filter((j) => j.status !== "invoiced" && j.status !== "cancelled"), [allLive]);
  const open = allLive.find((j) => j.id === openId) ?? null;

  // Trabalhos: the application's own work groups and search, on the store records.
  const storeJobOf = (id: string): Job | undefined => {
    const sid = W().storeIds?.[id];
    return sid ? W().ops?.service.getState().jobs.find((x) => x.id === sid) : undefined;
  };
  const [workNow] = useState(() => new Date());
  const workAll = allLive.map((r) => ({ r, s: storeJobOf(r.id) }));
  const work = useWork(workAll, workNow);
  const workRows = work.rows;
  const onStage = (rows: Row[]) => (open && !rows.some((r) => r.id === open.id) ? [...rows, open] : rows);
  // The layout follows the work (no switches): the map leaves while there is nothing to place
  // on it, and the panel widens when the work is tables and choices.
  //  · new transport, no place chosen yet → paper desk, form centred; first place → map returns
  //  · automatic planning before results → desk; with results → wide panel + routes on the map
  //  · planning a route for one transport → wide panel, route options on the map
  //  · writing to the client / an exception → wide panel, map steps back (dimmed)
  const view: View = creating
    ? draftPreview.points.length ? "map" : "list"
    : autoPlanning
      ? autoPlan ? "wide" : "list"
      : open && (mode === "plan" || mode === "notify" || mode === "exception")
        ? "wide"
        : "map";
  const dim = !!open && (mode === "notify" || mode === "exception");
  const tense = "now" as const;


  // What the panel shows: hover peek > sticky draft > committed.
  const shown: Draft = { ...draft, ...peek };
  /** Plan of the open transport with committed edits + `e` applied (nothing is stored). */
  const trial = useCallback(
    (e: Edit) => {
      if (!openId) return null;
      const merged = { ...(edits[openId] ?? {}), ...e };
      const j = applyEdit(openId, merged);
      return planWithFuel(j, j.driverId, merged.routeId ?? seedOf(openId).routeId).pl;
    },
    [openId, edits],
  );
  const previewPlan = open && Object.keys(shown).length ? trial(shown) : null;

  const transition = useCallback((fn: () => void) => {
    captureFlip();
    flipPending.current = true;
    fn();
  }, []);

  const select = useCallback(
    (id: string) =>
      transition(() => {
        if (!openId && listRef.current) listScroll.current = listRef.current.scrollTop;
        setOpenId(id);
        setSpot(null);
        setMode(null);
        setDraft({});
        setPeek({});
      }),
    [openId, transition],
  );
  const back = useCallback(
    () =>
      transition(() => {
        setOpenId(null);
        setDriverStep(null);
        setSpot(null);
        setFollow(false);
        setMode(null);
        setDraft({});
        setPeek({});
      }),
    [transition],
  );

  // The place in the URL: deep links and the browser's back/forward work.
  const place = placePath({ lens, openId, planning: autoPlanning, creating });
  useEffect(() => {
    if (window.location.pathname !== place) window.history.pushState(null, "", place + window.location.search);
  }, [place]);
  useEffect(() => {
    const onPop = () => {
      const p = placeOfPath(window.location.pathname, lens);
      transition(() => {
        setLens(p.lens);
        setOpenId(p.openId);
        setAutoPlanning(p.planning && !!W().ops);
        setCreating(p.creating && !!W().ops);
        setMode(null);
        setSpot(null);
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [lens, transition]);

  useLayoutEffect(() => {
    if (!flipPending.current) return;
    flipPending.current = false;
    if (!openId && listRef.current) listRef.current.scrollTop = listScroll.current;
    playFlip();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (inPalco) {
        setPalcos((p) => (p.length > 1 ? p.slice(0, -1) : p));
        return;
      }
      if (spot) {
        setSpot(null);
        return;
      }
      if (creating) {
        transition(() => setCreating(false));
        return;
      }
      if (autoPlanning) {
        transition(() => {
          setAutoPlanning(false);
          setAutoPlan(null);
        });
        return;
      }
      if (mode) {
        setMode(null);
        setDraft({});
        setPeek({});
      } else if (driverStep) setDriverStep(null);
      else if (openId) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, openId, back, creating, autoPlanning, transition, spot, driverStep, inPalco]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const confirm = () => {
    if (!open) return;
    const pp = trial(draft);
    const parts = describe(open, draft);
    if (parts.length) {
      setEdits((x) => ({ ...x, [open.id]: { ...(x[open.id] ?? {}), ...draft } }));
      setToast(`${open.id} · ${parts.join(" · ")}${pp?.final != null ? ` · chegada ${clock(pp.final)}` : ""}`);
      setPulse((n) => n + 1);
    }
    setMode(null);
    setDraft({});
    setPeek({});
  };

  // Every stop of every transport, on one time-ordered board.
  const board: BoardRow[] = useMemo(
    () =>
      jobs
        .flatMap((j) => {
          const timed = j.positionKm != null || j.forecast.start != null;
          const nextI = j.stops.findIndex((s) => !s.completedAt);
          return j.stops.map((s, i): BoardRow => {
            const sp = j.forecast.stops[i];
            const eta = s.completedAt ? toMinS(s.completedAt) : timed ? sp.eta : null;
            const state = s.completedAt
              ? "done"
              : i === 0 && j.status === "loading"
                ? "active"
                : eta == null
                  ? "unplanned"
                  : sp.late
                    ? "late"
                    : sp.early
                      ? "early"
                      : "due";
            return {
              key: `${j.id}-${s.id}`,
              job: { ...j, km: 0, at: j.at, heading: 0, activity: "" } as Row,
              i,
              city: s.city,
              site: s.site,
              type: s.type,
              window: s.window,
              eta,
              state,
              next: i === nextI,
              at: stopPoint(j.route, j.scale, s.km, i, j.stops.length),
            };
          });
        })
        .sort((a, b) => (a.eta ?? toMinS(a.window[0])) - (b.eta ?? toMinS(b.window[0]))),
    [jobs],
  );

  // Fuel marks: where each transport refuels (planned or engine-recommended) and where it
  // would touch the reserve without refuelling.
  const fuelMarks = (rows: typeof jobs): Extra[] =>
    rows.flatMap((j) => {
      const v = j.fuel;
      if (!v) return [];
      const out: Extra[] = [];
      v.refuels.forEach((r, i) => {
        const fs = j.forecast.fuelStops[i];
        const st = v.corridor.find((c) => c.station.id === r.stationId)?.station;
        out.push({
          id: `fuel-${j.id}-${i}`,
          station: r.stationId,
          at: st ? [st.lon, st.lat] : pointAtKm(j.route, r.km),
          kind: "fuel",
          label: `${eurL(r.pricePerL)} · ${Math.round(r.litres)} L`,
          sub: `${j.id} · ${fs ? clock(fs.at) : ""} · ${r.name}`,
          state: "planned",
        });
      });
      if (v.short && v.dryKmWithout != null)
        out.push({ id: `dry-${j.id}`, at: pointAtKm(j.route, v.dryKmWithout), kind: "dry", label: "Reserva", sub: `${j.id} · km ${Math.round(v.dryKmWithout)}` });
      return out;
    });

  // Things that are not on a transport but still belong on the map of this lens.
  const extras: Extra[] = useMemo(() => {
    if (lens === "layers" && !openId) {
      // The categories add up: drivers where they are (on their route when routes are shown), refuel stops.
      const people = layers.drivers
        ? allDrivers().flatMap((d): Extra[] => {
            const j = live.find((x) => x.driverId === d.id);
            if (j && layers.routes) return [];
            const at = j ? j.at : placeOf(d.where);
            return at ? [{ id: `ly-${d.id}`, at, kind: "person" as const, label: d.name, sub: j ? `${j.activity} · simulado` : d.where || "livre" }] : [];
          })
        : [];
      return [...people, ...(layers.fuel ? fuelMarks(jobs) : [])];
    }
    if (lens === "combo" && !openId) {
      const fuelBits = combo.fuel ? fuelMarks(jobs) : [];
      if (!combo.drivers) return fuelBits;
      // Drivers on: where each driver is (busy ones ride their truck unless transports are shown).
      return allDrivers().flatMap((d): Extra[] => {
        const j = live.find((x) => x.driverId === d.id);
        if (j && (combo.jobs || combo.fuel)) return [];
        const at = j ? j.at : placeOf(d.where);
        return at ? [{ id: `cb-${d.id}`, at, kind: "person" as const, label: d.name, sub: j ? j.activity : d.where || "livre" }] : [];
      }).concat(fuelBits);
    }
    if (creating)
      return draftPreview.points.map((x, i) => ({
        id: `draft-${i}`,
        at: x.at,
        kind: "stop" as const,
        label: x.label,
        sub: x.type === "pickup" ? "recolha" : x.type === "delivery" ? "entrega" : "paragem",
        state: "due",
      }));
    if (openId) {
      const j = jobs.find((x) => x.id === openId);
      return j?.fuel ? fuelMarks([j]) : [];
    }
    if (lens === "fuel") return fuelMarks(jobs);
    if (lens === "stops")
      return board
        .filter((r) => r.state !== "done")
        .map((r) => ({
          id: r.key,
          at: r.at,
          kind: "stop" as const,
          label: r.city,
          sub: `${r.eta != null ? clock(r.eta) : "sem plano"} · ${r.job.id}`,
          state: r.state,
        }));
    if (lens === "drivers")
      return allDrivers()
        .filter((d) => !d.holder)
        .flatMap((d) => {
          const at = placeOf(d.where);
          return at ? [{ id: d.id, at, kind: "person" as const, label: d.name, sub: d.where }] : [];
        });
    if (lens === "fleet")
      return [
        ...allTrucks()
          .filter((x) => !x.holder)
          .flatMap((x) => {
            const at = truckPlace(x.id);
            return at ? [{ id: x.id, at, kind: "truck" as const, label: x.plate, sub: `livre · ${x.where}` }] : [];
          }),
        ...freeTrailers().flatMap((x) => {
          const at = x.location ? placeOf(x.location) : null;
          return at ? [{ id: x.id, at: [at[0] + 0.05, at[1] - 0.04] as [number, number], kind: "trailer" as const, label: x.plate, sub: `${x.type} · ${x.location?.replace("livre · ", "")}` }] : [];
        }),
      ];
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, board, jobs, openId, creating, draftPreview, combo, layers, lens === "combo" || lens === "layers" ? live : null]);

  // Fuel stations on the map: the whole sample in the fuel lens, the corridor of an open job.
  const stations = useMemo(() => {
    if (openId) {
      // The open transport: every pump along its road, whatever the lens.
      const j = jobs.find((x) => x.id === openId);
      if (!j) return [];
      // Pumps a truck would actually use: close to the road (≤ 2,5 km), plus the plan's own stops.
      const planned = new Set(j.fuel?.refuels.map((r) => r.stationId) ?? []);
      return (j.fuel?.corridor ?? corridorOf(j.route).stations).filter((c) => c.offRouteM <= 2500 || planned.has(c.station.id)).map((c) => ({ at: [c.station.lon, c.station.lat] as [number, number], price: c.price.price, id: c.station.id, name: c.station.brand ?? "" }));
    }
    if (lens !== "fuel" && !(lens === "combo" && combo.fuel)) return [];
    // Only the stations that matter today: within the corridor of a trip being evaluated.
    const seen = new Map<string, { at: [number, number]; price: number; id: string; name: string }>();
    for (const j of jobs)
      for (const c of j.fuel?.corridor ?? [])
        seen.set(c.station.id, { at: [c.station.lon, c.station.lat], price: c.price.price, id: c.station.id, name: c.station.brand ?? "" });
    return seen.size ? [...seen.values()] : stationPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, openId, jobs, mode, fuelVersion, combo.fuel]);

  /** Fly to a fuel station: the pump of a refuel stop, or any station dot of the corridor. */
  const showStation = (stationId: string) => {
    const pool = open ? [open] : jobs;
    for (const j of pool) {
      const c = (j.fuel?.corridor ?? corridorOf(j.route).stations).find((x) => x.station.id === stationId);
      if (!c) continue;
      const st = c.station;
      const rf = j.fuel?.refuels.find((r) => r.stationId === stationId);
      const seen = c.price.sourceValidFrom ?? c.price.lastSeenAt;
      setFollow(false);
      setSpot({
        id: `${stationId}-${j.id}`,
        ref: stationId,
        at: [st.lon, st.lat],
        title: [st.brand, st.name].filter(Boolean).join(" · ") || "Posto de abastecimento",
        lines: [
          [st.address, st.locality ?? st.municipality].filter(Boolean).join(", "),
          `${c.price.sourceLabel} ${eurL(c.price.price)} · preço de ${new Date(seen).toLocaleDateString("pt-PT")}`,
          rf ? `Paragem do plano: ${Math.round(rf.litres)} L · ${money(rf.litres * rf.pricePerL)}` : "",
          `km ${Math.round(c.km)} da rota de ${j.id} · ${c.offRouteM < 1000 ? `${Math.round(c.offRouteM)} m` : `${(c.offRouteM / 1000).toFixed(1)} km`} da estrada`,
          [st.stationType && st.stationType !== "Outro" ? st.stationType : "", st.openingHours].filter(Boolean).join(" · "),
        ].filter(Boolean),
      });
      // The real station: OpenStreetMap (with its forecourt outline), else TomTom, else official.
      void locateStation(stationId, [st.lon, st.lat], st.brand).then((f) =>
        setSpot((s) => (!s || s.ref !== stationId ? s : { ...s, at: f.at, outline: f.outline, uncertain: f.source !== "osm", lines: [...s.lines, fixLine(f)] })),
      );
      return;
    }
  };

  // Each combination is a shot: where the camera goes, how much it tilts and turns.
  const comboShot = (() => {
    const scene = sceneOf(combo);
    const pts: [number, number][] =
      scene === "drivers"
        ? allDrivers().flatMap((d) => {
            const j = live.find((x) => x.driverId === d.id);
            const at = j ? j.at : placeOf(d.where);
            return at ? [at] : [];
          })
        : scene === "fuel" || scene === "drivers-fuel"
          ? live.flatMap((j) => (j.fuel?.corridor ?? []).map((c) => [c.station.lon, c.station.lat] as [number, number]))
          : scene === "map"
            ? []
            : live.flatMap((j) => j.route.line);
    const b = boundsOf(pts) ?? W().bounds;
    const look = LOOK[scene];
    return { key: scene, bounds: b, pitch: look[0], bearing: look[1], duration: look[2], curve: look[3] };
  })();

  // Mapa: the camera frames whatever the switched-on categories put on the map, with the shot of that combination.
  const layersShot = (() => {
    const scene = sceneOf({ drivers: layers.drivers, jobs: layers.routes, fuel: layers.fuel });
    const pts: [number, number][] = [
      ...(layers.drivers ? allDrivers().flatMap((d) => { const j = live.find((x) => x.driverId === d.id); const at = j ? j.at : placeOf(d.where); return at ? [at] : []; }) : []),
      ...(layers.routes ? live.flatMap((j) => j.route.line) : []),
      ...(layers.fuel ? fuelMarks(jobs).map((x) => x.at) : []),
    ];
    const look = LOOK[scene];
    return { key: scene, bounds: boundsOf(pts) ?? W().bounds, pitch: look[0], bearing: look[1], duration: look[2], curve: look[3], maxZoom: !layers.drivers && !layers.routes ? 8.5 : 10.5 };
  })();

  const visible = live.filter((j) =>
    filter === "me" ? j.tone === "bad" || j.tone === "warn" : filter === "road" ? j.status === "in_transit" || j.status === "loading" : true,
  );
  const needMe = jobs.filter((j) => j.tone === "bad" || j.tone === "warn").length;

  // Whatever is being tried (driver, truck or trailer) is shown where it is now, linked to the job.
  const candidate = (() => {
    if (!open) return null;

    if (shown.trailerId && shown.trailerId !== open.trailerId) {
      const x = trailerWorld(shown.trailerId);
      const at = x?.location ? placeOf(x.location) : null;
      return at ? { at, name: `${x!.plate} · ${x!.type}` } : null;
    }
    if (shown.truckId && shown.truckId !== open.truckId) {
      const at = truckPlace(shown.truckId);
      return at ? { at, name: truckWorld(shown.truckId).plate } : null;
    }
    if (shown.driverId && shown.driverId !== open.driverId) {
      const at = placeOf(allDrivers().find((d) => d.id === shown.driverId)?.where ?? "");
      return at ? { at, name: driverWorld(shown.driverId).name } : null;
    }
    return null;
  })();
  const draftLine =
    creating && draftPreview.points.length > 1
      ? ({ id: "draft", km: 0, hours: 0, roads: [], retrievedAt: "", strategy: "direct", line: draftPreview.points.map((x) => x.at), cum: draftPreview.points.map(() => 0) } as RecordedRoute)
      : null;
  const altRoute = draftLine ?? (open && shown.routeId && shown.routeId !== open.route.id ? ROUTES[shown.routeId] : null);
  const side: "left" | "right" = !open && lens === "fleet" ? "right" : "left";

  // Live curves from what you look at in the UI to where it is on the map.
  const links: Tether[] = [];
  if (open) {
    links.push({ key: "p-drv", from: ".panel .unit", to: open.at });
    links.push({ key: "p-veh", from: ".panel .vehicle", to: open.at });
    open.stops.forEach((s, i) =>
      links.push({ key: `p-${s.id}`, from: `[data-tether="stop-${open.id}-${s.id}"]`, to: stopPoint(open.route, open.scale, s.km, i, open.stops.length) }),
    );
  } else if (tether) {
    const to = tether.jobId ? live.find((j) => j.id === tether.jobId)?.at : tether.at;
    if (to) links.push({ key: tether.key, from: `[data-tether="${tether.key}"]`, to, strong: true });
  }
  const hoverFor = (key: string, jobId: string | null, at: [number, number] | null) => (h: boolean) => {
    setHoverId(h && jobId ? jobId : null);
    setTether(h ? (jobId ? { key, jobId } : at ? { key, at } : null) : null);
  };
  const palcoName = (p: Palco) => (p.k === "garagem" ? (p.truck ? `Garagem · ${truckWorld(p.truck).plate}` : "Garagem") : p.k === "perfil" ? `Perfil · ${driverWorld(p.driver).name}` : p.k === "combustivel" ? "Combustível" : p.k === "cliente" ? (p.client ? `Cliente · ${p.client.split(" — ")[0]}` : "Clientes") : "Viagens");
  /** Mapa with Motoristas: a person's ping opens their Perfil, out of the ping. */
  const pinToPerson = (jobId: string) => {
    const j = live.find((x) => x.id === jobId);
    if (!j?.driverId) return select(jobId);
    palcoFlight.from = document.querySelector<HTMLElement>(`.pin[data-id="${CSS.escape(jobId)}"] .pin-dot`)?.getBoundingClientRect() ?? null;
    setPalcos([{ k: "mapa" }, { k: "perfil", driver: j.driverId }]);
  };
  const switchLens = (k: Lens) => {
    if (k === lens) return;
    transition(() => {
      setLens(k);
      setTether(null);
      setHoverId(null);
    });
  };

  // Mapa vivo v2 (design direction in progress): its own full-screen map, same live data.
  if (lens === "v2")
    return (
      <LiveMap
        jobs={live}
        now={t}
        onPalco={(k, from) => {
          setLens("layers");
          openPalco(k, from);
        }}
      />
    );

  return (
    <div className="studio" data-open={open ? "" : undefined} data-lens={lens} data-side={side} data-view={view} data-dim={dim ? "" : undefined} data-spot={spot ? "" : undefined} data-step={open && driverStep ? "driver" : undefined} data-scene={lens === "combo" && !open ? sceneOf(combo) : layered ? layerScene : undefined} data-map-aside={lens === "combo" && !open && mapAside(sceneOf(combo)) ? "" : undefined} data-pins={lens === "layers" && !open && !layers.drivers ? "off" : undefined} data-palco={top && top.k !== "mapa" ? top.k : undefined}>
      <StageMap
        jobs={onStage(lens === "work" ? workRows : lens === "combo" ? (combo.jobs || combo.fuel ? live : []) : lens === "layers" ? (layers.routes ? live : []) : live)}
        extras={extras}
        lens={lens === "combo" ? (combo.drivers ? "drivers" : combo.fuel ? "fuel" : "jobs") : lens === "layers" ? (layers.drivers ? "drivers" : "jobs") : lens}
        bare={(lens === "combo" || lens === "layers") && !open}
        scene={lens === "combo" && !open ? sceneOf(combo) : layered ? layerScene : undefined}
        colour={layered}
        shot={lens === "combo" && !open ? comboShot : lens === "layers" && !open ? layersShot : null}
        side={side}
        tense={tense}
        openId={openId}
        hoverId={hoverId}
        altRoute={altRoute}
        candidate={candidate}
        panelWidth={(lens === "combo" || lens === "layers") && !open ? 96 : view === "wide" ? (open ? 736 : 676) : open ? PANEL_W : DECK_W}
        onSelect={layered && !inPalco && layers.drivers ? pinToPerson : select}
        onHover={setHoverId}
        pulse={pulse}
        stations={stations}
        mapStyle={mapStyle}
        traffic={traffic}
        follow={follow && !!open}
        spot={spot}
        rightWidth={open && driverStep ? 436 : lens === "combo" && !open && isSplit(sceneOf(combo)) ? SPLIT_W : 0}
        focusPoint={open && driverStep ? open.at : null}
        onStation={showStation}
        planRoutes={
          autoPlanning && autoPlan
            ? autoPlan.executions.flatMap((e) =>
                e.movements
                  .filter((m) => m.route.polyline.length > 1)
                  .map((m, i) => ({ id: `${e.jobId}-${i}`, line: m.route.polyline.map(([lat, lng]) => [lng, lat] as [number, number]), selected: true, kind: m.kind })),
              )
            : mode === "plan" && openId
            ? planned.options
                .filter((o) => o.polyline.length > 1)
                .map((o) => ({ id: o.id, line: o.polyline.map(([lat, lng]) => [lng, lat] as [number, number]), selected: o.id === planned.selectedId }))
            : []
        }
      />


      {view !== "list" && (
        <div className="maptools" role="group" aria-label="Mapa">
          {spot ? (
            <button className="mt-btn mt-exit" onClick={() => setSpot(null)}>
              ← Voltar ao percurso
            </button>
          ) : (
            open && open.positionKm != null && (
              <button className="mt-btn mt-follow" aria-pressed={follow} title="A câmara acompanha o camião (posição simulada)" onClick={() => setFollow(!follow)}>
                <span className="mt-dot" />
                {follow ? "A seguir" : "Seguir camião"}
              </button>
            )
          )}
          {toolsOpen && (
            <>
              <button className="mt-btn" aria-pressed={traffic} title="Trânsito em tempo real · TomTom" onClick={() => { setTraffic(!traffic); keep("traffic", traffic ? "off" : "on"); }}>
                Trânsito
              </button>
              <span className="mt-seg">
                {STYLES.map(([k, label, hint]) => (
                  <button key={k} className="mt-btn" aria-pressed={mapStyle === k} title={hint} onClick={() => { setMapStyle(k); keep("map", k); }}>
                    {label}
                  </button>
                ))}
              </span>
            </>
          )}
          <button className="mt-btn mt-layers" aria-expanded={toolsOpen} aria-label="Opções do mapa" title="Opções do mapa" onClick={() => setToolsOpen(!toolsOpen)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M8 2 1.8 5.2 8 8.4l6.2-3.2zM1.8 8 8 11.2 14.2 8M1.8 10.8 8 14l6.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden />
          FleetOS
        </span>
        <span className="crumb">
          <button className="crumb-btn" onClick={open ? back : inPalco ? () => setPalcos([{ k: "mapa" }]) : undefined} aria-current={open || inPalco ? undefined : "page"} title={inPalco ? "Voltar ao mapa" : undefined}>
            {autoPlanning ? "Expedição" : creating ? "Novo transporte" : lens === "work" ? "Trabalhos" : lens === "layers" ? "Mapa" : "Operação"}
          </button>
          {inPalco &&
            palcos.slice(1).map((p, i, all) => (
              <span key={i}>
                <span className="crumb-sep">›</span>{" "}
                {i === all.length - 1 ? (
                  <span aria-current="page">{palcoName(p)}</span>
                ) : (
                  <button className="crumb-btn" onClick={() => setPalcos((s) => s.slice(0, i + 2))} title="Voltar (Esc)">
                    {palcoName(p)}
                  </button>
                )}
              </span>
            ))}
          {open && (
            <>
              <span className="crumb-sep">/</span>
              <span data-flip-enter="80">{open.id}</span>
            </>
          )}
        </span>
        <a
          className="source"
          data-src={W().source}
          href={W().source === "ops" ? `${window.location.pathname}?source=lab` : window.location.pathname}
          title="Trocar a fonte dos dados"
        >
          <i />
          {W().label}
          <em>{W().source === "ops" ? "ver laboratório" : "ver dados operacionais"}</em>
        </a>
        <span className="clock" title={W().source === "ops" ? "Relógio desde a abertura dos dados · posições simuladas" : "Relógio da demonstração · posições simuladas"}>
          {NOW.label} · <b>{clock(t)}</b>
          <em className="live-dot">ao vivo</em>
        </span>
      </header>

      {autoPlanning ? (
        <AutoPlanPanel
          onClose={() =>
            transition(() => {
              setAutoPlanning(false);
              setAutoPlan(null);
            })
          }
          onPlan={onAutoPlan}
          onConfirmed={(n) => {
            setToast(`Plano confirmado · ${n} transporte${n === 1 ? "" : "s"} atribuído${n === 1 ? "" : "s"}`);
            setPulse((x) => x + 1);
          }}
        />
      ) : creating ? (
        <NewJobPanel
          onCancel={() => transition(() => setCreating(false))}
          onPreview={onDraftPreview}
          onCreated={(id) => {
            setToast(`${id} criado · por atribuir`);
            transition(() => {
              setCreating(false);
              setOpenId(id);
            });
          }}
        />
      ) : !open && lens === "layers" ? (
        <>
          <Sidebar layers={layers} jobs={live} rail={mainCount(layers) > 0} onToggle={toggleLayer} onPalco={openPalco} />
          <SceneStage
            scene={layerScene}
            jobs={live}
            onOpen={select}
            routesTitle="Rotas"
            fuelReel
            viagens={inPalco ? { now: t, variant: viagensVar, measure, onVariant: setViagensVar, onMeasure: setMeasure, onTruck: openTruck, onDriver: openPerson, onFuel: openFuel, onClient: openClient } : undefined}
          />
          {top?.k === "garagem" && <GarageScene key={top.truck ?? "all"} jobs={live} now={t} focus={top.truck} variant={garageVar} onVariant={setGarageVar} onOpen={select} onDriver={openPerson} />}
          {top?.k === "combustivel" && <FuelScene key={top.stop ?? "all"} jobs={live} now={t} focus={top.stop} variant={fuelVar} onVariant={setFuelVar} onOpen={select} onDriver={openPerson} onTruck={openTruck} />}
          {top?.k === "cliente" && <ClientScene key={top.client ?? "all"} jobs={live} now={t} focus={top.client} variant={clientVar} onVariant={setClientVar} onOpen={select} />}
          {top?.k === "perfil" && <PersonScene key={top.driver} driverId={top.driver} jobs={live} now={t} variant={personVar} onVariant={setPersonVar} onDriver={openPerson} onTruck={openTruck} onOpen={select} />}
        </>
      ) : !open && lens === "combo" ? (
        <ComboView combo={combo} onToggle={toggleCombo} jobs={live} onOpen={select} />
      ) : !open ? (
        <section className="deck" aria-label="Transportes de hoje">
          <div className="deck-head" data-flip="deck-head">
            <nav className="lenses" aria-label="Ver">
              {LENS.map(([k, label]) => (
                <button key={k} className="lens" aria-current={lens === k ? "true" : undefined} onClick={() => switchLens(k)}>
                  {label}
                </button>
              ))}
            </nav>
            <button
              className="newjob-btn"
              disabled={!W().ops}
              title={W().ops ? "Criar um transporte nos dados operacionais" : "Disponível com os dados operacionais (ver dados operacionais)"}
              onClick={() =>
                transition(() => {
                  setCreating(true);
                  setDraftPreview({ points: [] });
                })
              }
            >
              <span className="card-bg" data-flip="bg-new" data-flip-mode="box" />
              <span data-flip="new-title">+ Novo transporte</span>
            </button>
            <button
              className="newjob-btn autoplan-btn"
              disabled={!W().ops}
              title={W().ops ? "Planear todos os transportes por atribuir com o motor da Expedição" : "Disponível com os dados operacionais"}
              onClick={() => transition(() => setAutoPlanning(true))}
            >
              <span className="card-bg" data-flip="bg-auto" data-flip-mode="box" />
              <span data-flip="auto-title">Planear automaticamente</span>
            </button>
            <h1>
              {lens === "work" ? "Trabalhos" : lens === "drivers" ? "Motoristas" : lens === "fleet" ? "Frota" : "Hoje"}{" "}
              <span>
                {lens === "work"
                  ? `${work.total} transportes · ${work.count("unassigned")} por atribuir`
                  : lens === "jobs"
                  ? `${jobs.length} transportes`
                  : lens === "drivers"
                    ? `${allDrivers().length} motoristas · ${allDrivers().filter((d) => !d.holder).length} livres`
                    : lens === "fuel"
                      ? `${jobs.filter((j) => j.fuel).length} viagens a avaliar · ${jobs.reduce((a, j) => a + (j.fuel?.refuels.length ?? 0), 0)} paragens de abastecimento nas rotas`
                    : lens === "stops"
                      ? `${board.length} paragens · ${board.filter((r) => r.state === "late").length} fora da janela`
                      : `${allTrucks().length} tratores · ${freeTrailers().length} reboques livres`}
              </span>
            </h1>
            <div className="chips" role="tablist" hidden={lens !== "work"}>
              {WORK_CHIPS.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={work.chip === k} className="chip" onClick={() => work.setChip(k)}>
                  {label} <b>{work.count(k)}</b>
                </button>
              ))}
            </div>
            <div className="chips" role="tablist" hidden={lens !== "jobs"}>
              {(
                [
                  ["all", "Todos", jobs.length],
                  ["me", "Precisa de mim", needMe],
                  ["road", "Na estrada", jobs.filter((j) => j.status === "in_transit" || j.status === "loading").length],
                ] as const
              ).map(([k, label, n]) => (
                <button key={k} role="tab" aria-selected={filter === k} className="chip" onClick={() => setFilter(k)}>
                  {label} <b>{n}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="deck-list" ref={listRef} key={lens}>
            {lens === "work" &&
              (workRows.length ? (
                workRows.map((j) => <JobCard key={j.id} job={j} hot={hoverId === j.id} onOpen={() => select(j.id)} onHover={hoverFor(`job-${j.id}`, j.id, null)} />)
              ) : (
                <p className="deck-foot">Nenhum transporte neste grupo.</p>
              ))}
            {lens === "jobs" &&
              visible.map((j) => (
                <JobCard key={j.id} job={j} hot={hoverId === j.id} onOpen={() => select(j.id)} onHover={hoverFor(`job-${j.id}`, j.id, null)} />
              ))}
            {lens === "stops" &&
              board.map((r, i) => (
                <StopRow
                  key={r.key}
                  row={r}
                  t={t}
                  delay={i * 25}
                  hot={tether?.key === `stop-${r.key}`}
                  onOpen={() => select(r.job.id)}
                  onHover={(h) => {
                    setHoverId(h ? r.job.id : null);
                    setTether(h ? { key: `stop-${r.job.id}-${r.job.stops[r.i].id}`, at: r.at } : null);
                  }}
                />
              ))}
            {lens === "drivers" &&
              allDrivers().map((x, i) => {
                const j = live.find((y) => y.driverId === x.id);
                return (
                  <DriverCard
                    key={x.id}
                    id={x.id}
                    where={x.where}
                    job={j ?? null}
                    hot={!!j && hoverId === j.id}
                    delay={i * 40}
                    onOpen={() => j && select(j.id)}
                    onHover={hoverFor(`drv-${x.id}`, j?.id ?? null, placeOf(x.where))}
                  />
                );
              })}
            {lens === "fuel" && (
              <>
                {live
                  .filter((j) => j.fuel)
                  .sort((a, b) => Number(b.fuel!.short) - Number(a.fuel!.short) || b.fuel!.refuels.length - a.fuel!.refuels.length || a.fuel!.endL / a.fuel!.tankL - b.fuel!.endL / b.fuel!.tankL)
                  .map((j) => (
                    <FuelCard key={j.id} job={j} hot={hoverId === j.id} onOpen={() => select(j.id)} onHover={hoverFor(`job-${j.id}`, j.id, null)} />
                  ))}
                <p className="deck-foot">
                  {fuelMsg ?? FUEL_SOURCE_LABEL}. Regra: chegar com ≥25% do depósito. Viagens sem viatura ou sem início possível não entram na avaliação.
                </p>
              </>
            )}
            {lens === "fleet" &&
              allTrucks().map((x, i) => {
                const j = live.find((y) => y.truckId === x.id);
                return (
                  <TruckCard
                    key={x.id}
                    id={x.id}
                    where={x.where}
                    job={j ?? null}
                    hot={!!j && hoverId === j.id}
                    delay={i * 40}
                    onOpen={() => j && select(j.id)}
                    onHover={hoverFor(`trk-${x.id}`, j?.id ?? null, truckPlace(x.id))}
                  />
                );
              })}
          </div>
        </section>
      ) : (
        <JobPanel
          key={open.id}
          job={open}
          mode={mode}
          setMode={(m) => {
            setMode(m);
            setDraft({});
            setPeek({});
          }}
          draft={draft}
          setDraft={setDraft}
          setPeek={setPeek}
          preview={previewPlan}
          trial={trial}
          onBack={back}
          onConfirm={confirm}
          onPlanRoutes={onPlanRoutes}
          onStation={showStation}
          spotId={spot?.ref ?? null}
          onExecuted={(msg) => {
            setToast(msg);
            setPulse((n) => n + 1);
          }}
          driverOpen={!!driverStep}
          onOpenDriver={(origin) => {
            setMode(null);
            setDriverStep({ id: open.driverId, origin });
          }}
          onPlanConfirmed={() => {
            setToast(`${open.id} · plano confirmado · viatura e motorista atribuídos`);
            setPulse((n) => n + 1);
            setMode(null);
            setPlanned({ options: [], selectedId: null });
          }}
        />
      )}

      {open && driverStep && (
        <DriverScene
          key={driverStep.id}
          job={open}
          origin={driverStep.origin}
          onClose={() => setDriverStep(null)}
          onException={() => {
            setDriverStep(null);
            setMode("exception");
          }}
        />
      )}

      {!open && !creating && !autoPlanning && lens !== "fleet" && lens !== "combo" && lens !== "layers" && view !== "wide" && <AttentionStack onOpen={select} jobs={live} />}

      {view !== "list" && !spot && <Tethers links={links} />}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {toast}
        </div>
      )}
    </div>
  );
}
