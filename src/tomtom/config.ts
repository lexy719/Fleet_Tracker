/** TomTom API bases — see https://docs.tomtom.com/ */

/**
 * Base URL for TomTom REST APIs called via `fetch` (Search, Routing, etc.).
 * - In Vite dev, defaults to `/api/tomtom` so requests are same-origin and the dev server proxies to api.tomtom.com (avoids CORS "Failed to fetch" on localhost).
 * - In production, defaults to `https://api.tomtom.com` unless `VITE_TOMTOM_REST_BASE` is set (e.g. your own proxy path).
 */
export function getTomTomRestBase(): string {
  if (typeof window === "undefined") return "https://api.tomtom.com";
  const fromEnv = import.meta.env.VITE_TOMTOM_REST_BASE as string | undefined;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "/api/tomtom";
  }
  return "https://api.tomtom.com";
}

export function getTomTomKey(): string | undefined {
  const k = import.meta.env.VITE_TOMTOM_API_KEY;
  const key = typeof k === "string" ? k.trim() : "";
  return key.length > 0 ? key : undefined;
}

/**
 * TomTom Map Styles v2 — custom style from Map Maker.
 * Use with MapLibre (`@maplibre/maplibre-gl-leaflet`), not as a Leaflet raster `TileLayer` URL.
 * @see https://developer.tomtom.com/map-maker/documentation/cloud-styles/using-style-in-the-application
 */
export function tomTomMapStyleUrl(key: string): string | null {
  const configured = import.meta.env.VITE_TOMTOM_CUSTOM_STYLE_ID as string | undefined;
  return configured?.trim()
    ? `https://api.tomtom.com/style/2/custom/style/${encodeURIComponent(configured.trim())}.json?key=${encodeURIComponent(key)}`
    : null;
}

export const TOMTOM = {
  /** Traffic API — relative flow overlay (raster; stays on Leaflet `TileLayer`) */
  trafficFlow: (key: string) =>
    `https://api.tomtom.com/traffic/map/4/tileflow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
  attribution:
    '&copy; <a href="https://www.tomtom.com" target="_blank" rel="noreferrer">TomTom</a>',
} as const;
