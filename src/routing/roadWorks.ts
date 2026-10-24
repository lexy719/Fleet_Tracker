import type { RoutePlanOption } from "../tomtom/planRoutes";
import type { RoutingAvoidance, RoutingProvider } from "../solver/types";

/*
 * Road works and incidents on the route: decide whether to go through or around.
 *
 * - Closure: the road is shut → always go around (if the works are active when the truck passes).
 * - Partial (alternating traffic with lights, lane closed, conditioned traffic): the road stays open
 *   but costs time → go around only when the detour costs less than the expected delay.
 * Expected delay = the larger of a default per kind and any measured live delay (traffic feed).
 */

export type RoadWorkKind = "closure" | "alternating" | "lane_closure" | "conditioned";

export type RoadWork = {
  id: string;
  source: string;
  road: string;
  km?: number;
  lat: number;
  lng: number;
  kind: RoadWorkKind;
  /** ISO dates (Lisbon); open-ended when missing. */
  start?: string;
  end?: string;
  /** Daily hours in Lisbon time ("22:00"–"06:00" crosses midnight); all day when missing. */
  hours?: { from: string; to: string };
  text: string;
  /** Length of the affected stretch when the text states it ("entre o pk 104 e o 111"), km. */
  lengthKm?: number;
  /** The affected stretch itself, when it could be placed on the road ([lat, lng]); preferred over lengthKm. */
  line?: [number, number][];
  /** Measured live delay at the works (e.g. from a traffic feed), minutes. */
  liveDelayMin?: number;
  /** A live traffic feed covers this spot (then its measurement replaces part of the default). */
  liveTraffic?: boolean;
};

/** Stretch length from IP wording: "entre o pk 104 e o 111", "do km 27,145 ao km 34,050". */
export function extentKmFromText(text: string): number | undefined {
  const t = text.toLowerCase();
  const m = t.match(/(?:pk|km)\s*(\d{1,3}(?:[.,+]\d{1,3})?)\s*(?:e|a|ao|até)\s*(?:o\s+)?(?:pk|km)?\s*(\d{1,3}(?:[.,+]\d{1,3})?)/);
  if (!m) return undefined;
  const n = (s: string) => Number(s.replace("+", ".").replace(",", "."));
  const len = Math.abs(n(m[2]!) - n(m[1]!));
  return len > 0 && len < 100 ? len : undefined;
}

/** Default expected delay per kind (minutes). A starting point, to be calibrated with real truck GPS. */
export const DEFAULT_DELAY_MIN: Record<Exclude<RoadWorkKind, "closure">, number> = {
  alternating: 8,
  conditioned: 5,
  lane_closure: 3,
};

/** Reads the measure from IP's Portuguese text. Unknown wording → "conditioned" (open, some delay). */
export function classifyWorkText(text: string): RoadWorkKind {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/corte total|transito (sera )?cortado|encerra(r|mento)? ao transito|interdi[ct]a|ambas as vias e ambos os sentidos|estrada cortada/.test(t)) return "closure";
  if (/semaforo|alternad|sentido unico alternado/.test(t)) return "alternating";
  if (/corte de via|via (da )?(esquerda|direita|central) (cortada|suprimida)|supressao de via|faixa cortada/.test(t)) return "lane_closure";
  return "conditioned";
}

/**
 * Expected delay going through (minutes). Closure → Infinity. With a live traffic reading the measured
 * delay counts, with a small floor (traffic lights still cost a stop even without a queue).
 */
export function expectedDelayMin(w: RoadWork): number {
  if (w.kind === "closure") return Infinity;
  if (w.liveTraffic) return Math.max(w.liveDelayMin ?? 0, w.kind === "alternating" ? 3 : 1);
  return DEFAULT_DELAY_MIN[w.kind];
}

/** "entre as 09h30 e as 18h00", "das 22h00 às 06h00" → { from, to }. */
export function hoursFromText(text: string): { from: string; to: string } | undefined {
  const m = text.toLowerCase().match(/(?:entre as|das)\s*(\d{1,2})h(\d{2})?\s*(?:do dia \d{1,2}(?: de \w+)?\s*)?(?:e as|às|as|até às)\s*(\d{1,2})h(\d{2})?/);
  if (!m) return undefined;
  const hm = (h: string, mm?: string) => `${h.padStart(2, "0")}:${mm ?? "00"}`;
  return { from: hm(m[1]!, m[2]), to: hm(m[3]!, m[4]) };
}

const lisbon = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function lisbonParts(at: Date): { day: string; hm: string } {
  const p = Object.fromEntries(lisbon.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/**
 * Active at this moment (Lisbon time): within the date range and the daily hours. For hours that cross
 * midnight (22:00–06:00) the early-morning part belongs to the previous evening's date.
 */
export function activeAt(w: RoadWork, at: Date): boolean {
  const { day, hm } = lisbonParts(at);
  const inDates = (d: string) => (!w.start || w.start <= d) && (!w.end || w.end >= d);
  if (!w.hours) return inDates(day);
  const { from, to } = w.hours;
  if (from <= to) return inDates(day) && hm >= from && hm < to;
  if (hm >= from) return inDates(day);
  if (hm < to) return inDates(lisbonParts(new Date(at.getTime() - 24 * 3600 * 1000)).day);
  return false;
}

const M_LAT = 111_320;
const distM = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LAT * Math.cos((a[0] * Math.PI) / 180));

/** Index of the route point closest to the works and its distance (m). */
export function nearestOnRoute(poly: [number, number][], p: [number, number]): { i: number; d: number } {
  let i = 0, d = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const dk = distM(poly[k]!, p);
    if (dk < d) { d = dk; i = k; }
  }
  return { i, d };
}

/** The stretch of route within `halfM` of the works (the piece to avoid). */
export function stretchAround(poly: [number, number][], i: number, halfM: number): [number, number][] {
  let a = i, b = i, s = 0;
  while (a > 0 && s < halfM) { s += distM(poly[a]!, poly[a - 1]!); a--; }
  s = 0;
  while (b < poly.length - 1 && s < halfM) { s += distM(poly[b]!, poly[b + 1]!); b++; }
  return poly.slice(a, b + 1);
}

export const ON_ROUTE_M = 60;
const STRETCH_HALF_M = 250;

/**
 * Points of a placed stretch away from its two ends. A detour may join the road exactly where the works
 * end (the official diversion often does), so touching an end is not driving through the works.
 */
export function innerProbes(line: [number, number][], marginM = ON_ROUTE_M): [number, number][] {
  const cum = [0];
  for (let k = 1; k < line.length; k++) cum.push(cum[k - 1]! + distM(line[k - 1]!, line[k]!));
  const total = cum.at(-1)!;
  const inner = line.filter((_, k) => cum[k]! >= marginM && cum[k]! <= total - marginM);
  if (inner.length) return inner;
  let mid = 0;
  for (let k = 1; k < line.length; k++) if (Math.abs(cum[k]! - total / 2) < Math.abs(cum[mid]! - total / 2)) mid = k;
  return [line[mid]!];
}

const MIN_SHARED_M = 150;

/**
 * Does the route drive along the works? A single probe works: within ON_ROUTE_M. A placed stretch: the route
 * must share a real piece of it (≥ 150 m, or half of a shorter one), not just cross it or pass a ramp beside it.
 */
export function drivesThrough(poly: [number, number][], probes: [number, number][]): boolean {
  const hit = probes.map((p) => nearestOnRoute(poly, p).d <= ON_ROUTE_M);
  if (probes.length === 1) return hit[0]!;
  let shared = 0, total = 0;
  for (let k = 1; k < probes.length; k++) {
    const seg = distM(probes[k - 1]!, probes[k]!);
    total += seg;
    if (hit[k - 1] && hit[k]) shared += seg;
  }
  return shared >= Math.min(MIN_SHARED_M, total / 2);
}

export type WorksDecision = {
  work: RoadWork;
  onRoute: boolean;
  action: "none" | "go_around" | "go_through";
  /** Expected delay going through (minutes); Infinity for a closure. */
  delayThroughMin: number;
  /** Extra time of the detour vs the route through the works, ignoring the delay (minutes). */
  detourExtraMin?: number;
  detourExtraKm?: number;
  reason: string;
};

/**
 * For each active work on the route: closure → detour; partial → detour only if it saves time.
 * Detours accumulate (several works on one trip). Returns the chosen route and one decision per work.
 */
export async function decideAroundWorks(
  base: RoutePlanOption,
  works: RoadWork[],
  provider: RoutingProvider,
  at: Date,
): Promise<{ route: RoutePlanOption; decisions: WorksDecision[] }> {
  let route = base;
  const avoid: RoutingAvoidance[] = [];
  const decisions: WorksDecision[] = [];
  for (const w of works) {
    const probes: [number, number][] = w.line?.length ? innerProbes(w.line) : [[w.lat, w.lng]];
    const near = probes.map((p) => nearestOnRoute(route.polyline, p)).reduce((a, b) => (b.d < a.d ? b : a));
    if (!activeAt(w, at) || !drivesThrough(route.polyline, probes)) {
      decisions.push({ work: w, onRoute: false, action: "none", delayThroughMin: 0, reason: activeAt(w, at) ? "fora da rota" : "não ativa nesta data" });
      continue;
    }
    const delay = expectedDelayMin(w);
    // A stated stretch (e.g. pk 104–111) is blocked on both sides of the point: its direction along the road is unknown.
    const halfM = w.lengthKm ? Math.max(STRETCH_HALF_M, w.lengthKm * 1000) : STRETCH_HALF_M;
    // A placed stretch is blocked without its ends: those are the junctions where the diversion starts, still open.
    const placed = w.line?.length ? innerProbes(w.line) : [];
    const lines = placed.length >= 2 ? [placed] : w.line?.length ? [w.line] : [stretchAround(route.polyline, near.i, halfM)];
    const tryAvoid = [...avoid, { id: `works-${w.id}`, kind: "avoid_path" as const, lines, constraintIds: [w.id] }];
    let detour: RoutePlanOption | null = null;
    try { detour = await provider.route("FASTEST", tryAvoid); } catch { detour = null; }
    const stillThrough = detour ? drivesThrough(detour.polyline, probes) : true;
    if (!detour || stillThrough) {
      decisions.push({ work: w, onRoute: true, action: "go_through", delayThroughMin: delay, reason: w.kind === "closure" ? "sem alternativa encontrada — rota bloqueada, rever" : "sem alternativa razoável" });
      continue;
    }
    const extraMin = (detour.durationSec - route.durationSec) / 60;
    const extraKm = (detour.distanceM - route.distanceM) / 1000;
    if (extraMin < delay) {
      avoid.push(...tryAvoid.slice(avoid.length));
      route = detour;
      decisions.push({ work: w, onRoute: true, action: "go_around", delayThroughMin: delay, detourExtraMin: extraMin, detourExtraKm: extraKm,
        reason: w.kind === "closure" ? "estrada fechada" : `o desvio custa ${extraMin.toFixed(0)} min, a espera ~${delay.toFixed(0)} min` });
    } else {
      decisions.push({ work: w, onRoute: true, action: "go_through", delayThroughMin: delay, detourExtraMin: extraMin, detourExtraKm: extraKm,
        reason: `a espera ~${delay.toFixed(0)} min custa menos que o desvio (+${extraMin.toFixed(0)} min, +${extraKm.toFixed(1)} km)` });
    }
  }
  return { route, decisions };
}
