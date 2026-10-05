import type { Certainty, EvidenceSpan } from "../types";

/*
 * STRICT semantic-extraction contract shared by every semantic extractor (deterministic
 * Portuguese rules today; an LLM provider when configured). No prose answer enters the
 * data model: only this structure, validated, with evidence for every value.
 *
 * A value that the evidence does not support is null (UNKNOWN). Nothing is inferred
 * because it would be plausible.
 */

export const SEMANTIC_SCHEMA_VERSION = 1;

export type Valued<T> = {
  value: T;
  /** Original Portuguese wording the value was read from. */
  sourceWording: string;
  evidence: EvidenceSpan[];
  certainty: Exclude<Certainty, "UNKNOWN">;
  note?: string;
} | null;

export type EventKind =
  /** Road closed to traffic (both directions unless a direction is given). */
  | "ROAD_CLOSURE"
  /** One direction closed, traffic diverted. */
  | "CARRIAGEWAY_CLOSURE"
  /** Lanes suppressed but traffic still passes. */
  | "LANE_RESTRICTION"
  /** Single lane, alternating traffic (lights/agents) — traffic passes. */
  | "ALTERNATING_TRAFFIC"
  | "ROADWORKS"
  /** A class of vehicles is prohibited (typically a legal act). */
  | "VEHICLE_PROHIBITION"
  | "OTHER";

/** Local times "HH:MM" (Europe/Lisbon). */
export type TimeWindow = { start: string; end: string };

export type TemporalSpec =
  /** Specific days, optionally restricted to a daily window. No window ⇒ hours not stated. */
  | { kind: "days"; dates: string[]; window?: TimeWindow }
  /** Every day between two dates. With a window it RECURS daily; without, hours not stated. */
  | { kind: "daily_range"; from: string; to: string; window?: TimeWindow }
  /** Overnight windows: each night starts on `nights[i]` at window.start and ends next day at window.end. */
  | { kind: "nights"; nights: string[]; window: TimeWindow }
  /** From a local date-time with no stated end. */
  | { kind: "open_ended"; from: string; basis: "until_further_notice" | "until_completion" | "no_end_stated" }
  /** From a local date-time for a stated number of days. */
  | { kind: "duration"; from: string; days: number }
  /** Permanent recurring rule (e.g. working days 07:00–21:00), in force from a date. */
  | { kind: "weekly"; days: "WORKDAYS" | "WEEKENDS" | "EVERY_DAY"; window: TimeWindow; inForceFrom?: string };

export type VehicleCondition =
  | { kind: "gross_weight_over_kg"; kg: number }
  | { kind: "axles_at_least"; n: number }
  | { kind: "first_axle_height_at_least_m"; m: number }
  | { kind: "goods_transport" }
  | { kind: "dangerous_goods" };

export type VehicleScope =
  | "ALL_TRAFFIC"
  /** "pesados de mercadorias" (keep distinct from generic "pesados"). */
  | "GOODS_HGV"
  /** "pesados" without the goods qualifier. */
  | "HGV"
  | "WEIGHT_OVER"
  | "DANGEROUS_GOODS";

export type VehicleSpec = {
  scope: VehicleScope;
  /** Conditions stated by the source (definition clauses), each with its own evidence. */
  conditions: { condition: VehicleCondition; sourceWording: string; evidence: EvidenceSpan[] }[];
  exceptions: { text: string; evidence: EvidenceSpan[] }[];
};

export type PkReference = { road: string; km: number; sourceWording: string; evidence: EvidenceSpan[] };

export type SemanticEvent = {
  kind: Valued<EventKind>;
  roads: Valued<string[]>;
  locationText: Valued<string>;
  /** Named junctions/nodes ("Nó de X" … "Nó de Y"). */
  nodes: Valued<{ from: string; to: string }[]>;
  pk: PkReference[];
  municipalities: Valued<string[]>;
  direction: Valued<string>;
  temporal: Valued<TemporalSpec>;
  vehicles: Valued<VehicleSpec>;
  diversion: Valued<string>;
};

export type SemanticExtraction = {
  schemaVersion: typeof SEMANTIC_SCHEMA_VERSION;
  extractorId: string;
  extractorVersion: number;
  documentKind: Valued<"ROAD_NOTICE" | "LEGAL_ACT" | "NOT_ROAD_INFORMATION">;
  /** Organisation the document CLAIMS to come from (authority is resolved separately, never from this). */
  authorityClaim: Valued<string>;
  events: SemanticEvent[];
  issues: string[];
  /** Instruction-like text found in the document. Recorded as data; never followed. */
  injectionSignals: string[];
};

/* ─── Strict validation (rejects unknown keys / wrong types) ─── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;
const EVENT_KINDS: EventKind[] = ["ROAD_CLOSURE", "CARRIAGEWAY_CLOSURE", "LANE_RESTRICTION", "ALTERNATING_TRAFFIC", "ROADWORKS", "VEHICLE_PROHIBITION", "OTHER"];
const SCOPES: VehicleScope[] = ["ALL_TRAFFIC", "GOODS_HGV", "HGV", "WEIGHT_OVER", "DANGEROUS_GOODS"];

function keys(o: Record<string, unknown>, allowed: string[], required: string[], where: string, p: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) p.push(`${where}: chave inesperada «${k}»`);
  for (const k of required) if (!(k in o)) p.push(`${where}: falta «${k}»`);
}

function span(v: unknown, where: string, p: string[]) {
  if (!isObj(v)) return void p.push(`${where}: evidência inválida`);
  keys(v, ["snapshotId", "representation", "location", "quote"], ["snapshotId", "representation", "location", "quote"], where, p);
  if (typeof v.quote !== "string" || !v.quote) p.push(`${where}: citação vazia`);
  const l = v.location;
  if (!isObj(l) || typeof l.start !== "number" || typeof l.end !== "number" || l.end <= l.start) p.push(`${where}: localização inválida`);
}

function valued(v: unknown, where: string, p: string[], ok: (x: unknown) => boolean) {
  if (v === null) return;
  if (!isObj(v)) return void p.push(`${where}: formato inválido`);
  keys(v, ["value", "sourceWording", "evidence", "certainty", "note"], ["value", "sourceWording", "evidence", "certainty"], where, p);
  if (!ok(v.value)) p.push(`${where}.value inválido`);
  if (typeof v.sourceWording !== "string") p.push(`${where}.sourceWording inválido`);
  if (v.certainty !== "EXPLICIT" && v.certainty !== "INTERPRETED") p.push(`${where}.certainty inválido`);
  if (!Array.isArray(v.evidence) || v.evidence.length === 0) p.push(`${where}: valor sem evidência`);
  else v.evidence.forEach((e, i) => span(e, `${where}.evidence[${i}]`, p));
}

const strArr = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === "string" && s.length > 0);
const win = (w: unknown) => isObj(w) && typeof w.start === "string" && HHMM.test(w.start) && typeof w.end === "string" && HHMM.test(w.end);

export function validTemporal(t: unknown): boolean {
  if (!isObj(t)) return false;
  switch (t.kind) {
    case "days":
      return Array.isArray(t.dates) && t.dates.length > 0 && t.dates.every((d) => typeof d === "string" && LOCAL_DATE.test(d)) && (t.window === undefined || win(t.window));
    case "daily_range":
      return typeof t.from === "string" && LOCAL_DATE.test(t.from) && typeof t.to === "string" && LOCAL_DATE.test(t.to) && t.to >= t.from && (t.window === undefined || win(t.window));
    case "nights":
      return Array.isArray(t.nights) && t.nights.length > 0 && t.nights.every((d) => typeof d === "string" && LOCAL_DATE.test(d)) && win(t.window);
    case "open_ended":
      return typeof t.from === "string" && LOCAL_DT.test(t.from) && ["until_further_notice", "until_completion", "no_end_stated"].includes(String(t.basis));
    case "duration":
      return typeof t.from === "string" && LOCAL_DT.test(t.from) && typeof t.days === "number" && t.days > 0 && t.days < 3650;
    case "weekly":
      return ["WORKDAYS", "WEEKENDS", "EVERY_DAY"].includes(String(t.days)) && win(t.window) && (t.inForceFrom === undefined || (typeof t.inForceFrom === "string" && LOCAL_DATE.test(t.inForceFrom)));
    default:
      return false;
  }
}

function validVehicles(v: unknown, where: string, p: string[]): boolean {
  if (!isObj(v) || !SCOPES.includes(v.scope as VehicleScope) || !Array.isArray(v.conditions) || !Array.isArray(v.exceptions)) return false;
  v.conditions.forEach((c, i) => {
    if (!isObj(c) || !isObj(c.condition) || typeof c.sourceWording !== "string" || !Array.isArray(c.evidence) || !c.evidence.length) p.push(`${where}.conditions[${i}] inválido`);
    else c.evidence.forEach((e, j) => span(e, `${where}.conditions[${i}].evidence[${j}]`, p));
  });
  v.exceptions.forEach((x, i) => {
    if (!isObj(x) || typeof x.text !== "string" || !Array.isArray(x.evidence) || !x.evidence.length) p.push(`${where}.exceptions[${i}] inválido`);
  });
  return true;
}

export function validateSemanticExtraction(v: unknown): { ok: true; value: SemanticExtraction } | { ok: false; problems: string[] } {
  const p: string[] = [];
  if (!isObj(v)) return { ok: false, problems: ["não é um objeto"] };
  keys(v, ["schemaVersion", "extractorId", "extractorVersion", "documentKind", "authorityClaim", "events", "issues", "injectionSignals"], ["schemaVersion", "extractorId", "extractorVersion", "documentKind", "authorityClaim", "events", "issues", "injectionSignals"], "raiz", p);
  if (v.schemaVersion !== SEMANTIC_SCHEMA_VERSION) p.push(`versão de esquema ${String(v.schemaVersion)} desconhecida`);
  valued(v.documentKind, "documentKind", p, (x) => ["ROAD_NOTICE", "LEGAL_ACT", "NOT_ROAD_INFORMATION"].includes(String(x)));
  valued(v.authorityClaim, "authorityClaim", p, (x) => typeof x === "string");
  if (!Array.isArray(v.events)) p.push("events não é lista");
  else
    v.events.forEach((e, i) => {
      const w = `events[${i}]`;
      if (!isObj(e)) return void p.push(`${w} inválido`);
      keys(e, ["kind", "roads", "locationText", "nodes", "pk", "municipalities", "direction", "temporal", "vehicles", "diversion"], ["kind", "roads", "locationText", "nodes", "pk", "municipalities", "direction", "temporal", "vehicles", "diversion"], w, p);
      valued(e.kind, `${w}.kind`, p, (x) => EVENT_KINDS.includes(x as EventKind));
      valued(e.roads, `${w}.roads`, p, strArr);
      valued(e.locationText, `${w}.locationText`, p, (x) => typeof x === "string");
      valued(e.nodes, `${w}.nodes`, p, (x) => Array.isArray(x) && x.every((n) => isObj(n) && typeof n.from === "string" && typeof n.to === "string"));
      if (!Array.isArray(e.pk)) p.push(`${w}.pk não é lista`);
      else e.pk.forEach((k, j) => (!isObj(k) || typeof k.road !== "string" || typeof k.km !== "number" || !Number.isFinite(k.km) ? p.push(`${w}.pk[${j}] inválido`) : (k.evidence as unknown[]).forEach((s, n) => span(s, `${w}.pk[${j}].evidence[${n}]`, p))));
      valued(e.municipalities, `${w}.municipalities`, p, strArr);
      valued(e.direction, `${w}.direction`, p, (x) => typeof x === "string");
      valued(e.temporal, `${w}.temporal`, p, validTemporal);
      valued(e.vehicles, `${w}.vehicles`, p, (x) => validVehicles(x, `${w}.vehicles`, p));
      valued(e.diversion, `${w}.diversion`, p, (x) => typeof x === "string");
    });
  if (!Array.isArray(v.issues) || !v.issues.every((x) => typeof x === "string")) p.push("issues inválido");
  if (!Array.isArray(v.injectionSignals) || !v.injectionSignals.every((x) => typeof x === "string")) p.push("injectionSignals inválido");
  return p.length ? { ok: false, problems: p } : { ok: true, value: v as unknown as SemanticExtraction };
}
