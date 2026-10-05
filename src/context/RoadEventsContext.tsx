import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useIngestion } from "./IngestionContext";
import { availableRoadEvents, buildRegulationDataset } from "../regulations/repository";
import type { RegulationDataset } from "../regulations/types";

const STORAGE_KEY = "fleet-road-events-v1";

/**
 * Constraint dataset used by the evaluator: curated legal restrictions (always on),
 * manually introduced road events, and ingested candidates that passed the trust gate.
 */
const RoadEventsContext = createContext<{
  enabledIds: string[];
  setEnabled: (id: string, on: boolean) => void;
  dataset: RegulationDataset;
} | null>(null);

export function RoadEventsProvider({ children }: { children: ReactNode }) {
  const [enabledIds, setEnabledIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      const known = new Set(availableRoadEvents().map((e) => e.id));
      return stored.filter((id) => known.has(id));
    } catch {
      return [];
    }
  });

  const setEnabled = useCallback((id: string, on: boolean) => {
    setEnabledIds((prev) => {
      const next = on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const { ingested } = useIngestion();
  // Rebuild only when the set of active ingested constraints changes (fingerprint), not on
  // every ingestion tick that re-creates an equal object.
  const dataset = useMemo(
    () => buildRegulationDataset(enabledIds, ingested),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabledIds, ingested.fingerprint],
  );

  return <RoadEventsContext.Provider value={{ enabledIds, setEnabled, dataset }}>{children}</RoadEventsContext.Provider>;
}

export function useRoadEvents() {
  const ctx = useContext(RoadEventsContext);
  if (!ctx) throw new Error("useRoadEvents must be used within RoadEventsProvider");
  return ctx;
}
