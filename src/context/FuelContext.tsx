import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MemoryFuelStore, runFuelSource, type FuelFetch, type FuelRunReport, type FuelSourceState, type FuelStore } from "../fuel/collector";
import { IdbFuelStore } from "../fuel/idbStore";
import { createFuelIntelligence, type FuelIntelligence } from "../fuel/intelligence";
import { FUEL_SOURCES } from "../fuel/sources";
import type { FuelPriceObservation, FuelStation } from "../fuel/types";

/*
 * Fuel Intelligence, local-first like Road Intelligence ingestion: official pump-price feeds
 * are checked while the app is open (on load, then each source at its own cadence), stored in
 * this browser (IndexedDB), and exposed to routing as one in-memory view.
 */

const TICK_MS = 60_000;

type FuelValue = {
  ready: boolean;
  storage: "indexeddb" | "memory";
  states: FuelSourceState[];
  lastRun: Record<string, FuelRunReport>;
  running: string[];
  stationCount: number;
  priceCount: number;
  /** Routing/planning entry point; rebuilt whenever stored prices change. */
  intelligence: FuelIntelligence;
  refresh: (sourceId?: string) => Promise<void>;
};

const FuelContext = createContext<FuelValue | null>(null);

function openStore(): { store: FuelStore; kind: "indexeddb" | "memory" } {
  try {
    if (typeof indexedDB !== "undefined") return { store: new IdbFuelStore(), kind: "indexeddb" };
  } catch {
    /* fall through */
  }
  return { store: new MemoryFuelStore(), kind: "memory" };
}

const browserFetch: FuelFetch = (url, init) => fetch(url, { ...init, credentials: "omit", cache: "no-store" });

function isDue(state: FuelSourceState | undefined, everyMin: number, now: Date): boolean {
  const last = state?.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
  return now.getTime() - last >= everyMin * 60_000;
}

export function FuelProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<{ store: FuelStore; kind: "indexeddb" | "memory" } | null>(null);
  if (!storeRef.current) storeRef.current = openStore();
  const [storage, setStorage] = useState(storeRef.current.kind);
  const [ready, setReady] = useState(false);
  const [states, setStates] = useState<FuelSourceState[]>([]);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [prices, setPrices] = useState<FuelPriceObservation[]>([]);
  const [lastRun, setLastRun] = useState<Record<string, FuelRunReport>>({});
  const [running, setRunning] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const s = storeRef.current!.store;
    const per = await Promise.all(
      FUEL_SOURCES.map(async (src) => ({ state: await s.getState(src.id), stations: await s.getStations(src.id), prices: await s.getCurrentPrices(src.id) })),
    );
    setStates(per.flatMap((p) => (p.state ? [p.state] : [])));
    setStations(per.flatMap((p) => p.stations));
    setPrices(per.flatMap((p) => p.prices));
  }, []);

  const runOne = useCallback(async (sourceId: string) => {
    const source = FUEL_SOURCES.find((x) => x.id === sourceId);
    if (!source || inFlight.current.has(sourceId)) return;
    inFlight.current.add(sourceId);
    setRunning([...inFlight.current]);
    try {
      const report = await runFuelSource(source, { store: storeRef.current!.store, fetch: browserFetch, now: new Date() });
      setLastRun((r) => ({ ...r, [sourceId]: report }));
    } catch (e) {
      console.warn("[fuel] run failed", sourceId, e);
      setLastRun((r) => ({ ...r, [sourceId]: { sourceId, outcome: "FETCH_ERROR", message: `armazenamento: ${e instanceof Error ? e.message : String(e)}` } }));
      if (storeRef.current!.kind === "indexeddb") {
        storeRef.current = { store: new MemoryFuelStore(), kind: "memory" };
        setStorage("memory");
      }
    } finally {
      inFlight.current.delete(sourceId);
      setRunning([...inFlight.current]);
    }
  }, []);

  const runDue = useCallback(
    async (force: boolean, only?: string) => {
      const t = new Date();
      const s = storeRef.current!.store;
      const due: string[] = [];
      for (const src of FUEL_SOURCES) {
        if (only && src.id !== only) continue;
        if (force || isDue(await s.getState(src.id).catch(() => undefined), src.checkEveryMin, t)) due.push(src.id);
      }
      if (!due.length) return;
      await Promise.all(due.map(runOne));
      await reload().catch(() => undefined);
    },
    [reload, runOne],
  );

  useEffect(() => {
    let alive = true;
    reload()
      .catch((e) => {
        console.warn("[fuel] IndexedDB unavailable, using memory", e);
        storeRef.current = { store: new MemoryFuelStore(), kind: "memory" };
        setStorage("memory");
      })
      .finally(() => {
        if (!alive) return;
        setReady(true);
        void runDue(false);
      });
    const id = window.setInterval(() => void runDue(false), TICK_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload, runDue]);

  const intelligence = useMemo(() => createFuelIntelligence(stations, prices), [stations, prices]);
  const refresh = useCallback((sourceId?: string) => runDue(true, sourceId), [runDue]);

  const value: FuelValue = {
    ready,
    storage,
    states,
    lastRun,
    running,
    stationCount: intelligence.stationCount,
    priceCount: prices.length,
    intelligence,
    refresh,
  };
  return <FuelContext.Provider value={value}>{children}</FuelContext.Provider>;
}

export function useFuel(): FuelValue {
  const ctx = useContext(FuelContext);
  if (!ctx) throw new Error("useFuel must be used within FuelProvider");
  return ctx;
}
