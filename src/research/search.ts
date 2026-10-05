import type { SearchHit } from "./authority";

/*
 * Search provider contract. Search results are discovery CLUES: ranking is never authority
 * evidence, and only verified official URLs can become source proposals (after validation).
 */

export class SearchUnavailableError extends Error {}

export interface SearchProvider {
  id: string;
  search(query: string): Promise<SearchHit[]>;
}

/** Web search through the local research boundary — unavailable unless a server-side key exists. */
export function proxySearch(fetchImpl: typeof fetch = (u, i) => fetch(u, i)): SearchProvider {
  return {
    id: "research-proxy-search",
    async search(query) {
      let r: Response;
      try {
        r = await fetchImpl(`/__research/search?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      } catch (e) {
        throw new SearchUnavailableError(`fronteira de pesquisa inacessível: ${e instanceof Error ? e.message : String(e)}`);
      }
      const j = (await r.json().catch(() => null)) as { ok?: boolean; hits?: SearchHit[]; error?: { kind?: string; message?: string } } | null;
      if (r.status === 503 || r.status === 404 || j?.error?.kind === "UNAVAILABLE") throw new SearchUnavailableError(j?.error?.message ?? "pesquisa web não configurada");
      if (!j?.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
      return (j.hits ?? []).filter((h) => typeof h?.url === "string").map((h) => ({ url: h.url, title: String(h.title ?? ""), snippet: String(h.snippet ?? ""), ...(h.rank ? { rank: h.rank } : {}) }));
    },
  };
}

/** No provider configured: every search reports SEARCH_UNAVAILABLE. */
export const NO_SEARCH: SearchProvider = {
  id: "none",
  search: () => Promise.reject(new SearchUnavailableError("sem fornecedor de pesquisa web configurado (requer chave no servidor)")),
};
