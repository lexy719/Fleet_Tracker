import type { GeocodeHit } from "./geocodeTypes";

type LatLonish = { lat?: unknown; lon?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };

/** Raw TomTom Fuzzy Search result (subset of fields we use). */
export type TomTomSearchResult = {
  id?: string;
  /** e.g. POI, Geography, Street, Point Address */
  type?: string;
  position?: LatLonish;
  /** When the main result has no point, TomTom often still provides entry points (POI / some streets). */
  entryPoints?: { position?: LatLonish }[];
  /** Bounding box — we use the center if no point position exists (some Area / Street responses). */
  viewport?: {
    topLeftPoint?: LatLonish;
    btmRightPoint?: LatLonish;
  };
  /** Street segment endpoints — use midpoint if no other position. */
  addressRanges?: {
    from?: LatLonish;
    to?: LatLonish;
  };
  address?: {
    freeformAddress?: string;
    streetNumber?: string;
    streetName?: string;
    localName?: string;
    municipality?: string;
    municipalitySubdivision?: string;
    countrySubdivision?: string;
    country?: string;
    countryCode?: string;
  };
  poi?: { name?: string };
};

function countryFromCode(code?: string): string | undefined {
  if (!code || typeof code !== "string") return undefined;
  const u = code.trim().toUpperCase();
  if (u === "PT" || u === "PRT") return "Portugal";
  if (u === "ES" || u === "ESP") return "Spain";
  return undefined;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function numCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Resolve a lat/lon from TomTom's various shapes (lon vs lng, string numbers, fallbacks). */
export function extractPosition(r: TomTomSearchResult): { lat: number; lon: number } | null {
  const fromPoint = (p: LatLonish | undefined): { lat: number; lon: number } | null => {
    if (!p) return null;
    const lat = numCoord(p.lat ?? p.latitude);
    const lon = numCoord(p.lon ?? p.lng ?? p.longitude);
    if (lat != null && lon != null) return { lat, lon };
    return null;
  };

  const direct =
    fromPoint(r.position) ??
    fromPoint(r.entryPoints?.[0]?.position) ??
    fromPoint(r.addressRanges?.from) ??
    fromPoint(r.addressRanges?.to);
  if (direct) return direct;

  const tl = r.viewport?.topLeftPoint;
  const br = r.viewport?.btmRightPoint;
  if (tl && br) {
    const p1 = fromPoint(tl);
    const p2 = fromPoint(br);
    if (p1 && p2) return { lat: (p1.lat + p2.lat) / 2, lon: (p1.lon + p2.lon) / 2 };
  }

  const fr = r.addressRanges?.from;
  const to = r.addressRanges?.to;
  if (fr && to) {
    const a = fromPoint(fr);
    const b = fromPoint(to);
    if (a && b) return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  }

  return null;
}

function mapKind(type?: string): "city" | "address" | "poi" {
  const t = (type ?? "").toLowerCase();
  if (t === "poi") return "poi";
  if (t === "geography") return "city";
  return "address";
}

/** Secondary line: municipality / region / country (no coordinates). */
function buildSecondaryLine(a: NonNullable<TomTomSearchResult["address"]>): string {
  const municipality = a.municipality?.trim() || a.municipalitySubdivision?.trim();
  const region = a.countrySubdivision?.trim();
  const country = a.country?.trim() || countryFromCode(a.countryCode);

  const segments: string[] = [];
  if (municipality) segments.push(municipality);
  if (region && norm(region) !== norm(municipality ?? "")) segments.push(region);
  if (country) {
    const last = segments[segments.length - 1];
    if (!last || norm(last) !== norm(country)) segments.push(country);
  }

  const out: string[] = [];
  for (const s of segments) {
    if (!s) continue;
    if (out.length && norm(out[out.length - 1]!) === norm(s)) continue;
    out.push(s);
  }
  return out.join(", ");
}

function firstSegment(freeform: string | undefined): string | undefined {
  if (!freeform?.trim()) return undefined;
  const seg = freeform.split(",")[0]?.trim();
  return seg || undefined;
}

/**
 * Build primary line: POI name, street, or place name — never raw coordinates.
 */
function buildPrimaryLine(r: TomTomSearchResult, fallback: string): string {
  const t = (r.type ?? "").toLowerCase();
  const a = r.address;
  const poi = r.poi?.name?.trim();

  if (t === "poi" && poi) return poi;

  const street = a?.streetName?.trim();
  if (street) {
    const num = a?.streetNumber?.trim();
    return num ? `${num} ${street}` : street;
  }

  if (poi) return poi;

  if (t === "geography") {
    const place = a?.localName?.trim() || a?.municipality?.trim() || a?.municipalitySubdivision?.trim();
    if (place) return place;
  }

  const muni = a?.municipality?.trim() || a?.localName?.trim();
  if (muni && (t === "geography" || !a?.freeformAddress)) return muni;

  const ff = a?.freeformAddress?.trim();
  if (ff) {
    const first = firstSegment(ff);
    if (first) return first;
  }

  if (muni) return muni;
  return fallback;
}

/** Single-line label for stored state (input + ✓ line). */
function buildStoredLabel(
  r: TomTomSearchResult,
  primaryLine: string,
  secondaryLine: string,
): string {
  const ff = r.address?.freeformAddress?.trim();
  if (ff) return ff;
  if (secondaryLine) return `${primaryLine}, ${secondaryLine}`;
  return primaryLine;
}

/**
 * Maps a TomTom search hit to {@link GeocodeHit} with human-readable display fields.
 */
export function geocodeHitFromTomTomResult(r: TomTomSearchResult, fallbackQuery: string): GeocodeHit | null {
  const pos = extractPosition(r);
  if (!pos) return null;

  const primaryLine = buildPrimaryLine(r, fallbackQuery);
  const secondaryLine = r.address ? buildSecondaryLine(r.address) : "";

  let secondary = secondaryLine;
  if (secondary && norm(secondary) === norm(primaryLine)) secondary = "";

  const label = buildStoredLabel(r, primaryLine, secondary);

  const hit: GeocodeHit = {
    lat: pos.lat,
    lng: pos.lon,
    label,
    primaryLine,
    secondaryLine: secondary || undefined,
    kind: mapKind(r.type),
  };
  if (typeof r.id === "string" && r.id.length > 0) hit.id = r.id;
  return hit;
}
