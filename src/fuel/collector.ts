import { sha256Hex } from "../ingestion/text";
import { combineParses, mergePrices, mergeStations } from "./history";
import { parseDgeg } from "./parsers/dgeg";
import { parseMiteco } from "./parsers/miteco";
import type { FuelParseOutput, FuelPriceObservation, FuelSource, FuelStation } from "./types";

/* Fuel collector: fetch every request of a source → parse → combine → merge into the store. */

export const FUEL_FETCH_TIMEOUT_MS = 90_000;

export type FuelFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

export type FuelSourceState = {
  sourceId: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastSha256?: string;
  publishedAt?: string;
  publishedAtBasis?: string;
  stationCount?: number;
  priceCount?: number;
};

export interface FuelStore {
  getState(sourceId: string): Promise<FuelSourceState | undefined>;
  putState(state: FuelSourceState): Promise<void>;
  getStations(sourceId: string): Promise<FuelStation[]>;
  putStations(sourceId: string, stations: FuelStation[]): Promise<void>;
  getCurrentPrices(sourceId: string): Promise<FuelPriceObservation[]>;
  putCurrentPrices(sourceId: string, prices: FuelPriceObservation[]): Promise<void>;
  appendHistory(observations: FuelPriceObservation[]): Promise<void>;
}

/** In-memory store (tests, one-off runs). Persistent stores implement the same interface. */
export class MemoryFuelStore implements FuelStore {
  states = new Map<string, FuelSourceState>();
  stations = new Map<string, FuelStation[]>();
  prices = new Map<string, FuelPriceObservation[]>();
  history: FuelPriceObservation[] = [];
  async getState(id: string) { return this.states.get(id); }
  async putState(s: FuelSourceState) { this.states.set(s.sourceId, s); }
  async getStations(id: string) { return this.stations.get(id) ?? []; }
  async putStations(id: string, s: FuelStation[]) { this.stations.set(id, s); }
  async getCurrentPrices(id: string) { return this.prices.get(id) ?? []; }
  async putCurrentPrices(id: string, p: FuelPriceObservation[]) { this.prices.set(id, p); }
  async appendHistory(o: FuelPriceObservation[]) { this.history.push(...o); }
}

export function parseFuelResponse(source: FuelSource, body: string, snapshotId: string): FuelParseOutput {
  const ctx = { sourceId: source.id, snapshotId };
  switch (source.parser) {
    case "miteco-stations":
      return parseMiteco(body, ctx);
    case "dgeg-stations":
      return parseDgeg(body, ctx);
  }
}

export type FuelRunReport = {
  sourceId: string;
  outcome: "FETCH_ERROR" | "PARSE_ERROR" | "UNCHANGED" | "CHANGED";
  message?: string;
  counts?: { stations: number; prices: number; priceChanges: number; newPrices: number; missingStations: number; errors: number };
};

export async function runFuelSource(source: FuelSource, deps: { store: FuelStore; fetch: FuelFetch; now?: Date }): Promise<FuelRunReport> {
  const at = (deps.now ?? new Date()).toISOString();
  const prev = (await deps.store.getState(source.id)) ?? { sourceId: source.id };
  const bodies: string[] = [];
  for (const req of source.requests) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FUEL_FETCH_TIMEOUT_MS);
    try {
      const res = await deps.fetch(req.url, { signal: ctrl.signal, headers: { Accept: req.accept ?? "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${req.label})`);
      bodies.push(await res.text());
    } catch (e) {
      const error = e instanceof DOMException && e.name === "AbortError" ? `tempo esgotado (${req.label})` : e instanceof Error ? e.message : String(e);
      await deps.store.putState({ ...prev, lastAttemptAt: at, lastError: error });
      return { sourceId: source.id, outcome: "FETCH_ERROR", message: error };
    } finally {
      clearTimeout(timer);
    }
  }
  const sha = await sha256Hex(bodies.join("\u0000"));
  if (prev.lastSha256 === sha) {
    const rest = { ...prev };
    delete rest.lastError;
    await deps.store.putState({ ...rest, lastAttemptAt: at, lastSuccessAt: at });
    return { sourceId: source.id, outcome: "UNCHANGED" };
  }
  const snapshotId = `${source.id}@${at}`;
  const parsed = combineParses(bodies.map((b) => parseFuelResponse(source, b, snapshotId)));
  if (parsed.prices.length === 0) {
    // A broken payload is not "every price disappeared": keep the previous state.
    const message = parsed.errors.slice(0, 3).join("; ") || "nenhum preço lido";
    await deps.store.putState({ ...prev, lastAttemptAt: at, lastError: message });
    return { sourceId: source.id, outcome: "PARSE_ERROR", message };
  }
  const stations = mergeStations(await deps.store.getStations(source.id), parsed.stations, at);
  const merge = mergePrices(await deps.store.getCurrentPrices(source.id), parsed.prices, at);
  await deps.store.putStations(source.id, stations);
  await deps.store.putCurrentPrices(source.id, merge.current);
  await deps.store.appendHistory(merge.superseded);
  await deps.store.putState({
    sourceId: source.id,
    lastAttemptAt: at,
    lastSuccessAt: at,
    lastSha256: sha,
    stationCount: parsed.stations.length,
    priceCount: parsed.prices.length,
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt, publishedAtBasis: parsed.publishedAtBasis } : {}),
  });
  return {
    sourceId: source.id,
    outcome: "CHANGED",
    counts: {
      stations: parsed.stations.length,
      prices: parsed.prices.length,
      priceChanges: merge.changes.filter((c) => c.from !== undefined).length,
      newPrices: merge.changes.filter((c) => c.from === undefined).length,
      missingStations: stations.filter((s) => s.missingSinceAt).length,
      errors: parsed.errors.length,
    },
  };
}
