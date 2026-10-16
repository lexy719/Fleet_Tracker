import type { RefuelPlan } from "../domain/fuelPlanning/refuelPlanner";
/**
 * TomTom Routing API — dynamic route alternatives (no static strategy placeholders).
 * @see https://developer.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route
 */

import { routesEquivalent } from "../regulations/geometry";
import { getTomTomRestBase } from "./config";
import { tomtomFetchJson } from "./httpClient";
import { maxCargoKg, totalVehicleWeightKg, type TruckPreset } from "./truckPresets";

/**
 * How toll € on a route option was derived (for UI honesty).
 * - `unpriced_sections`: TomTom returned toll/TOLL_ROAD/TOLL_VIGNETTE (or tollPaymentTypes) but no EUR price in the response.
 */
export type TollDataQuality = "priced" | "estimated" | "mixed" | "unpriced_sections" | "none";

/** Stable id for selection / map layers (e.g. route-0, route-1). */
export type RouteOptionId = string;

/** @deprecated Use RouteOptionId — kept for gradual migration */
export type RoutePlanVariantId = RouteOptionId;

export type RouteStopArrival = {
  stopId: string;
  name: string;
  etaLabel: string;
  windowRisk?: "ok" | "warn" | "critical";
};

/** Map / legend: fastest ≈ green, lowest toll ≈ orange, most fuel ≈ blue, others gray. */
export type RouteComparisonRole = "fastest" | "lowest_toll" | "most_fuel" | "other" | "single";

export type RoutePlanOption = {
  /** Guidance belongs to this exact, unsimplified route, including after solver detours. */
  navigation?: { instructions: NavigationInstruction[]; sections: NavigationSection[] };
  id: RouteOptionId;
  title: string;
  subtitle: string;
  polyline: [number, number][];
  distanceM: number;
  durationSec: number;
  trafficDelaySec: number;
  fuelConsumptionL?: number;
  fuelCostEur: number;
  tollCostEur: number;
  /** Sum of TomTom EUR toll prices (0 if none). */
  tollPricedEur: number;
  /** Model-based estimate for unpriced toll / motorway toll exposure. */
  tollEstimatedEur: number;
  tollDataQuality: TollDataQuality;
  /** Toll-related sections reported by TomTom (TOLL / TOLL_ROAD / TOLL_VIGNETTE). */
  tollSectionCount: number;
  stopArrivals: RouteStopArrival[];
  legDurationSec: number[];
  /** Points per leg — partitions `polyline` (TomTom legs are concatenated in order). */
  legPointCounts: number[];
  /** Road numbers from TomTom `ROAD_SHIELDS` sections (e.g. "A28", "IC1"). Display/diagnostics only. */
  roadNumbers: string[];
  /** Departure time sent to TomTom (RFC 3339). */
  departAtIso?: string;
  /** Arrival time reported by TomTom `summary.arrivalTime`. */
  arrivalAtIso?: string;
  /** How TomTom produced this route — kept for persistence / audit. */
  routing?: RouteRequestInfo;
  error?: string;
  /** Stroke / legend color index (palette) */
  colorIndex: number;
  /** Visual role for comparison coloring (set after planning). */
  comparisonRole?: RouteComparisonRole;
  /** Where the €/L behind `fuelCostEur` came from (measured corridor median vs default). */
  fuelPriceBasis?: { eurPerL: number; source: "MEASURED" | "DEFAULT"; basis: string; sample: number };
  /** Fuel Intelligence refuel plan for this route (stops, detours, pause merges, saving vs naive). */
  refuelPlan?: RefuelPlan;
};

/** Last-resort €/L when no measured pump prices cover the trip (PT/ES diesel, Oct 2026 order of magnitude). */
export const DEFAULT_FUEL_EUR_PER_L = 2.0;

/** Stroke colors — cycle by `colorIndex` */
export const ROUTE_OPTION_PALETTE = ["#0d9488", "#ea580c", "#059669", "#6366f1", "#8b5cf6", "#dc2626"] as const;

export function routeOptionStrokeColor(colorIndex: number): string {
  return ROUTE_OPTION_PALETTE[((colorIndex % ROUTE_OPTION_PALETTE.length) + ROUTE_OPTION_PALETTE.length) % ROUTE_OPTION_PALETTE.length]!;
}

const ROUTE_GRAY_VARIANTS = ["#64748b", "#78716c", "#71717a", "#52525b", "#57534e"] as const;

/** Line color for map / cards: semantic when role is known, else gray by index. */
export function routeLineBaseColor(o: RoutePlanOption): string {
  switch (o.comparisonRole) {
    case "fastest":
    case "single":
      return "#059669";
    case "lowest_toll":
      return "#ea580c";
    case "most_fuel":
      return "#2563eb";
    case "other":
      return ROUTE_GRAY_VARIANTS[o.colorIndex % ROUTE_GRAY_VARIANTS.length]!;
    default:
      return routeOptionStrokeColor(o.colorIndex);
  }
}

/** @deprecated Use routeOptionStrokeColor(option.colorIndex) */
export const ROUTE_VARIANT_COLORS: Record<string, string> = {
  fastest: ROUTE_OPTION_PALETTE[0]!,
  cheapest: ROUTE_OPTION_PALETTE[1]!,
  balanced: ROUTE_OPTION_PALETTE[2]!,
};

type TomTomLeg = {
  summary?: {
    lengthInMeters?: number;
    travelTimeInSeconds?: number;
    trafficDelayInSeconds?: number;
  };
  points: { latitude: number; longitude: number }[];
  /** Rare — some responses attach sections per leg; prefer route-level `sections` when present. */
  sections?: TomTomSection[];
};

type TomTomRouteResponse = {
  routes?: (TomTomRouteCore & { sections?: TomTomSection[] })[];
};

export type NavigationInstruction = { routeOffsetInMeters: number; maneuver: string; message: string; street?: string; roadNumbers?: string[]; signpostText?: string; roundaboutExitNumber?: number; exitNumber?: string; point?: { latitude: number; longitude: number } };
export type NavigationSection = { sectionType?: string; startPointIndex?: number; endPointIndex?: number; maxSpeedLimitInKmh?: number; lanes?: { directions: string[]; follow?: string }[] };

type TomTomRouteCore = {
  guidance?: { instructions?: NavigationInstruction[] };
  summary: {
    lengthInMeters: number;
    travelTimeInSeconds: number;
    trafficDelayInSeconds?: number;
    fuelConsumptionInLiters?: number;
    departureTime?: string;
    arrivalTime?: string;
  };
  legs: TomTomLeg[];
};

type TomTomRoute = TomTomRouteCore & { sections?: TomTomSection[] };

type TomTomSection = NavigationSection & {
  sectionType?: string;
  /** Section length when available — used to estimate tolls if no priced toll. */
  lengthInMeters?: number;
  startPointIndex?: number;
  endPointIndex?: number;
  /** Present when `includeTollPaymentTypes=all` — TomTom docs show this without EUR prices. */
  tollPaymentTypes?: string[];
  /** When present, may list priced legs (shape varies by API version). */
  tollPrices?: unknown;
  /** `sectionType=roadShields` — observed shape: `{ reference, shieldContent }`. */
  roadShieldReferences?: { reference?: string; shieldContent?: string }[];
};

/** Axis-aligned rectangle for the documented POST `avoidAreas` body (max 10, ~160×160 km each). */
export type AvoidRectangle = { south: number; west: number; north: number; east: number };

export type RouteRequestInfo = {
  /** primary = first route of a request; alternative = further routes (maxAlternatives); toll_avoiding = avoid=tollRoads request. */
  role: "primary" | "alternative" | "toll_avoiding";
  /** Query parameters sent (API key excluded). */
  params: Record<string, string>;
  avoidAreas?: AvoidRectangle[];
};

type CollectedRoute = { route: TomTomRoute; routing: RouteRequestInfo };

type InternalCandidate = {
  routing: RouteRequestInfo;
  route: TomTomRoute;
  durationSec: number;
  distanceM: number;
  tollCostEur: number;
  tollPricedEur: number;
  tollEstimatedEur: number;
  tollDataQuality: TollDataQuality;
  tollSectionCount: number;
  fuelL: number;
  fuelCostEur: number;
  polyline: [number, number][];
  legDurationSec: number[];
};

const TOLL_SPREAD_MIN_EUR = 0.75;
const FUEL_SPREAD_MIN_L_PER_100 = 0.85;
const SIMILAR_DURATION_SEC = 120;
const SIMILAR_DISTANCE_M = 500;
const SIMILAR_TOLL_EUR = 0.5;

/** Provider geometry/summary sanity: malformed responses become errors, never routes. */
export function tomtomRouteValid(route: TomTomRoute | undefined): boolean {
  if (!route || !route.summary || !Array.isArray(route.legs) || route.legs.length === 0) return false;
  if (!Number.isFinite(route.summary.lengthInMeters) || !Number.isFinite(route.summary.travelTimeInSeconds)) return false;
  let n = 0;
  for (const leg of route.legs) {
    if (!Array.isArray(leg.points)) return false;
    for (const p of leg.points) {
      if (!p || typeof p.latitude !== "number" || typeof p.longitude !== "number" || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false;
      if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return false;
      n++;
    }
  }
  return n >= 2;
}

function polylineFromRoute(route: TomTomRoute): [number, number][] {
  const pts: [number, number][] = [];
  for (const leg of route.legs) {
    for (const p of leg.points) {
      pts.push([p.latitude, p.longitude]);
    }
  }
  return pts;
}

/** Distinct road numbers from ROAD_SHIELDS sections, in first-seen order. */
function roadNumbersFromRoute(route: TomTomRoute): string[] {
  const out: string[] = [];
  for (const sec of allSectionsFromRoute(route)) {
    if (normalizeTomTomSectionType(sec.sectionType) !== "ROAD_SHIELDS") continue;
    for (const ref of sec.roadShieldReferences ?? []) {
      const n = ref.shieldContent?.trim();
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** RFC 3339 without milliseconds (TomTom `departAt` accepts a dateTime; default is `now`). */
export function toTomTomDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function legDurationsSec(route: TomTomRoute): number[] {
  const total = route.summary.travelTimeInSeconds;
  const n = route.legs.length;
  const fallback = n > 0 ? total / n : 0;
  return route.legs.map((leg) => leg.summary?.travelTimeInSeconds ?? fallback);
}

/** TomTom may return `TOLL_ROAD`, camelCase `tollRoad`, or `TOLL` — normalize for comparisons. */
function normalizeTomTomSectionType(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toUpperCase();
}

function isTollSectionType(sectionType: string | undefined): boolean {
  const t = normalizeTomTomSectionType(sectionType);
  if (t === "TRAFFIC" || t === "COUNTRY") return false;
  return (
    t === "TOLL" ||
    t === "TOLL_ROAD" ||
    t === "TOLL_VIGNETTE" ||
    t === "TOLLROAD" ||
    t === "TOLLVIGNETTE" ||
    t.endsWith("_TOLL")
  );
}

function isMotorwaySection(sectionType: string | undefined): boolean {
  return normalizeTomTomSectionType(sectionType) === "MOTORWAY";
}

function allSectionsFromRoute(route: TomTomRoute): TomTomSection[] {
  const top = route.sections ?? [];
  if (top.length > 0) return top;
  const fromLegs = route.legs.flatMap((l) => l.sections ?? []);
  return fromLegs;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance along the decoded polyline between point indices [start, end] inclusive of both endpoints. */
function polylineSliceDistanceM(pts: [number, number][], startIdx: number, endIdx: number): number {
  if (pts.length < 2 || startIdx < 0 || endIdx <= startIdx || endIdx >= pts.length) return 0;
  let d = 0;
  for (let i = startIdx; i < endIdx; i++) {
    d += haversineM(pts[i]!, pts[i + 1]!);
  }
  return d;
}

function sectionLengthMeters(sec: TomTomSection, polylinePts: [number, number][]): number {
  if (typeof sec.lengthInMeters === "number" && sec.lengthInMeters > 0) return sec.lengthInMeters;
  const si = sec.startPointIndex;
  const ei = sec.endPointIndex;
  if (si == null || ei == null || polylinePts.length < 2) return 0;
  const max = polylinePts.length - 1;
  const s = Math.max(0, Math.min(Math.floor(si), max));
  const e = Math.max(0, Math.min(Math.floor(ei), max));
  if (e <= s) return 0;
  return polylineSliceDistanceM(polylinePts, s, e);
}

/** Sum EUR from `tollPrices` — tolerates alternate shapes some API versions use. */
function extractEurFromTollPrices(sec: TomTomSection): number {
  const raw = sec.tollPrices;
  if (raw == null) return 0;
  const list = Array.isArray(raw) ? raw : [raw];
  let sum = 0;
  for (const item of list) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const price = o.price as { amount?: number; currency?: string } | undefined;
    if (price && typeof price.amount === "number" && !Number.isNaN(price.amount)) {
      const cur = (price.currency ?? "EUR").toUpperCase();
      if (cur === "EUR") sum += price.amount;
    }
    if (typeof o.amount === "number" && !Number.isNaN(o.amount)) {
      const cur = String(o.currency ?? "EUR").toUpperCase();
      if (cur === "EUR") sum += o.amount;
    }
  }
  return sum;
}

function heavyFactor(totalWeightKg: number): number {
  if (totalWeightKg >= 36_000) return 1.28;
  if (totalWeightKg >= 28_000) return 1.15;
  return 1;
}

/**
 * Priced tolls from TomTom (`tollPrices` when present); length-based estimate using `lengthInMeters`
 * or polyline indices (TomTom examples often omit `lengthInMeters` on TOLL sections).
 * Official samples include `tollPaymentTypes` without EUR — treat as toll metadata, not "no data".
 */
function tollAnalysisFromRoute(
  route: TomTomRoute,
  totalWeightKg: number,
  polylinePts: [number, number][],
): {
  totalEur: number;
  pricedEur: number;
  estimatedEur: number;
  quality: TollDataQuality;
  tollSectionCount: number;
} {
  const UNPRICED_TOLL_EUR_PER_KM = 0.12;
  const MOTORWAY_FALLBACK_EUR_PER_KM = 0.04;

  const sections = allSectionsFromRoute(route);

  let pricedEur = 0;
  let unpricedTollKm = 0;
  let motorwayKm = 0;
  let tollSectionCount = 0;
  let sawTollLikeSection = false;

  for (const sec of sections) {
    if (isMotorwaySection(sec.sectionType)) {
      const m = sectionLengthMeters(sec, polylinePts);
      if (m > 0) motorwayKm += m / 1000;
    }

    const tollLike =
      isTollSectionType(sec.sectionType) ||
      (Array.isArray(sec.tollPaymentTypes) && sec.tollPaymentTypes.length > 0);
    if (!tollLike) continue;

    sawTollLikeSection = true;
    tollSectionCount += 1;

    const eur = extractEurFromTollPrices(sec);
    if (eur > 0) {
      pricedEur += eur;
      continue;
    }

    const lenM = sectionLengthMeters(sec, polylinePts);
    if (lenM > 0) {
      unpricedTollKm += lenM / 1000;
    }
  }

  const hf = heavyFactor(totalWeightKg);
  let estimatedEur = unpricedTollKm * UNPRICED_TOLL_EUR_PER_KM * hf;

  if (pricedEur === 0 && estimatedEur === 0 && !sawTollLikeSection && motorwayKm > 0) {
    estimatedEur = motorwayKm * MOTORWAY_FALLBACK_EUR_PER_KM * hf;
  }

  pricedEur = Math.round(pricedEur * 100) / 100;
  estimatedEur = Math.round(estimatedEur * 100) / 100;
  const totalEur = Math.round((pricedEur + estimatedEur) * 100) / 100;

  let quality: TollDataQuality = "none";
  if (pricedEur > 0 && estimatedEur > 0) quality = "mixed";
  else if (pricedEur > 0) quality = "priced";
  else if (estimatedEur > 0) quality = "estimated";
  else if (sawTollLikeSection) quality = "unpriced_sections";
  else quality = "none";

  return { totalEur, pricedEur, estimatedEur, quality, tollSectionCount };
}

function fuelLitersFromRoute(route: TomTomRoute, distanceKm: number, lPer100kmFallback: number): number {
  const fromApi = route.summary.fuelConsumptionInLiters;
  if (typeof fromApi === "number" && fromApi > 0) return fromApi;
  return (distanceKm * lPer100kmFallback) / 100;
}

function parseHm(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function buildStopArrivals(
  route: TomTomRoute,
  waypointStops: { id: string; name: string; windowStart?: string; windowEnd?: string }[],
  startTime: Date,
): RouteStopArrival[] {
  const legs = route.legs;
  const arrivals: RouteStopArrival[] = [];
  let cursor = new Date(startTime.getTime());
  const totalTravel = route.summary.travelTimeInSeconds;
  const fallbackLegSec = legs.length > 0 ? totalTravel / legs.length : 0;

  for (let i = 0; i < legs.length; i++) {
    const sec = legs[i].summary?.travelTimeInSeconds ?? fallbackLegSec;
    cursor = new Date(cursor.getTime() + sec * 1000);
    const meta = waypointStops[i];
    if (!meta) continue;

    const hh = cursor.getHours();
    const mm = cursor.getMinutes();
    const etaLabel = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const etaM = hh * 60 + mm;
    let windowRisk: RouteStopArrival["windowRisk"] = "ok";
    const ws = parseHm(meta.windowStart);
    const we = parseHm(meta.windowEnd);
    if (ws != null && we != null) {
      if (etaM > we) windowRisk = "critical";
      else if (etaM > we - 30 || etaM < ws) windowRisk = "warn";
    }

    arrivals.push({
      stopId: meta.id,
      name: meta.name,
      etaLabel,
      windowRisk: ws != null && we != null ? windowRisk : undefined,
    });
  }

  return arrivals;
}

function cloneSearchParams(p: URLSearchParams): URLSearchParams {
  const n = new URLSearchParams();
  p.forEach((value, key) => {
    n.append(key, value);
  });
  return n;
}

function mergeRoutingParams(base: URLSearchParams, extra: Record<string, string | undefined>): URLSearchParams {
  const n = cloneSearchParams(base);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) n.set(k, v);
  }
  return n;
}

/**
 * TomTom truck routing — `includeTollPaymentTypes=all` requires `sectionType=toll` in the request.
 * @see https://developer.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route
 */
function buildTruckRoutingQuery(preset: TruckPreset, totalWeightKg: number): URLSearchParams {
  const s = new URLSearchParams();
  const axles = Math.max(1, preset.vehicleNumberOfAxles);
  const axleLoad = Math.ceil(totalWeightKg / axles);
  const axleWeight = Math.min(preset.maxAxleWeightKg, axleLoad);
  s.set("travelMode", "truck");
  s.set("vehicleWeight", String(Math.round(totalWeightKg)));
  s.set("vehicleAxleWeight", String(axleWeight));
  s.set("vehicleNumberOfAxles", String(preset.vehicleNumberOfAxles));
  s.set("vehicleLength", String(preset.vehicleLength));
  s.set("vehicleWidth", String(preset.vehicleWidth));
  s.set("vehicleHeight", String(preset.vehicleHeight));
  s.set("vehicleCommercial", "true");
  s.set("traffic", "true");
  s.set("routeType", "fastest");
  s.set("computeTravelTimeFor", "all");
  s.set("includeTollPaymentTypes", "all");
  s.append("sectionType", "toll");
  /** Still returned as `TOLL_ROAD` in many regions; TomTom recommends `toll` + `tollVignette` going forward. */
  s.append("sectionType", "tollRoad");
  s.append("sectionType", "tollVignette");
  s.append("sectionType", "motorway");
  s.append("sectionType", "traffic");
  s.append("sectionType", "roadShields");
  return s;
}

function paramsRecord(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  p.forEach((v, k) => {
    if (k === "key") return;
    out[k] = out[k] ? `${out[k]},${v}` : v;
  });
  return out;
}

async function calculateRoutes(
  key: string,
  waypoints: { lat: number; lng: number }[],
  queryParams: URLSearchParams,
  debugLabel?: string,
  avoidAreas?: AvoidRectangle[],
): Promise<{ routes: TomTomRoute[] } | { error: string }> {
  if (waypoints.length < 2) return { error: "Need at least two waypoints" };
  const path = waypoints.map((p) => `${p.lat},${p.lng}`).join(":");
  const search = cloneSearchParams(queryParams);
  search.set("key", key);
  const url = `${getTomTomRestBase()}/routing/1/calculateRoute/${path}/json?${search.toString()}`;
  if (import.meta.env?.DEV) {
    const safeUrl = url.replace(/([?&])key=[^&]*/i, "$1key=***");
    console.debug(`[TomTom] ${debugLabel ?? "calculateRoute"} request URL`, safeUrl);
  }
  let data: TomTomRouteResponse;
  try {
    data = await tomtomFetchJson<TomTomRouteResponse>(url, {
      timeoutMs: 15_000,
      retries: 1,
      jsonBody:
        avoidAreas && avoidAreas.length > 0
          ? {
              avoidAreas: {
                rectangles: avoidAreas.map((r) => ({
                  southWestCorner: { latitude: r.south, longitude: r.west },
                  northEastCorner: { latitude: r.north, longitude: r.east },
                })),
              },
            }
          : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Routing request failed";
    return { error: message.slice(0, 200) };
  }
  if (import.meta.env?.DEV) {
    console.debug(`[TomTom] ${debugLabel ?? "calculateRoute"} raw JSON`, data);
  }
  const routes = data.routes ?? [];
  if (routes.length === 0) return { error: "No route returned" };
  if (import.meta.env?.DEV) {
    routes.forEach((r, i) => {
      const sections = r.sections ?? [];
      console.debug(`[TomTom] ${debugLabel ?? "route"} [${i}]`, {
        lengthM: r.summary.lengthInMeters,
        travelSec: r.summary.travelTimeInSeconds,
        sectionCount: sections.length,
        sectionTypes: [...new Set(sections.map((s) => s.sectionType).filter(Boolean))],
        tollLikeSections: sections.filter((s) => isTollSectionType(s.sectionType)).length,
        sampleTollSection: sections.find((s) => isTollSectionType(s.sectionType)),
      });
    });
  }
  return { routes };
}

function tollSubtitleFragment(c: InternalCandidate): string {
  if (c.tollDataQuality === "unpriced_sections") {
    return `${c.tollSectionCount} toll section(s) · price n/a (API)`;
  }
  if (c.tollDataQuality === "none" && c.tollCostEur === 0) return "no toll metadata in response";
  if (c.tollDataQuality === "priced") return `€${c.tollCostEur.toFixed(2)} toll (priced)`;
  if (c.tollDataQuality === "estimated") return `~€${c.tollCostEur.toFixed(2)} toll (est.)`;
  if (c.tollDataQuality === "mixed")
    return `€${c.tollPricedEur.toFixed(2)} priced + ~€${c.tollEstimatedEur.toFixed(2)} est.`;
  return `€${c.tollCostEur.toFixed(2)} toll`;
}

function toCandidate(
  { route, routing }: CollectedRoute,
  lPer: number,
  fuelEur: number,
  totalWeightKg: number,
): InternalCandidate {
  const s = route.summary;
  const distanceKm = s.lengthInMeters / 1000;
  const fuelL = fuelLitersFromRoute(route, distanceKm, lPer);
  const fuelCostEur = Math.round(fuelL * fuelEur * 100) / 100;
  const polyline = polylineFromRoute(route);
  const toll = tollAnalysisFromRoute(route, totalWeightKg, polyline);
  return {
    route,
    routing,
    durationSec: s.travelTimeInSeconds,
    distanceM: s.lengthInMeters,
    tollCostEur: toll.totalEur,
    tollPricedEur: toll.pricedEur,
    tollEstimatedEur: toll.estimatedEur,
    tollDataQuality: toll.quality,
    tollSectionCount: toll.tollSectionCount,
    fuelL,
    fuelCostEur,
    polyline,
    legDurationSec: legDurationsSec(route),
  };
}

/**
 * Same PATH, not merely similar numbers: similar distance/time/toll can belong to routes
 * on different roads (one of which may avoid a restriction). Numbers are a cheap guard;
 * geometry decides.
 */
function similarCandidates(a: InternalCandidate, b: InternalCandidate): boolean {
  const numbersClose =
    Math.abs(a.durationSec - b.durationSec) < SIMILAR_DURATION_SEC &&
    Math.abs(a.distanceM - b.distanceM) < SIMILAR_DISTANCE_M &&
    Math.abs(a.tollCostEur - b.tollCostEur) < SIMILAR_TOLL_EUR;
  return numbersClose && routesEquivalent(a.polyline, b.polyline);
}

function dedupeCandidates(candidates: InternalCandidate[]): InternalCandidate[] {
  const out: InternalCandidate[] = [];
  for (const c of candidates) {
    if (out.some((o) => similarCandidates(o, c))) continue;
    out.push(c);
  }
  return out;
}

function argminIndex<T>(arr: T[], score: (t: T) => number): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (score(arr[i]!) < score(arr[best]!)) best = i;
  }
  return best;
}

function formatDurSubtitle(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${m} min drive`;
  return `${h}h ${min}m drive`;
}

function buildTitlesAndSubtitles(candidates: InternalCandidate[]): { title: string; subtitle: string; sortKey: number }[] {
  const n = candidates.length;
  if (n === 0) return [];
  if (n === 1) {
    const c = candidates[0]!;
    return [
      {
        title: "Best available route",
        subtitle: `${formatDurSubtitle(c.durationSec)} · ${(c.distanceM / 1000).toFixed(1)} km · ${tollSubtitleFragment(c)}`,
        sortKey: 3,
      },
    ];
  }

  const tolls = candidates.map((c) => c.tollCostEur);
  const tollSpread = Math.max(...tolls) - Math.min(...tolls);
  const lPer100 = candidates.map((c) => {
    const km = c.distanceM / 1000;
    return km > 0 ? (c.fuelL / km) * 100 : Number.NaN;
  });
  const finiteL = lPer100.filter((x) => Number.isFinite(x));
  const fuelSpread = finiteL.length >= 2 ? Math.max(...finiteL) - Math.min(...finiteL) : 0;

  const iFast = argminIndex(candidates, (c) => c.durationSec);
  const iToll = argminIndex(candidates, (c) => c.tollCostEur);
  const iFuel = argminIndex(candidates, (c) => {
    const km = c.distanceM / 1000;
    return km > 0 ? c.fuelL / km : Number.POSITIVE_INFINITY;
  });

  const fastest = candidates[iFast]!;

  return candidates.map((c, i) => {
    const parts: string[] = [];
    if (i === iFast) parts.push("Fastest time");
    if (tollSpread >= TOLL_SPREAD_MIN_EUR && i === iToll) parts.push("Lowest toll");
    if (fuelSpread >= FUEL_SPREAD_MIN_L_PER_100 && finiteL.length >= 2 && i === iFuel) parts.push("Most fuel-efficient");

    const sortKey = parts.length;
    const title = parts.length > 0 ? parts.join(" · ") : "Alternative route";
    const deltaSec = c.durationSec - fastest.durationSec;
    const deltaLabel =
      i === iFast
        ? "TomTom-ranked alternative for your request"
        : `${deltaSec >= 0 ? "+" : "−"}${formatDurSubtitle(Math.abs(deltaSec))} vs fastest`;
    const subtitle = `${(c.distanceM / 1000).toFixed(1)} km · ${formatDurSubtitle(c.durationSec)} · ${tollSubtitleFragment(c)} · ${deltaLabel}`;
    return { title, subtitle, sortKey };
  });
}

function sortDisplayOrder(candidates: InternalCandidate[], labels: { sortKey: number }[]): number[] {
  const idx = candidates.map((_, i) => i);
  idx.sort((a, b) => {
    const bc = labels[b]!.sortKey - labels[a]!.sortKey;
    if (bc !== 0) return bc;
    return candidates[a]!.durationSec - candidates[b]!.durationSec;
  });
  return idx;
}

/** Vehicle + cargo used for TomTom truck routing and consumption estimates (fleet truck + load planning). */
export type PlanRouteTruckOpts = {
  fleetTruckId: string;
  cargoWeightKg: number;
  preset: TruckPreset;
};

export type PlanRoutePlanningOpts = {
  navigationLanguage?: "pt-PT" | "es-ES" | "en-GB";
  lPer100kmFallback?: number;
  fuelEurPerL?: number;
  departAt?: Date;
  waypointStops: { id: string; name: string; windowStart?: string; windowEnd?: string }[];
  truck: PlanRouteTruckOpts;
  /** Documented POST `avoidAreas` rectangles (≤ 10). Avoidance is not guaranteed — verify results. */
  avoidAreas?: AvoidRectangle[];
};

function emptyOption(id: string, error: string): RoutePlanOption {
  return {
    id,
    title: "Route",
    subtitle: "",
    polyline: [],
    distanceM: 0,
    durationSec: 0,
    trafficDelaySec: 0,
    fuelCostEur: 0,
    tollCostEur: 0,
    tollPricedEur: 0,
    tollEstimatedEur: 0,
    tollDataQuality: "none",
    tollSectionCount: 0,
    stopArrivals: [],
    legDurationSec: [],
    legPointCounts: [],
    roadNumbers: [],
    error,
    colorIndex: 0,
  };
}

export async function planRouteOptions(
  key: string,
  waypoints: { lat: number; lng: number }[],
  planning: PlanRoutePlanningOpts,
): Promise<RoutePlanOption[]> {
  const fuelEur = planning.fuelEurPerL ?? DEFAULT_FUEL_EUR_PER_L;
  const waypointStops = planning.waypointStops;
  if (waypointStops.length !== waypoints.length - 1) {
    return [emptyOption("route-0", "Waypoint / stop metadata mismatch")];
  }

  const truckOpt = planning.truck;
  const preset = truckOpt.preset;
  const cargoWeightKg = Math.max(0, truckOpt.cargoWeightKg);
  const totalWeightKg = totalVehicleWeightKg(preset, cargoWeightKg);
  const maxCargo = maxCargoKg(preset);
  const loadRatio = maxCargo > 0 ? Math.min(1, cargoWeightKg / maxCargo) : 0;
  const baseLPer = planning.lPer100kmFallback ?? preset.lPer100kmFallback;
  /** Heavier load → slightly higher L/100km when API has no fuel field. */
  const lPer = baseLPer * (1 + 0.12 * loadRatio);

  const baseQuery = buildTruckRoutingQuery(preset, totalWeightKg);
  /** Same departure for TomTom's time-dependent travel times and our local ETAs. */
  const departAt = planning.departAt ?? new Date();
  const departAtIso = toTomTomDateTime(departAt);
  baseQuery.set("departAt", departAtIso);

  const collected: CollectedRoute[] = [];
  const avoidAreas = planning.avoidAreas;
  const tag = (routes: TomTomRoute[], query: URLSearchParams, firstRole: RouteRequestInfo["role"]) =>
    routes.forEach((route, i) =>
      collected.push({
        route,
        routing: { role: i === 0 ? firstRole : "alternative", params: paramsRecord(query), avoidAreas },
      }),
    );

  const altQuery = mergeRoutingParams(baseQuery, {
    maxAlternatives: "3",
    alternativeType: "anyRoute",
  });
  const tryAlternatives = await calculateRoutes(key, waypoints, altQuery, "alternatives(max=3,anyRoute)", avoidAreas);

  if ("routes" in tryAlternatives) {
    tag(tryAlternatives.routes, altQuery, "primary");
  } else {
    const fallbackQuery = mergeRoutingParams(baseQuery, {
      maxAlternatives: "0",
    });
    const fallback = await calculateRoutes(key, waypoints, fallbackQuery, "fallback(max=0)", avoidAreas);
    if ("routes" in fallback) {
      tag(fallback.routes, fallbackQuery, "primary");
    } else {
      const e1 = "error" in tryAlternatives ? tryAlternatives.error : "Routing failed";
      const e2 = "error" in fallback ? fallback.error : "";
      return [emptyOption("route-0", e2 || e1)];
    }
  }

  const tollQuery = mergeRoutingParams(baseQuery, {
    maxAlternatives: "0",
    avoid: "tollRoads",
  });
  const tollAvoid = await calculateRoutes(key, waypoints, tollQuery, "avoidTollRoads", avoidAreas);
  if ("routes" in tollAvoid && tollAvoid.routes[0]) {
    tag([tollAvoid.routes[0]], tollQuery, "toll_avoiding");
  }

  const invalid = collected.filter((r) => !tomtomRouteValid(r.route)).length;
  if (invalid && import.meta.env?.DEV) console.warn(`[TomTom] ${invalid} route(s) with invalid geometry dropped`);
  let candidates = collected.filter((r) => tomtomRouteValid(r.route)).map((r, idx) => {
    const c = toCandidate(r, lPer, fuelEur, totalWeightKg);
    if (import.meta.env?.DEV && idx === 0) {
      const secs = allSectionsFromRoute(c.route);
      console.debug("[TomTom] parsed internal route [0] (post-fetch)", {
        tollDataQuality: c.tollDataQuality,
        tollCostEur: c.tollCostEur,
        tollPricedEur: c.tollPricedEur,
        tollEstimatedEur: c.tollEstimatedEur,
        tollSectionCount: c.tollSectionCount,
        sectionCount: secs.length,
        sectionTypes: [...new Set(secs.map((s) => s.sectionType).filter(Boolean))],
      });
    }
    return c;
  });
  candidates = dedupeCandidates(candidates);

  if (candidates.length === 0) {
    return [emptyOption("route-0", "No route returned")];
  }

  const labels = buildTitlesAndSubtitles(candidates);
  const order = sortDisplayOrder(candidates, labels);

  const startTime = departAt;
  const out: RoutePlanOption[] = [];

  order.forEach((srcIdx, displayIdx) => {
    const c = candidates[srcIdx]!;
    const { title, subtitle } = labels[srcIdx]!;
    const route = c.route;
    const s = route.summary;
    out.push({
      id: `route-${displayIdx}`,
      title,
      subtitle,
      polyline: c.polyline,
      distanceM: s.lengthInMeters,
      durationSec: s.travelTimeInSeconds,
      trafficDelaySec: s.trafficDelayInSeconds ?? 0,
      fuelConsumptionL: c.fuelL,
      fuelCostEur: c.fuelCostEur,
      tollCostEur: c.tollCostEur,
      tollPricedEur: c.tollPricedEur,
      tollEstimatedEur: c.tollEstimatedEur,
      tollDataQuality: c.tollDataQuality,
      tollSectionCount: c.tollSectionCount,
      stopArrivals: buildStopArrivals(route, waypointStops, startTime),
      legDurationSec: c.legDurationSec,
      legPointCounts: route.legs.map((l) => l.points.length),
      roadNumbers: roadNumbersFromRoute(route),
      departAtIso,
      arrivalAtIso: s.arrivalTime,
      routing: c.routing,
      colorIndex: displayIdx,
    });
  });

  return assignComparisonRoles(out);
}

export function totalTripCostEur(o: RoutePlanOption): number {
  return o.fuelCostEur + o.tollCostEur;
}

/** Quick-jump targets — omit categories when spread is negligible or only one route exists. */
export function quickCompareTargets(options: RoutePlanOption[]): {
  fastest: RouteOptionId | null;
  lowestToll: RouteOptionId | null;
  mostFuelEfficient: RouteOptionId | null;
} {
  const ok = options.filter((o) => !o.error && o.polyline.length);
  if (ok.length <= 1) {
    return { fastest: null, lowestToll: null, mostFuelEfficient: null };
  }

  const tolls = ok.map((o) => o.tollCostEur);
  const tollSpread = Math.max(...tolls) - Math.min(...tolls);

  const lPer100Values = ok
    .map((o) => {
      const km = o.distanceM / 1000;
      if (km <= 0 || o.fuelConsumptionL == null) return null;
      return (o.fuelConsumptionL / km) * 100;
    })
    .filter((x): x is number => x != null && Number.isFinite(x));
  const fuelSpreadLPer100 =
    lPer100Values.length >= 2 ? Math.max(...lPer100Values) - Math.min(...lPer100Values) : 0;

  let fastest = ok[0]!;
  for (const o of ok) {
    if (o.durationSec < fastest.durationSec) fastest = o;
  }

  let lowestToll = ok[0]!;
  for (const o of ok) {
    if (o.tollCostEur < lowestToll.tollCostEur) lowestToll = o;
  }

  let fuelEff = ok[0]!;
  let bestLPer100 = Infinity;
  for (const o of ok) {
    const km = o.distanceM / 1000;
    if (km <= 0 || o.fuelConsumptionL == null) continue;
    const l100 = (o.fuelConsumptionL / km) * 100;
    if (l100 < bestLPer100) {
      bestLPer100 = l100;
      fuelEff = o;
    }
  }

  return {
    fastest: fastest.id,
    lowestToll: tollSpread >= TOLL_SPREAD_MIN_EUR ? lowestToll.id : null,
    mostFuelEfficient:
      lPer100Values.length >= 2 && fuelSpreadLPer100 >= FUEL_SPREAD_MIN_L_PER_100 ? fuelEff.id : null,
  };
}

function assignComparisonRoles(options: RoutePlanOption[]): RoutePlanOption[] {
  const ok = options.filter((o) => !o.error && o.polyline.length);
  if (ok.length === 0) return options.map((o) => ({ ...o }));
  if (ok.length === 1) {
    const only = ok[0]!.id;
    return options.map((o) => (o.id === only ? { ...o, comparisonRole: "single" as const } : { ...o }));
  }
  const t = quickCompareTargets(options);
  return options.map((o) => {
    if (o.error || !o.polyline.length) return { ...o };
    if (t.fastest && o.id === t.fastest) return { ...o, comparisonRole: "fastest" as const };
    if (t.lowestToll && o.id === t.lowestToll) return { ...o, comparisonRole: "lowest_toll" as const };
    if (t.mostFuelEfficient && o.id === t.mostFuelEfficient) return { ...o, comparisonRole: "most_fuel" as const };
    return { ...o, comparisonRole: "other" as const };
  });
}

/** @deprecated Use quickCompareTargets */
export function pickDecisionVariants(options: RoutePlanOption[]): {
  fastest: RouteOptionId | null;
  cheapest: RouteOptionId | null;
  balanced: RouteOptionId | null;
  fuelEfficient: RouteOptionId | null;
} {
  const q = quickCompareTargets(options);
  return {
    fastest: q.fastest,
    cheapest: q.lowestToll,
    balanced: null,
    fuelEfficient: q.mostFuelEfficient,
  };
}

/**
 * One route for one strategy (Phase 3C clean-route solver). Same truck parameters and
 * departure handling as `planRouteOptions`; avoidAreas are a request, not a guarantee.
 */
export async function planStrategyRoute(
  key: string,
  waypoints: { lat: number; lng: number }[],
  planning: PlanRoutePlanningOpts,
  strategy: "FASTEST" | "NO_TOLLS",
  id: string,
): Promise<RoutePlanOption> {
  const fuelEur = planning.fuelEurPerL ?? DEFAULT_FUEL_EUR_PER_L;
  if (planning.waypointStops.length !== waypoints.length - 1) return emptyOption(id, "Waypoint / stop metadata mismatch");
  const preset = planning.truck.preset;
  const cargoWeightKg = Math.max(0, planning.truck.cargoWeightKg);
  const totalWeightKg = totalVehicleWeightKg(preset, cargoWeightKg);
  const maxCargo = maxCargoKg(preset);
  const loadRatio = maxCargo > 0 ? Math.min(1, cargoWeightKg / maxCargo) : 0;
  const lPer = (planning.lPer100kmFallback ?? preset.lPer100kmFallback) * (1 + 0.12 * loadRatio);
  const baseQuery = buildTruckRoutingQuery(preset, totalWeightKg);
  const departAt = planning.departAt ?? new Date();
  const departAtIso = toTomTomDateTime(departAt);
  baseQuery.set("departAt", departAtIso);
  const query = mergeRoutingParams(baseQuery, { maxAlternatives: "0", ...(strategy === "NO_TOLLS" ? { avoid: "tollRoads" } : {}) });
  if (planning.navigationLanguage) {
    query.set("instructionsType", "text");
    query.set("language", planning.navigationLanguage);
    query.append("sectionType", "speedLimit");
    query.append("sectionType", "lanes");
  }
  const res = await calculateRoutes(key, waypoints, query, `strategy:${strategy}`, planning.avoidAreas);
  if (!("routes" in res) || !res.routes[0]) return emptyOption(id, "error" in res ? res.error : "No route returned");
  const route = res.routes[0];
  if (!tomtomRouteValid(route)) return emptyOption(id, "Geometria/resumo inválidos na resposta do fornecedor");
  const routing: RouteRequestInfo = { role: strategy === "NO_TOLLS" ? "toll_avoiding" : "primary", params: paramsRecord(query), avoidAreas: planning.avoidAreas };
  const c = toCandidate({ route, routing }, lPer, fuelEur, totalWeightKg);
  const s = route.summary;
  return {
    id,
    title: strategy === "NO_TOLLS" ? "Sem portagens" : "Mais rápida",
    subtitle: planning.avoidAreas?.length ? `desvio pedido (${planning.avoidAreas.length} áreas)` : "",
    polyline: c.polyline,
    distanceM: s.lengthInMeters,
    durationSec: s.travelTimeInSeconds,
    trafficDelaySec: s.trafficDelayInSeconds ?? 0,
    fuelConsumptionL: c.fuelL,
    fuelCostEur: c.fuelCostEur,
    tollCostEur: c.tollCostEur,
    tollPricedEur: c.tollPricedEur,
    tollEstimatedEur: c.tollEstimatedEur,
    tollDataQuality: c.tollDataQuality,
    tollSectionCount: c.tollSectionCount,
    stopArrivals: buildStopArrivals(route, planning.waypointStops, departAt),
    legDurationSec: c.legDurationSec,
    legPointCounts: route.legs.map((l) => l.points.length),
    roadNumbers: roadNumbersFromRoute(route),
    departAtIso,
    arrivalAtIso: s.arrivalTime,
    routing,
    colorIndex: 20,
    comparisonRole: "other",
    ...(planning.navigationLanguage ? { navigation: { instructions: route.guidance?.instructions ?? [], sections: route.sections ?? [] } } : {}),
  };
}
