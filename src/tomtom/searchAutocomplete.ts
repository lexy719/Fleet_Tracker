import { getTomTomRestBase } from "./config";
import type { GeocodeHit } from "./geocodeTypes";
import { tomtomFetchJson } from "./httpClient";
import { geocodeHitFromTomTomResult, type TomTomSearchResult } from "./placeSuggestionFromTomTom";

/**
 * TomTom Fuzzy Search — typeahead suggestions (Iberia-first; optional env override).
 * @see https://developer.tomtom.com/search-api/documentation/search-service/fuzzy-search
 */

const IDX_DEFAULT = "POI,PAD,Str,Xstr,Geo,Addr";

function buildParams(
  key: string,
  limit: number,
  countrySet: string | undefined,
): URLSearchParams {
  const params = new URLSearchParams({
    key,
    limit: String(limit),
    typeahead: "true",
    language: "en-GB",
    idxSet: IDX_DEFAULT,
  });

  const raw = import.meta.env.VITE_TOMTOM_SEARCH_COUNTRY_SET as string | undefined;
  if (raw === "") {
    /* Worldwide — `.env`: VITE_TOMTOM_SEARCH_COUNTRY_SET= */
  } else if (typeof raw === "string" && raw.trim().length > 0) {
    params.set("countrySet", raw.trim());
  } else if (countrySet) {
    params.set("countrySet", countrySet);
  }
  return params;
}

async function fetchSearchJson(
  q: string,
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<{ results?: TomTomSearchResult[] }> {
  const pathQuery = encodeURIComponent(q.trim());
  const url = `${getTomTomRestBase()}/search/2/search/${pathQuery}.json?${params.toString()}`;
  try {
    return await tomtomFetchJson<{ results?: TomTomSearchResult[] }>(url, { signal, timeoutMs: 9_000, retries: 1 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("403")) {
      throw new Error(`${error.message}. Ensure your TomTom key enables the Search API.`);
    }
    throw error;
  }
}

function mapResults(data: { results?: TomTomSearchResult[] }, q: string, limit: number): GeocodeHit[] {
  const out: GeocodeHit[] = [];
  for (const r of data.results ?? []) {
    const hit = geocodeHitFromTomTomResult(r, q);
    if (!hit) continue;
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchAutocomplete(
  key: string,
  query: string,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const limit = Math.min(20, Math.max(1, opts?.limit ?? 8));
  const signal = opts?.signal;

  const envOverride = import.meta.env.VITE_TOMTOM_SEARCH_COUNTRY_SET as string | undefined;
  const singleShot = envOverride !== undefined && envOverride.trim() === "" ? "worldwide" : envOverride?.trim() ? "fixed" : null;

  const attempts: (() => URLSearchParams)[] =
    singleShot === "worldwide"
      ? [() => buildParams(key, limit, undefined)]
      : singleShot === "fixed"
        ? [() => buildParams(key, limit, envOverride!.trim())]
        : [
            () => buildParams(key, limit, "PT,ES"),
            () => buildParams(key, limit, undefined),
          ];

  for (const build of attempts) {
    const data = await fetchSearchJson(q, build(), signal);
    const hits = mapResults(data, q, limit);
    if (hits.length > 0) return hits;
  }

  return [];
}
