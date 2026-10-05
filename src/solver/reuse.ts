import { canonicalJson, hashString } from "../regulations/decisionInputs";
import type { FactSet } from "../regulations/types";
import type { RouteStrategy, StrategyResult } from "./types";

/*
 * When may a persisted clean-route result be shown instead of re-solving?
 * Only when EVERY decision input is identical (job stops, truck, cargo, departure, strategy,
 * vehicle facts) AND the constraint knowledge (dataset version) is the one it was solved with.
 * Anything else ⇒ re-solve; a stale result is never presented as current.
 */
export type CleanRouteInputs = {
  jobId: string;
  stops: { sequence: number; lat: number; lng: number; type?: string; municipality?: string; windowStartAt?: string; windowEndAt?: string; scheduledTime?: string; windowEnd?: string }[];
  truckId: string | null | undefined;
  cargoKg: number | undefined;
  departAtIso: string | null;
  strategy: RouteStrategy;
  facts: FactSet;
  timingKey?: string;
};

export function cleanRouteInputsKey(x: CleanRouteInputs): string {
  return hashString(
    canonicalJson({
      job: x.jobId,
      stops: [...x.stops].sort((a, b) => a.sequence - b.sequence).map((s) => ({ lat: s.lat, lng: s.lng, type: s.type, municipality: s.municipality, windowStartAt: s.windowStartAt, windowEndAt: s.windowEndAt, scheduledTime: s.scheduledTime, windowEnd: s.windowEnd })),
      truckId: x.truckId,
      cargoKg: x.cargoKg,
      departAt: x.departAtIso,
      strategy: x.strategy,
      facts: x.facts,
      timingKey: x.timingKey,
      engineVersion: "5.6C",
    }),
  );
}

export function canReuseSolve(saved: Pick<StrategyResult, "inputsKey" | "datasetVersion"> | null | undefined, inputsKey: string, datasetVersion: string): boolean {
  return !!saved && saved.inputsKey === inputsKey && saved.datasetVersion === datasetVersion;
}
