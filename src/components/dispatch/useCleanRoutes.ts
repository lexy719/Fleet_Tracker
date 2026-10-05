import { useEffect, useMemo, useRef, useState } from "react";
import { useIngestion } from "../../context/IngestionContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import type { Job } from "../../data/types";
import { canonicalJson, hashString, routeGeometryHash } from "../../regulations/decisionInputs";
import { buildRegulationDataset } from "../../regulations/repository";
import type { ComplianceReport, FactSet, RegulationDataset } from "../../regulations/types";
import { solveStrategy, storedToOption } from "../../solver/solver";
import { canReuseSolve, cleanRouteInputsKey } from "../../solver/reuse";
import { assessRouteCoverage } from "../../ingestion/coverage";
import { buildRouteMetrics } from "../../solver/metrics";
import type { DiscoveryRun } from "../../discovery/types";
import { tomtomRoutingProvider } from "../../solver/tomtomProvider";
import { ROUTE_FRESHNESS_MS } from "../../tomtom/routeCache";
import { STRATEGY_LABEL, type RouteStrategy, type StrategyResult } from "../../solver/types";
import type { PlanRoutePlanningOpts, RoutePlanOption } from "../../tomtom/planRoutes";

/*
 * Runs the clean-route solver for every provider-supported strategy of a job.
 * - Baselines are the routes the planner already fetched (no duplicate requests).
 * - A persisted result is reused while its inputs AND the constraint dataset are unchanged
 *   (so reloading never silently changes "+x km / +y min"); otherwise it is re-solved.
 * - TomTom is called again only when a known accepted constraint forces a reroute.
 */

export const STRATEGIES: RouteStrategy[] = ["FASTEST", "NO_TOLLS"];

export type CleanRouteState = {
  strategy: RouteStrategy;
  status: "idle" | "solving" | "done" | "error";
  result?: StrategyResult;
  finalOption?: RoutePlanOption | null;
  /** Reused from storage (no routing request made). */
  reused?: boolean;
  candidates?: RoutePlanOption[];
  providerRequests?: number;
  message?: string;
};

export function baselineFor(strategy: RouteStrategy, planned: RoutePlanOption[]): RoutePlanOption | undefined {
  const ok = planned.filter((o) => !o.error && o.polyline.length > 1 && !o.routing?.avoidAreas?.length);
  return strategy === "FASTEST"
    ? ok.find((o) => o.routing?.role === "primary")
    : ok.find((o) => o.routing?.role === "toll_avoiding" || o.routing?.params.avoid === "tollRoads");
}

export function useCleanRoutes(args: {
  job: Job;
  apiKey: string | null;
  planned: RoutePlanOption[];
  planning: { waypoints: { lat: number; lng: number }[]; opts: PlanRoutePlanningOpts } | null;
  departAt: Date | null;
  truckId: string;
  facts: FactSet;
  timingKey: string;
  evaluate: (o: RoutePlanOption, ds: RegulationDataset) => ComplianceReport;
}): Record<RouteStrategy, CleanRouteState> {
  const ingestion = useIngestion();
  const { dataset, enabledIds } = useRoadEvents();
  const [state, setState] = useState<Record<RouteStrategy, CleanRouteState>>({
    FASTEST: { strategy: "FASTEST", status: "idle" },
    NO_TOLLS: { strategy: "NO_TOLLS", status: "idle" },
  });
  const runId = useRef(0);
  const argsRef = useRef(args);
  argsRef.current = args;
  const ingRef = useRef(ingestion);
  ingRef.current = ingestion;

  const { job, apiKey, planned, planning, departAt, truckId, facts } = args;
  const plannedKey = planned.map((o) => `${o.id}:${routeGeometryHash(o.polyline)}:${o.durationSec}:${o.trafficDelaySec}:${o.fuelCostEur}:${o.tollCostEur}`).join(",");
  const inputsKeyFor = (strategy: RouteStrategy) =>
    cleanRouteInputsKey({ jobId: job.id, stops: job.stops, truckId, cargoKg: job.totalWeightKg, departAtIso: departAt?.toISOString() ?? null, strategy, facts, timingKey: `${args.timingKey}:${plannedKey}` });
  const factsKey = hashString(canonicalJson(facts));

  useEffect(() => {
    if (!apiKey || !planning || !departAt || planned.length === 0) return;
    const my = ++runId.current;
    const set = (s: RouteStrategy, v: Partial<CleanRouteState>) => {
      if (runId.current !== my) return;
      setState((prev) => ({ ...prev, [s]: { ...prev[s], ...v, strategy: s } }));
    };
    const ing = ingRef.current;
    const a = argsRef.current;
    // The in-memory dataset is current unless a discovery run refreshed a source during this
    // solve — only then is ingestion re-read from storage (it is expensive on large stores).
    let refreshed = false;
    const getDataset = async () => {
      if (!refreshed) return dataset;
      refreshed = false;
      return buildRegulationDataset(enabledIds, await ingRef.current.ingestedNow());
    };

    void (async () => {
    for (const strategy of STRATEGIES) {
      if (runId.current !== my) return; // superseded by a newer solve
      await (async () => {
        const key = `${a.job.id}:${strategy}`;
        const inputsKey = inputsKeyFor(strategy);
        set(strategy, { status: "solving", message: undefined, finalOption: null, candidates: [], result: undefined });
        try {
          const saved = await ing.loadSolverRun(key);
          if (saved && canReuseSolve(saved, inputsKey, dataset.version) && Date.now() - Date.parse(saved.solvedAt) < ROUTE_FRESHNESS_MS) {
            void ing.recordRouteMetrics({ ...buildRouteMetrics({ jobId: a.job.id, result: saved, runs: [], providerCalls: 0, reused: true }), id: `${a.job.id}:${strategy}:reuse:${new Date().toISOString()}`, solvedAt: new Date().toISOString() });
            set(strategy, {
              status: "done",
              result: saved,
              reused: true,
              providerRequests: 0,
              candidates: [storedToOption(saved.baseline.route, `baseline-${strategy.toLowerCase()}`, "Rota base guardada")],
              finalOption: saved.final ? storedToOption(saved.final.route, `clean-${strategy.toLowerCase()}`, `FleetOS · ${STRATEGY_LABEL[strategy]}`) : null,
            });
            return;
          }
          const provider = tomtomRoutingProvider(a.apiKey!, planning.waypoints, planning.opts);
          const runs: DiscoveryRun[] = [];
          const baseline = baselineFor(strategy, a.planned);
          const { result, finalOption, routes } = await solveStrategy({
            strategy,
            provider,
            ...(baseline ? { baseline } : {}),
            evaluate: a.evaluate,
            getDataset,
            discover: async (route) => {
              const run = await ingRef.current.runRouteDiscovery(route, strategy, a.facts);
              runs.push(run);
              if (run.refreshedSourceIds.length) refreshed = true;
              return {
                runId: run.id,
                localMs: run.timings.totalMs - run.timings.externalMs + run.timings.scopeMs,
                externalMs: run.timings.externalMs,
                phases: { ...(run.timings.contextMs ?? {}), "run.cache-lookups": Math.round(run.timings.cacheMs), "run.classify+gaps": Math.round(run.timings.classifyMs) },
              };
            },
            inputsKey,
          });
          if (runId.current !== my) return;
          const ingNow = ingRef.current;
          if (ingNow.municipalities) {
            const route = (result.final ?? result.baseline).route.polyline;
            const c = assessRouteCoverage({ route, index: ingNow.municipalities, sources: ingNow.sources, freshness: ingNow.freshness, candidates: [], status: (result.final ?? result.baseline).report.status });
            result.coverageAtSolve = { territories: c.territories, outsideTerritoryKm: c.outsideTerritoryKm, invalidSamples: c.invalidSamples, headline: c.headline };
          }
          const tp = performance.now();
          await ing.saveSolverRun({ key, jobId: a.job.id, strategy, savedAt: new Date().toISOString(), result });
          const persistMs = performance.now() - tp;
          await ing.recordRouteMetrics(buildRouteMetrics({ jobId: a.job.id, result, runs, providerCalls: provider.requests, reused: false, persistMs }));
          set(strategy, {
            status: "done",
            result,
            candidates: routes.map((o, i) => ({ ...o, id: `solver-${strategy}-${i}` })),
            reused: false,
            providerRequests: provider.requests,
            finalOption: finalOption ? { ...finalOption, id: `clean-${strategy.toLowerCase()}`, title: `FleetOS · ${STRATEGY_LABEL[strategy]}`, comparisonRole: "other", colorIndex: 21 } : null,
          });
        } catch (e) {
          set(strategy, { status: "error", message: e instanceof Error ? e.message : String(e) });
        }
      })();
    }
    })();
    // Re-solve when the baselines, the inputs or the constraint dataset change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedKey, dataset.version, apiKey, departAt?.getTime(), truckId, factsKey, args.timingKey, planning]);

  // Stable references prevent a map update from re-triggering candidate evaluation.
  // Hide superseded candidates before the next effect starts its solve.
  const fastestKey = inputsKeyFor("FASTEST"), noTollsKey = inputsKeyFor("NO_TOLLS");
  const ready = !!planning && !!departAt && !!planned.length;
  return useMemo(() => Object.fromEntries(STRATEGIES.map((strategy) => {
    const s = state[strategy];
    const key = strategy === "FASTEST" ? fastestKey : noTollsKey;
    const stale = !ready || (s.result && (s.result.inputsKey !== key || s.result.datasetVersion !== dataset.version));
    return [strategy, stale ? { strategy, status: "idle" } : s];
  })) as Record<RouteStrategy, CleanRouteState>, [state, ready, fastestKey, noTollsKey, dataset.version]);
}
