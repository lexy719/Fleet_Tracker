import type { Job } from "../data/types";
import { planningJob } from "../domain/planning/fixtures";

/*
 * Synthetic Iberian week for one artic based in Porto (Mon 12 – Fri 16 Oct 2026).
 * Places are real; the loads, windows and rates are INVENTED to resemble a normal spot/contract
 * mix (some loads chain well, some are far apart, one is a long-haul trap far from home).
 * Rates ≈ 1.6 €/loaded km, order of magnitude only.
 */

export const PORTO: [number, number] = [41.1579, -8.6291];
export const WEEK_START = "2026-10-12T06:00:00+01:00";
/** Driver must be back in Porto by Friday evening. */
export const HOME_BY = "2026-10-16T20:00:00+01:00";

const P = {
  maia: [41.235, -8.62],
  braga: [41.5454, -8.4265],
  aveiro: [40.6405, -8.6538],
  viseu: [40.6566, -7.9125],
  leiria: [39.7436, -8.8071],
  azambuja: [39.07, -8.868],
  vigo: [42.2406, -8.7207],
  valladolid: [41.6523, -4.7245],
  salamanca: [40.9701, -5.6635],
  burgos: [42.3439, -3.6969],
  coslada: [40.4238, -3.5613],
  getafe: [40.3057, -3.7329],
  guadalajara: [40.6329, -3.1669],
  zaragoza: [41.626, -0.962],
  barcelona: [41.3874, 2.1686],
  valencia: [39.4699, -0.3763],
  sevilla: [37.3891, -5.9845],
} satisfies Record<string, [number, number]>;

type Spec = {
  id: string;
  from: keyof typeof P;
  to: keyof typeof P;
  /** ISO with offset (PT +01:00, ES +02:00). */
  pickup: [string, string];
  delivery: [string, string];
  rateEur: number;
  weightKg: number;
};

export const WEEK_LOADS: Spec[] = [
  { id: "L01 Porto→Vigo", from: "maia", to: "vigo", pickup: ["2026-10-12T06:00+01:00", "2026-10-12T09:00+01:00"], delivery: ["2026-10-12T09:00+02:00", "2026-10-12T15:00+02:00"], rateEur: 320, weightKg: 18_000 },
  { id: "L02 Maia→Madrid", from: "maia", to: "coslada", pickup: ["2026-10-12T07:00+01:00", "2026-10-12T11:00+01:00"], delivery: ["2026-10-13T07:00+02:00", "2026-10-13T14:00+02:00"], rateEur: 950, weightKg: 22_000 },
  { id: "L03 Braga→Valladolid", from: "braga", to: "valladolid", pickup: ["2026-10-12T08:00+01:00", "2026-10-12T12:00+01:00"], delivery: ["2026-10-12T18:00+02:00", "2026-10-13T12:00+02:00"], rateEur: 700, weightKg: 20_000 },
  { id: "L04 Salamanca→Viseu", from: "salamanca", to: "viseu", pickup: ["2026-10-13T08:00+02:00", "2026-10-13T14:00+02:00"], delivery: ["2026-10-13T15:00+01:00", "2026-10-14T10:00+01:00"], rateEur: 450, weightKg: 16_000 },
  { id: "L05 Getafe→Zaragoza", from: "getafe", to: "zaragoza", pickup: ["2026-10-13T12:00+02:00", "2026-10-13T19:00+02:00"], delivery: ["2026-10-14T06:00+02:00", "2026-10-14T12:00+02:00"], rateEur: 560, weightKg: 21_000 },
  { id: "L06 Guadalajara→Barcelona", from: "guadalajara", to: "barcelona", pickup: ["2026-10-13T14:00+02:00", "2026-10-13T20:00+02:00"], delivery: ["2026-10-14T08:00+02:00", "2026-10-14T16:00+02:00"], rateEur: 880, weightKg: 19_000 },
  { id: "L07 Madrid→Azambuja", from: "coslada", to: "azambuja", pickup: ["2026-10-14T08:00+02:00", "2026-10-14T14:00+02:00"], delivery: ["2026-10-15T06:00+01:00", "2026-10-15T12:00+01:00"], rateEur: 900, weightKg: 22_000 },
  { id: "L08 Zaragoza→Burgos", from: "zaragoza", to: "burgos", pickup: ["2026-10-14T10:00+02:00", "2026-10-14T16:00+02:00"], delivery: ["2026-10-14T18:00+02:00", "2026-10-15T12:00+02:00"], rateEur: 480, weightKg: 18_000 },
  { id: "L09 Barcelona→Valencia", from: "barcelona", to: "valencia", pickup: ["2026-10-14T14:00+02:00", "2026-10-14T20:00+02:00"], delivery: ["2026-10-15T08:00+02:00", "2026-10-15T14:00+02:00"], rateEur: 560, weightKg: 20_000 },
  { id: "L10 Burgos→Aveiro", from: "burgos", to: "aveiro", pickup: ["2026-10-15T07:00+02:00", "2026-10-15T13:00+02:00"], delivery: ["2026-10-15T18:00+01:00", "2026-10-16T12:00+01:00"], rateEur: 820, weightKg: 23_000 },
  { id: "L11 Valencia→Sevilla", from: "valencia", to: "sevilla", pickup: ["2026-10-15T12:00+02:00", "2026-10-15T18:00+02:00"], delivery: ["2026-10-16T08:00+02:00", "2026-10-16T14:00+02:00"], rateEur: 1050, weightKg: 21_000 },
  { id: "L12 Leiria→Porto", from: "leiria", to: "maia", pickup: ["2026-10-15T13:00+01:00", "2026-10-15T18:00+01:00"], delivery: ["2026-10-16T06:00+01:00", "2026-10-16T12:00+01:00"], rateEur: 360, weightKg: 15_000 },
  { id: "L13 Valladolid→Porto", from: "valladolid", to: "maia", pickup: ["2026-10-15T14:00+02:00", "2026-10-16T08:00+02:00"], delivery: ["2026-10-16T10:00+01:00", "2026-10-16T18:00+01:00"], rateEur: 640, weightKg: 20_000 },
  { id: "L14 Zaragoza→Braga", from: "zaragoza", to: "braga", pickup: ["2026-10-15T06:00+02:00", "2026-10-15T12:00+02:00"], delivery: ["2026-10-16T06:00+01:00", "2026-10-16T14:00+01:00"], rateEur: 1250, weightKg: 22_000 },
];

/** Loading/unloading time per stop (service): 45 min — meals fall inside the legal breaks. */
export const SERVICE_SEC = 45 * 60;

export function weekJobs(): Job[] {
  const now = Date.parse(WEEK_START);
  return WEEK_LOADS.map((s) => {
    const j = planningJob(s.id, P[s.from], P[s.to], now, "dry", s.weightKg);
    j.rateEur = s.rateEur;
    j.client = `${s.from} → ${s.to}`;
    j.stops[0]!.city = s.from;
    j.stops[1]!.city = s.to;
    j.stops[0]!.windowStartAt = new Date(s.pickup[0]).toISOString();
    j.stops[0]!.windowEndAt = new Date(s.pickup[1]).toISOString();
    j.stops[1]!.windowStartAt = new Date(s.delivery[0]).toISOString();
    j.stops[1]!.windowEndAt = new Date(s.delivery[1]).toISOString();
    j.operationalRequirements = { serviceSecByStop: Object.fromEntries(j.stops.map((st) => [st.id, SERVICE_SEC])) };
    return j;
  });
}
