// Mapa vivo (v2): the map is the home and it is really 3D (pitched MapLibre over terrain with hillshade, sky
// and fog at the horizon, upright labels). The fleet lives on it: every truck advances frame by frame along its
// route (dead-reckoned between data updates, never backwards) and leaves a short fading trail. Changes are born
// where they happen: a status change rings once on the truck, a changed arrival time ticks on its tag and row,
// and the "Agora" feed in the sidebar collects them. When a new problem matters, the camera flies there by
// itself, the truck pulses as it lands, the alert rises, and on the way back the alert shrinks into the
// sidebar's count. Tapping a driver (on the map, on their route or in the sidebar) flies the camera to the truck
// and then follows it low and behind it. Dark and light themes are both kept so they can be compared.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { convertFilter, expression } from "@maplibre/maplibre-gl-style-spec";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MlMap, type PaddingOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { pointAtKm, sliceKm } from "../../world/world";
import { allDrivers, allTrucks, clock, driverWorld, initials, placeOf, truckPlace, truckWorld, type Point } from "../model";
import type { Row } from "../types";
import type { PalcoKey } from "../Layers";
import "./livemap.css";

type Theme = "dark" | "light";
type Alert = { jobId: string; late: number; closes: number };
type Cam = { center: [number, number]; zoom: number; pitch: number; bearing: number; padding?: PaddingOptions };
type FeedItem = { key: string; jobId: string; at: number; tone: "bad" | "ok" | "info"; text: string };
// the fleet works in the peninsula: names outside it (Tangier, Edinburgh…) are noise
const IBERIA = ["all", ["within", { type: "Polygon", coordinates: [[[-10.5, 35.9], [4.6, 35.9], [4.6, 44.2], [-10.5, 44.2], [-10.5, 35.9]]] }], ["!=", ["get", "name"], "Gibraltar"]];
// the overview is read from above, north up, like a chart on the desk; only the close shots tilt
// the base map: OpenStreetMap through OpenFreeMap (free, no key); re-themed below for dark and light
const OSM_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FALLBACK_HOME: Cam = { center: [-5.2, 39.1], zoom: 6.05, pitch: 0, bearing: 0 };
/** The sidebar covers the left of the map: every camera move frames the free part. */
const PAD: PaddingOptions = { left: 16, top: 80, right: 16, bottom: 110 };
const CHASE_PAD: PaddingOptions = { ...PAD, top: 330, bottom: 180, right: 260 };
const DEM = "https://demotiles.maplibre.org/terrain-tiles/tiles.json";
const EASE = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const EASE_IN = (t: number) => t * t * t;
const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
/** The client's window at the last stop, on the day of the arrival. */
function windowOf(j: Row): [number, number] | null {
  const w = j.stops.at(-1)?.window;
  if (!w || j.forecast.final == null) return null;
  const f = j.forecast.final;
  let a = Math.floor(f / 1440) * 1440 + toMin(w[0]);
  if (a - f > 720) a -= 1440;
  if (f - a > 720) a += 1440;
  return [a, a + ((toMin(w[1]) - toMin(w[0]) + 1440) % 1440)];
}
/** +8h04, +45min: one format for lateness everywhere. */
const late = (m: number) => `+${m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)}min`}`;
const onRoad = (j: Row) => !!j.driverId && j.forecast.final != null && j.status !== "delivered" && j.status !== "backlog";
const driving = (j: Row) => /conduz/i.test(j.activity);
const bearingOf = (a: Point, b: Point) => {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) * 180) / Math.PI;
};
const turn = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** Recolour the base style for a theme and quiet it down: the fleet is the subject, the base map is the ground. */
function applyTheme(m: MlMap, theme: Theme) {
  const cx = document.createElement("canvas").getContext("2d")!;
  const rgb = (c: string) => {
    cx.fillStyle = "#010203";
    cx.fillStyle = c;
    const v = cx.fillStyle as string;
    if (v === "#010203" && c !== "#010203") return null;
    if (v[0] === "#") return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    const n = v.match(/[\d.]+/g);
    return n ? n.slice(0, 3).map(Number) : null;
  };
  const mix = (c: string, to: string, t: number) => {
    const a = rgb(c), b = rgb(to);
    return a && b ? `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})` : c;
  };
  const walk = (v: unknown, to: string, t: number): unknown =>
    typeof v === "string" ? (rgb(v) ? mix(v, to, t) : v) : Array.isArray(v) ? v.map((x, i) => (i === 0 && typeof x === "string" ? x : walk(x, to, t))) : v;
  const set = (id: string, prop: string, to: string, t: number) => {
    const v = m.getPaintProperty(id, prop);
    if (v != null) m.setPaintProperty(id, prop, walk(v, to, t) as never);
  };
  const dark = theme === "dark";
  for (const l of m.getStyle().layers) {
    if (l.id.startsWith("lm-")) continue;
    // place names in Portuguese (or Latin script) where the tiles carry them
    if (l.type === "symbol") {
      const tf = JSON.stringify(m.getLayoutProperty(l.id, "text-field") ?? "");
      if (/name/.test(tf)) m.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:pt"], ["get", "name_pt"], ["get", "name:latin"], ["get", "name_en"], ["get", "name:en"], ["get", "name"], ""]);
      const f = m.getFilter(l.id);
      if (!JSON.stringify(f ?? "").includes('"within"')) {
        try {
          const expr = f == null ? null : expression.isExpressionFilter(f) ? f : convertFilter(f);
          m.setFilter(l.id, (expr ? ["all", expr, IBERIA] : IBERIA) as maplibregl.FilterSpecification);
        } catch {
          /* legacy filter syntax: leave it */
        }
      }
    }
    // road numbers, shields, points of interest, seas and country names are noise at the scale of a fleet
    if (l.type === "symbol" && /shield|poi|ferry|airport|transit|rail|number|ref|country|marine|ocean|sea|bay|continent|state|water|label_water|place_sea|one_way|highway-name-path|label_other/i.test(l.id)) {
      m.setLayoutProperty(l.id, "visibility", "none");
      continue;
    }
    const water = /water|ocean|sea|lake|river/i.test(l.id);
    const road = /road|motorway|highway|street|trunk|primary|secondary|tertiary|minor|tunnel|bridge/i.test(l.id);
    const major = /motorway|highway|trunk|major/i.test(l.id);
    try {
      if (dark) {
        if (l.type === "background") m.setPaintProperty(l.id, "background-color", "#0f161f");
        else if (l.type === "fill") {
          // patterned fills (wetland, road areas) and green park edges would speckle the night
          if (m.getPaintProperty(l.id, "fill-pattern")) m.setLayoutProperty(l.id, "visibility", "none");
          m.setPaintProperty(l.id, "fill-color", water ? "#070d14" : "#121a24");
          m.setPaintProperty(l.id, "fill-outline-color", water ? "#070d14" : "#121a24");
        }
        else if (l.type === "fill-extrusion") m.setPaintProperty(l.id, "fill-extrusion-color", "#1a2330");
        if (l.type === "fill-extrusion" || l.type === "raster") m.setLayoutProperty(l.id, "visibility", "none");
        else if (l.type === "line") m.setPaintProperty(l.id, "line-color", water ? "#0b1520" : major ? "#2c3747" : road ? "#263140" : "#1d2733");
        else if (l.type === "symbol") {
          m.setPaintProperty(l.id, "text-halo-width", 1.6);
          m.setPaintProperty(l.id, "text-halo-blur", 0.4);
          m.setPaintProperty(l.id, "text-color", "#7d8896");
          m.setPaintProperty(l.id, "text-halo-color", "#0f161f");
          m.setPaintProperty(l.id, "text-opacity", 0.9);
        }
      } else {
        if (l.type === "background") m.setPaintProperty(l.id, "background-color", "#e4e3db");
        else if (l.type === "fill") {
          set(l.id, "fill-color", water ? "#c9d8df" : "#efe9dd", water ? 0.35 : 0.45);
          if (m.getPaintProperty(l.id, "fill-outline-color")) m.setPaintProperty(l.id, "fill-outline-color", "rgba(0,0,0,0)");
        }
        else if (l.type === "fill-extrusion") m.setPaintProperty(l.id, "fill-extrusion-color", "#e9e3d6");
        if (l.type === "fill-extrusion" || l.type === "raster") m.setLayoutProperty(l.id, "visibility", "none");
        else if (l.type === "line") set(l.id, "line-color", water ? "#c9d8df" : road ? "#e2dccf" : "#e7e0d2", road ? 0.9 : 0.5);
        else if (l.type === "symbol") {
          m.setPaintProperty(l.id, "text-halo-width", 1.6);
          m.setPaintProperty(l.id, "text-color", "#4a4e57");
          set(l.id, "text-halo-color", "#f6f2ea", 0.6);
          m.setPaintProperty(l.id, "text-opacity", 0.9);
        }
      }
    } catch {
      /* layers with data-driven paint keep theirs */
    }
  }
  const set2 = (id: string, prop: string, v: unknown) => {
    try {
      m.setPaintProperty(id, prop, v as never);
    } catch {
      /* not added yet */
    }
  };
  set2("lm-ahead", "line-color", ["case", ["get", "late"], dark ? "#ff6a3d" : "#e0502a", dark ? "#fff3dc" : "#1b1d22"]);
  set2("lm-case", "line-color", dark ? "#0d131b" : "#ffffff");
  set2("lm-glow", "line-color", ["case", ["get", "late"], dark ? "#ff6a3d" : "#e0502a", dark ? "#ffd28a" : "#1b1d22"]);
  // the glow is for the overview only: up close it would fray the route's edges
  set2("lm-glow", "line-opacity", ["step", ["zoom"], ["case", ["get", "quiet"], 0, dark ? 0.3 : 0.1], 10, 0]);
  set2("lm-ahead", "line-opacity", ["case", ["get", "quiet"], 0, 1]);
  set2("lm-case", "line-opacity", ["case", ["get", "quiet"], 0, 1]);
  set2("lm-dest", "circle-opacity", ["case", ["get", "quiet"], 0, 1]);
  set2("lm-dest", "circle-stroke-opacity", ["case", ["get", "quiet"], 0, 1]);
  set2("lm-buildings", "fill-extrusion-color", dark ? "#1c2633" : "#e9e3d6");
  set2("lm-dest-name", "text-color", dark ? "#ff8a5c" : "#c8401c");
  set2("lm-dest-name", "text-halo-color", dark ? "#0f161f" : "#f6f2ea");
  set2("lm-dest-name", "text-halo-width", 2);
  set2("lm-past", "line-color", dark ? "#8b97a6" : "#868a93");
  set2("lm-dest", "circle-color", dark ? "#0f161f" : "#ffffff");
  set2("lm-dest", "circle-stroke-color", ["case", ["get", "late"], dark ? "#ff6a3d" : "#e0502a", dark ? "#fff3dc" : "#1b1d22"]);
  set2("lm-trail", "line-gradient", ["interpolate", ["linear"], ["line-progress"], 0, "rgba(0,0,0,0)", 1, dark ? "rgba(255,243,220,0.9)" : "rgba(27,29,34,0.8)"]);
  set2("lm-hills", "hillshade-shadow-color", dark ? "#05080c" : "#b9ad97");
  set2("lm-hills", "hillshade-highlight-color", dark ? "#1f2a38" : "#fffaf0");
  set2("lm-hills", "hillshade-exaggeration", dark ? 0.35 : 0.25);
  m.setSky(
    dark
      ? { "sky-color": "#0a111b", "horizon-color": "#16243a", "fog-color": "#121a24", "sky-horizon-blend": 1, "horizon-fog-blend": 1, "fog-ground-blend": 0.2 }
      : { "sky-color": "#c4d6e2", "horizon-color": "#efe9dd", "fog-color": "#efe9dd", "sky-horizon-blend": 1, "horizon-fog-blend": 1, "fog-ground-blend": 0.25 },
  );
}

/** Dead reckoning: from = rendered km at the last update, base = the data's km then, v = the route's speed. */
type Sim = { route: Row["route"]; km: number; from: number; base: number; t0: number; v: number; heading: number; at: Point };
type Mk = { m: maplibregl.Marker; el: HTMLDivElement };

export function LiveMap({ jobs, now, onPalco }: { jobs: Row[]; now: number; onPalco: (k: PalcoKey, from: DOMRect) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, Mk>());
  const sims = useRef(new Map<string, Sim>());
  /** The id of the flight in progress (0 = none). A newer flight supersedes an older one. */
  const flying = useRef(0);
  const flightSeq = useRef(0);
  const pendingEnd = useRef<((e: unknown) => void) | null>(null);
  const home = useRef<Cam>(FALLBACK_HOME);
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("fleetos-v2.theme") as Theme) || "dark";
    } catch {
      return "dark";
    }
  });
  const [follow, setFollow] = useState<string | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [visit, setVisit] = useState<string | null>(null);
  const [visitDone, setVisitDone] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  /** What the dock shows on the map: drivers (trucks, no lines), routes (lines and their names) or both. */
  const [cat, setCat] = useState<"drivers" | "routes" | "trucks" | null>(null);
  /** A parked truck seen up close (trucks on the road are followed instead). */
  const [truck, setTruck] = useState<string | null>(null);
  const truckRef = useRef(truck);
  truckRef.current = truck;
  /** The route seen whole, with its departure and arrival pinned at its ends. */
  const [route, setRoute] = useState<string | null>(null);
  const [palcos, setPalcos] = useState(false);
  /** Problems the camera already visited / whose truck already pulsed. */
  const seen = useRef(new Set<string>());
  const born = useRef(new Set<string>());
  const visitAlive = useRef(false);
  /** Last time the person touched the map: the camera never takes over right after a touch. */
  const interacted = useRef(-1e9);
  const retTimer = useRef(0);
  /** What each truck last said (activity, arrival) — a change is an event. */
  const lastSaid = useRef(new Map<string, { act: string; eta: number }>());
  /** Leaving the chase by dragging keeps the camera where it is. */
  const dragStop = useRef(false);

  const road = useMemo(() => jobs.filter(onRoad), [jobs]);
  const alerts = useMemo<Alert[]>(
    () =>
      road.flatMap((j) => {
        const w = windowOf(j);
        const f = j.forecast.final!;
        return w && f > w[1] ? [{ jobId: j.id, late: f - w[1], closes: w[1] }] : [];
      }),
    [road],
  );
  const lateBy = useMemo(() => new Map(alerts.map((a) => [a.jobId, a])), [alerts]);
  const alertKey = alerts.map((a) => a.jobId).join("|");
  const unassigned = jobs.filter((j) => j.status === "backlog" || !j.driverId).length;

  const followRef = useRef(follow);
  followRef.current = follow;
  const visitRef = useRef(visit);
  visitRef.current = visit;
  const routeRef = useRef(route);
  routeRef.current = route;
  const catRef = useRef(cat);
  catRef.current = cat;
  const onPalcoRef = useRef(onPalco);
  onPalcoRef.current = onPalco;

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("fleetos-v2.theme", t);
    } catch {
      /* preference only */
    }
  };
  const push = useCallback((it: Omit<FeedItem, "key">) => setFeed((f) => [{ ...it, key: `${it.jobId}-${it.text}-${performance.now()}` }, ...f.filter((x) => !(x.jobId === it.jobId && x.text === it.text))].slice(0, 5)), []);

  /** One way to move the camera. Each flight has an id: only its own end runs its follow-up, and a newer
   *  flight (or a touch) supersedes it from wherever the camera is. Reduced motion jumps. */
  const run = useCallback((cam: Cam, duration: number, easing: (t: number) => number, onEnd?: () => void) => {
    const m = map.current;
    if (!m) return;
    const id = ++flightSeq.current;
    flying.current = id;
    if (pendingEnd.current) m.off("moveend", pendingEnd.current);
    const done = (e: { flightId?: number }) => {
      if (e.flightId !== id) return;
      m.off("moveend", done);
      if (flightSeq.current !== id) return; // superseded: no follow-up
      const there = m.project(maplibregl.LngLat.convert(cam.center)), here = m.project(m.getCenter());
      if (Math.abs(m.getZoom() - cam.zoom) > 0.05 || Math.hypot(there.x - here.x, there.y - here.y) > 20) {
        flying.current = 0; // stopped mid-air by a touch: not a landing
        return;
      }
      flying.current = 0;
      onEnd?.();
    };
    pendingEnd.current = done as never;
    m.on("moveend", done);
    const opts = { ...cam, padding: cam.padding ?? PAD };
    if (reducedMotion()) m.jumpTo(opts, { flightId: id });
    else m.flyTo({ ...opts, duration, curve: 1.2, minZoom: Math.min(m.getZoom(), cam.zoom), easing }, { flightId: id });
  }, []);
  // a long leg (country ↔ street) passes through an altitude whose tiles are already there: the world never empties mid-air
  const fly = useCallback(
    (cam: Cam, duration: number, onEnd?: () => void) => {
      const m = map.current;
      if (!m) return;
      if (reducedMotion() || Math.abs(cam.zoom - m.getZoom()) < 4.5) return run(cam, duration, EASE, onEnd);
      const c = m.getCenter();
      const inward = cam.zoom > m.getZoom();
      const mid: Cam = { center: inward ? cam.center : [c.lng, c.lat], zoom: 10, pitch: Math.min(40, Math.max(m.getPitch(), cam.pitch)), bearing: cam.bearing, padding: cam.padding };
      const share = Math.abs(mid.zoom - m.getZoom()) / (Math.abs(mid.zoom - m.getZoom()) + Math.abs(cam.zoom - mid.zoom));
      run(mid, duration * share, EASE_IN, () => run(cam, duration * (1 - share), EASE_OUT, onEnd));
    },
    [run],
  );

  // ── the map, once
  useEffect(() => {
    const m = new maplibregl.Map({
      container: host.current!,
      style: OSM_STYLE,
      center: FALLBACK_HOME.center,
      zoom: FALLBACK_HOME.zoom,
      pitch: FALLBACK_HOME.pitch,
      bearing: FALLBACK_HOME.bearing,
      maxPitch: 76,
      maxTileCacheSize: 1200,
      attributionControl: { compact: true },
      fadeDuration: 180,
    });
    map.current = m;
    (window as unknown as { __liveMap?: MlMap }).__liveMap = m;
    m.setPadding(PAD);
    m.on("style.load", () => {
      const layers = m.getStyle().layers;
      // the work goes above every road: before the first label that comes after the last line of the base map
      const lastLine = layers.map((l) => l.type).lastIndexOf("line");
      const firstSymbol = layers.find((l, i) => i > lastLine && l.type === "symbol")?.id;
      const firstRoad = layers.find((l) => l.type === "line" && /road|motorway|highway|street|trunk/i.test(l.id))?.id;
      const font = (layers.find((l) => l.type === "symbol" && (l.layout as Record<string, unknown> | undefined)?.["text-font"]) as { layout?: { "text-font"?: string[] } } | undefined)?.layout?.["text-font"] ?? ["Noto-Regular"];
      // relief as light and shade under the roads. No terrain mesh: draped on it, the routes would vanish
      // wherever elevation tiles are late and hide behind the buildings up close; the depth comes from the
      // pitched camera, the shading and the buildings
      if (!m.getSource("lm-dem-shade")) m.addSource("lm-dem-shade", { type: "raster-dem", url: DEM, tileSize: 256 });
      m.addLayer({ id: "lm-hills", type: "hillshade", source: "lm-dem-shade", paint: { "hillshade-exaggeration": 0.3 } }, firstRoad ?? firstSymbol);
      // the work: routes above the roads (glow far out, casing 4px wider than the line), destinations, trails
      m.addSource("lm-routes", { type: "geojson", promoteId: "id", data: { type: "FeatureCollection", features: [] } });
      m.addSource("lm-trail", { type: "geojson", lineMetrics: true, data: { type: "FeatureCollection", features: [] } });
      m.addSource("lm-trucks", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const ahead = ["==", ["get", "part"], "ahead"] as maplibregl.FilterSpecification;
      const hov = ["boolean", ["feature-state", "hover"], false];
      const w = (a: number, b: number, c: number) => ["interpolate", ["linear"], ["zoom"], 5, ["case", hov, a + 3, ["get", "focus"], a + 1.5, a], 12, ["case", hov, b + 3.5, ["get", "focus"], b + 2, b], 16, ["case", hov, c + 3.5, ["get", "focus"], c + 2, c]] as unknown as number;
      const round = { "line-cap": "round", "line-join": "round" } as const;
      // buildings up close (OpenStreetMap via OpenFreeMap: the base tiles carry none in most towns), under the routes
      if (!m.getSource("lm-osm")) m.addSource("lm-osm", { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap" });
      m.addLayer(
        {
          id: "lm-buildings",
          type: "fill-extrusion",
          source: "lm-osm",
          "source-layer": "building",
          minzoom: 14,
          paint: {
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.85],
            "fill-extrusion-vertical-gradient": true,
          },
        },
        firstSymbol,
      );
      m.addLayer({ id: "lm-past", type: "line", source: "lm-routes", filter: ["==", ["get", "part"], "past"], layout: round, paint: { "line-width": 2, "line-opacity": ["case", ["get", "quiet"], 0, ["get", "focus"], 0.7, 0.4], "line-dasharray": [1, 2] } }, firstSymbol);
      m.addLayer({ id: "lm-glow", type: "line", source: "lm-routes", filter: ahead, layout: round, paint: { "line-width": w(14, 18, 18), "line-blur": 9 } }, firstSymbol);
      m.addLayer({ id: "lm-case", type: "line", source: "lm-routes", filter: ahead, layout: round, paint: { "line-width": w(10, 13, 14) } }, firstSymbol);
      m.addLayer({ id: "lm-ahead", type: "line", source: "lm-routes", filter: ahead, layout: round, paint: { "line-width": w(6, 9, 10) } }, firstSymbol);
      m.addLayer({ id: "lm-dest", type: "circle", source: "lm-routes", filter: ["==", ["get", "part"], "dest"], paint: { "circle-radius": ["case", ["get", "late"], 22, 7], "circle-stroke-width": ["case", ["get", "late"], 2.5, 3], "circle-pitch-alignment": "viewport" } });
      m.addLayer({ id: "lm-trail", type: "line", source: "lm-trail", layout: round, paint: { "line-width": w(4, 7, 9) } });
      // place names sit on top of the work (with their halo), never under a route
      for (const l of layers) if (l.type === "symbol" && /place|city|town|village|settlement|locality|label/i.test(l.id) && layers.indexOf(l) < lastLine) m.moveLayer(l.id);
      // invisible boxes where the truck tags are: the base map's labels give way to them instead of colliding
      m.addLayer({
        id: "lm-keepout",
        type: "symbol",
        source: "lm-trucks",
        layout: { "text-field": ["get", "box"], "text-font": font, "text-size": 13, "text-anchor": "left", "text-offset": [-1.4, 0], "text-padding": 6, "text-allow-overlap": true, "text-ignore-placement": false },
        paint: { "text-opacity": 0 },
      });
      // invisible images: their boxes are what the base labels give way to
      const clear = (w: number, h: number) => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
      if (!m.hasImage("lm-void")) m.addImage("lm-void", clear(2, 2));
      if (!m.hasImage("lm-void-card")) m.addImage("lm-void-card", clear(276, 156));
      m.addLayer({
        id: "lm-keepout-disc",
        type: "symbol",
        source: "lm-trucks",
        layout: { "icon-image": "lm-void", "icon-size": 20, "icon-padding": 6, "icon-allow-overlap": true, "icon-ignore-placement": false },
      });
      // a late route ends at a named place
      m.addLayer({
        id: "lm-dest-name",
        type: "symbol",
        source: "lm-routes",
        filter: ["all", ["==", ["get", "part"], "dest"], ["get", "late"]],
        layout: { "text-field": ["get", "city"], "text-font": font, "text-size": 13, "text-anchor": "bottom", "text-offset": [0, -2.1], "text-allow-overlap": true, "text-ignore-placement": true },
      });
      // base labels step off the routes: invisible discs sampled along each line ahead
      m.addSource("lm-keepout-pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "lm-keepout-pts",
        type: "symbol",
        source: "lm-keepout-pts",
        layout: { "icon-image": "lm-void", "icon-size": 9, "icon-padding": 3, "icon-allow-overlap": true, "icon-ignore-placement": false },
      });
      // while the alert stands beside its truck, the base labels give way to the card too
      m.addLayer({
        id: "lm-keepout-card",
        type: "symbol",
        source: "lm-trucks",
        filter: ["==", ["get", "card"], true],
        layout: { "icon-image": "lm-void-card", "icon-anchor": "right", "icon-offset": [-30, 0], "icon-allow-overlap": true, "icon-ignore-placement": false },
      });
      ready.current = true;
      applyTheme(m, themeRef.current);
      paintRef.current();
      showCatRef.current();
      if (!followRef.current) m.jumpTo({ ...home.current, padding: PAD });
      root.current?.removeAttribute("data-switching");
      // the attribution stays folded (its "i"), it never runs under the HUD
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    });
    // a route is tappable like its truck
    // in Rotas a line opens its route whole; elsewhere it follows its truck
    m.on("click", "lm-ahead", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (!id) return;
      if (catRef.current === "routes") openRouteRef.current(String(id));
      else startFollow(String(id));
    });
    m.on("mousemove", "lm-ahead", (e) => {
      m.getCanvas().style.cursor = "pointer";
      const id = e.features?.[0]?.properties?.id;
      if (id) hoverRouteRef.current(String(id));
    });
    m.on("mouseleave", "lm-ahead", () => {
      m.getCanvas().style.cursor = "";
      hoverRouteRef.current(null);
    });
    // any touch takes the camera back: the automatic visit ends, an automatic flight stops where it is
    const touched = () => {
      interacted.current = performance.now();
      if (visitAlive.current) {
        visitAlive.current = false;
        clearTimeout(retTimer.current);
        retTimer.current = 0;
        setVisit(null);
        // the queue goes on once the person has been still for a while
        window.setTimeout(() => setVisitDone((n) => n + 1), 6000);
      }
      flying.current = 0;
      flightSeq.current++;
    };
    m.on("dragstart", () => {
      touched();
      // looking around while following: stop following, stay here, offer to follow again
      if (followRef.current) {
        dragStop.current = true;
        setResume(followRef.current);
        setFollow(null);
      }
    });
    m.on("zoomend", () => paintRef.current());
    m.on("wheel", touched);
    m.on("touchmove", touched);
    let hold = false, holdUntil = 0;
    const canvas = m.getCanvas();
    const down = () => (hold = true);
    const up = () => {
      hold = false;
      holdUntil = performance.now() + 300;
    };
    const wheel = () => (holdUntil = performance.now() + 600);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("wheel", wheel, { passive: true });

    // ── every frame: trucks advance along their routes; the chase camera rides behind the followed one
    let raf = 0, last = performance.now(), lastData = 0, camBearing = m.getBearing();
    const frame = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      const W = m.getContainer().clientWidth, H = m.getContainer().clientHeight;
      const bearing = m.getBearing();
      for (const [id, s] of sims.current) {
        // the rendered position drifts toward the data's over 3 s while moving at the route's speed;
        // a driving truck never goes backwards and never runs at less than 0.6× or more than 1.6× its speed
        const k = Math.min(1, (t - s.t0) / 3000);
        const blend = s.from + s.v * (t - s.t0) + (s.base - s.from) * (k * (2 - k));
        const next = Math.min(s.route.km, blend);
        if (s.v > 0) s.km = Math.min(s.route.km, s.km + Math.max(0.6 * s.v * dt, Math.min(1.6 * s.v * dt, next - s.km)));
        else if (next > s.km) s.km += (next - s.km) * Math.min(1, dt / 400);
        s.at = pointAtKm(s.route, s.km);
        const ahead = pointAtKm(s.route, Math.min(s.route.km, s.km + 0.6));
        if (ahead[0] !== s.at[0] || ahead[1] !== s.at[1]) s.heading = bearingOf(s.at, ahead);
        const r = markers.current.get(id);
        if (!r) continue;
        r.m.setLngLat(s.at);
        r.el.style.setProperty("--rot", `${s.heading - bearing}deg`);
        // a truck behind the camera or off screen fades out instead of sticking to an edge
        const p = m.project(s.at);
        const off = p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80;
        if ((r.el.dataset.off === "1") !== off) r.el.dataset.off = off ? "1" : "";
      }
      const f = followRef.current && sims.current.get(followRef.current);
      if (f && !flying.current && !hold && t > holdUntil) {
        // reduced motion: the camera re-centres but never turns by itself
        if (!reducedMotion()) camBearing += turn(camBearing, f.heading) * Math.min(1, dt / 700);
        m.jumpTo({ center: f.at, bearing: camBearing });
      } else camBearing = bearing;
      // the trail and the keep-out boxes don't need every frame
      if (t - lastData > 400 && ready.current) {
        lastData = t;
        if (followRef.current || visitRef.current) paintRef.current();
        const rings = lateEnds.current.map((p) => m.project(p));
        for (const [id, s] of sims.current) {
          const r = markers.current.get(id);
          if (!r) continue;
          const p = m.project(s.at);
          const rot = (((s.heading - m.getBearing()) % 360) + 360) % 360;
          const flip = (rot > 25 && rot < 155) || rings.some((q) => q.x > p.x - 20 && q.x - p.x < 150 && Math.abs(q.y - p.y) < 50);
          if ((r.el.dataset.flip === "1") !== flip) r.el.dataset.flip = flip ? "1" : "";
        }
        const trail = m.getSource("lm-trail") as GeoJSONSource | undefined;
        trail?.setData({
          type: "FeatureCollection",
          features: [...sims.current.values()].filter((s) => s.km > 0.2).map((s) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: sliceKm(s.route, Math.max(0, s.km - 14), s.km) } })),
        });
        const boxes = m.getSource("lm-trucks") as GeoJSONSource | undefined;
        boxes?.setData({
          type: "FeatureCollection",
          features: [...sims.current.entries()].map(([id, s]) => ({ type: "Feature" as const, properties: { card: id === visitRef.current, box: `  ${markers.current.get(id)?.el.querySelector(".lm-tag b")?.textContent ?? ""}    \n         ` }, geometry: { type: "Point" as const, coordinates: s.at } })),
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerup", up);
      clearTimeout(retTimer.current);
      // the markers belong to this map: forget them with it (StrictMode mounts twice in development)
      markers.current.clear();
      sims.current.clear();
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themeRef = useRef(theme);
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    const m = map.current;
    if (!m) return;
    // the map dims out, the base is rebuilt in the new theme, and it fades back in on load
    root.current?.setAttribute("data-switching", "");
    ready.current = false;
    const t = setTimeout(() => m.setStyle(OSM_STYLE, { diff: false }), 220);
    return () => clearTimeout(t);
  }, [theme]);

  // ── the routes follow the data; the home camera frames the whole operation once it is known
  const paint = useCallback(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource("lm-routes") as GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: road.flatMap((j) => {
        const k = Math.max(0, Math.min(j.route.km, sims.current.get(j.id)?.km ?? j.km));
        const props = { id: j.id, late: lateBy.has(j.id), focus: followRef.current === j.id || routeRef.current === j.id, lit: followRef.current === j.id || visitRef.current === j.id || routeRef.current === j.id, quiet: (!!followRef.current && followRef.current !== j.id) || (!!visitRef.current && visitRef.current !== j.id) || (!!routeRef.current && routeRef.current !== j.id) };
        return [
          { type: "Feature" as const, properties: { ...props, part: "past" }, geometry: { type: "LineString" as const, coordinates: sliceKm(j.route, 0, k) } },
          { type: "Feature" as const, properties: { ...props, part: "ahead" }, geometry: { type: "LineString" as const, coordinates: sliceKm(j.route, k, j.route.km) } },
          { type: "Feature" as const, properties: { ...props, part: "dest", city: j.stops.at(-1)!.city }, geometry: { type: "Point" as const, coordinates: j.route.line.at(-1)! } },
        ];
      }),
    });
    // a disc every ~14 px on screen: close up along the route in focus, further out along every route
    const z = m.getZoom();
    const step = Math.max(0.03, (14 * 78271.5 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** z / 1000);
    (m.getSource("lm-keepout-pts") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: road.flatMap((j) => {
        const lit = followRef.current === j.id || visitRef.current === j.id;
        if (z >= 13 && !lit) return [];
        const k = Math.max(0, Math.min(j.route.km, sims.current.get(j.id)?.km ?? j.km));
        const until = Math.min(j.route.km, k + step * 900);
        const out = [];
        for (let x = k + step / 2; x < until; x += step) out.push({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: pointAtKm(j.route, x) } });
        return out;
      }),
    });
  }, [road, lateBy]);
  const paintRef = useRef(paint);
  const lateEnds = useRef<Point[]>([]);
  lateEnds.current = road.filter((j) => lateBy.has(j.id)).map((j) => j.route.line.at(-1)!);
  paintRef.current = paint;
  useEffect(paint, [paint, follow, visit, route]);

  const showCat = useCallback(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    // lines are a mode: they come with Rotas, a route opened whole, a truck followed or a problem visited
    const hide = catRef.current !== "routes" && !routeRef.current && !followRef.current && !visitRef.current;
    for (const id of ["lm-past", "lm-glow", "lm-case", "lm-ahead", "lm-dest", "lm-trail", "lm-dest-name", "lm-keepout-pts"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", hide ? "none" : "visible");
  }, []);
  const showCatRef = useRef(showCat);
  useEffect(showCat, [cat, route, follow, visit, showCat]);

  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || framed.current || !road.length) return;
    const pts = road.flatMap((j) => j.route.line);
    const lng = pts.map((p) => p[0]), lat = pts.map((p) => p[1]);
    const b: LngLatBoundsLike = [
      [Math.min(...lng), Math.min(...lat)],
      [Math.max(...lng), Math.max(...lat)],
    ];
    const cam = m.cameraForBounds(b, { padding: { top: 90, bottom: 90, left: 70, right: 70 }, bearing: 0 });
    if (!cam?.center) return;
    framed.current = true;
    const c = maplibregl.LngLat.convert(cam.center);
    home.current = { center: [c.lng, c.lat], zoom: Math.min(7.6, cam.zoom ?? 6), pitch: 0, bearing: 0 };
    if (!followRef.current) fly(home.current, 1400);
  }, [road, fly]);

  // ── trucks: one marker each, fed by the dead-reckoning loop; changes are born on them
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const keep = new Set(road.map((j) => j.id));
    for (const [id, r] of markers.current)
      if (!keep.has(id)) {
        r.m.remove();
        markers.current.delete(id);
        sims.current.delete(id);
      }
    const t = performance.now();
    for (const j of road) {
      // between updates a driving truck advances at its route's speed; the error to the data is absorbed over
      // the next 2 s by adjusting its speed (never by rolling it back), unless it is large (then it re-seats)
      const s = sims.current.get(j.id);
      const v0 = driving(j) ? j.route.km / Math.max(0.5, j.route.hours) / 3_600_000 : 0;
      if (s) {
        // far off (over 2 km): re-seat, with a short crossfade on the marker
        if (Math.abs(j.km - s.km) > 2) {
          s.km = j.km;
          const el = markers.current.get(j.id)?.el;
          el?.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 400 });
        }
        Object.assign(s, { route: j.route, from: s.km, base: j.km, t0: t, v: v0 });
      } else sims.current.set(j.id, { route: j.route, km: j.km, from: j.km, base: j.km, t0: t, v: v0, heading: j.heading, at: j.at });
      let r = markers.current.get(j.id);
      if (!r) {
        const el = document.createElement("div");
        el.className = "lm-truck";
        el.innerHTML = `<span class="lm-shadow"></span><span class="lm-ring"></span><span class="lm-puck"><i class="lm-arrow"></i></span><span class="lm-tag"><b></b><small></small></span><span class="lm-alert"><em>Atraso</em><strong></strong><small></small><button type="button">Ver viagem</button></span><span class="lm-card"></span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const t = e.target as HTMLElement;
          if (t.closest(".lm-alert button, .lm-card [data-act='trip']")) onPalcoRef.current(t.closest(".lm-panel") ? "garagem" : "viagens", t.getBoundingClientRect());
          else if (t.closest(".lm-card [data-act='stop']")) setFollow(null);
          else if (!t.closest(".lm-card")) startFollow(j.id);
        });
        const mk = new maplibregl.Marker({ element: el, anchor: "center", pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat(j.at).addTo(m);
        r = { m: mk, el };
        markers.current.set(j.id, r);
      }
      const a = lateBy.get(j.id);
      r.el.dataset.late = a ? "1" : "";
      r.el.dataset.focus = follow === j.id ? "1" : "";
      const name = driverWorld(j.driverId).name;
      const tk = j.truckId ? truckWorld(j.truckId) : null;
      const machine = cat === "trucks" && tk;
      r.el.dataset.machine = machine ? "1" : "";
      if (machine) r.el.style.setProperty("--fuel", String((fuelPct(tk) ?? 0) / 100));
      r.el.querySelector(".lm-tag b")!.textContent = machine ? tk.plate : name.split(" ")[0];
      r.el.querySelector(".lm-tag small")!.textContent = machine ? `em viagem · ${fuelPct(tk) ?? "?"}%` : a ? late(a.late) : `chega ${clock(j.forecast.final!)}`;
      r.el.querySelector(".lm-alert strong")!.textContent = a ? late(a.late) : "";
      r.el.querySelector(".lm-alert small")!.textContent = a ? `${name} · ${j.stops.at(-1)!.city} fecha ${clock(a.closes)}` : "";
      // what changed since the last update is born on the truck (and goes to the feed)
      const said = lastSaid.current.get(j.id);
      const eta = Math.round(j.forecast.final!);
      if (said && said.act !== j.activity) {
        ring(r.el, driving(j) ? "go" : "ok");
        push({ jobId: j.id, at: now, tone: "info", text: `${name.split(" ")[0]} · ${j.activity}` });
      } else if (said && Math.abs(said.eta - eta) >= 1) tick(r.el);
      if (!said) {
        if (!driving(j) && !a) push({ jobId: j.id, at: now, tone: "info", text: `${name.split(" ")[0]} · ${j.activity}` });
      }
      lastSaid.current.set(j.id, { act: j.activity, eta });
      if (follow === j.id) r.el.querySelector(".lm-card")!.innerHTML = machine ? truckCardHtml(tk, `em viagem · ${driverWorld(j.driverId).name.split(" ")[0]} · chega ${clock(j.forecast.final!)}`, "road") : cardHtml(j, sims.current.get(j.id)!, a);
      if (a && !born.current.has(j.id)) {
        born.current.add(j.id);
        ring(r.el, "late");
        push({ jobId: j.id, at: now, tone: "bad", text: `${name.split(" ")[0]} vai chegar tarde a ${j.stops.at(-1)!.city}` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [road, lateBy, follow, cat]);

  // ── routes: a name on each line; tapping one shows it whole from a little above, its ends pinned
  const openRoute = useCallback((id: string) => {
    interacted.current = performance.now();
    visitAlive.current = false;
    setVisit(null);
    setFollow(null);
    setRoute(id);
  }, []);
  const openRouteRef = useRef(openRoute);
  openRouteRef.current = openRoute;
  const hoveredRoute = useRef<string | null>(null);
  const hoverRouteRef = useRef((id: string | null) => {
    const m = map.current;
    if (!m || hoveredRoute.current === id) return;
    if (hoveredRoute.current) m.setFeatureState({ source: "lm-routes", id: hoveredRoute.current }, { hover: false });
    hoveredRoute.current = id;
    if (id) m.setFeatureState({ source: "lm-routes", id }, { hover: true });
    names.current.forEach((mk, k) => (mk.getElement().dataset.hot = k === id ? "1" : ""));
  });
  const names = useRef(new Map<string, maplibregl.Marker>());
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const want = cat === "routes" && !route && !follow ? road : [];
    const entering = want.length > 0 && names.current.size === 0;
    for (const [id, mk] of names.current)
      if (!want.some((j) => j.id === id)) {
        mk.remove();
        names.current.delete(id);
      }
    want.forEach((j, i) => {
      let mk = names.current.get(j.id);
      if (!mk) {
        const wrap = document.createElement("div");
        wrap.className = "lm-rname-m";
        const el = document.createElement("button");
        el.type = "button";
        el.className = "lm-rname";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          openRoute(j.id);
        });
        el.addEventListener("mouseenter", () => hoverRouteRef.current(j.id));
        el.addEventListener("mouseleave", () => hoverRouteRef.current(null));
        wrap.appendChild(el);
        mk = new maplibregl.Marker({ element: wrap, anchor: "bottom", offset: [0, -14] }).setLngLat(pointAtKm(j.route, j.route.km * 0.5)).addTo(m);
        names.current.set(j.id, mk);
        // switching Rotas on is an event: a light runs each line from where it starts to where it ends
        if (entering && !reducedMotion()) {
          el.style.animationDelay = `${0.12 * i + 0.55}s`;
          comet(m, j.route, 0.12 * i);
        }
      }
      const a = lateBy.get(j.id);
      const el = mk.getElement().firstElementChild as HTMLElement;
      el.dataset.late = a ? "1" : "";
      el.innerHTML = `<b>${j.stops[0].city} → ${j.stops.at(-1)!.city}</b><small>${Math.round(j.route.km)} km · ${a ? late(a.late) : clock(j.forecast.final!)}</small>`;
    });
  }, [cat, route, follow, road, lateBy, openRoute]);

  // ── a route seen whole: the line sits in the upper part of the shot, its stops, pauses and refuels are pings
  // on it (born in travel order), and the bottom band tells the trip as a day line. Hovering one lights the other.
  const pings = useRef<{ id: string; mk: maplibregl.Marker[] } | null>(null);
  const lastRoute = useRef<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const j = road.find((x) => x.id === route);
    if (!route || !j) {
      pings.current?.mk.forEach((k) => k.remove());
      pings.current = null;
      if (m.getLayer("lm-past")) {
        m.setPaintProperty("lm-past", "line-dasharray", [1, 2]);
        m.setPaintProperty("lm-past", "line-width", 2);
      }
      if (lastRoute.current) {
        lastRoute.current = null;
        if (!followRef.current) fly(home.current, 1700);
      }
      return;
    }
    if (lastRoute.current !== route) {
      lastRoute.current = route;
      const xs = j.route.line.map((p) => p[0]), ys = j.route.line.map((p) => p[1]);
      m.setPaintProperty("lm-past", "line-dasharray", [1, 0]);
      m.setPaintProperty("lm-past", "line-width", ["interpolate", ["linear"], ["zoom"], 5, 3.5, 12, 6]);
      m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      const cam = m.cameraForBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: 120, bottom: 400, left: 170, right: 170 }, bearing: 0 });
      m.setPadding(PAD);
      if (cam?.center) {
        const c = maplibregl.LngLat.convert(cam.center);
        fly({ center: [c.lng, c.lat], zoom: Math.min(11, (cam.zoom ?? 7) + 0.15), pitch: 40, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }, 1900);
      }
    }
    if (pings.current?.id !== route) {
      pings.current?.mk.forEach((k) => k.remove());
      pings.current = {
        id: route,
        mk: dayMarks(j).filter((d) => d.ping).map((d, i) => {
          const el = document.createElement("div");
          el.className = "lm-ping";
          el.dataset.kind = d.kind;
          el.dataset.key = d.key;
          el.style.setProperty("--d", `${1.2 + i * 0.18}s`);
          el.innerHTML = "<i></i><i></i><b></b>";
          el.addEventListener("mouseenter", () => setHot(d.key));
          el.addEventListener("mouseleave", () => setHot(null));
          return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(pointAtKm(j.route, Math.min(j.route.km, d.km))).addTo(m);
        }),
      };
    }
  }, [route, road, fly]);
  useEffect(() => {
    pings.current?.mk.forEach((k) => (k.getElement().dataset.hot = k.getElement().dataset.key === hot ? "1" : ""));
  }, [hot]);
  const parkedPins = useRef(new Map<string, maplibregl.Marker>());
  const parkedKey = allTrucks().map((t) => t.id + t.availability).join("|") + road.map((j) => j.truckId).join("|");
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    retire([...parkedPins.current.values(), ...yards.current], dockRect("trucks"));
    parkedPins.current.clear();
    yards.current = [];
    if (cat !== "trucks" || follow || route) return;
    yardsEnter.current = performance.now();
    const busy = new Set(road.map((j) => j.truckId));
    const parked = allTrucks()
      .filter((t) => !busy.has(t.id))
      .map((t) => ({ t, at: truckPlace(t.id) }))
      .filter((x): x is { t: (typeof x)["t"]; at: Point } => !!x.at);
    // trucks at the same yard stand side by side
    const yard = new Map<string, number>();
    for (const { at } of parked) {
      const k = at.map((v) => v.toFixed(3)).join();
      yard.set(k, (yard.get(k) ?? 0) + 1);
    }
    const seat = new Map<string, number>();
    for (const { t, at } of parked) {
      const k = at.map((v) => v.toFixed(3)).join();
      const n = yard.get(k)!, i = seat.get(k) ?? 0;
      seat.set(k, i + 1);
      const next = jobs.find((j) => j.truckId === t.id && j.status !== "delivered" && j.forecast.start != null);
      const state = t.availability !== "AVAILABLE" ? "shop" : next ? "next" : "free";
      const fuel = fuelPct(t);
      const soon = validities(t.plate).sort((a, b) => a.days - b.days)[0];
      const el = document.createElement("div");
      el.className = "lm-park";
      el.dataset.state = state;
      el.style.setProperty("--d", `${1.7 + parkedPins.current.size * 0.09}s`);
      el.style.setProperty("--fuel", String((fuel ?? 0) / 100));
      el.innerHTML = `<button type="button" class="lm-park-b"><span class="sq"><svg viewBox="0 0 20 20" aria-hidden><path d="M2.5 13.5V6h9v7.5M11.5 9h3.5l2.5 2.8v1.7"/><circle cx="6" cy="14.5" r="1.6"/><circle cx="14.5" cy="14.5" r="1.6"/></svg></span><span class="lab"><b>${t.plate}</b><small>${state === "shop" ? "oficina" : state === "next" ? `sai ${clock(next!.forecast.start!)}` : "livre"}${fuel != null ? ` · ${fuel}%` : ""}</small></span>${(fuel != null && fuel < 25) || soon.days <= 14 ? `<i class="warn">${fuel != null && fuel < 25 ? "depósito" : soon.name} ${fuel != null && fuel < 25 ? `${fuel}%` : `${soon.days} d`}</i>` : ""}</button><span class="lm-card"></span>`;
      el.querySelector(".lm-park-b")!.addEventListener("click", (e) => {
        e.stopPropagation();
        setTruck(t.id);
      });
      el.querySelector(".lm-card")!.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
        if (b?.dataset.act === "trip") onPalcoRef.current("garagem", b.getBoundingClientRect());
        else if (b?.dataset.act === "stop") setTruck(null);
      });
      el.querySelector(".lm-card")!.innerHTML = truckCardHtml(t, state === "shop" ? "na oficina" : state === "next" ? `livre até ${clock(next!.forecast.start!)}` : `livre · ${placeName(t)}`, state);
      el.dataset.place = placeName(t);
      void n;
      void i;
      parkedPins.current.set(t.id, new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(m));
    }
    declutterRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, follow, route, parkedKey]);

  /** Parked trucks too close on screen gather into one yard chip ("Lisboa · 3 camiões"); tapping it comes closer
   *  until they stand apart. Re-run whenever the camera rests. */
  const yards = useRef<maplibregl.Marker[]>([]);
  const yardsEnter = useRef(0);
  const fanFrom = useRef<{ rect: DOMRect; ids: string[]; t: number } | null>(null);
  /** The yard opened into its bays (its trucks' ids, sorted), if any. */
  const openYard = useRef<string | null>(null);
  const declutterRef = useRef(() => {});
  declutterRef.current = () => {
    const m = map.current;
    yards.current.forEach((k) => k.remove());
    yards.current = [];
    if (!m) return;
    const pins = [...parkedPins.current.entries()];
    if (truckRef.current) {
      pins.forEach(([, mk]) => (mk.getElement().style.display = ""));
      return;
    }
    const spots = new Map<string, maplibregl.Marker[]>();
    for (const [, mk] of pins) {
      const ll = mk.getLngLat();
      const k = `${ll.lng.toFixed(2)},${ll.lat.toFixed(2)}`;
      spots.set(k, [...(spots.get(k) ?? []), mk]);
    }
    for (const list of spots.values())
      list.forEach((mk, i) => {
        mk.getElement().style.display = "";
        const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        mk.setOffset(list.length > 1 ? [Math.cos(a) * 13, Math.sin(a) * 13] : [0, 0]);
      });
    if (pins.length) return;
    const road = [...markers.current.values()].map((r) => m.project(r.m.getLngLat()));
    // a yard steps down below a moving truck's tag; yards whose boxes still touch become one
    type G = { ids: string[]; p: maplibregl.Point; dy: number };
    const below = (p: maplibregl.Point) => {
      const q = road.find((r) => Math.abs(r.x - p.x) < 220 && Math.abs(r.y - p.y) < 62);
      return q ? q.y + 62 - p.y : 0;
    };
    let groups: G[] = pins.map(([id, mk]) => {
      const p = m.project(mk.getLngLat());
      return { ids: [id], p, dy: below(p) };
    });
    // the open yard stays one, whatever the zoom
    const open = openYard.current?.split("|");
    if (open && open.every((k) => parkedPins.current.has(k))) {
      const inOpen = groups.filter((g) => open.includes(g.ids[0]));
      const p = new maplibregl.Point(inOpen.reduce((a, g) => a + g.p.x, 0) / inOpen.length, inOpen.reduce((a, g) => a + g.p.y, 0) / inOpen.length);
      groups = groups.filter((g) => !open.includes(g.ids[0])).concat({ ids: open, p, dy: below(p) });
    }
    const touch = (a: G, b: G) => Math.abs(a.p.x - b.p.x) < 175 && Math.abs(a.p.y + a.dy - (b.p.y + b.dy)) < 58;
    for (let merged = true; merged; ) {
      merged = false;
      outer: for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++)
          if (touch(groups[i], groups[j])) {
            const a = groups[i], b = groups[j];
            const n = a.ids.length + b.ids.length;
            const p = new maplibregl.Point((a.p.x * a.ids.length + b.p.x * b.ids.length) / n, (a.p.y * a.ids.length + b.p.y * b.ids.length) / n);
            groups = groups.filter((_, k) => k !== i && k !== j).concat({ ids: [...a.ids, ...b.ids], p, dy: below(p) });
            merged = true;
            break outer;
          }
    }
    for (const g of groups) {
      const members = g.ids.map((id) => parkedPins.current.get(id)!);
      const dy = g.dy;
      if (g.ids.length === 1) {
        members[0].getElement().style.display = "";
        members[0].setOffset([0, dy]);
        const inner = members[0].getElement().firstElementChild as HTMLElement;
        if (performance.now() - yardsEnter.current < 400) emerge(inner, dockRect("trucks"), groups.indexOf(g));
        else if (fanFrom.current && performance.now() - fanFrom.current.t < 3000 && fanFrom.current.ids.includes(g.ids[0])) {
          // they come out of where the yard's chip now stands: the centre of its trucks in the new view
          const pts = fanFrom.current.ids.map((k) => parkedPins.current.get(k)).filter(Boolean).map((k) => m.project(k!.getLngLat()));
          const cx = pts.reduce((a, b) => a + b.x, 0) / pts.length, cy = pts.reduce((a, b) => a + b.y, 0) / pts.length;
          const from = new DOMRect(cx - 60, cy - 20, 120, 40);
          emerge(inner, from, fanFrom.current.ids.indexOf(g.ids[0]));
        }
        continue;
      }
      members.forEach((mk) => (mk.getElement().style.display = "none"));
      const states = members.map((mk) => mk.getElement().dataset.state);
      const at: Point = m.unproject(g.p).toArray() as Point;
      const key = [...g.ids].sort().join("|");
      const town = townNear(m, at) ?? "Armazém";
      const el = document.createElement("div");
      el.className = "lm-yard";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      const head = `<span class="dots">${states.map((st) => `<i data-state="${st}"></i>`).join("")}</span><b>${town}</b><small>${g.ids.length} camiões${states.includes("shop") ? " · 1 na oficina" : ""}</small>`;
      if (openYard.current === key) {
        // the bays: each truck of the yard in its row, read from its own pin
        el.classList.add("open");
        el.innerHTML = `<span class="yh">${head}</span><span class="bays">${g.ids
          .map((id, i) => {
            const pin = parkedPins.current.get(id)!.getElement();
            const plate = pin.querySelector(".lab b")?.textContent ?? "";
            const st = pin.querySelector(".lab small")?.textContent ?? "";
            const warn = pin.querySelector(".warn")?.textContent ?? "";
            const fuel = Number(pin.style.getPropertyValue("--fuel") || 0);
            return `<span class="bay" data-id="${id}" data-state="${pin.dataset.state}" style="--i:${i};--fuel:${fuel}"><span class="sq"></span><b>${plate}</b><small>${st}</small><span class="fbar"><i></i></span>${warn ? `<em>${warn}</em>` : ""}</span>`;
          })
          .join("")}</span>`;
      } else el.innerHTML = head;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        interacted.current = performance.now();
        const bay = (e.target as HTMLElement).closest<HTMLElement>(".bay");
        if (bay) {
          openYard.current = null;
          setTruck(bay.dataset.id!);
          return;
        }
        // the yard opens into its bays where it stands; the camera leans in a little for context
        if (openYard.current === key) {
          openYard.current = null;
          declutterRef.current();
          return;
        }
        openYard.current = key;
        declutterRef.current();
        fly({ center: at, zoom: Math.min(11.5, m.getZoom() + 1.2), pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }, 1200);
      });
      const wrap = document.createElement("div");
      wrap.className = "lm-yard-m";
      wrap.appendChild(el);
      yards.current.push(new maplibregl.Marker({ element: wrap, anchor: "center", offset: [0, dy] }).setLngLat(at).addTo(m));
      if (performance.now() - yardsEnter.current < 400) emerge(el, dockRect("trucks"), yards.current.length);
    }
  };
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const f = () => declutterRef.current();
    m.on("moveend", f);
    return () => {
      m.off("moveend", f);
    };
  }, []);

  // a parked truck up close: the camera comes down beside it, its panel opens
  const lastTruck = useRef<string | null>(null);
  useEffect(() => {
    parkedPins.current.forEach((mk, id) => (mk.getElement().dataset.focus = truck === id ? "1" : ""));
    declutterRef.current();
    if (truck) {
      const at = truckPlace(truck);
      if (at && lastTruck.current !== truck) fly({ center: at, zoom: 15.8, pitch: 62, bearing: -24, padding: { top: 300, bottom: 160, left: 0, right: 420 } }, 2000);
      lastTruck.current = truck;
      return;
    }
    if (lastTruck.current) {
      lastTruck.current = null;
      if (catRef.current === "trucks") fleetShot.current = false;
      else if (!followRef.current && !routeRef.current) fly(home.current, 1700);
    }
  }, [truck, fly]);
  useEffect(() => {
    if (cat !== "trucks") setTruck(null);
    openYard.current = null;
  }, [cat]);
  const fleetShot = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (cat === "trucks" && !follow && !route && !truck) {
      const pts: Point[] = [...allTrucks().map((t) => truckPlace(t.id)).filter((p): p is Point => !!p), ...[...sims.current.values()].map((x) => x.at)];
      if (!pts.length || fleetShot.current) return;
      fleetShot.current = true;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      const cam = m.cameraForBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: 170, bottom: 200, left: 220, right: 220 } });
      m.setPadding(PAD);
      if (cam?.center) {
        const c = maplibregl.LngLat.convert(cam.center);
        interacted.current = performance.now();
        fly({ center: [c.lng, c.lat], zoom: (cam.zoom ?? 7) + 0.1, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }, 1800);
      }
      return;
    }
    if (cat !== "trucks" && fleetShot.current) {
      fleetShot.current = false;
      if (!follow && !route) fly(home.current, 1600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, follow, route, truck, fly]);

  // ── fly to a truck, then follow it (chase camera, low and behind it along its heading)
  const startFollow = useCallback((id: string) => {
    interacted.current = performance.now();
    setRoute(null);
    visitAlive.current = false;
    clearTimeout(retTimer.current);
    retTimer.current = 0;
    setVisit(null);
    setResume(null);
    setFollow(id);
  }, []);
  const lastFollow = useRef<string | null>(null);
  useEffect(() => {
    if (follow) {
      const s = sims.current.get(follow);
      if (s && lastFollow.current !== follow) fly({ center: pointAtKm(s.route, Math.min(s.route.km, s.km + s.v * 2200)), zoom: 15.2, pitch: 66, bearing: s.heading, padding: CHASE_PAD }, 2200);
      lastFollow.current = follow;
      return;
    }
    if (lastFollow.current) {
      lastFollow.current = null;
      // stopped by a drag: the camera stays where the person took it; otherwise it flies home
      if (dragStop.current) dragStop.current = false;
      else if (catRef.current === "trucks") fleetShot.current = false;
      else fly(home.current, 1800);
    }
  }, [follow, fly]);

  // ── when something new goes wrong: ring at home → the camera flies there → pulse on landing → the alert
  // rises → 7.5 s later it shrinks into the sidebar's count while the camera flies back → the next one, 3 s later
  useEffect(() => {
    const fresh = alerts.filter((a) => !seen.current.has(a.jobId));
    if (!fresh.length || follow) return;
    const a = fresh[0];
    let wait = 0;
    const go = () => {
      const m = map.current;
      const s = sims.current.get(a.jobId);
      if (!m || !s) return;
      // the person is busy with the map: try again a bit later
      if (performance.now() - interacted.current < 4000 || followRef.current) {
        wait = window.setTimeout(go, 2000);
        return;
      }
      visitAlive.current = true;
      const back = home.current;
      // look along the route toward the destination, truck low in the frame so land and road fill the shot
      const toward = home.current.bearing + Math.max(-35, Math.min(35, turn(home.current.bearing, bearingOf(s.route.line[0], s.route.line.at(-1)!))));
      fly({ center: s.at, zoom: 9.2, pitch: 42, bearing: toward, padding: { ...PAD, top: 260 } }, 2100, () => {
        if (!visitAlive.current) return;
        seen.current.add(a.jobId);
        const r = markers.current.get(a.jobId);
        if (r) ring(r.el, "late");
        setTimeout(() => visitAlive.current && setVisit(a.jobId), 120);
        retTimer.current = window.setTimeout(() => {
          retTimer.current = 0;
          if (!visitAlive.current) return;
          visitAlive.current = false;
          handBack(a.jobId);
          setVisit(null);
          if (followRef.current) return;
          fly(back, 1900, () => setTimeout(() => setVisitDone((n) => n + 1), 3000));
        }, 7500);
      });
    };
    wait = window.setTimeout(go, 2200);
    return () => clearTimeout(wait);
    // the data refreshes every 2 s; only a different set of problems, the end of a visit or of a chase restarts this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertKey, visitDone, follow]);
  useEffect(() => {
    markers.current.forEach((r, id) => (r.el.dataset.visit = visit === id ? "1" : ""));
    // while an alert stands on the map, the base labels step back so the card never cuts them
    const m = map.current;
    if (!m || !ready.current) return;
    for (const l of m.getStyle().layers)
      if (l.type === "symbol" && !l.id.startsWith("lm-"))
        try {
          m.setPaintProperty(l.id, "text-opacity", visit ? 0.25 : follow ? (/village|hamlet|neighbourhood|suburb|locality|industrial|landuse|natur|poi/i.test(l.id) ? 0 : 0.5) : 0.9);
        } catch {
          /* hidden layer */
        }
  }, [visit, follow]);

  /** The alert card shrinks into the sidebar's "atrasados" tile: the eye sees where the problem went. */
  function handBack(jobId: string) {
    const card = markers.current.get(jobId)?.el.querySelector<HTMLElement>(".lm-alert");
    const tile = root.current?.querySelector<HTMLElement>(".lm-dock [data-k='alerts']");
    if (!card || !tile || reducedMotion()) return;
    const a = card.getBoundingClientRect(), b = tile.getBoundingClientRect();
    const truck = card.closest<HTMLElement>(".lm-truck");
    truck?.setAttribute("data-handing", "1");
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add("lm-ghost");
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    root.current!.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(0.55)`, opacity: 0.9, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0 },
        ],
        { duration: 520, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      )
      .finished.then(() => {
        ghost.remove();
        truck?.removeAttribute("data-handing");
      });
    window.setTimeout(() => tile.animate([{ transform: "scale(1.08)" }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }), 440);
  }

  // Esc stops following (the camera returns home) or dismisses the offer to follow again
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if ((document.activeElement as HTMLElement | null)?.closest?.(".lm-row")) (document.activeElement as HTMLElement).blur();
      if (followRef.current) setFollow(null);
      else if (routeRef.current) setRoute(null);
      else if (truckRef.current) setTruck(null);
      else if (openYard.current) {
        openYard.current = null;
        declutterRef.current();
      }
      else setResume(null);
      setPalcos(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useGlide(root);
  const dockRect = (k: string) => root.current?.querySelector(`.lm-dock [data-k='${k}']`)?.getBoundingClientRect();
  const free = allDrivers().filter((d) => !road.some((j) => j.driverId === d.id) && !d.holder);
  const routeJob = route ? road.find((j) => j.id === route) : undefined;
  /** Free drivers never sit on a truck's tag or on each other: a pin that would steps down a row. */
  const spreadFree = () => {
    const m = map.current;
    if (!m) return;
    const taken = [...markers.current.values()].map((r) => m.project(r.m.getLngLat())).map((p) => ({ x: p.x - 60, y: p.y }));
    for (const mk of freePins.current) {
      const p = m.project(mk.getLngLat());
      let dy = 0;
      while (taken.some((q) => Math.abs(q.x - p.x) < 150 && Math.abs(q.y - (p.y + dy)) < 42) && dy < 400) dy += 44;
      mk.setOffset([0, dy]);
      taken.push({ x: p.x, y: p.y + dy });
    }
  };
  const spreadFreeRef = useRef(spreadFree);
  spreadFreeRef.current = spreadFree;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const f = () => spreadFreeRef.current();
    m.on("moveend", f);
    return () => {
      m.off("moveend", f);
    };
  }, []);
  // drivers mode: the free ones stand where they are, in green; tapping one goes there
  const freePins = useRef<maplibregl.Marker[]>([]);
  const freeKey = free.map((d) => d.id + d.where).join("|");
  useEffect(() => {
    const m = map.current;
    retire(freePins.current, dockRect("drivers"));
    freePins.current = [];
    if (!m || cat !== "drivers" || follow || route) return;
    const from = dockRect("drivers");
    const byPlace = new Map<string, ReturnType<typeof allDrivers>>();
    for (const d of allDrivers().filter((x) => !road.some((j) => j.driverId === x.id) && !x.holder)) {
      if (!placeOf(d.where)) continue;
      byPlace.set(d.where, [...(byPlace.get(d.where) ?? []), d]);
    }
    [...byPlace.entries()].forEach(([where, people], i) => {
      const p = placeOf(where)!;
      const wrap = document.createElement("div");
      wrap.className = "lm-freepin-m";
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lm-freepin";
      el.dataset.n = String(people.length);
      el.innerHTML =
        people.length === 1
          ? `<i>${initials(people[0].name)}</i><span><b>${people[0].name.split(" ")[0]}</b><small>livre · ${where}</small></span>`
          : `<span class="avs">${people.map((d) => `<i>${initials(d.name)}</i>`).join("")}</span><span><b>${people.map((d) => d.name.split(" ")[0]).join(", ")}</b><small>${people.length} livres · ${where}</small></span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        interacted.current = performance.now();
        fly({ center: p, zoom: 12.5, pitch: 42, bearing: 0 }, 1800);
      });
      wrap.appendChild(el);
      freePins.current.push(new maplibregl.Marker({ element: wrap, anchor: "center" }).setLngLat(p).addTo(m));
      emerge(el, from, i);
    });
    spreadFree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, follow, route, freeKey, fly]);

  return (
    <div className="lm" ref={root} data-theme={theme} data-cat={cat ?? undefined} data-route={route ? "" : undefined} data-truck={truck ? "" : undefined} data-following={follow ? "" : undefined} data-visiting={visit ? "" : undefined}>
      <div className="lm-map" ref={host} />

      <header className="lm-brandchip">
        <span className="lm-mark" aria-hidden />
        <b>FleetOS</b>
        <span className="lm-clock">
          {clock(now)}
          <i aria-hidden key={String(now)} />
        </span>
      </header>

      {feed[0] && (
        <button key={feed[0].key} className="lm-toast" data-tone={feed[0].tone === "bad" && !lateBy.has(feed[0].jobId) ? undefined : feed[0].tone} onClick={() => road.some((j) => j.id === feed[0].jobId) && startFollow(feed[0].jobId)}>
          <i aria-hidden />
          {feed[0].text}
        </button>
      )}

      {(follow || route || truck) && (
        <button className="lm-back" onClick={() => (follow ? setFollow(null) : route ? setRoute(null) : setTruck(null))}>
          ← {cat === "trucks" ? "Todos os camiões" : follow ? "Todos os motoristas" : "Todas as rotas"} <kbd>Esc</kbd>
        </button>
      )}

      {palcos && (
        <nav className="lm-palcos-pop" aria-label="Palcos">
          {(
            [
              ["viagens", "Viagens", unassigned ? `${unassigned} por atribuir` : ""],
              ["garagem", "Garagem", ""],
              ["clientes", "Clientes", ""],
              ["combustivel", "Gasóleo", ""],
            ] as [PalcoKey, string, string][]
          ).map(([k, label, note]) => (
            <button key={k} onClick={(e) => onPalco(k, e.currentTarget.getBoundingClientRect())}>
              {label}
              {note && <small>{note}</small>}
            </button>
          ))}
        </nav>
      )}

      {routeJob && <RouteBand key={routeJob.id} j={routeJob} now={now} late={lateBy.get(routeJob.id)} hot={hot} setHot={setHot} onFollow={() => startFollow(routeJob.id)} onTrip={(r) => onPalco("viagens", r)} />}

      <nav className="lm-dock" aria-label="Categorias">
        <button data-k="drivers" aria-pressed={cat === "drivers"} onClick={() => setCat((c) => (c === "drivers" ? null : "drivers"))}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="7" r="3.2" />
            <path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5" />
          </svg>
          Motoristas<em key={road.length + free.length}>{road.length + free.length}</em>
        </button>
        <button data-k="routes" aria-pressed={cat === "routes"} onClick={() => setCat((c) => (c === "routes" ? null : "routes"))}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <circle cx="4.5" cy="15.5" r="2" />
            <circle cx="15.5" cy="4.5" r="2" />
            <path d="M6.5 15.5h6a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6h6" />
          </svg>
          Rotas<em key={road.length}>{road.length}</em>
        </button>
        <button data-k="trucks" aria-pressed={cat === "trucks"} onClick={() => setCat((c) => (c === "trucks" ? null : "trucks"))}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M2.5 13.5V6h9v7.5M11.5 9h3.5l2.5 2.8v1.7" />
            <circle cx="6" cy="14.5" r="1.6" />
            <circle cx="14.5" cy="14.5" r="1.6" />
          </svg>
          Camiões<em>{allTrucks().length}</em>
        </button>
        <button data-k="alerts" data-tone={alerts.length ? "bad" : undefined} onClick={() => alerts[0] && startFollow(alerts[0].jobId)} disabled={!alerts.length}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M10 3.5 17.5 16.5h-15z" />
            <path d="M10 8.5v3.5M10 14.2v.1" />
          </svg>
          Alertas<em key={alerts.length}>{alerts.length}</em>
        </button>
        <span className="lm-dock-sep" aria-hidden />
        <button data-k="palcos" aria-expanded={palcos} onClick={() => setPalcos((p) => !p)}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <circle cx="5" cy="10" r="1.2" />
            <circle cx="10" cy="10" r="1.2" />
            <circle cx="15" cy="10" r="1.2" />
          </svg>
          Palcos
        </button>
      </nav>

      <div className="lm-theme" role="radiogroup" aria-label="Tema">
        {(["dark", "light"] as Theme[]).map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
            {t === "dark" ? "Escuro" : "Claro"}
          </button>
        ))}
      </div>

      {resume && !follow && road.some((j) => j.id === resume) && (
        <button className="lm-resume" onClick={() => startFollow(resume)}>
          Seguir {driverWorld(road.find((j) => j.id === resume)!.driverId).name.split(" ")[0]} de novo
        </button>
      )}

    </div>
  );
}

/** Something switched on by a dock button flies out of that button to its place (springy, staggered). */
function emerge(inner: HTMLElement, from: DOMRect | undefined, i: number) {
  if (!from || reducedMotion()) return;
  const r = inner.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
  inner.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: "none", opacity: 1 }], { duration: 640, delay: i * 70, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)", fill: "backwards" });
}
/** …and switched off, flies back into it before it is removed. */
function retire(mks: maplibregl.Marker[], to: DOMRect | undefined) {
  mks.forEach((mk, i) => {
    const inner = (mk.getElement().firstElementChild as HTMLElement | null) ?? mk.getElement();
    if (!to || reducedMotion() || mk.getElement().style.display === "none") return mk.remove();
    const r = inner.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (r.left + r.width / 2), dy = to.top + to.height / 2 - (r.top + r.height / 2);
    inner.style.pointerEvents = "none";
    inner.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0 }], { duration: 420, delay: i * 30, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "forwards" }).finished.then(() => mk.remove(), () => mk.remove());
  });
}
/** A light runs a line from its start to its end once (Rotas switched on). */
function comet(m: MlMap, route: Row["route"], delay: number) {
  const el = document.createElement("div");
  el.className = "lm-comet";
  const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(route.line[0]).addTo(m);
  const dur = 1100, t0 = performance.now() + delay * 1000;
  const step = (t: number) => {
    const k = Math.max(0, Math.min(1, (t - t0) / dur));
    const e = 1 - Math.pow(1 - k, 2);
    mk.setLngLat(pointAtKm(route, route.km * e));
    el.style.opacity = k <= 0 ? "0" : String(1 - Math.max(0, k - 0.85) / 0.15);
    if (k < 1) requestAnimationFrame(step);
    else mk.remove();
  };
  requestAnimationFrame(step);
}

/** What happens along a trip, in order: its stops, pauses and refuels (with time and km). */
type DayMark = { key: string; kind: "pickup" | "stop" | "delivery" | "break" | "fuel"; km: number; at: number | null; title: string; sub: string; ping: boolean };
function dayMarks(j: Row): DayMark[] {
  const out: DayMark[] = [];
  j.stops.forEach((st, i) => {
    const eta = j.forecast.stops[i]?.eta ?? null;
    out.push({ key: `s${i}`, kind: st.type, km: st.km, at: eta, title: st.city, sub: st.type === "pickup" ? "carga" : st.type === "delivery" ? "descarga" : "paragem", ping: i > 0 && i < j.stops.length - 1 });
  });
  j.forecast.trace.forEach((g, i) => {
    if (g.kind === "break") out.push({ key: `b${i}`, kind: "break", km: g.km0, at: g.from, title: `Pausa ${Math.round(g.to - g.from)} min`, sub: `km ${Math.round(g.km0)}`, ping: true });
  });
  j.forecast.fuelStops.forEach((f, i) => out.push({ key: `f${i}`, kind: "fuel", km: f.km, at: f.at, title: "Abastecer", sub: f.name, ping: true }));
  return out.sort((a, b) => a.km - b.km);
}

/** The bottom band of a route seen whole: a film title, the facts, and the trip as a day line (real plan:
 *  drive, pauses, stops, waiting), with "agora" moving along it. Labels and map pings light each other. */
function RouteBand({ j, now, late: a, hot, setHot, onFollow, onTrip }: { j: Row; now: number; late: Alert | undefined; hot: string | null; setHot: (k: string | null) => void; onFollow: () => void; onTrip: (r: DOMRect) => void }) {
  const name = driverWorld(j.driverId).name;
  const plate = j.truckId ? truckWorld(j.truckId).plate : "";
  const tr = j.forecast.trace;
  const t0 = Math.min(tr[0]?.from ?? now, now), t1 = Math.max(j.forecast.final ?? now + 60, (tr.at(-1)?.to ?? now) + 1);
  const W = 1000;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const marks = dayMarks(j).filter((d) => d.at != null);
  // labels never touch: a label too close to the previous one is dropped (its ping still stands on the map)
  const shown: DayMark[] = [];
  for (const d of marks) if (!shown.length || X(d.at!) - X(shown.at(-1)!.at!) > 120) shown.push(d);
  const hours: number[] = [];
  for (let h = Math.ceil(t0 / 60) * 60; h < t1; h += 60) hours.push(h);
  const step = Math.ceil(hours.length / 9);
  const left = Math.max(0, Math.round(j.route.km - j.km));
  const state = driving(j) ? "a conduzir" : j.activity;
  return (
    <section className="lm-routeband" aria-label="Rota">
      <div className="lm-rb-head">
        <div className="lm-rb-title">
          <h1>
            {j.stops[0].city} <span>→</span> {j.stops.at(-1)!.city}
          </h1>
          <p>
            <b>{name}</b> · {plate}
            <em data-tone={driving(j) ? "go" : "wait"}>
              <i aria-hidden />
              {state}
            </em>
          </p>
        </div>
        <div className="lm-rb-facts">
          <span>
            <small>Faltam</small>
            <b>
              {left}
              <i>km</i>
            </b>
          </span>
          <span data-late={a ? "1" : undefined}>
            <small>Chega{a && <em>{late(a.late)}</em>}</small>
            <b key={Math.round(j.forecast.final!)}>{clock(j.forecast.final!)}</b>
          </span>
          <button className="lm-rb-btn q" onClick={(e) => onTrip(e.currentTarget.getBoundingClientRect())}>
            Viagem
          </button>
          <button className="lm-rb-btn" onClick={onFollow}>
            Seguir o {name.split(" ")[0]}
          </button>
        </div>
      </div>
      <div className="lm-rb-day">
        <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" aria-hidden>
          <line className="base" x1="0" y1="20" x2={W} y2="20" />
          {tr.map((g, i) => {
            const past = g.to <= now;
            return <line key={i} className={`seg ${g.kind}${past ? " past" : ""}`} x1={X(g.from)} y1="20" x2={Math.max(X(g.from) + 1, X(g.to))} y2="20" style={{ animationDelay: `${0.5 + (X(g.from) / W) * 0.9}s` }} />;
          })}
          <circle className="end" cx={W - 8} cy="20" r="8" />
        </svg>
        {hours.filter((h, i) => i % step === 0 && Math.abs(X(h) - X(now)) > 50).map((h) => (
          <span key={h} className="lm-rb-hour" style={{ left: `${(X(h) / W) * 100}%` }}>
            {String(Math.floor((h / 60) % 24)).padStart(2, "0")}h
          </span>
        ))}
        <span className="lm-rb-now" style={{ left: `${(X(now) / W) * 100}%` }}>
          <i aria-hidden />
          agora
        </span>
        {shown.map((d, i) => (
          <span key={d.key} className="lm-rb-mark" data-kind={d.kind} data-hot={hot === d.key || undefined} data-edge={i === 0 ? "l" : X(d.at!) > W - 110 ? "r" : undefined} style={{ left: `${(X(d.at!) / W) * 100}%`, animationDelay: `${0.9 + i * 0.12}s` }} onMouseEnter={() => setHot(d.key)} onMouseLeave={() => setHot(null)}>
            <b>{d.title}</b>
            <small>
              {clock(d.at!)} · {d.sub}
            </small>
          </span>
        ))}
      </div>
    </section>
  );
}

type Truck = ReturnType<typeof truckWorld>;
/** The nearest city or town in the loaded OpenStreetMap places, labelled on screen or not. */
function townNear(m: MlMap, at: Point): string | null {
  let best: { name: string; d: number } | null = null;
  for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "place" })) {
    if (f.geometry.type !== "Point" || !/city|town/.test(String(f.properties.class))) continue;
    const [x, y] = f.geometry.coordinates as [number, number];
    const d = Math.hypot((x - at[0]) * Math.cos((at[1] * Math.PI) / 180), y - at[1]);
    const name = (f.properties["name:pt"] ?? f.properties["name:latin"] ?? f.properties.name) as string | undefined;
    if (name && d < 0.5 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name ?? null;
}

const fuelPct = (t: Truck) => (t.fuel.prov.kind === "UNKNOWN" ? null : Math.round(t.fuel.value));
const placeName = (t: Truck) => t.fuel.prov.source.replace(/^manual · /, "").replace(/^depósito /, "");
const hash = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
};
/** Simulated document deadlines, deterministic per plate (same rule as the Garagem palco). */
function validities(plate: string) {
  const h = hash(plate);
  return [
    { name: "inspeção", days: 1 + (h % 40) },
    { name: "seguro", days: 12 + (h % 170) },
    { name: "tacógrafo", days: 25 + (h % 300) },
  ];
}
/** The truck's panel: a fuel arc with its range, the plate and the machine's numbers, its deadlines. */
function truckCardHtml(t: Truck, line: string, state: string) {
  const pct = fuelPct(t);
  const l100 = t.consumptionL100.value > 0 ? t.consumptionL100.value : null;
  const range = pct == null || !l100 ? null : Math.round(((pct / 100) * t.tankL) / (l100 / 100));
  const arc = (frac: number) => {
    const r = 42, c = Math.PI * r;
    return `<svg viewBox="0 0 96 56" aria-hidden><path d="M6 50 A42 42 0 0 1 90 50" class="t"/><path d="M6 50 A42 42 0 0 1 90 50" class="f" stroke-dasharray="${(c * Math.max(0.001, Math.min(1, frac))).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  };
  const svc = /([\d\s.]+)\s*km/.exec(t.service);
  const toService = svc ? Number(svc[1].replace(/[\s.]/g, "")) - t.odometer.value : null;
  const docs = validities(t.plate).sort((a, b) => a.days - b.days);
  const k = (n: number) => Math.round(n).toLocaleString("pt-PT");
  return `<span class="lm-card-in lm-panel" data-state="${state}">
    <span class="lm-fuel" data-low="${pct != null && pct < 25 ? 1 : ""}">${arc((pct ?? 0) / 100)}<b>${pct ?? "?"}<small>%</small></b><small>${range != null ? `≈ ${k(range)} km` : "depósito"}</small></span>
    <span class="lm-panel-id"><b>${t.plate}</b><small>${t.make} ${t.model.split(" ").slice(0, 2).join(" ")}${t.adrEquipped ? " · ADR" : ""}</small><small class="st">${line}</small>
      <span class="lm-panel-nums"><span><b>${k(t.odometer.value)}</b> km</span>${toService != null ? `<span>revisão em <b>${k(toService)}</b> km</span>` : ""}</span></span>
    <span class="lm-panel-docs">${docs.map((d) => `<span data-soon="${d.days <= 14 ? 1 : ""}"><b>${d.days}<i> d</i></b><small>${d.name}</small></span>`).join("")}<em>datas simuladas</em></span>
    <span class="lm-card-acts lm-panel-acts"><button type="button" data-act="trip">Garagem</button><button type="button" data-act="stop" class="q">Parar <kbd>Esc</kbd></button></span>
  </span>`;
}

/** The card on the followed truck: its form follows what the driver is doing. */
function cardHtml(j: Row, s: Sim, a: Alert | undefined) {
  const name = driverWorld(j.driverId).name;
  const left = Math.max(0, Math.round(j.route.km - (s?.km ?? j.km)));
  const ring = (frac: number) => {
    const r = 38, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 84 84" aria-hidden><circle cx="42" cy="42" r="${r}" class="t"/><circle cx="42" cy="42" r="${r}" class="f" stroke-dasharray="${(c * Math.max(0.001, Math.min(1, frac))).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  };
  const eta = `${clock(j.forecast.final!)}${a ? ` <em>${late(a.late)}</em>` : ""}`;
  const acts = `<span class="lm-card-acts"><button type="button" data-act="trip">Ver viagem</button><button type="button" data-act="stop" class="q">Parar <kbd>Esc</kbd></button></span>`;
  if (driving(j)) {
    const kmh = Math.round((s?.v ?? 0) * 3_600_000);
    return `<span class="lm-card-in" data-kind="drive"><span class="lm-ringv" data-tone="go">${ring(kmh / 120)}<b>${kmh}</b><small>km/h</small></span><span class="lm-card-txt"><b>${name}</b><small class="st" data-tone="go">${j.activity}</small><small>${left} km · chega ${eta}</small>${acts}</span></span>`;
  }
  const mins = /(\d+)\s*min/.exec(j.activity)?.[1];
  return `<span class="lm-card-in" data-kind="stop"><span class="lm-ringv" data-tone="wait">${ring(1)}<b>${mins ?? "·"}</b><small>${mins ? "min" : ""}</small></span><span class="lm-card-txt"><b>${name}</b><small class="st" data-tone="wait">Parado · ${j.activity}</small><small>${left} km · chega ${eta}</small>${acts}</span></span>`;
}

/** Elements marked data-glide glide from where they were to where they are after every render (FLIP). */
function useGlide(root: React.RefObject<HTMLElement | null>) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const next = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-glide]").forEach((n, i) => {
      const k = n.dataset.glide!;
      const top = n.getBoundingClientRect().top;
      next.set(k, top);
      const was = last.current.get(k);
      if (was != null && Math.abs(was - top) > 1 && !reducedMotion())
        n.animate(
          Math.abs(was - top) > 40
            ? [{ transform: `translateY(${Math.sign(was - top) * 12}px)`, opacity: 0 }, { transform: "none", opacity: 1 }]
            : [{ transform: `translateY(${was - top}px)` }, { transform: "none" }],
          { duration: 340, delay: i * 40, fill: "backwards", easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
        );
    });
    last.current = next;
  });
}

/** One burst of rings on a truck: a problem is born or the camera arrives (late), a status changes (ok),
 *  it sets off (go). Reduced motion: a static halo held for 3 s instead. */
function ring(el: HTMLElement, kind: "late" | "ok" | "go") {
  el.dataset.ring = kind;
  el.classList.remove("lm-born");
  void el.offsetWidth;
  el.classList.add("lm-born");
  window.setTimeout(() => el.classList.remove("lm-born"), 4600);
}
/** The arrival time changed: the tag ticks once. */
function tick(el: HTMLElement) {
  el.classList.remove("lm-tick");
  void el.offsetWidth;
  el.classList.add("lm-tick");
}
