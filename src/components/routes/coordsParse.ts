/** Parse and validate WGS84 lat/lng for EU-focused planner */

export type CoordsParseResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; error: string };

export function parseLatLngStrings(latStr: string, lngStr: string): CoordsParseResult {
  const lat = Number(String(latStr).trim().replace(",", "."));
  const lng = Number(String(lngStr).trim().replace(",", "."));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, error: "Enter valid numbers for latitude and longitude." };
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude must be between −90 and 90." };
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, error: "Longitude must be between −180 and 180." };
  }
  return { ok: true, lat, lng };
}

/** Optional single-line "lat, lng" or "lat lng" */
export function parseCoordPairLine(line: string): CoordsParseResult {
  const t = line.trim();
  if (!t) return { ok: false, error: "Enter coordinates." };
  const parts = t.split(/[\s,;]+/).filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, error: "Use two values: latitude and longitude (e.g. 41.545, -8.426)." };
  }
  return parseLatLngStrings(parts[0]!, parts[1]!);
}
