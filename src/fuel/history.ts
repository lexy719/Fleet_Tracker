import type { FuelParseOutput, FuelPriceObservation, FuelStation } from "./types";

/*
 * Run-length price history: one observation per DISTINCT price per (station, fuel label).
 * Same price again ⇒ only lastSeenAt moves. New price ⇒ previous gets supersededAt and
 * goes to history; nothing is overwritten or deleted. Stations missing from a snapshot
 * get missingSinceAt (absence ≠ closure); their last prices stay current but are not refreshed.
 */

export const priceKey = (p: Pick<FuelPriceObservation, "stationId" | "fuelType" | "sourceLabel">) => `${p.stationId}|${p.fuelType}|${p.sourceLabel}`;

/** Several responses (e.g. one per DGEG fuel) → one snapshot parse. */
export function combineParses(parts: FuelParseOutput[]): FuelParseOutput {
  const stations = new Map<string, FuelParseOutput["stations"][number]>();
  const prices = new Map<string, FuelParseOutput["prices"][number]>();
  const errors: string[] = [];
  let publishedAt: string | undefined;
  let publishedAtBasis: string | undefined;
  let recordCount = 0;
  for (const p of parts) {
    for (const s of p.stations) stations.set(s.id, { ...stations.get(s.id), ...s });
    for (const x of p.prices) {
      const k = priceKey(x);
      if (prices.has(k) && prices.get(k)!.price !== x.price) errors.push(`${k}: dois preços diferentes no mesmo snapshot (${prices.get(k)!.price} / ${x.price}) — mantido o primeiro`);
      else prices.set(k, x);
    }
    errors.push(...p.errors);
    recordCount += p.recordCount;
    if (p.publishedAt && (!publishedAt || p.publishedAt > publishedAt)) {
      publishedAt = p.publishedAt;
      publishedAtBasis = p.publishedAtBasis;
    }
  }
  return { stations: [...stations.values()], prices: [...prices.values()], errors, recordCount, ...(publishedAt ? { publishedAt, publishedAtBasis } : {}) };
}

export type PriceMerge = {
  current: FuelPriceObservation[];
  /** Observations closed by this merge (to append to history). */
  superseded: FuelPriceObservation[];
  changes: { key: string; from?: number; to: number }[];
};

export function mergePrices(previous: FuelPriceObservation[], incoming: FuelParseOutput["prices"], at: string): PriceMerge {
  const prev = new Map(previous.map((p) => [priceKey(p), p]));
  const current: FuelPriceObservation[] = [];
  const superseded: FuelPriceObservation[] = [];
  const changes: PriceMerge["changes"] = [];
  const seen = new Set<string>();
  for (const x of incoming) {
    const k = priceKey(x);
    seen.add(k);
    const old = prev.get(k);
    if (old && old.price === x.price && old.unit === x.unit) {
      // Same price: keep the original observation (and its provenance), extend the seen window.
      current.push({ ...old, lastSeenAt: at, ...(x.sourceValidFrom && !old.sourceValidFrom ? { sourceValidFrom: x.sourceValidFrom } : {}), ...(x.sourcePublishedAt ? { sourcePublishedAt: x.sourcePublishedAt } : {}) });
      continue;
    }
    if (old) superseded.push({ ...old, supersededAt: at });
    changes.push({ key: k, ...(old ? { from: old.price } : {}), to: x.price });
    current.push({ ...x, firstSeenAt: at, lastSeenAt: at });
  }
  // Not in this snapshot: keep as current (not refreshed). Consumers judge age by lastSeenAt.
  for (const [k, old] of prev) if (!seen.has(k)) current.push(old);
  return { current, superseded, changes };
}

export function mergeStations(previous: FuelStation[], incoming: FuelParseOutput["stations"], at: string): FuelStation[] {
  const prev = new Map(previous.map((s) => [s.id, s]));
  const out: FuelStation[] = [];
  const seen = new Set<string>();
  for (const s of incoming) {
    seen.add(s.id);
    const old = prev.get(s.id);
    const merged: FuelStation = { ...s, firstSeenAt: old?.firstSeenAt ?? at, lastSeenAt: at };
    out.push(merged);
  }
  for (const [id, old] of prev) if (!seen.has(id)) out.push({ ...old, missingSinceAt: old.missingSinceAt ?? at });
  return out;
}
