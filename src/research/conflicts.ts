import type { CandidateConstraint } from "../ingestion/types";
import type { GeometryRecord, RegulationRecord } from "../regulations/types";
import { nameTokens } from "./geometryResolution";

/*
 * Conflicts. When two pieces of knowledge about the same road disagree, FleetOS does NOT
 * pick whichever arrived last: it records a CONFLICT with both evidence chains and the
 * trust gate / reviewer decides.
 */

export type ConflictKind =
  | "IDENTICAL"
  | "CONSISTENT"
  | "OVERLAPPING"
  | "CONFLICTING_DATES"
  | "CONFLICTING_GEOMETRY"
  | "CONFLICTING_VEHICLES"
  | "NEWER_REVISION"
  | "SECONDARY_VS_PRIMARY";

/** Normalised comparable view of one piece of knowledge. */
export type Fact = {
  id: string;
  origin: "research" | "curated" | "ingested";
  sourceLabel: string;
  primary: boolean;
  seriesKey?: string;
  /** Snapshot the fact was read from (events of the same snapshot are siblings, never conflicts). */
  snapshotId?: string;
  observedAt?: string;
  roads: string[];
  /** Junction-name token sets ("vila pouca treixedo" …); empty when unknown. */
  location: string[][];
  pk: number[];
  direction?: string;
  /** Local periods "YYYY-MM-DDTHH:MM" pairs. */
  periods: { start: string; end: string }[];
  vehicles: string | null;
  evidence: string[];
};

export type Conflict = {
  id: string;
  kind: ConflictKind;
  a: Fact;
  b: Fact;
  fields: string[];
  detail: string;
  resolution: "REVIEWER_DECIDES" | "NONE_NEEDED";
};

const ROAD = /\b(A|IP|IC|EN|ER|EM|N|R)\s?(\d{1,3})(?:-(\d{1,2}))?\b|\bVCI\b/g;
const roadsOf = (s: string) => [...s.matchAll(ROAD)].map((m) => (m[0] === "VCI" ? "VCI" : `${m[1]}${m[2]}${m[3] ? `-${m[3]}` : ""}`));

export function factFromCandidate(c: CandidateConstraint, primary = true): Fact {
  const nodes = c.research ? c.research.geometry.original.nodes : [];
  return {
    id: c.id,
    origin: c.research ? "research" : "ingested",
    sourceLabel: c.sourceId,
    primary,
    ...(c.research ? { seriesKey: c.research.seriesKey, snapshotId: c.research.snapshotId } : {}),
    observedAt: c.lastSeenAt,
    roads: c.fields.roads.value ?? [],
    location: nodes.map((n) => [...nameTokens(n.from), "|", ...nameTokens(n.to)]),
    pk: c.research?.geometry.original.pk.map((p) => p.km) ?? [],
    ...(c.fields.direction.value ? { direction: c.fields.direction.value } : {}),
    periods: c.fields.periods.value ?? [],
    vehicles: c.research?.vehicles ? c.research.vehicles.scope : c.fields.vehicleApplicability.value?.kind ?? null,
    evidence: (c.evidence ?? []).filter((e) => e.field === "temporal" || e.field === "location" || e.field === "nodes").flatMap((e) => e.evidence.map((s) => s.quote)),
  };
}

export function factFromRegulation(r: RegulationRecord, geometries: GeometryRecord[]): Fact {
  const g = geometries.find((x) => x.id === r.location.geometryId);
  const label = g?.label ?? "";
  const nodeMatch = label.match(/Nó de (.+?) ↔ Nó de (.+)$/);
  return {
    id: r.id,
    origin: r.origin ? "ingested" : "curated",
    sourceLabel: r.instrument,
    primary: true,
    roads: [...new Set([...roadsOf(r.title), ...roadsOf(label)])],
    location: nodeMatch ? [[...nameTokens(nodeMatch[1]!), "|", ...nameTokens(nodeMatch[2]!)]] : [],
    pk: [],
    periods: r.when.activePeriods?.map((p) => ({ start: p.start, end: p.end })) ?? [],
    // Curated fact conditions are a different vocabulary from extracted vehicle scopes: not comparable (null), never "different".
    vehicles: r.appliesTo.kind === "all" && r.appliesTo.of.length === 0 ? "ALL_TRAFFIC" : null,
    evidence: r.evidence.flatMap((e) => (e.quote ? [e.quote] : [])),
  };
}

function sameLocation(a: Fact, b: Fact): "SAME" | "DIFFERENT" | "UNKNOWN" {
  if (a.location.length && b.location.length) {
    const key = (t: string[]) => {
      const i = t.indexOf("|");
      const x = t.slice(0, i).sort().join(" "), y = t.slice(i + 1).sort().join(" ");
      return [x, y].sort().join("↔");
    };
    // Token containment (labels may carry extra particles, e.g. "do Outeiro" vs "de Outeiro").
    const cover = (p: string[], q: string[]) => {
      const pi = p.indexOf("|"), qi = q.indexOf("|");
      const [p1, p2, q1, q2] = [p.slice(0, pi), p.slice(pi + 1), q.slice(0, qi), q.slice(qi + 1)];
      const sub = (u: string[], v: string[]) => u.every((t) => v.includes(t)) || v.every((t) => u.includes(t));
      return (sub(p1, q1) && sub(p2, q2)) || (sub(p1, q2) && sub(p2, q1));
    };
    if (a.location.some((x) => b.location.some((y) => key(x) === key(y) || cover(x, y)))) return "SAME";
    return "DIFFERENT";
  }
  if (a.pk.length && b.pk.length) return a.pk.some((k) => b.pk.some((j) => Math.abs(k - j) < 0.5)) ? "SAME" : "DIFFERENT";
  return "UNKNOWN";
}

function periodRelation(a: Fact, b: Fact): "EQUAL" | "A_IN_B" | "B_IN_A" | "OVERLAP" | "DISJOINT" | "UNKNOWN" {
  if (!a.periods.length || !b.periods.length) return "UNKNOWN";
  const k = (p: { start: string; end: string }) => `${p.start}/${p.end}`;
  const A = new Set(a.periods.map(k)), B = new Set(b.periods.map(k));
  // "Inside" means the SAME period appears in the other set (a subset of the list), not a
  // nested-but-different period: 21:00–05:00 vs 21:00–06:00 is a disagreement.
  const inside = (p: { start: string; end: string }, q: { start: string; end: string }[]) => q.some((x) => x.start === p.start && x.end === p.end);
  if (A.size === B.size && [...A].every((x) => B.has(x))) return "EQUAL";
  if (a.periods.every((p) => inside(p, b.periods))) return "A_IN_B";
  if (b.periods.every((p) => inside(p, a.periods))) return "B_IN_A";
  const overlap = a.periods.some((p) => b.periods.some((q) => p.start < q.end && q.start < p.end));
  return overlap ? "OVERLAP" : "DISJOINT";
}

const dayMs = 86_400_000;
const near = (a: Fact, b: Fact) => {
  const t = (f: Fact) => f.periods.map((p) => Date.parse(`${p.start}:00Z`)).filter(Number.isFinite);
  const ta = t(a), tb = t(b);
  return ta.length && tb.length && ta.some((x) => tb.some((y) => Math.abs(x - y) < 14 * dayMs));
};

/** Compare two facts about (possibly) the same thing. Null = unrelated (different roads or far apart in time). */
export function compareFacts(a: Fact, b: Fact): Conflict | null {
  if (!a.roads.some((r) => b.roads.includes(r))) return null;
  if (a.snapshotId && a.snapshotId === b.snapshotId) return null; // events of one document
  const loc = sameLocation(a, b);
  const per = periodRelation(a, b);
  if (per === "DISJOINT" && !near(a, b)) return null;
  const id = `conf-${[a.id, b.id].sort().join("~")}`;
  // OVERLAPPING with an unknown location is recorded as a note: nothing is known to disagree.
  const mk = (kind: ConflictKind, fields: string[], detail: string): Conflict => ({ id, kind, a, b, fields, detail, resolution: kind === "IDENTICAL" || kind === "CONSISTENT" || kind === "OVERLAPPING" ? "NONE_NEEDED" : "REVIEWER_DECIDES" });
  const vehiclesDiffer = a.vehicles && b.vehicles && a.vehicles !== b.vehicles;
  if (a.seriesKey && a.seriesKey === b.seriesKey && a.snapshotId !== b.snapshotId) {
    return mk("NEWER_REVISION", ["periods", "location"], "mesma série de avisos da mesma autoridade — prevalece a revisão mais recente APENAS após revisão; o histórico mantém-se");
  }
  if (a.primary !== b.primary && (per !== "EQUAL" || loc === "DIFFERENT")) {
    return mk("SECONDARY_VS_PRIMARY", ["periods", "location"], "fonte secundária diverge da fonte primária — a secundária nunca prevalece");
  }
  if (loc === "DIFFERENT" && (per === "EQUAL" || per === "OVERLAP" || per === "A_IN_B" || per === "B_IN_A")) return mk("CONFLICTING_GEOMETRY", ["location"], "mesmo período, troços diferentes");
  if (loc !== "DIFFERENT" && vehiclesDiffer && per !== "DISJOINT") return mk("CONFLICTING_VEHICLES", ["vehicles"], `veículos: ${a.vehicles} vs ${b.vehicles}`);
  if (loc === "SAME" && per === "EQUAL") return mk("IDENTICAL", [], "mesmo troço e mesmos períodos");
  if (loc === "SAME" && (per === "A_IN_B" || per === "B_IN_A")) return mk("CONSISTENT", [], "períodos de um contidos nos do outro, mesmo troço");
  if (loc === "SAME" && (per === "DISJOINT" || per === "OVERLAP")) return mk("CONFLICTING_DATES", ["periods"], "mesmo troço, períodos diferentes");
  if (per === "OVERLAP" || per === "EQUAL") return mk("OVERLAPPING", ["periods"], "mesma estrada e períodos sobrepostos — troço não comparável");
  return null;
}

export function detectConflicts(facts: Fact[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < facts.length; i++)
    for (let j = i + 1; j < facts.length; j++) {
      if (facts[i]!.origin !== "research" && facts[j]!.origin !== "research") continue;
      const c = compareFacts(facts[i]!, facts[j]!);
      if (c) out.push(c);
    }
  return out;
}
