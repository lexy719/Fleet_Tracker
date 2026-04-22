/**
 * Nominatim (OpenStreetMap) geocoder — free, no API key required.
 * Much better POI coverage for PT/ES than TomTom, especially rural areas.
 *
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 * — max 1 req/s, must send a meaningful User-Agent.
 */

const BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "PeninsulaLogistics/1.0 (fleet-tms-demo)";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
};

export type NominatimOptions = {
  /**
   * ISO-3166 alpha-2 country codes to restrict results (comma-separated).
   * Pass `null` to search worldwide — required for international shipments.
   * Defaults to `"pt,es"` for Iberian Peninsula searches.
   */
  countrycodes?: string | null;
  /**
   * Restrict results to a bounding box — pass `[lat, lng]` of the city centre
   * and a half-side in degrees (default 0.18° ≈ 18 km). Combined with
   * `bounded=1` this prevents Nominatim from drifting to a bigger city when
   * searching for a POI (e.g. "Pingo Doce, Vieira do Minho" → Braga).
   */
  nearCenter?: { lat: number; lng: number; halfDeg?: number };
};

export async function nominatimGeocode(
  query: string,
  options?: NominatimOptions,
): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;

  const params = new URLSearchParams({
    q,
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  // Only apply country restriction when explicitly requested.
  // Default: restrict to PT+ES for Iberian searches.
  // Pass countrycodes: null to search worldwide (international jobs).
  const cc = options && "countrycodes" in options ? options.countrycodes : "pt,es";
  if (cc) params.set("countrycodes", cc);

  if (options?.nearCenter) {
    const { lat, lng, halfDeg = 0.18 } = options.nearCenter;
    // viewbox = min_lng,max_lat,max_lng,min_lat  (west,north,east,south)
    params.set(
      "viewbox",
      `${lng - halfDeg},${lat + halfDeg},${lng + halfDeg},${lat - halfDeg}`,
    );
    params.set("bounded", "1");
  }

  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt,es,en",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NominatimResult[];
  const r = data[0];
  if (!r) return null;

  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}
