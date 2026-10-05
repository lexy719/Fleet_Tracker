import { canonicalJson, hashString } from "../regulations/decisionInputs";
import type { CandidateFields, Field, FieldState, GeometryProvenance, ParseOutput } from "./types";

export type ParsedCandidate = ParseOutput["candidates"][number];

export const unknownField = <T>(note?: string): Field<T> => (note ? { state: "UNKNOWN", note } : { state: "UNKNOWN" });

export const field = <T>(state: Exclude<FieldState, "UNKNOWN">, value: T, basis: string, note?: string): Field<T> =>
  note ? { state, value, basis, note } : { state, value, basis };

export function emptyFields(): CandidateFields {
  return {
    category: unknownField(),
    roads: unknownField(),
    locationText: unknownField(),
    geometry: { state: "UNKNOWN", provenance: "UNKNOWN" },
    validity: unknownField(),
    periods: unknownField(),
    vehicleApplicability: unknownField("A fonte não indica a que veículos se aplica."),
    direction: unknownField(),
    diversion: unknownField(),
    description: unknownField(),
  };
}

export function geometryField(
  state: Exclude<FieldState, "UNKNOWN">,
  value: NonNullable<CandidateFields["geometry"]["value"]>,
  provenance: GeometryProvenance,
  basis: string,
  note?: string,
): CandidateFields["geometry"] {
  return { ...field(state, value, basis, note), provenance };
}

/**
 * Hash of the normalized VALUES only (not states/notes) — detects source changes.
 * Coordinates are rounded to ~1 m so re-serialisation noise is not a change.
 */
export function candidateContentHash(title: string, f: CandidateFields): string {
  const round = (v: unknown): unknown =>
    typeof v === "number" ? Math.round(v * 1e5) / 1e5 : Array.isArray(v) ? v.map(round) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;
  const values = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, round((x as Field<unknown>).value ?? null)]));
  return hashString(canonicalJson({ title, values }));
}

/** Which top-level fields differ in value between two versions. */
export function changedFields(a: CandidateFields, b: CandidateFields): string[] {
  return (Object.keys(a) as (keyof CandidateFields)[]).filter(
    (k) => canonicalJson(a[k].value ?? null) !== canonicalJson(b[k].value ?? null),
  );
}
