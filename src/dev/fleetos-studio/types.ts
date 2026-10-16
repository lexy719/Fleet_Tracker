import { type LiveJob, type MapExtra } from "./StageMap";
import { type Edit, type Need, type Plan } from "./model";
import type { FuelView } from "./fuel";

export type Draft = Edit;
export type Mode = null | "driver" | "route" | "truck" | "trailer" | "window" | "notify" | "exception" | "plan";
export type Filter = "all" | "me" | "road";
export type Lens = "jobs" | "drivers" | "fleet" | "stops" | "fuel";
export const LENS: [Lens, string][] = [
  ["jobs", "Transportes"],
  ["stops", "Paragens"],
  ["fuel", "Combustível"],
  ["drivers", "Motoristas"],
  ["fleet", "Frota"],
];
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
