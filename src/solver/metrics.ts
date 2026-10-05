import type { DiscoveryRun } from "../discovery/types";
import type { StrategyResult, TraceSpan } from "./types";

/*
 * Per-route instrumentation (Phase 3C.5), prepared for the future agentic research layer so
 * its cost and knowledge reuse can be compared route by route (route #1 vs route #300).
 * Only COUNTS and defensible ratios; no "Portugal knowledge %". AI fields are zero because
 * no model is called in this phase; actual cost stays null (no billing data exists).
 */

export const METRICS_SCHEMA_VERSION = 1;

export type RouteIntelligenceMetrics = {
  schemaVersion: typeof METRICS_SCHEMA_VERSION;
  id: string;
  jobId: string;
  strategy: string;
  solvedAt: string;
  /** Result reused from storage (no discovery, no routing). */
  reused: boolean;
  corridor: { baselineFingerprint: string; finalFingerprint: string | null };
  discovery: {
    runs: number;
    localMs: number;
    externalMs: number;
    tasks: number;
    cacheHits: number;
    cacheMisses: number;
    cacheStale: number;
    cacheErrors: number;
    /** Tasks answered from existing knowledge (cache hits), with the denominator. */
    tasksAvoidedByExistingKnowledge: { count: number; of: number };
    sourcesKnown: number;
    sourcesRequiringRefresh: number;
    sourcesRefreshed: number;
    gaps: number;
    gapsByKind: Record<string, number>;
    newSourceProposals: number;
    results: number;
  };
  constraints: {
    /** Ingested constraints already known when the solve started. */
    reusedAccepted: number;
    /** Ingested constraints that became active during this solve (e.g. via a discovery refresh). */
    newlyActivated: number;
    encountered: number;
  };
  solver: {
    outcome: string;
    iterations: number;
    routingProviderCalls: number;
    deviations: number;
    baseline: { distanceM: number; durationSec: number };
    final: { distanceM: number; durationSec: number } | null;
    evaluateMs: number;
    orchestrationMs: number;
  };
  knowledge: {
    authoritiesEncountered: number;
    knownAuthorities: number;
    unknownAuthorities: number;
    knownOperationalSources: number;
    freshReusableSources: number;
    staleReusableSources: number;
  };
  /** Wall-clock trace of the solve (see StrategyResult.trace) + persistence after it. */
  timing?: {
    wallMs: number;
    unexplainedMs: number;
    persistMs: number;
    deterministicMs: number;
    externalMs: number;
    trace: TraceSpan[];
  };
  /** Future agentic research — none of this happens in Phase 3C.5. */
  future: {
    webSearches: number;
    pagesFetched: number;
    modelCalls: number;
    modelInputTokens: number;
    modelOutputTokens: number;
    estimatedAiCostEur: number;
    actualAiCostEur: number | null;
  };
};

export function buildRouteMetrics(args: {
  jobId: string;
  result: StrategyResult;
  runs: DiscoveryRun[];
  providerCalls: number;
  reused: boolean;
  persistMs?: number;
}): RouteIntelligenceMetrics {
  const { result: r, runs } = args;
  const last = runs.at(-1);
  const sum = (f: (x: DiscoveryRun) => number) => runs.reduce((s, x) => s + f(x), 0);
  const hits = sum((x) => x.cache.hit);
  const tasks = sum((x) => x.cache.details.length);
  const gapsByKind: Record<string, number> = {};
  for (const g of last?.gaps ?? []) gapsByKind[g.kind] = (gapsByKind[g.kind] ?? 0) + 1;
  const first = new Set(r.ingestedConstraintIds?.first ?? []);
  const lastIds = r.ingestedConstraintIds?.last ?? [];
  const encountered = new Set(r.attempts.flatMap((a) => [...a.applies, ...a.uncertain].map((x) => x.constraintId)));
  const scope = last?.scope;
  const knownAuth = scope ? scope.authorities.filter((a) => !scope.uncoveredAuthorityIds.includes(a.authorityId)).length : 0;
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    id: `${args.jobId}:${r.strategy}:${r.solvedAt}`,
    jobId: args.jobId,
    strategy: r.strategy,
    solvedAt: r.solvedAt,
    reused: args.reused,
    corridor: { baselineFingerprint: r.baseline.route.fingerprint, finalFingerprint: r.final?.route.fingerprint ?? null },
    discovery: {
      runs: runs.length,
      localMs: Math.round(sum((x) => x.timings.totalMs - x.timings.externalMs + x.timings.scopeMs)),
      externalMs: Math.round(sum((x) => x.timings.externalMs)),
      tasks,
      cacheHits: hits,
      cacheMisses: sum((x) => x.cache.miss),
      cacheStale: sum((x) => x.cache.stale),
      cacheErrors: sum((x) => x.cache.error),
      tasksAvoidedByExistingKnowledge: { count: hits, of: tasks },
      sourcesKnown: scope?.registeredSources.length ?? 0,
      sourcesRequiringRefresh: scope ? scope.staleSourceIds.length + scope.unknownCoverageSourceIds.length : 0,
      sourcesRefreshed: sum((x) => x.refreshedSourceIds.length),
      gaps: last?.gaps.length ?? 0,
      gapsByKind,
      newSourceProposals: new Set(runs.flatMap((x) => x.proposals.filter((p) => p.status === "PROPOSED" && p.discoveredVia.some((v) => v.at === x.startedAt)).map((p) => p.id))).size,
      results: last?.results.length ?? 0,
    },
    constraints: {
      reusedAccepted: first.size,
      newlyActivated: lastIds.filter((id) => !first.has(id)).length,
      encountered: encountered.size,
    },
    solver: {
      outcome: r.outcome,
      iterations: r.attempts.length,
      routingProviderCalls: args.providerCalls,
      deviations: r.deviations.length,
      baseline: { distanceM: r.baseline.route.distanceM, durationSec: r.baseline.route.durationSec },
      final: r.final ? { distanceM: r.final.route.distanceM, durationSec: r.final.route.durationSec } : null,
      evaluateMs: Math.round(r.timings.evaluateMs),
      orchestrationMs: Math.round(r.timings.orchestrationMs),
    },
    knowledge: {
      authoritiesEncountered: scope?.authorities.length ?? 0,
      knownAuthorities: knownAuth,
      unknownAuthorities: scope?.uncoveredAuthorityIds.length ?? 0,
      knownOperationalSources: scope?.registeredSources.filter((s) => s.freshness !== "FETCH_ERROR").length ?? 0,
      freshReusableSources: scope?.registeredSources.filter((s) => s.freshness === "FRESH" || s.freshness === "AGING").length ?? 0,
      staleReusableSources: scope?.registeredSources.filter((s) => s.freshness === "STALE").length ?? 0,
    },
    ...(r.trace && !args.reused
      ? {
          timing: {
            wallMs: r.wallMs ?? 0,
            unexplainedMs: r.unexplainedMs ?? 0,
            persistMs: Math.round(args.persistMs ?? 0),
            externalMs: Math.round(r.trace.filter((t) => t.external).reduce((s, t) => s + t.ms, 0)),
            deterministicMs: Math.round(r.trace.filter((t) => !t.external && !t.phase.includes(":") && t.phase !== "discovery").reduce((s, t) => s + t.ms, 0)),
            trace: r.trace,
          },
        }
      : {}),
    future: { webSearches: 0, pagesFetched: 0, modelCalls: 0, modelInputTokens: 0, modelOutputTokens: 0, estimatedAiCostEur: 0, actualAiCostEur: null },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseRouteMetrics(raw: unknown): RouteIntelligenceMetrics | null {
  if (!isObj(raw) || raw.schemaVersion !== METRICS_SCHEMA_VERSION || typeof raw.id !== "string") return null;
  if (!isObj(raw.discovery) || !isObj(raw.solver) || !isObj(raw.future) || !isObj(raw.knowledge) || !isObj(raw.constraints)) return null;
  return raw as unknown as RouteIntelligenceMetrics;
}
