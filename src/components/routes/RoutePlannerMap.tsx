import clsx from "clsx";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { Fragment, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { CargoItem } from "../../data/types";
import { routeLineBaseColor, type RoutePlanOption, type RouteOptionId } from "../../tomtom/planRoutes";
import { getTomTomKey, TOMTOM } from "../../tomtom/config";
import { MapLibreTomTomLayer } from "../map/MapLibreTomTomLayer";
import { MapResizeHandler } from "../map/MapResizeHandler";

function useLeafletIconFix() {
  useEffect(() => {
    const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
    delete proto._getIconUrl;
    L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
  }, []);
}

const truckIcon = L.divIcon({
  className: "route-truck-marker",
  html: `<div style="width:22px;height:22px;border-radius:999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function markerColor(role: RouteMapMarker["role"]): string {
  if (role === "start") return "#059669";
  if (role === "finish") return "#dc2626";
  return "#2563eb";
}

function FitToShapes({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [72, 72], maxZoom: 12 });
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
  }, [map, points]);
  return null;
}

/** All routes visible; selected = thick + full opacity; others fade when a selection exists. */
function polylineStyle(
  o: RoutePlanOption,
  selectedId: RouteOptionId | null,
  hoveredRouteId: RouteOptionId | null,
): { weight: number; opacity: number } {
  const isSel = selectedId === o.id;
  const isHov = hoveredRouteId === o.id;
  const hasSel = selectedId != null;

  let weight = 3;
  let opacity = 0.5;
  if (isSel) {
    weight = 7;
    opacity = 1;
  } else if (hasSel) {
    weight = 2;
    opacity = 0.26;
  }
  if (isHov && !isSel) {
    weight = hasSel ? 4 : 5;
    opacity = hasSel ? 0.42 : 0.72;
  }
  if (isSel && isHov) {
    weight = 7;
    opacity = 1;
  }
  return { weight, opacity };
}

export type RouteMapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  role: "start" | "via" | "finish";
};

export function RoutePlannerMap({
  options,
  selectedId,
  hoveredRouteId,
  onRouteHover,
  onRouteLineClick,
  truck,
  markers,
  cargoByStopId,
  selectedMarkerId,
  onMarkerClick,
  className,
  /** Bottom comparison panel: adjusts legend so route lines stay readable above the drawer. */
  comparisonSheetInset,
}: {
  options: RoutePlanOption[];
  selectedId: RouteOptionId | null;
  /** Sync with route cards — hover highlights the matching polyline. */
  hoveredRouteId: RouteOptionId | null;
  onRouteHover: (id: RouteOptionId | null) => void;
  /** Click a route line to select it (same as card). */
  onRouteLineClick?: (id: RouteOptionId) => void;
  truck?: { lat: number; lng: number } | null;
  markers: RouteMapMarker[];
  cargoByStopId?: Record<string, CargoItem[]>;
  selectedMarkerId: string | null;
  onMarkerClick: (id: string) => void;
  className?: string;
  comparisonSheetInset?: "none" | "peek" | "expanded";
}) {
  useLeafletIconFix();
  const apiKey = getTomTomKey();
  const first = markers[0];
  const center: [number, number] = truck ? [truck.lat, truck.lng] : first ? [first.lat, first.lng] : [40.2, -8.4];

  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (truck) pts.push([truck.lat, truck.lng]);
    markers.forEach((s) => pts.push([s.lat, s.lng]));
    options.forEach((o) => o.polyline.forEach((p) => pts.push(p)));
    return pts;
  }, [truck, markers, options]);

  /** Draw unselected / non-highlighted routes first so the selected route stroke sits on top. */
  const routesRenderOrder = useMemo(() => {
    const valid = options.filter((o) => !o.error && o.polyline.length > 0);
    return [...valid].sort((a, b) => {
      const aSel = selectedId === a.id;
      const bSel = selectedId === b.id;
      if (aSel === bSel) return 0;
      return aSel ? 1 : -1;
    });
  }, [options, selectedId]);

  const roleTitle = (role: RouteMapMarker["role"]) => {
    if (role === "start") return "Origem";
    if (role === "finish") return "Destino";
    return "Paragem";
  };

  return (
    <div
      className={clsx(
        "relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border min-h-[200px] lg:min-h-0",
        "border-[var(--app-border)] bg-[var(--app-elevated)]",
        className,
      )}
    >
      <MapContainer
        center={center}
        zoom={7}
        className="z-0 h-full w-full min-h-0 flex-1 [&_.leaflet-container]:h-full [&_.leaflet-container]:min-h-0"
        style={{ height: "100%", width: "100%", minHeight: "100%" }}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
      >
        <MapResizeHandler />
        {apiKey ? (
          <MapLibreTomTomLayer apiKey={apiKey} />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={22}
          />
        )}
        {apiKey ? (
          <TileLayer url={TOMTOM.trafficFlow(apiKey)} opacity={0.45} maxZoom={22} zIndex={400} />
        ) : null}
        <FitToShapes points={allPoints} />

        {truck ? (
          <Marker position={[truck.lat, truck.lng]} icon={truckIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-slate-900">Posição da viatura</div>
                <p className="mt-1 text-xs text-slate-600">GPS em tempo real</p>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {(() => {
          let viaN = 0;
          return markers.map((s) => {
          const selected = selectedMarkerId === s.id;
          const cargo = cargoByStopId?.[s.id] ?? [];
          const col = markerColor(s.role);
          const badge =
            s.role === "start" ? "A" : s.role === "finish" ? "B" : `${++viaN}`;
          const pin = L.divIcon({
            className: "planner-pin",
            html: `<div style="width:26px;height:26px;border-radius:999px;background:${col};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);font-size:11px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;">${badge}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={pin}
              eventHandlers={{
                click: () => onMarkerClick(s.id),
              }}
              zIndexOffset={selected ? 700 : 400}
            >
              <Popup>
                <div className="min-w-[200px] max-w-[260px] text-sm">
                  <div className="font-semibold text-slate-900">
                    {roleTitle(s.role)} · {s.label || "Point"}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500">
                    {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                  </div>
                  {cargo.length > 0 ? (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cargo</div>
                      <ul className="mt-1 space-y-1">
                        {cargo.map((c) => (
                          <li key={c.id} className="text-xs text-slate-800">
                            <span className="font-mono text-[10px] text-slate-500">{c.sku}</span> · {c.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        });
        })()}

        {selectedMarkerId
          ? markers
              .filter((s) => s.id === selectedMarkerId)
              .map((s) => (
                <CircleMarker
                  key={`ring-${s.id}`}
                  center={[s.lat, s.lng]}
                  radius={20}
                  pathOptions={{
                    color: "#0d9488",
                    fillColor: "#14b8a6",
                    fillOpacity: 0.1,
                    weight: 3,
                  }}
                />
              ))
          : null}

        {routesRenderOrder.map((o) => {
          const color = routeLineBaseColor(o);
          const { weight, opacity } = polylineStyle(o, selectedId, hoveredRouteId);
          const isSel = selectedId === o.id;
          return (
            <Fragment key={o.id}>
              <Polyline
                positions={o.polyline}
                pathOptions={{
                  color: "#0f172a",
                  opacity: 0,
                  weight: 24,
                  lineCap: "round",
                  lineJoin: "round",
                  interactive: true,
                }}
                eventHandlers={{
                  mouseover: () => onRouteHover(o.id),
                  mouseout: () => onRouteHover(null),
                  click: () => onRouteLineClick?.(o.id),
                }}
              />
              <Polyline
                positions={o.polyline}
                pathOptions={{
                  color,
                  weight,
                  opacity,
                  lineCap: "round",
                  lineJoin: "round",
                  interactive: false,
                  className: isSel ? "route-plan-polyline-selected" : undefined,
                }}
              />
            </Fragment>
          );
        })}
      </MapContainer>
      {/* Legal attribution — compact, single line, styled to match app */}
      <div className="pointer-events-none absolute bottom-1 right-2 z-[1000] select-none text-[9px] leading-none text-black/40">
        <a href="https://leafletjs.com" target="_blank" rel="noreferrer" className="pointer-events-auto hover:text-black/70">Leaflet</a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="pointer-events-auto hover:text-black/70">© OpenStreetMap</a>
        {apiKey ? " · © TomTom" : ""}
      </div>

      <div
        className={clsx(
          "pointer-events-none absolute left-3 flex flex-wrap gap-2 rounded-xl border px-3 py-2 text-[10px] shadow-sm",
          "border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-muted)]",
          comparisonSheetInset === "expanded"
            ? "bottom-[max(7rem,min(38vh,24rem))]"
            : comparisonSheetInset === "peek"
              ? "bottom-[5.25rem]"
              : "bottom-3",
        )}
      >
        {options
          .filter((o) => !o.error && o.polyline.length > 0)
          // Show same 3 meaningful options as the right-panel cards
          .filter((o, _, arr) => {
            const r = o.comparisonRole;
            if (r === "fastest" || r === "lowest_toll" || r === "most_fuel" || r === "single") return true;
            return o.id === arr.find((x) => x.comparisonRole === "other")?.id;
          })
          .map((o) => {
            const label = (() => {
              switch (o.comparisonRole) {
                case "fastest":     return "Mais rápida";
                case "lowest_toll": return "Menos portagem";
                case "most_fuel":   return "Mais eficiente";
                case "single":      return "Rota disponível";
                default:            return "Alternativa";
              }
            })();
            return (
              <span key={o.id} className="inline-flex max-w-[160px] items-center gap-1.5" title={label}>
                <span
                  className="h-2 w-4 shrink-0 rounded-sm"
                  style={{ background: routeLineBaseColor(o) }}
                />
                <span className="truncate">{label}</span>
              </span>
            );
          })}
        {truck ? (
          <span
            className="inline-flex items-center gap-1.5 border-l pl-2"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Viatura
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 border-l pl-2 text-[9px]"
            style={{ borderColor: "var(--app-border)" }}
          >
            A origem · via · B destino
          </span>
        )}
      </div>
    </div>
  );
}
