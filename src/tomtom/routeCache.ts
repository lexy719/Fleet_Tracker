/** Bounded, in-memory traffic cache. Concurrent identical requests share one promise. */
export const ROUTE_FRESHNESS_MS = 5 * 60_000;
export class RouteCache<T> {
  private entries = new Map<string, { until: number; value: Promise<T> }>();
  constructor(private ttl = ROUTE_FRESHNESS_MS, private limit = 24) {}
  get(key: string, load: () => Promise<T>, now = Date.now(), refresh = false): Promise<T> {
    const hit = this.entries.get(key);
    if (!refresh && hit && hit.until > now) return hit.value;
    for (const [k, entry] of this.entries) if (entry.until <= now) this.entries.delete(k);
    if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value!);
    const value = load().catch((error) => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, { until: now + this.ttl, value });
    return value;
  }
}
