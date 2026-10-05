import { canonicalJson } from "../regulations/decisionInputs";
import type { CandidateConstraint } from "../ingestion/types";

/*
 * Field-level review diff between two versions (OLD → NEW). Each version stays a separate
 * immutable record with its own snapshot and evidence; the diff never rewrites history.
 */

export type FieldChange = { field: string; label: string; change: "CHANGED" | "ADDED" | "REMOVED" | "UNCHANGED"; old: string; new: string };

const local = (s: string) => (s.startsWith("9999") ? "sem fim" : `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`);
const periods = (p: { start: string; end: string }[] | undefined) => (p?.length ? p.map((x) => `${local(x.start)}–${local(x.end)}`).join("; ") : "—");

function render(c: CandidateConstraint | undefined, f: string): string {
  if (!c) return "—";
  const v = c.fields;
  switch (f) {
    case "kind": return c.research?.eventKind ?? v.category.value ?? "—";
    case "roads": return v.roads.value?.join(", ") ?? "—";
    case "location": return v.locationText.value ?? "—";
    case "direction": return v.direction.value ?? "—";
    case "periods": return periods(v.periods.value);
    case "start": return v.periods.value?.[0] ? local(v.periods.value[0].start).slice(6) : "—";
    case "end": return v.periods.value?.length ? local(v.periods.value.at(-1)!.end).slice(6) : "—";
    case "vehicles": return c.research?.vehicles ? `${c.research.vehicles.scope}${c.research.vehicles.conditions.length ? ` (${c.research.vehicles.conditions.map((x) => x.sourceWording).join("; ")})` : ""}` : v.vehicleApplicability.value?.kind ?? "desconhecido";
    case "exceptions": return c.research?.vehicles?.exceptions.map((x) => x.text).join(" | ") || "—";
    case "geometry": return c.research ? `${c.research.geometry.status}${c.research.geometry.geometryIds.length ? ` (${c.research.geometry.geometryIds.join(", ")})` : ""}` : v.geometry.provenance;
    case "diversion": return v.diversion.value ?? "—";
    default: return canonicalJson((v as Record<string, { value?: unknown }>)[f]?.value ?? null);
  }
}

const FIELDS: [string, string][] = [
  ["kind", "tipo"],
  ["roads", "estrada"],
  ["location", "troço"],
  ["direction", "sentido"],
  ["start", "hora de início"],
  ["end", "hora de fim"],
  ["periods", "períodos"],
  ["vehicles", "veículos"],
  ["exceptions", "exceções"],
  ["geometry", "geometria"],
  ["diversion", "desvio"],
];

export function diffCandidates(oldC: CandidateConstraint | undefined, newC: CandidateConstraint | undefined): FieldChange[] {
  return FIELDS.map(([f, label]) => {
    const o = render(oldC, f), n = render(newC, f);
    const change = o === n ? "UNCHANGED" : o === "—" ? "ADDED" : n === "—" ? "REMOVED" : "CHANGED";
    return { field: f, label, change, old: o, new: n };
  });
}

/**
 * Diff between two versions of a document series (events matched by location, then order).
 * Returns pairs; unmatched old events are REMOVED, unmatched new ones ADDED.
 */
export function diffSeries(oldVersion: CandidateConstraint[], newVersion: CandidateConstraint[]): { old?: CandidateConstraint; new?: CandidateConstraint; changes: FieldChange[] }[] {
  const used = new Set<CandidateConstraint>();
  const pairs: { old?: CandidateConstraint; new?: CandidateConstraint; changes: FieldChange[] }[] = [];
  for (const o of oldVersion) {
    const m =
      newVersion.find((n) => !used.has(n) && n.fields.locationText.value === o.fields.locationText.value && n.fields.direction.value === o.fields.direction.value) ??
      newVersion.find((n) => !used.has(n) && n.research?.eventIndex === o.research?.eventIndex);
    if (m) used.add(m);
    pairs.push({ old: o, ...(m ? { new: m } : {}), changes: diffCandidates(o, m) });
  }
  for (const n of newVersion) if (!used.has(n)) pairs.push({ new: n, changes: diffCandidates(undefined, n) });
  return pairs;
}
