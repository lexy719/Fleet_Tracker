import type { LegalFeedItem, SourceRecord } from "../ingestion/types";
import { fold } from "../ingestion/text";
import type { Authority, DiscoveryScope, DiscoveryTask, RawDiscoveryHit } from "./types";

/*
 * Discovery providers. Each answers ONE task (authority × topic) for a scope and returns
 * raw hits. Providers never classify trust and never create constraints; the orchestrator
 * does classification, and only the 3B pipeline creates candidates.
 *
 * A future search/agent provider (web search + model) plugs in here with the same shape.
 */

export type ProviderContext = { scope: DiscoveryScope; authorities: Authority[]; now: Date };

export interface DiscoveryProvider {
  id: string;
  label: string;
  /** Does this provider answer this task at all? (No cache entry is created otherwise.) */
  handles(task: DiscoveryTask, ctx: ProviderContext): boolean;
  discover(task: DiscoveryTask, ctx: ProviderContext): Promise<RawDiscoveryHit[]>;
}

export class ProviderUnavailableError extends Error {}

/** Registered sources of the task's authority that cover the topic. */
export function registeredSourceProvider(sources: SourceRecord[]): DiscoveryProvider {
  const covers = (s: SourceRecord, t: DiscoveryTask) => {
    const p = s.coverage.provides;
    switch (t.topic) {
      case "temporary_closures":
        return p.includes("closures") || p.includes("temporary_events");
      case "roadworks":
        return p.includes("roadworks") || p.includes("temporary_events");
      case "temporary_restrictions":
        return p.includes("temporary_events");
      case "legal_acts":
        return p.includes("legal_acts");
      case "permanent_hgv_restrictions":
      case "access_zones":
      case "dimension_weight_limits":
      case "dangerous_goods":
        return p.includes("permanent_restrictions");
    }
  };
  return {
    id: "registered-sources",
    label: "Fontes registadas",
    handles: () => true,
    async discover(task, ctx) {
      const authority = ctx.authorities.find((a) => a.id === task.authorityId);
      if (!authority) return [];
      return sources
        .filter((s) => (authority.sourceIds.includes(s.id) || (authority.synthetic && s.synthetic)) && s.enabled && covers(s, task))
        .map((s) => ({
          url: s.landingUrl,
          title: s.name,
          snippet: s.coverage.network,
          method: "registered_source" as const,
          topics: [task.topic],
          municipalityCodes: task.municipalityCodes,
          roads: task.roads,
          sourceType: s.type,
          registeredSourceId: s.id,
        }));
    },
  };
}

/**
 * Diário da República index (already ingested by 3B): items that are potentially
 * relevant AND mention a municipality in scope. Legal text needs extraction — the
 * result is a document, never a constraint.
 */
export function legalIndexProvider(items: LegalFeedItem[]): DiscoveryProvider {
  return {
    id: "legal-index",
    label: "Índice do Diário da República",
    handles: (task, ctx) => task.topic === "legal_acts" || ctx.authorities.find((a) => a.id === task.authorityId)?.kind === "municipality",
    async discover(task, ctx) {
      const authority = ctx.authorities.find((a) => a.id === task.authorityId);
      if (!authority || authority.kind !== "municipality" || !(task.topic === "permanent_hgv_restrictions" || task.topic === "access_zones")) return [];
      const name = fold(authority.name.replace(/^Município de /, ""));
      return items
        .filter((i) => i.relevance !== "NOT_RELEVANT" && fold(`${i.title} ${i.description}`).includes(name))
        .map((i) => ({
          url: i.url,
          title: i.title,
          snippet: i.description,
          method: "legal_index" as const,
          topics: [task.topic],
          municipalityCodes: task.municipalityCodes,
          roads: [],
          sourceType: "STATIC_LEGAL_RECORD" as const,
          ...(i.publishedOn ? { publishedAt: i.publishedOn } : {}),
        }));
    },
  };
}

/** Web/search discovery is not configured (no key, no backend). Reported as a gap. */
export const UNAVAILABLE_SEARCH_PROVIDER: DiscoveryProvider = {
  id: "web-search",
  label: "Pesquisa web",
  handles: (task, ctx) => ctx.authorities.find((a) => a.id === task.authorityId)?.kind === "municipality" || task.authorityId === "ip",
  discover: () => Promise.reject(new ProviderUnavailableError("sem fornecedor de pesquisa configurado (requer backend/chave)")),
};

/**
 * Search provider over a fixed list of hits (development fixtures / tests). Returns the
 * hits relevant to the task's municipalities or roads. The hits are hostile input.
 */
export function fixtureSearchProvider(hits: RawDiscoveryHit[], id = "fixture-search"): DiscoveryProvider {
  return {
    id,
    label: "Pesquisa (fixtures de desenvolvimento)",
    handles: () => true,
    async discover(task) {
      // Answer only what the task (and so its cache key) is about: its road, or its municipality.
      return hits.filter(
        (h) =>
          h.topics.includes(task.topic) &&
          (task.road ? h.roads.includes(task.road) : h.municipalityCodes.some((c) => task.municipalityCodes.includes(c))),
      );
    },
  };
}

