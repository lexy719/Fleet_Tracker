/*
 * What FleetOS knows about PERMANENT restrictions per municipality (CAOP DTMN code).
 * DATA, not code. A municipality absent from this table is NOT_CURATED: FleetOS has not
 * reviewed its regulations — which is not the same as "no restrictions".
 */

export type MunicipalCuration = {
  status: "NOT_CURATED" | "KNOWN_NOT_ENCODED" | "PARTIAL";
  /** Restrictions known to exist but not encoded (never evaluated). */
  knownNotEncoded: { label: string; source: string; url?: string }[];
  notes: string[];
};

export const MUNICIPAL_CURATION: Record<string, MunicipalCuration> = {
  "1312": {
    status: "KNOWN_NOT_ENCODED",
    knownNotEncoded: [
      {
        label: "ZAR — Zona de acesso restrito a pesados > 3,5 t (08h–10h e 18h–20h)",
        source: "Código Regulamentar do Município do Porto, art. D-3/8.º",
      },
    ],
    notes: ["Geometria da ZAR só disponível num visualizador (não descarregável) — não codificada."],
  },
};

export function curationFor(code: string): MunicipalCuration {
  return MUNICIPAL_CURATION[code] ?? { status: "NOT_CURATED", knownNotEncoded: [], notes: [] };
}
