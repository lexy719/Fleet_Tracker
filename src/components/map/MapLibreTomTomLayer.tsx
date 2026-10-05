import L from "leaflet";
import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { tomTomMapStyleUrl } from "../../tomtom/config";

type GlLayer = L.MaplibreGL & {
  _glMap?: unknown;
  _container?: HTMLElement;
  _throttledUpdate?: () => void;
  options: { updateInterval?: number };
};

/** Library methods that dereference the GL map (see @maplibre/maplibre-gl-leaflet). */
const GL_METHODS = ["_update", "_pinchZoom", "_animateZoom", "_zoomEnd", "_transitionEnd", "_resize"] as const;

/**
 * The library assumes its GL map always exists: onRemove calls `_glMap.remove()` and the
 * (throttled) move/zoom handlers dereference `_glMap`. When MapLibre failed to start (no
 * WebGL, context limit) or a throttled update fires after removal, that throws and takes
 * the app down. Make every GL-touching method a no-op without a GL map, and rebuild the
 * throttle (it captured the original `_update` in the constructor).
 */
function hardenGlLayer(layer: GlLayer): void {
  const methods = layer as unknown as Record<string, unknown>;
  for (const name of GL_METHODS) {
    const fn = methods[name];
    if (typeof fn !== "function") continue;
    methods[name] = function (this: GlLayer, ...args: unknown[]) {
      return this._glMap ? (fn as (...a: unknown[]) => unknown).apply(this, args) : undefined;
    };
  }
  layer._throttledUpdate = L.Util.throttle(methods._update as () => void, layer.options.updateInterval ?? 32, layer);
  const originalOnRemove = layer.onRemove.bind(layer);
  layer.onRemove = function (this: GlLayer, m: L.Map) {
    if (this._glMap) return originalOnRemove(m);
    this._container?.remove();
    return this;
  };
}

/**
 * TomTom Map Maker style (Map Styles v2 JSON) as the basemap via MapLibre inside Leaflet.
 * Raster `tile/basic/main/...` cannot reproduce custom Map Maker themes.
 *
 * Falls back to OpenStreetMap tiles when MapLibre cannot start (no WebGL / context limit)
 * or the style cannot be loaded (e.g. 404 for a key without access to the custom style).
 */
export function MapLibreTomTomLayer({ apiKey }: { apiKey: string }) {
  const map = useMap();
  const [failed, setFailed] = useState(false);

  const styleUrl = tomTomMapStyleUrl(apiKey);
  useEffect(() => {
    if (failed || !styleUrl) return;
    const layer = L.maplibreGL({ style: styleUrl, interactive: false }) as GlLayer;
    hardenGlLayer(layer);

    try {
      layer.addTo(map);
      const gl = layer.getMaplibreMap();
      if (!gl) throw new Error("MapLibre map not created");
      let loaded = false;
      gl.once("load", () => {
        loaded = true;
      });
      gl.on("error", () => {
        if (!loaded) {
          console.warn("[MapLibreTomTomLayer] style failed to load — falling back to OpenStreetMap");
          setFailed(true);
        }
      });
    } catch (e) {
      console.warn("[MapLibreTomTomLayer] MapLibre unavailable — falling back to OpenStreetMap", e);
      setFailed(true);
    }

    return () => {
      try {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      } catch (e) {
        console.warn("[MapLibreTomTomLayer] cleanup failed", e);
      }
    };
  }, [map, styleUrl, failed]);

  if (!failed && styleUrl) return null;
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}
