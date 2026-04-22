import clsx from "clsx";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { Info, Layers, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useJobs } from "../../context/JobsContext";
import { countOperationalJobsOnTruck, primaryOperationalJob } from "../../lib/jobOperational";
import { routeHealthCategory, type RouteHealth } from "../../data/routeHealth";
import type { Route as FleetRoute, Truck } from "../../data/types";
import { getTomTomKey, TOMTOM } from "../../tomtom/config";
import { loadFleetRoutePolylines } from "../../tomtom/routing";
import { MapLibreTomTomLayer } from "./MapLibreTomTomLayer";
import { MapResizeHandler } from "./MapResizeHandler";
import { PopupAddress } from "./PopupAddress";

function ClearFocusOnMapClick({ active, onClear }: { active: boolean; onClear: () => void }) {
  useMapEvents({
    click: () => {
      if (active) onClear();
    },
  });
  return null;
}

/** Centra o mapa na viatura quando a seleção muda (deep link / lista). */
function FlyToSelectedTruck({
  truckId,
  trucks,
}: {
  truckId: string | null | undefined;
  trucks: Truck[];
}) {
  const map = useMap();
  useEffect(() => {
    if (!truckId) return;
    const t = trucks.find((x) => x.id === truckId);
    if (!t) return;
    const z = Math.max(map.getZoom(), 9);
    map.flyTo([t.lat, t.lng], z, { duration: 0.45 });
  }, [truckId, trucks, map]);
  return null;
}

function useLeafletIconFix() {
  useEffect(() => {
    const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
    delete proto._getIconUrl;
    L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
  }, []);
}

function FitBounds({
  trucks,
  routes,
  polylines,
}: {
  trucks: Truck[];
  routes: FleetRoute[];
  polylines: Record<string, [number, number][]>;
}) {
  const map = useMap();
  useEffect(() => {
    const pts: L.LatLngExpression[] = [];
    trucks.forEach((t) => pts.push([t.lat, t.lng]));
    routes.forEach((r) => {
      const poly = polylines[r.id] ?? r.polyline;
      poly.forEach((p) => pts.push(p));
    });
    if (pts.length === 0) return;
    const b = L.latLngBounds(pts);
    map.fitBounds(b, { padding: [48, 48], maxZoom: 11 });
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [map, trucks, routes, polylines]);
  return null;
}

function truckIcon(status: Truck["status"], selected: boolean, headingDeg: number) {
  const color =
    status === "delayed" || status === "maintenance"
      ? "#f59e0b"
      : status === "idle" || status === "loading"
        ? "#64748b"
        : "#22c55e";
  const ring = selected ? "0 0 0 3px rgba(45,95,78,0.95)" : "none";
  const rot = Number.isFinite(headingDeg) ? headingDeg : 0;
  return L.divIcon({
    className: "fleet-truck-marker",
    html: `<div style="width:32px;height:32px;border-radius:10px;background:${color};box-shadow:${ring};border:2px solid #0f172a;display:flex;align-items:center;justify-content:center;font-size:15px;transform:rotate(${rot}deg);transition:transform 0.2s;">🚛</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const HEALTH_COLORS: Record<RouteHealth, string> = {
  delayed: "#dc2626",
  at_risk: "#d97706",
  on_time: "#16a34a",
};

export function FleetMap({
  trucks,
  routes,
  selectedTruckId,
  onSelectTruck,
  showRoutes = true,
  heightClassName = "h-[min(72vh,640px)]",
  embed = false,
  className,
  /** Filter map to one health bucket; `all` shows every active route with color coding. */
  healthFilter = "all",
}: {
  trucks: Truck[];
  routes: FleetRoute[];
  selectedTruckId?: string | null;
  onSelectTruck?: (id: string | null) => void;
  showRoutes?: boolean;
  heightClassName?: string;
  /** Full-bleed map (no rounded card) for operations layout */
  embed?: boolean;
  className?: string;
  healthFilter?: "all" | RouteHealth;
}) {
  useLeafletIconFix();

  const { jobs } = useJobs();
  const apiKey = getTomTomKey();
  const [trafficOn, setTrafficOn] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendWrapRef = useRef<HTMLDivElement>(null);
  const [polylines, setPolylines] = useState<Record<string, [number, number][]> | null>(null);
  const [routingStatus, setRoutingStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  useEffect(() => {
    if (!legendOpen) return;
    const close = (e: MouseEvent) => {
      if (legendWrapRef.current && !legendWrapRef.current.contains(e.target as Node)) setLegendOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [legendOpen]);

  useEffect(() => {
    if (!apiKey) {
      setPolylines(null);
      setRoutingStatus("idle");
      return;
    }
    let cancelled = false;
    setRoutingStatus("loading");
    loadFleetRoutePolylines(apiKey, routes)
      .then((m) => {
        if (!cancelled) {
          setPolylines(m);
          setRoutingStatus("ok");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPolylines(null);
          setRoutingStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, routes]);

  const resolvedPolylines = useMemo(() => {
    const base: Record<string, [number, number][]> = {};
    for (const r of routes) {
      base[r.id] = polylines?.[r.id] ?? r.polyline;
    }
    return base;
  }, [routes, polylines]);

  const center = useMemo((): [number, number] => {
    const t = trucks[0];
    return t ? [t.lat, t.lng] : [40.2, -8.4];
  }, [trucks]);

  const routeByTruck = useMemo(() => {
    const m = new Map<string, FleetRoute>();
    routes.forEach((r) => m.set(r.truckId, r));
    return m;
  }, [routes]);

  const routesForMap = useMemo(() => {
    if (healthFilter === "all") return routes;
    const f = routes.filter((r) => routeHealthCategory(r) === healthFilter);
    return f;
  }, [routes, healthFilter]);

  const trucksForMap = useMemo(() => {
    if (healthFilter === "all") return trucks;
    const ids = new Set(routesForMap.map((r) => r.truckId));
    return trucks.filter((t) => ids.has(t.id));
  }, [trucks, routesForMap, healthFilter]);

  const [focusedTruckId, setFocusedTruckId] = useState<string | null>(selectedTruckId ?? null);

  useEffect(() => {
    if (selectedTruckId !== undefined) {
      setFocusedTruckId(selectedTruckId);
    }
  }, [selectedTruckId]);

  const orderedRoutesForMap = useMemo(() => {
    const list = [...routesForMap];
    if (!focusedTruckId) return list;
    const ix = list.findIndex((r) => r.truckId === focusedTruckId);
    if (ix <= 0) return list;
    const [row] = list.splice(ix, 1);
    list.push(row);
    return list;
  }, [routesForMap, focusedTruckId]);

  const stopMarkers = useMemo(() => {
    if (!focusedTruckId) {
      return routesForMap.flatMap((r) => r.stops.map((s) => ({ stop: s, routeId: r.id })));
    }
    const r = routesForMap.find((rt) => rt.truckId === focusedTruckId);
    return r ? r.stops.map((s) => ({ stop: s, routeId: r.id })) : [];
  }, [routesForMap, focusedTruckId]);

  const trafficUrl = apiKey ? TOMTOM.trafficFlow(apiKey) : "";

  return (
    <div
      className={clsx(
        "relative flex w-full min-w-0 flex-col overflow-hidden",
        embed ? "h-full min-h-[200px] flex-1 flex-col border-0 lg:min-h-0" : `rounded-xl border ${heightClassName}`,
        className,
      )}
      style={!embed ? { borderColor: "var(--app-border)" } : undefined}
    >
      <MapContainer
        center={center}
        zoom={7}
        maxBounds={[
          [35.0, -10.5],
          [44.5, 5.2],
        ]}
        maxBoundsViscosity={0.85}
        className="z-0 h-full w-full min-h-0 flex-1 [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-0"
        style={{ height: "100%", width: "100%", minHeight: "100%" }}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
      >
        <MapResizeHandler />
        <ClearFocusOnMapClick
          active={!!focusedTruckId}
          onClear={() => {
            setFocusedTruckId(null);
            onSelectTruck?.(null);
          }}
        />
        <FlyToSelectedTruck truckId={selectedTruckId ?? focusedTruckId} trucks={trucksForMap} />
        {apiKey ? (
          <MapLibreTomTomLayer apiKey={apiKey} />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={22}
          />
        )}
        {apiKey && trafficOn && trafficUrl ? (
          <TileLayer url={trafficUrl} opacity={0.55} maxZoom={22} zIndex={400} />
        ) : null}
        <FitBounds trucks={trucksForMap} routes={routesForMap} polylines={resolvedPolylines} />

        {showRoutes
          ? orderedRoutesForMap.map((r) => {
              const dim = !!focusedTruckId && r.truckId !== focusedTruckId;
              if (!dim) return null;
              const h = routeHealthCategory(r);
              return (
                <Polyline
                  key={`${r.id}-bg`}
                  positions={resolvedPolylines[r.id] ?? r.polyline}
                  pathOptions={{
                    color: HEALTH_COLORS[h],
                    weight: 3,
                    opacity: 0.22,
                    dashArray: "5 12",
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              );
            })
          : null}

        {showRoutes
          ? orderedRoutesForMap.map((r) => {
              const dim = !!focusedTruckId && r.truckId !== focusedTruckId;
              if (dim) return null;
              const h = routeHealthCategory(r);
              const color = HEALTH_COLORS[h];
              const positions = resolvedPolylines[r.id] ?? r.polyline;
              const focus = focusedTruckId === r.truckId;
              return (
                <Fragment key={r.id}>
                  {focus ? (
                    <Polyline
                      positions={positions}
                      pathOptions={{
                        color: "rgba(15,23,42,0.85)",
                        weight: 12,
                        opacity: 0.35,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  ) : null}
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color,
                      weight: focus ? 7 : healthFilter === "all" ? 6 : 7,
                      opacity: focus ? 0.98 : healthFilter === "all" ? 0.9 : 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </Fragment>
              );
            })
          : null}

        {stopMarkers.map(({ stop: s, routeId }) => (
          <Marker key={`${routeId}-${s.id}`} position={[s.lat, s.lng]}>
            <Popup>
              <div className="min-w-[180px] text-sm">
                <div className="font-semibold">{s.name}</div>
                <PopupAddress apiKey={apiKey} lat={s.lat} lng={s.lng} />
                <div className="mt-1 text-xs" style={{ color: "#6B6B6B" }}>
                  {s.type === "pickup" ? "Levantamento" : s.type === "delivery" ? "Entrega" : s.type === "fuel" ? "Combustível" : s.type} · ETA {s.eta}
                  {s.delayMin > 0 ? ` · +${s.delayMin} min` : ""}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {trucksForMap.map((t) => {
          const rt = routeByTruck.get(t.id);
          const opCount = countOperationalJobsOnTruck(jobs, t.id);
          const primaryJob = primaryOperationalJob(jobs, t.id);
          return (
            <Marker
              key={t.id}
              position={[t.lat, t.lng]}
              icon={truckIcon(t.status, selectedTruckId === t.id || focusedTruckId === t.id, t.headingDeg ?? 0)}
              eventHandlers={{
                click: () => {
                  onSelectTruck?.(t.id);
                  setFocusedTruckId(t.id);
                },
              }}
            >
              <Popup>
                <div className="min-w-[200px] text-sm">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs" style={{ color: "#6B6B6B" }}>{t.plate}</div>
                  <PopupAddress apiKey={apiKey} lat={t.lat} lng={t.lng} />
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <span style={{ color: "#6B6B6B" }}>Estado</span>
                    <span className="font-medium capitalize">{t.status.replace("_", " ")}</span>
                    <span style={{ color: "#6B6B6B" }}>Combustível</span>
                    <span className="font-medium">{t.fuelPct}%</span>
                    <span style={{ color: "#6B6B6B" }}>Carga</span>
                    <span className="font-medium">
                      {(t.currentWeightKg / 1000).toFixed(1)} t / {(t.maxWeightKg / 1000).toFixed(1)} t
                    </span>
                  </div>
                  {primaryJob ? (
                    <div className="mt-2 rounded-lg border p-2 text-xs" style={{ borderColor: "#2D5F4E30", background: "#E8F0EC" }}>
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#2D5F4E" }}>
                        Trabalho em curso{opCount > 1 ? ` (${opCount} nesta viatura)` : ""}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold" style={{ color: "#2D5F4E" }}>{primaryJob.id}</span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: primaryJob.slaStatus === "breached" ? "#F6E3DE" : primaryJob.slaStatus === "at_risk" ? "#FBF3DD" : "#E8F0EC",
                            color: primaryJob.slaStatus === "breached" ? "#A84432" : primaryJob.slaStatus === "at_risk" ? "#8B6F47" : "#2D5F4E",
                          }}
                        >
                          {primaryJob.slaStatus === "breached" ? "SLA violado" : primaryJob.slaStatus === "at_risk" ? "SLA em risco" : "No prazo"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-medium" style={{ color: "#1A1A1A" }}>{primaryJob.client}</div>
                      <div className="mt-1">
                        <Link
                          to={`/app/jobs?job=${primaryJob.id}`}
                          className="text-[10px] font-semibold underline"
                          style={{ color: "#2D5F4E" }}
                        >
                          Ver trabalho →
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  {rt ? (
                    <div className="mt-2 border-t pt-2 text-xs" style={{ borderColor: "#E8E6E0" }}>
                      <span style={{ color: "#6B6B6B" }}>Rota · </span>
                      {rt.name}
                    </div>
                  ) : null}
                  {rt ? (
                    <p className="mt-2 text-[11px] leading-snug" style={{ color: "#6B6B6B" }}>
                      Toque no mapa vazio para limpar o foco da rota.
                    </p>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legal attribution — compact, single line */}
      <div className="pointer-events-none absolute bottom-1 right-2 z-[1000] select-none text-[9px] leading-none text-black/40">
        <a href="https://leafletjs.com" target="_blank" rel="noreferrer" className="pointer-events-auto hover:text-black/70">Leaflet</a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="pointer-events-auto hover:text-black/70">© OpenStreetMap</a>
        {apiKey ? " · © TomTom" : ""}
      </div>

      {healthFilter !== "all" && routesForMap.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[300] flex items-center justify-center" style={{ background: "rgba(26,26,26,0.12)" }}>
          <p className="rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg" style={{ background: "var(--app-card)", borderColor: "var(--app-border)", color: "var(--app-fg)" }}>
            Nenhuma rota ativa neste filtro
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        {routingStatus === "loading" ? (
          <div
            className="pointer-events-none inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium shadow-sm"
            style={{ background: "rgba(255,255,255,0.92)", borderColor: "var(--app-border)", color: "#6B6B6B" }}
          >
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            A calcular rotas…
          </div>
        ) : null}

        <div className="pointer-events-auto flex flex-wrap items-stretch gap-2">
          <div ref={legendWrapRef} className="relative">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold shadow-sm transition hover:opacity-90"
              style={{
                background: "rgba(255,255,255,0.96)",
                borderColor: "var(--app-border)",
                color: "var(--app-fg)",
              }}
              aria-expanded={legendOpen}
              aria-controls="fleet-map-legend"
            >
              <Info className="h-3.5 w-3.5 shrink-0" style={{ color: "#2D5F4E" }} />
              Legenda
            </button>
            {legendOpen ? (
              <div
                id="fleet-map-legend"
                className="absolute bottom-full left-0 z-[1100] mb-2 w-[min(100vw-2rem,17rem)] rounded-xl border px-3 py-2.5 text-[11px] shadow-xl"
                style={{
                  background: "rgba(23,40,32,0.96)",
                  borderColor: "rgba(45,95,78,0.45)",
                  color: "#D8ECE4",
                }}
              >
                <p className="mb-2 font-bold text-white">Cores da rota</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: "#16a34a" }} />
                    No prazo
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: "#d97706" }} />
                    Em risco
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: "#dc2626" }} />
                    Atraso / variância
                  </div>
                </div>
                <p className="mt-2 border-t pt-2 text-[10px] leading-snug" style={{ borderColor: "rgba(255,255,255,0.12)", color: "#82A898" }}>
                  Toque num camião para focar · toque no mapa vazio para limpar.
                </p>
                {apiKey ? (
                  <p className="mt-1.5 text-[10px] leading-snug" style={{ color: "#82A898" }}>
                    TomTom: linha cheia = rota em foco; tracejado = outras viaturas.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[10px] leading-snug" style={{ color: "#C8A049" }}>
                    OpenStreetMap (demo). <code className="text-[9px]">VITE_TOMTOM_API_KEY</code> para TomTom + tráfego.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {apiKey ? (
            <button
              type="button"
              onClick={() => setTrafficOn((v) => !v)}
              title={trafficOn ? "Desligar camada de tráfego" : "Ligar camada de tráfego"}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold shadow-sm transition hover:opacity-90"
              style={{
                background: trafficOn ? "rgba(232,240,236,0.98)" : "rgba(255,255,255,0.96)",
                borderColor: trafficOn ? "rgba(45,95,78,0.45)" : "var(--app-border)",
                color: trafficOn ? "#2D5F4E" : "var(--app-fg)",
              }}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              Tráfego {trafficOn ? "on" : "off"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
