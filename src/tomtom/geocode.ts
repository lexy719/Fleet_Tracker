/** Search API — resolve addresses / POIs to coordinates */

import { getTomTomRestBase } from "./config";
import type { GeocodeHit } from "./geocodeTypes";
import { tomtomFetchJson } from "./httpClient";
import { geocodeHitFromTomTomResult, type TomTomSearchResult } from "./placeSuggestionFromTomTom";

export type { GeocodeHit, PlaceSuggestionKind } from "./geocodeTypes";

export async function searchPlaces(key: string, query: string): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (!q) return null;

  const params = new URLSearchParams({
    key,
    limit: "1",
    typeahead: "false",
    language: "en-GB",
    idxSet: "POI,PAD,Str,Xstr,Geo,Addr",
  });

  const raw = import.meta.env.VITE_TOMTOM_SEARCH_COUNTRY_SET as string | undefined;
  if (raw === "") {
    /* worldwide */
  } else if (typeof raw === "string" && raw.trim().length > 0) {
    params.set("countrySet", raw.trim());
  } else {
    params.set("countrySet", "PT,ES");
  }

  const pathQuery = encodeURIComponent(q);
  const url = `${getTomTomRestBase()}/search/2/search/${pathQuery}.json?${params.toString()}`;
  const data = await tomtomFetchJson<{ results?: TomTomSearchResult[] }>(url, {
    timeoutMs: 9_000,
    retries: 1,
  });

  const r = data.results?.[0];
  return r ? geocodeHitFromTomTomResult(r, q) : null;
}
