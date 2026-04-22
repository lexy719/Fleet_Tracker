export type PlaceSuggestionKind = "city" | "address" | "poi";

export type GeocodeHit = {
  /** Stable id from TomTom when present (for list keys). */
  id?: string;
  lat: number;
  lng: number;
  /** Best single-line label for the field and confirmation (often TomTom freeformAddress). */
  label: string;
  /** Primary line in suggestion dropdown (place / street / POI name). */
  primaryLine?: string;
  /** Secondary line: municipality, region, country — no coordinates. */
  secondaryLine?: string;
  /** Suggestion type for UI badge when set. */
  kind?: PlaceSuggestionKind;
};
