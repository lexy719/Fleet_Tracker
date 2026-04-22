import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { tomTomMapStyleUrl } from "../../tomtom/config";

/**
 * TomTom Map Maker style (Map Styles v2 JSON) as the basemap via MapLibre inside Leaflet.
 * Raster `tile/basic/main/...` cannot reproduce custom Map Maker themes.
 */
export function MapLibreTomTomLayer({ apiKey }: { apiKey: string }) {
  const map = useMap();

  useEffect(() => {
    const styleUrl = tomTomMapStyleUrl(apiKey);
    const layer = L.maplibreGL({
      style: styleUrl,
      interactive: false,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, apiKey]);

  return null;
}
