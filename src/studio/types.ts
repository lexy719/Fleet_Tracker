import { type LiveJob, type MapExtra } from "./StageMap";
import { type Edit, type Need, type Plan } from "./model";
import type { FuelView } from "./fuel";

export type Draft = Edit;
export type Mode = null | "driver" | "route" | "truck" | "trailer" | "window" | "notify" | "exception" | "plan";
export type Filter = "all" | "me" | "road";
export type Lens = "jobs" | "drivers" | "fleet" | "stops" | "fuel" | "work" | "combo" | "layers" | "v2";
export const LENS: [Lens, string][] = [
  ["jobs", "Transportes"],
  ["work", "Trabalhos"],
  ["stops", "Paragens"],
  ["fuel", "Combustível"],
  ["drivers", "Motoristas"],
  ["fleet", "Frota"],
];

/* URL of each place in the app (deep links, back/forward). */
// The map is the main page; the transport list (Operação) has its own address.
const LENS_PATH: Record<Lens, string> = { jobs: "/operacao", stops: "/paragens", fuel: "/combustivel", work: "/trabalhos", drivers: "/motoristas", fleet: "/frota", combo: "/combinar", layers: "/", v2: "/v2" };
export type Place = { lens: Lens; openId: string | null; planning: boolean; creating: boolean };
export function placePath(p: Place): string {
  if (p.creating) return "/novo";
  if (p.planning) return "/expedicao";
  if (p.openId) return `/transporte/${encodeURIComponent(p.openId)}`;
  return LENS_PATH[p.lens];
}
export function placeOfPath(path: string, fallback: Lens = "layers"): Place {
  const clean = path.replace(/\/$/, "") || "/";
  const base: Place = { lens: fallback, openId: null, planning: false, creating: false };
  if (clean === "/novo") return { ...base, creating: true };
  if (clean === "/expedicao") return { ...base, planning: true };
  const t = clean.match(/^\/transporte\/(.+)$/);
  if (t) return { ...base, openId: decodeURIComponent(t[1]) };
  if (clean === "/mapa") return { ...base, lens: "layers" };
  const lens = (Object.entries(LENS_PATH) as [Lens, string][]).find(([, v]) => v === clean)?.[0];
  return { ...base, lens: lens ?? fallback };
}
export const PANEL_W = 468;
export const DECK_W = 404;

export type Extra = MapExtra;
export type Hover = (h: boolean) => void;

/** A person. If they are on a transport, the transport's card becomes this card (shared bg/ref/plate keys). */
export type BoardRow = {
  key: string;
  job: Row;
  i: number;
  city: string;
  site: string;
  type: "pickup" | "stop" | "delivery";
  window: [string, string];
  eta: number | null;
  state: "done" | "active" | "late" | "early" | "due" | "unplanned";
  next: boolean;
  at: [number, number];
};

/** One stop of one transport, on the day's board. The transport's next stop carries its card. */
export type Row = LiveJob & { forecast: Plan; notified?: string; exception?: string; edit: Edit; need: Need; fuel: FuelView | null };

/** Human summary of what an edit changes (toast + commit bar). */
