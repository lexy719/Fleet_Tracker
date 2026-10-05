import { hashString } from "../regulations/decisionInputs";
import type { CacheStatus, DiscoveryCacheEntry, DiscoveryTask, DiscoveryTopic, RawDiscoveryHit } from "./types";

/*
 * Discovery cache: one entry per (provider, authority, topic, vehicle class). Entries are
 * reused until `refreshAfter`; after that they are STALE and refreshed — never silently
 * served as current. Temporary information expires fast, regulations slowly.
 */

const MIN = 60_000;
export const CACHE_TTL_MIN: Record<DiscoveryTopic, number> = {
  temporary_closures: 60,
  temporary_restrictions: 60,
  roadworks: 6 * 60,
  permanent_hgv_restrictions: 7 * 24 * 60,
  dimension_weight_limits: 7 * 24 * 60,
  access_zones: 7 * 24 * 60,
  dangerous_goods: 7 * 24 * 60,
  legal_acts: 24 * 60,
};
/** Failed lookups are retried sooner. */
export const ERROR_RETRY_MIN = 10;

export function taskKey(t: Pick<DiscoveryTask, "authorityId" | "topic" | "vehicleClass" | "road">): string {
  return `${t.authorityId}|${t.topic}|${t.vehicleClass}|${t.road ?? "*"}`;
}

export function cacheKey(providerId: string, task: DiscoveryTask): string {
  return `${providerId}|${task.key}`;
}

export function cacheStatus(entry: DiscoveryCacheEntry | undefined, now: Date): CacheStatus {
  if (!entry) return "MISS";
  if (Date.parse(entry.refreshAfter) <= now.getTime()) return "STALE";
  return entry.ok ? "HIT" : "ERROR";
}

export function makeEntry(providerId: string, task: DiscoveryTask, now: Date, result: { ok: true; hits: RawDiscoveryHit[] } | { ok: false; error: string }): DiscoveryCacheEntry {
  const ttl = result.ok ? CACHE_TTL_MIN[task.topic] : ERROR_RETRY_MIN;
  return {
    schemaVersion: 1,
    key: cacheKey(providerId, task),
    task,
    providerId,
    discoveredAt: now.toISOString(),
    refreshAfter: new Date(now.getTime() + ttl * MIN).toISOString(),
    ok: result.ok,
    ...(result.ok ? {} : { error: result.error }),
    hits: result.ok ? result.hits : [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Validate a persisted cache entry; corrupt entries are discarded (treated as MISS). */
export function parseCacheEntry(raw: unknown): DiscoveryCacheEntry | null {
  if (!isObj(raw) || raw.schemaVersion !== 1) return null;
  if (typeof raw.key !== "string" || typeof raw.providerId !== "string" || typeof raw.ok !== "boolean") return null;
  if (typeof raw.discoveredAt !== "string" || !Number.isFinite(Date.parse(raw.discoveredAt))) return null;
  if (typeof raw.refreshAfter !== "string" || !Number.isFinite(Date.parse(raw.refreshAfter))) return null;
  if (!isObj(raw.task) || !Array.isArray(raw.hits)) return null;
  for (const h of raw.hits) {
    if (!isObj(h) || typeof h.url !== "string" || typeof h.title !== "string" || typeof h.snippet !== "string") return null;
    if (!Array.isArray(h.municipalityCodes) || !Array.isArray(h.roads) || !Array.isArray(h.topics)) return null;
  }
  return raw as unknown as DiscoveryCacheEntry;
}

export const resultId = (url: string) => `dr-${hashString(url)}`;
