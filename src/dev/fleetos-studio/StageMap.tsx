// The map is the stage: one MapLibre instance for the whole session. Selection,
// previews and returns change framing and overlays, never the instance.
import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { environmentTomTomStyle, TOMTOM_ATTRIBUTION } from "../fleetos-environment/tomtomStyle";
import { getTomTomKey, TOMTOM } from "../../tomtom/config";
import { PT_OUTLINE } from "../fleetos-workspace/geo";
import { sliceKm } from "../fleetos-environment/world";
import { W } from "./world/active";
import { litresAt, type FuelView } from "./fuel";
import { driverWorld, truckWorld, type Placed, type Point, type RecordedRoute, type Tone } from "./model";

/** Base map: streets like the app (OSM + TomTom traffic), TomTom's own style, or the quiet paper map. */
export type MapStyle = "streets" | "tomtom" | "paper";
/** A place the camera flies into (e.g. the pump of a refuel stop), with its facts. */
export type MapSpot = { id: string; ref?: string; outline?: Point[]; uncertain?: boolean; at: Point; title: string; lines: string[]; kind?: "fuel" | "stop" };
export type LiveJob = Placed & { tone: Tone; km: number; heading: number; activity: string };
export type MapExtra = { id: string; at: Point; kind: "person" | "truck" | "trailer" | "stop" | "fuel" | "dry"; label: string; sub: string; state?: string; station?: string };
export type StageProps = {
  jobs: LiveJob[];
  /** Free people / equipment shown by the current lens. */
  extras: MapExtra[];
  lens: "jobs" | "drivers" | "fleet" | "stops" | "fuel";
  /** Which side the deck sits on (the map frames the other side). */
  side: "left" | "right";
  /** Where the scrubbed clock sits relative to the demo clock. */
  tense: "now" | "past" | "future";
  openId: string | null;
  hoverId: string | null;
  altRoute: RecordedRoute | null;
  candidate: { at: Point; name: string } | null;
  panelWidth: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  pulse: number;
  /** Route options of an open planning session (TomTom), the selected one emphasised. */
  planRoutes: { id: string; line: Point[]; selected: boolean; kind?: "EMPTY" | "LOADED" }[];
  /** Fuel stations with published diesel price (fuel lens / open corridor). */
  stations: { at: Point; price: number; id: string; name: string }[];
  mapStyle: MapStyle;
  traffic: boolean;
  /** Camera stays on the open transport, close in, while it moves. */
  follow: boolean;
  spot: MapSpot | null;
  /** A fuel station dot was clicked on the map. */
  onStation?: (id: string) => void;
};

const PT = (): LngLatBoundsLike => W().bounds;
const INK = "#1b1d22";
const FOCUS = "#e0502a";

/** Screen projection for overlays (tethers) that connect UI objects to the map. */
export const stageApi: { project: ((p: Point) => { x: number; y: number }) | null } = { project: null };

/** Camera padding that keeps the subject in the map area left free by the panels. */
function pad(panelWidth: number, focused: boolean, side: "left" | "right" = "left") {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 760) return { top: 70, bottom: Math.round(h * 0.6) + 20, left: 30, right: 30 };
  if (focused) return { top: 90, bottom: 70, left: panelWidth + 70, right: 90 };
  return side === "right"
    ? { top: 70, bottom: 50, left: 60, right: panelWidth + 40 }
    : { top: 70, bottom: 50, left: panelWidth + 40, right: w > 1180 ? 340 : 60 };
}

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (coords: Point[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "LineString", coordinates: coords },
});

/** Re-ink the provider style as a quiet paper map: work overlays carry the colour. */
function paperize(map: MlMap) {
  for (const l of map.getStyle().layers ?? []) {
    const id = l.id.toLowerCase();
    try {
      if (l.type === "background") map.setPaintProperty(l.id, "background-color", "#ebe5d8");
      else if (l.type === "fill") {
        if (/water|ocean|sea|lake|river|reservoir/.test(id)) map.setPaintProperty(l.id, "fill-color", "#c6d2d0");
        else if (/park|wood|forest|green|grass|vegetation|nature/.test(id))
          map.setPaintProperty(l.id, "fill-color", "#e1e0cc");
        else if (/build/.test(id)) map.setLayoutProperty(l.id, "visibility", "none");
        else map.setPaintProperty(l.id, "fill-color", "#e8e2d4");
      } else if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", "none");
      else if (l.type === "line") {
        if (/water|river|stream/.test(id)) map.setPaintProperty(l.id, "line-color", "#b9c7c5");
        else if (/boundary|border|admin/.test(id)) map.setPaintProperty(l.id, "line-color", "#a49d8d");
        else if (/motorway|highway|major|trunk|primary/.test(id)) map.setPaintProperty(l.id, "line-color", "#fbf8f1");
        else map.setPaintProperty(l.id, "line-color", "#f3eee4");
      } else if (l.type === "symbol") {
        if (/poi|transit|airport|rail|station|ferry|house|building|place.*(neigh|suburb|hamlet|village)/.test(id))
          map.setLayoutProperty(l.id, "visibility", "none");
        else {
          map.setPaintProperty(l.id, "text-color", "#6b665b");
          map.setPaintProperty(l.id, "text-halo-color", "#ebe5d8");
          map.setPaintProperty(l.id, "icon-opacity", 0.55);
        }
      }
    } catch {
      /* layer without that property: leave as provided */
    }
  }
}

function streetsStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function styleFor(s: MapStyle): string | maplibregl.StyleSpecification {
  if (s === "streets") return streetsStyle();
  return environmentTomTomStyle() ?? fallbackStyle();
}

function fallbackStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { pt: { type: "geojson", data: fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [PT_OUTLINE] } }]) } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#c6d2d0" } },
      { id: "pt", type: "fill", source: "pt", paint: { "fill-color": "#ebe5d8" } },
      { id: "pt-edge", type: "line", source: "pt", paint: { "line-color": "#a49d8d", "line-width": 1 } },
    ],
  };
}

export function StageMap(p: StageProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLDivElement }>());
  const props = useRef(p);
  props.current = p;
  const reveal = useRef(0);
  const labels = useRef<maplibregl.Marker[]>([]);
  const cand = useRef<maplibregl.Marker | null>(null);
  const home = useRef<{ center: maplibregl.LngLat; zoom: number } | null>(null);
  const revealKm = useRef(0);
  const routesKey = useRef("");
  const flow = useRef(0);
  const extraMarkers = useRef<maplibregl.Marker[]>([]);
  /** Last data of every overlay source, re-applied when the base style changes. */
  const data = useRef(new Map<string, GeoJSON.FeatureCollection>());
  const styleNow = useRef(p.mapStyle);
  const spotMarker = useRef<maplibregl.Marker | null>(null);

  /** Set an overlay source's data (kept, so a style switch does not lose it). */
  function put(name: string, d: GeoJSON.FeatureCollection) {
    data.current.set(name, d);
    (map.current?.getSource(name) as GeoJSONSource | undefined)?.setData(d);
  }

  // Mount once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: host.current!,
      style: styleFor(p.mapStyle),
      bounds: PT(),
      fitBoundsOptions: { padding: pad(p.panelWidth, false, p.side) },
      attributionControl: { compact: true, customAttribution: TOMTOM_ATTRIBUTION },
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 0,
    });
    map.current = m;
    (window as unknown as { __studioMap?: MlMap }).__studioMap = m;
    stageApi.project = (pt) => m.project(pt);
    m.on("style.load", () => {
      if (props.current.mapStyle === "paper") paperize(m);
      install(m);
      ready.current = true;
      if (!home.current) home.current = { center: m.getCenter(), zoom: m.getZoom() };
      sync();
    });
    m.on("click", "fuel-st", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) props.current.onStation?.(String(id));
    });
    m.on("mouseenter", "fuel-st", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "fuel-st", () => (m.getCanvas().style.cursor = ""));
    return () => {
      m.remove();
      stageApi.project = null;
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Overlay sources and layers on top of whichever base style is loaded. */
  function install(m: MlMap) {
    {
      const key = getTomTomKey();
      if (key && !m.getSource("sat")) {
        // Satellite photo for close-ups (the pump itself), shown only while a spot is open.
        m.addSource("sat", {
          type: "raster",
          tiles: [`https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`],
          tileSize: 256,
          maxzoom: 19,
          attribution: TOMTOM.attribution,
        });
        m.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: props.current.spot ? "visible" : "none" }, paint: { "raster-fade-duration": 300 } });
      }
      if (key && !m.getSource("traffic")) {
        m.addSource("traffic", { type: "raster", tiles: [TOMTOM.trafficFlow(key)], tileSize: 256, attribution: TOMTOM.attribution });
        m.addLayer({ id: "traffic", type: "raster", source: "traffic", layout: { visibility: props.current.traffic ? "visible" : "none" }, paint: { "raster-opacity": 0.55 } });
      }
      m.addSource("routes", { type: "geojson", data: data.current.get("routes") ?? fc([]) });
      m.addSource("focus", { type: "geojson", data: data.current.get("focus") ?? fc([]) });
      m.addSource("alt", { type: "geojson", data: data.current.get("alt") ?? fc([]) });
      m.addSource("link", { type: "geojson", data: data.current.get("link") ?? fc([]) });
      m.addSource("done", { type: "geojson", data: data.current.get("done") ?? fc([]) });
      m.addSource("stops", { type: "geojson", data: data.current.get("stops") ?? fc([]) });
      m.addSource("ahead", { type: "geojson", data: data.current.get("ahead") ?? fc([]) });
      m.addSource("fuel-st", { type: "geojson", data: data.current.get("fuel-st") ?? fc([]) });
      m.addSource("plan", { type: "geojson", data: data.current.get("plan") ?? fc([]) });
      m.addLayer({ id: "routes-casing", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ebe5d8", "line-width": 6, "line-opacity": 0.9 } });
      m.addLayer({ id: "routes", type: "line", source: "routes", filter: ["==", ["get", "recorded"], true], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INK, "line-width": 2.2, "line-opacity": 0.55 } });
      // No road geometry recorded: a dashed straight line between stops, never mistaken for a road.
      m.addLayer({ id: "routes-direct", type: "line", source: "routes", filter: ["==", ["get", "recorded"], false], paint: { "line-color": INK, "line-width": 1.6, "line-opacity": 0.45, "line-dasharray": [2, 2.5] } });
      m.addLayer({ id: "alt", type: "line", source: "alt", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2f6f8f", "line-width": 3.5, "line-dasharray": [1.2, 1.4] } });
      m.addLayer({ id: "focus-glow", type: "line", source: "focus", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": FOCUS, "line-width": 12, "line-opacity": 0.16, "line-blur": 4 } });
      m.addLayer({ id: "focus", type: "line", source: "focus", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": FOCUS, "line-width": 4 } });
      m.addLayer({ id: "done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INK, "line-width": 4, "line-opacity": 0.85 } });
      m.addLayer({
        id: "fuel-st",
        type: "circle",
        source: "fuel-st",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.6, 9, 5, 14, 8],
          "circle-color": ["interpolate", ["linear"], ["get", "k"], 0, "#2a7a57", 0.5, "#c2850c", 1, "#d2401f"],
          "circle-stroke-color": "#fbf8f1",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2],
          "circle-opacity": 0.9,
        },
      });
      m.addSource("spot-area", { type: "geojson", data: data.current.get("spot-area") ?? fc([]) });
      m.addLayer({ id: "spot-area", type: "fill", source: "spot-area", paint: { "fill-color": FOCUS, "fill-opacity": 0.18 } });
      m.addLayer({ id: "spot-area-edge", type: "line", source: "spot-area", paint: { "line-color": "#fff", "line-width": 2.5, "line-dasharray": [2, 1.2] } });
      m.addLayer({ id: "plan-alt", type: "line", source: "plan", filter: ["==", ["get", "selected"], false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2f6f8f", "line-width": 3, "line-opacity": 0.55 } });
      m.addLayer({ id: "plan-empty", type: "line", source: "plan", filter: ["all", ["==", ["get", "selected"], true], ["==", ["get", "empty"], true]], paint: { "line-color": "#2f6f8f", "line-width": 3, "line-dasharray": [1.4, 1.4] } });
      m.addLayer({ id: "plan-sel-casing", type: "line", source: "plan", filter: ["all", ["==", ["get", "selected"], true], ["!=", ["get", "empty"], true]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fbf8f1", "line-width": 9 } });
      m.addLayer({ id: "plan-sel", type: "line", source: "plan", filter: ["all", ["==", ["get", "selected"], true], ["!=", ["get", "empty"], true]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#e0502a", "line-width": 5 } });
      m.addLayer({ id: "flow", type: "line", source: "ahead", layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": "#fff6ee", "line-width": 1.6, "line-opacity": 0.95, "line-dasharray": [0, 4, 3] } });
      m.addLayer({ id: "link", type: "line", source: "link", paint: { "line-color": "#2f6f8f", "line-width": 1.6, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-radius": ["case", ["get", "end"], 6, 4.5], "circle-color": "#fbf8f1", "circle-stroke-color": FOCUS, "circle-stroke-width": 2.5 } });
    }
  }

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { jobs, openId, hoverId, tense } = props.current;
    const key = jobs.map((j) => `${j.route.id}:${j.route.line.length}`).join("|");
    if (key !== routesKey.current) {
      routesKey.current = key;
      put("routes", 
        fc(jobs.map((j) => line(j.route.line, { id: j.id, recorded: (j.route as { recorded?: boolean }).recorded !== false }))),
      );
    }
    focusLines();
    m.setPaintProperty("routes", "line-opacity", [
      "case",
      ["==", ["get", "id"], hoverId ?? ""],
      0.95,
      openId ? 0.12 : 0.5,
    ]);
    m.setPaintProperty("routes", "line-width", ["case", ["==", ["get", "id"], hoverId ?? ""], 3.6, 2.2]);
    m.setPaintProperty("routes-direct", "line-opacity", ["case", ["==", ["get", "id"], hoverId ?? ""], 0.9, openId ? 0.1 : 0.45]);
    // Markers: one persistent DOM object per transport.
    for (const j of jobs) {
      let rec = markers.current.get(j.id);
      if (!rec) {
        const el = document.createElement("div");
        el.className = "pin";
        el.innerHTML = `<span class="pin-dot"><span class="pin-arrow"></span></span><span class="pin-tag"><b></b><i></i></span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          props.current.onSelect(j.id);
        });
        el.addEventListener("mouseenter", () => props.current.onHover(j.id));
        el.addEventListener("mouseleave", () => props.current.onHover(null));
        const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(j.at).addTo(m);
        rec = { m: mk, el };
        markers.current.set(j.id, rec);
      }
      rec.m.setLngLat(j.at);
      const t = truckWorld(j.truckId);
      rec.el.querySelector("b")!.textContent = props.current.lens === "drivers" ? driverWorld(j.driverId).name : t.plate;
      const fv = (j as LiveJob & { fuel?: FuelView | null }).fuel;
      rec.el.querySelector("i")!.textContent =
        props.current.lens === "fuel" && fv
          ? `${Math.round((litresAt(fv, j.km) / fv.tankL) * 100)}% · ${Math.round(litresAt(fv, j.km))} L`
          : `${j.activity} · ${tense === "now" ? "simulado" : tense === "future" ? "projeção" : "reconstituição"}`;
      rec.el.dataset.fuel = fv ? String(Math.round((litresAt(fv, j.km) / fv.tankL) * 100)) : "";
      (rec.el.querySelector(".pin-arrow") as HTMLElement).style.transform = `rotate(${j.heading}deg)`;
      rec.el.dataset.tone = j.tone;
      rec.el.dataset.moving = String(j.moving);
      rec.el.dataset.state = openId === j.id ? "open" : openId ? "recede" : hoverId === j.id ? "hover" : "rest";
    }
  }

  /** Selected corridor: ink behind the truck, vermilion ahead with light flowing toward the destination. */
  function focusLines() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { jobs, openId } = props.current;
    const j = jobs.find((x) => x.id === openId);
    const done = j ? Math.min(revealKm.current, j.km) : 0;
    put("done", fc(j && done > 0.5 ? [line(sliceKm(j.route, 0, done))] : []));
    const end = j ? Math.min(revealKm.current, j.route.km) : 0;
    put("ahead", 
      fc(j && end - j.km > 0.5 && revealKm.current >= j.route.km - 0.5 ? [line(sliceKm(j.route, j.km, j.route.km))] : []),
    );
  }

  // Flowing light along the remaining corridor (finite pattern, cycled while a job is open).
  useEffect(() => {
    const m = map.current;
    if (!m || !p.openId || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seq = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ];
    let i = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 55 && ready.current) {
        last = now;
        i = (i + 1) % seq.length;
        try {
          m.setPaintProperty("flow", "line-dasharray", seq[i]);
        } catch {
          /* style not ready */
        }
      }
      flow.current = requestAnimationFrame(tick);
    };
    flow.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(flow.current);
  }, [p.openId]);

  // Lens extras: free drivers, free trucks, parked trailers. Re-created per lens (finite set).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      extraMarkers.current.forEach((x) => x.remove());
      extraMarkers.current = p.extras.map((x, i) => {
        const el = document.createElement("div");
        el.className = "xpin";
        el.dataset.kind = x.kind;
        if (x.state) el.dataset.state = x.state;
        el.style.animationDelay = `${i * 60}ms`;
        el.innerHTML = `<span class="xpin-dot"></span><span class="xpin-tag"><b></b><i></i></span>`;
        el.querySelector("b")!.textContent = x.label;
        el.querySelector("i")!.textContent = x.sub;
        if (x.station) {
          el.style.cursor = "pointer";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            props.current.onStation?.(x.station!);
          });
        }
        return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(x.at).addTo(m);
      });
    };
    if (ready.current) apply();
    else m.once("load", apply);
    return () => {
      extraMarkers.current.forEach((x) => x.remove());
      extraMarkers.current = [];
    };
  }, [p.extras]);

  // Data/hover/selection overlays.
  useEffect(sync);

  // Selection framing + route reveal.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const go = () => {
      const { jobs, openId, panelWidth } = props.current;
      const j = jobs.find((x) => x.id === openId);
      cancelAnimationFrame(reveal.current);
      labels.current.forEach((x) => x.remove());
      labels.current = [];
      revealKm.current = 0;
      if (!j) {
        put("focus", fc([]));
        put("done", fc([]));
        put("ahead", fc([]));
        put("stops", fc([]));
        if (!props.current.spot) m.fitBounds(PT(), { padding: pad(panelWidth, false, props.current.side), duration: 1000, essential: true });
        return;
      }
      const b = new maplibregl.LngLatBounds();
      j.route.line.forEach((pt) => b.extend(pt));
      if (!props.current.follow && !props.current.spot) m.fitBounds(b, { padding: pad(panelWidth, true), duration: 1100, essential: true, maxZoom: 9.5 });
      const pts = j.stops.map((s, i) =>
        i === 0 ? j.route.line[0] : i === j.stops.length - 1 ? j.route.line.at(-1)! : nearest(j.route, s.km * j.scale),
      );
      put("stops", 
        fc(
          j.stops.map((_, i) => ({
            type: "Feature",
            properties: { end: i === 0 || i === j.stops.length - 1 },
            geometry: { type: "Point", coordinates: pts[i] },
          })),
        ),
      );
      labels.current = j.stops.map((s, i) => {
        const el = document.createElement("div");
        el.className = "stop-label";
        el.style.animationDelay = `${300 + (i / Math.max(1, j.stops.length - 1)) * 1000}ms`;
        el.innerHTML = `<b>${s.city}</b><span>${s.type === "pickup" ? "Carga" : s.type === "delivery" ? "Entrega" : "Paragem"} · ${s.window[0]}–${s.window[1]}</span>`;
        return new maplibregl.Marker({ element: el, anchor: "top", offset: [0, 10] }).setLngLat(pts[i]).addTo(m);
      });
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      const D = reduced ? 1 : 1300;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / D);
        const e = 1 - Math.pow(1 - k, 3);
        const km = Math.max(0.5, e * j.route.km);
        revealKm.current = km;
        put("focus", fc([line(sliceKm(j.route, 0, km))]));
        focusLines();
        if (k < 1) reveal.current = requestAnimationFrame(step);
      };
      reveal.current = requestAnimationFrame(step);
    };
    if (ready.current) go();
    else m.once("load", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.openId, geometryKey(p.jobs.find((j) => j.id === p.openId)), p.side, p.follow, !!p.spot]);

  // The layout widened or narrowed around the open transport: keep its corridor in the free map area.
  const widthSeen = useRef(p.panelWidth);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || widthSeen.current === p.panelWidth) return;
    widthSeen.current = p.panelWidth;
    const j = p.jobs.find((x) => x.id === p.openId);
    if (!j || p.follow || p.spot || p.planRoutes.length) return;
    const b = new maplibregl.LngLatBounds();
    j.route.line.forEach((pt) => b.extend(pt));
    m.fitBounds(b, { padding: pad(p.panelWidth, true), duration: 700, essential: true, maxZoom: 9.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.panelWidth]);

  // Base style switch: overlays are re-installed with their data on "style.load".
  useEffect(() => {
    const m = map.current;
    if (!m || styleNow.current === p.mapStyle) return;
    styleNow.current = p.mapStyle;
    ready.current = false;
    m.setStyle(styleFor(p.mapStyle), { diff: false });
  }, [p.mapStyle]);

  // TomTom live traffic flow over any base.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !m.getLayer("traffic")) return;
    m.setLayoutProperty("traffic", "visibility", p.traffic ? "visible" : "none");
  }, [p.traffic]);

  // Follow: the camera rides with the open transport, close enough to read the streets.
  const followed = p.follow && !p.spot ? p.jobs.find((j) => j.id === p.openId) : undefined;
  const followKey = followed ? followed.at.map((x) => x.toFixed(5)).join(",") : "";
  const followed0 = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !followed) {
      followed0.current = false;
      return;
    }
    const first = !followed0.current;
    followed0.current = true;
    const opts = { center: followed.at, padding: pad(props.current.panelWidth, true), essential: true };
    if (first) m.flyTo({ ...opts, zoom: 13.6, duration: 1600 });
    else m.easeTo({ ...opts, duration: 1800, easing: (k: number) => k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followKey, p.openId]);

  // Spot: fly into one place (the pump of a refuel stop), on the satellite photo, with its facts.
  const spotSeen = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    const same = !!p.spot && spotSeen.current === p.spot.id;
    spotSeen.current = p.spot?.id ?? null;
    if (m?.getLayer("sat")) m.setLayoutProperty("sat", "visibility", p.spot ? "visible" : "none");
    put(
      "spot-area",
      fc(p.spot?.outline && p.spot.outline.length > 2 ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [p.spot.outline] } }] : []),
    );
    if (!same) {
      spotMarker.current?.remove();
      spotMarker.current = null;
    }
    if (!m || !p.spot) return;
    if (!spotMarker.current) {
      const el = document.createElement("div");
      el.className = "spot";
      el.dataset.kind = p.spot.kind ?? "fuel";
      el.innerHTML = `<span class="spot-ring"></span><span class="spot-pump" aria-hidden="true"></span><div class="spot-card"><b></b><ul></ul></div>`;
      spotMarker.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(p.spot.at).addTo(m);
    }
    const el = spotMarker.current.getElement();
    if (p.spot.uncertain) el.dataset.uncertain = "";
    else delete el.dataset.uncertain;
    el.querySelector("b")!.textContent = p.spot.title;
    el.querySelector("ul")!.replaceChildren(
      ...p.spot.lines.map((l) => {
        const li = document.createElement("li");
        li.textContent = l;
        return li;
      }),
    );
    spotMarker.current.setLngLat(p.spot.at);
    const opts = { center: p.spot.at, padding: pad(props.current.panelWidth, true), essential: true };
    if (same) m.easeTo({ ...opts, zoom: 18, duration: 900 });
    else m.flyTo({ ...opts, zoom: 18, duration: 2400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.spot?.id, p.spot?.at.join(","), p.spot?.lines.length, p.spot?.outline?.length, p.spot?.uncertain]);


  // Alternative route + candidate driver link (previews only).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    put("alt", fc(p.altRoute ? [line(p.altRoute.line)] : []));
    const j = p.jobs.find((x) => x.id === p.openId);
    put("link", fc(p.candidate && j ? [line([p.candidate.at, j.at])] : []));
    cand.current?.remove();
    cand.current = null;
    if (p.candidate && j) {
      const el = document.createElement("div");
      el.className = "cand";
      el.innerHTML = `<span class="cand-dot"></span><span class="cand-tag"></span>`;
      el.querySelector(".cand-tag")!.textContent = p.candidate.name;
      cand.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(p.candidate.at).addTo(m);
    }
  }, [p.altRoute, p.candidate, p.openId, p.jobs]);

  // Planning session routes (real TomTom geometry) + framing on the selected one.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    put("plan", fc(p.planRoutes.map((r) => line(r.line, { id: r.id, selected: r.selected, empty: r.kind === "EMPTY" }))));
    const framed = p.planRoutes.some((r) => r.kind) ? p.planRoutes : p.planRoutes.filter((r) => r.selected).slice(0, 1);
    if (framed.length) {
      const b = new maplibregl.LngLatBounds();
      framed.forEach((r) => r.line.forEach((pt) => b.extend(pt)));
      m.fitBounds(b, { padding: pad(props.current.panelWidth, true), duration: 900, maxZoom: 10 });
    }
  }, [p.planRoutes]);

  // Fuel stations: coloured by price within the shown set (green cheapest, red dearest).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const ps = p.stations.map((x) => x.price);
      const lo = Math.min(...ps);
      const hi = Math.max(...ps);
      put("fuel-st", 
        fc(
          p.stations.map((x) => ({
            type: "Feature",
            properties: { id: x.id, k: hi > lo ? (x.price - lo) / (hi - lo) : 0.5, price: x.price, name: x.name },
            geometry: { type: "Point", coordinates: x.at },
          })),
        ),
      );
    };
    if (ready.current) apply();
    else m.once("load", apply);
  }, [p.stations]);

  // Confirmation: a finite ring travels out from the affected transport.
  useEffect(() => {
    if (!p.pulse || !p.openId) return;
    const el = markers.current.get(p.openId)?.el;
    if (!el) return;
    el.classList.remove("pin-pulse");
    void el.offsetWidth;
    el.classList.add("pin-pulse");
  }, [p.pulse, p.openId]);

  return <div ref={host} className="stage" aria-label="Mapa de operação" />;
}

/** Identity of a corridor's drawn geometry: same id can carry a new (confirmed) road route. */
function geometryKey(j: { route: RecordedRoute } | undefined) {
  if (!j) return "";
  const l = j.route.line;
  return `${j.route.id}:${l.length}:${Math.round(j.route.km)}:${l[Math.floor(l.length / 2)]?.join(",")}`;
}

function nearest(route: RecordedRoute, km: number): Point {
  const i = Math.max(0, route.cum.findIndex((c) => c >= km));
  return route.line[i] ?? route.line.at(-1)!;
}
