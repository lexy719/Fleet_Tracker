export type EntryMode = "search" | "coords";

/** One route vertex (start, intermediate stop, or finish). */
export type PlannerPointDraft = {
  id: string;
  mode: EntryMode;
  /** Resolved place name (search) or short label (coords) */
  label: string;
  lat: number | null;
  lng: number | null;
  /** Search input while typing */
  searchText: string;
  latInput: string;
  lngInput: string;
};

export function createEmptyPoint(id: string): PlannerPointDraft {
  return {
    id,
    mode: "search",
    label: "",
    lat: null,
    lng: null,
    searchText: "",
    latInput: "",
    lngInput: "",
  };
}
