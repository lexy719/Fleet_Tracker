import { fold } from "../ingestion/text";
import type { SemanticEvent } from "./semantic/schema";

/*
 * Geometry resolution — SEPARATE from extraction. The extractor only reports what the text
 * says (road, PK, named junctions, direction); it never produces coordinates. This
 * resolver maps those references to geometry using data-driven reference sets:
 *
 *   1. authority-supplied geometry (structured feeds) — handled by the deterministic parsers;
 *   2. official chainage (PK) reference          — only if a reference dataset is loaded;
 *   3. named segment reference (junction ↔ junction → existing geometry);
 *   4. otherwise UNRESOLVED.
 *
 * A name match is an interpretation (INTERPRETED, review required) — never VERIFIED.
 */

export type GeometryResolutionStatus = "RESOLVED_REFERENCE" | "INTERPRETED_CANDIDATE" | "AMBIGUOUS" | "UNRESOLVED";

export type GeometryResolution = {
  status: GeometryResolutionStatus;
  method: "chainage_reference" | "named_segment_reference" | "none";
  /** What the source said, preserved verbatim. */
  original: { roads: string[]; pk: { road: string; km: number; wording: string }[]; nodes: { from: string; to: string }[]; direction?: string };
  geometryIds: string[];
  referenceDataset?: string;
  uncertainty?: string;
  reason: string;
};

/** A named segment (junction ↔ junction) mapped to an existing geometry record. DATA, not logic. */
export type NamedSegmentReference = { road: string; label: string; geometryId: string; dataset: string };

/** Official chainage reference (PK → coordinates). None is loaded in FleetOS today. */
export interface ChainageReference {
  dataset: string;
  version: string;
  /** Null when the road/PK is unknown, ambiguous (branches/resets) or reclassified. */
  locate(road: string, km: number): { lat: number; lng: number; uncertaintyM: number } | { ambiguous: string } | null;
}

const STOP = new Set(["no", "nos", "de", "do", "da", "dos", "das", "e", "o", "a"]);
const ABBR: Record<string, string> = { "st.a": "santa", "sta": "santa", "s.": "sao", s: "sao", "sto": "santo", "n.a": "nossa", "sr.a": "senhora" };

export function nameTokens(name: string): string[] {
  return fold(name)
    .replace(/[()«»"]/g, " ")
    .replace(/st\.ª|st\.a/g, "santa")
    .split(/[\s—–-]+/)
    .map((t) => ABBR[t] ?? t.replace(/\.$/, ""))
    .map((t) => ABBR[t] ?? t)
    .filter((t) => t && !STOP.has(t) && t !== "↔");
}

/** Do all key tokens of the junction name appear in the reference label? */
function nameMatches(node: string, label: string): boolean {
  const lt = new Set(nameTokens(label));
  const nt = nameTokens(node);
  return nt.length > 0 && nt.every((t) => lt.has(t));
}

export function resolveEventGeometry(e: SemanticEvent, refs: NamedSegmentReference[], chainage: ChainageReference | null): GeometryResolution {
  const roads = e.roads?.value ?? [];
  const original = {
    roads,
    pk: e.pk.map((p) => ({ road: p.road, km: p.km, wording: p.sourceWording })),
    nodes: e.nodes?.value ?? [],
    ...(e.direction ? { direction: e.direction.value } : {}),
  };
  // 3. Named segments
  if (original.nodes.length) {
    const ids: string[] = [];
    const unmatched: string[] = [];
    for (const n of original.nodes) {
      const hits = refs.filter((r) => roads.includes(r.road) && nameMatches(n.from, r.label) && nameMatches(n.to, r.label));
      if (hits.length === 1) ids.push(hits[0]!.geometryId);
      else unmatched.push(`${n.from} ↔ ${n.to}${hits.length > 1 ? " (várias correspondências)" : ""}`);
    }
    if (ids.length && !unmatched.length) {
      return {
        status: "INTERPRETED_CANDIDATE",
        method: "named_segment_reference",
        original,
        geometryIds: [...new Set(ids)],
        referenceDataset: refs.find((r) => r.geometryId === ids[0])?.dataset,
        uncertainty: "correspondência por nome de nós — confirmar que o troço curado corresponde ao do aviso",
        reason: "troço nomeado no aviso corresponde a uma geometria de referência existente",
      };
    }
    if (unmatched.some((u) => u.includes("várias"))) return { status: "AMBIGUOUS", method: "named_segment_reference", original, geometryIds: [], reason: `nós ambíguos: ${unmatched.join("; ")}` };
  }
  // 2. Chainage
  if (original.pk.length) {
    if (!chainage) {
      return { status: "UNRESOLVED", method: "none", original, geometryIds: [], reason: "PK preservado, mas não há referencial oficial de quilometragem carregado — geometria não resolvida (nada inventado)" };
    }
    const located = original.pk.map((p) => chainage.locate(p.road, p.km));
    if (located.some((l) => l && "ambiguous" in l)) return { status: "AMBIGUOUS", method: "chainage_reference", original, geometryIds: [], referenceDataset: `${chainage.dataset}@${chainage.version}`, reason: "PK ambíguo no referencial (ramos/reinícios/reclassificação) — requer revisão" };
    if (located.some((l) => !l)) return { status: "UNRESOLVED", method: "chainage_reference", original, geometryIds: [], referenceDataset: `${chainage.dataset}@${chainage.version}`, reason: "PK não encontrado no referencial" };
    return { status: "RESOLVED_REFERENCE", method: "chainage_reference", original, geometryIds: [], referenceDataset: `${chainage.dataset}@${chainage.version}`, reason: "PK resolvido no referencial oficial" };
  }
  return { status: "UNRESOLVED", method: "none", original, geometryIds: [], reason: original.nodes.length ? "nós nomeados sem geometria de referência correspondente" : "o texto não delimita o troço (sem PK nem nós)" };
}
