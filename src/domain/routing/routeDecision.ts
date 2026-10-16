import { haversineM, routesEquivalent } from "../../regulations/geometry";
import { routeGeometryHash } from "../../regulations/decisionInputs";
import type { ComplianceReport } from "../../regulations/types";
import type { WindowStatus } from "../../regulations/deliveryWindow";
import type { RoutePlanOption } from "../../tomtom/planRoutes";

/** Dispatch materiality policy, not a provider claim or a quota of cards.
 * Five minutes / five euros warrant a conscious time-cost choice; seconds/cents do not.
 * €0.30/min is a declared comparison weight, not a measured operating cost.
 * Geometry uses the existing bidirectional sampled segment coverage, not metric equality.
 */
export const ROUTE_DECISION_POLICY = Object.freeze({
  meaningfulTimeSec: 300, meaningfulCostEur: 5, meaningfulTollEur: 5,
  valueEurPerMinute: 0.30, familyToleranceM: 30, familyCoverage: 0.98,
  stabilityTimeSec: 120, stabilityCostEur: 1,
});

export type DecisionCandidate = {
  option: RoutePlanOption;
  report?: ComplianceReport;
  elapsedSec: number;
  window: WindowStatus;
  criticalHours: boolean;
  coverageComplete: boolean;
  provenance: string[];
};
export type RouteDecision = DecisionCandidate & {
  routeId: string;
  familyId: string;
  candidateIds: string[];
  reason: "RECOMMENDED" | "MEANINGFUL_TIME_COST_TRADEOFF" | "MEANINGFUL_TOLL_TRADEOFF" | "DISTINCT_OPERATIONAL_CORRIDOR";
  explanation: string;
};
export type RouteDecisionSet = {
  recommendedRouteId: string | null;
  fastestRouteId: string | null;
  bestValueRouteId: string | null;
  lowestCostRouteId: string | null;
  decisions: RouteDecision[];
  evaluatedCandidateCount: number;
  executableCandidateCount: number;
  excludedCandidateCount: number;
  excluded: { routeId: string; reasons: string[]; provenance: string[] }[];
  decisionStatus: "RECOMMENDED" | "RECOMMENDED_WITH_UNCERTAINTY" | "NO_EXECUTABLE_ROUTE" | "EVALUATION_UNAVAILABLE";
  tradeoffExists: boolean;
  unresolvedIssues: string[];
  analysisSummary: string;
};

const cost = (c: DecisionCandidate) => c.option.fuelCostEur + c.option.tollCostEur;
const windowRank: Record<WindowStatus, number> = { no_window: 0, achievable: 0, unknown: 1, at_risk: 2, missed: 3 };
const complianceRank = (c: DecisionCandidate) => c.report?.status === "ROUTE_COMPLIANT" ? 0 : 1;
const risk = (c: DecisionCandidate) => c.report?.results.filter((r) => r.effect !== "advisory" && r.outcome === "UNKNOWN").length ?? 0;
const score = (c: DecisionCandidate) => cost(c) + c.elapsedSec / 60 * ROUTE_DECISION_POLICY.valueEurPerMinute;
const compare = (a: DecisionCandidate, b: DecisionCandidate) =>
  complianceRank(a) - complianceRank(b) || windowRank[a.window] - windowRank[b.window] ||
  risk(a) - risk(b) || score(a) - score(b) || a.elapsedSec - b.elapsedSec || a.option.id.localeCompare(b.option.id);

export function exclusionReasons(c: DecisionCandidate): string[] {
  const reasons: string[] = [];
  if (c.option.error || c.option.polyline.length < 2 || !Number.isFinite(c.elapsedSec) || !Number.isFinite(cost(c))) reasons.push("Rota sem geometria ou métricas utilizáveis");
  if (!c.report || c.report.status === "EVALUATION_ERROR") reasons.push("Avaliação de restrições indisponível");
  if (c.report?.status === "ROUTE_AFFECTED") reasons.push(...c.report.results.filter((r) => r.outcome === "APPLIES" && r.effect !== "advisory").map((r) => r.title));
  if (c.report?.status === "ROUTE_AFFECTED" && !reasons.length) reasons.push("Restrição obrigatória aplicável");
  if (c.criticalHours) reasons.push("Limite de condução excedido");
  if (c.window === "missed") reasons.push("Janela de entrega não executável");
  return reasons;
}

type RouteGeometry = Pick<RoutePlanOption, "polyline" | "distanceM">;
export function sameRouteFamily(a: RouteGeometry, b: RouteGeometry): boolean {
  if (a.polyline.length < 2 || b.polyline.length < 2 || haversineM(a.polyline[0]!, b.polyline[0]!) > ROUTE_DECISION_POLICY.familyToleranceM || haversineM(a.polyline[a.polyline.length - 1]!, b.polyline[b.polyline.length - 1]!) > ROUTE_DECISION_POLICY.familyToleranceM) return false;
  if (Math.abs(a.distanceM - b.distanceM) > Math.max(a.distanceM, b.distanceM) * 0.05) return false;
  return routesEquivalent(a.polyline, b.polyline, ROUTE_DECISION_POLICY.familyToleranceM, ROUTE_DECISION_POLICY.familyCoverage);
}

/** Exact dominance; a material toll advantage is retained even if total cost is higher. */
export type OperationalRouteContext = { opportunityEurPerHour:number; preserveTollObjective?:boolean; downstreamValueEurByRoute?:Record<string,number> };
const contextualCost = (c:DecisionCandidate, context:OperationalRouteContext) => cost(c)+c.elapsedSec/3600*context.opportunityEurPerHour-(context.downstreamValueEurByRoute?.[c.option.id]??0);
export function dominates(a: DecisionCandidate, b: DecisionCandidate, context?:OperationalRouteContext): boolean {
  if(context){
    if(context.preserveTollObjective&&a.option.tollCostEur-b.option.tollCostEur>=ROUTE_DECISION_POLICY.meaningfulTollEur)return false;
    const av=[contextualCost(a,context),complianceRank(a),windowRank[a.window],risk(a)],bv=[contextualCost(b,context),complianceRank(b),windowRank[b.window],risk(b)];
    return av.every((v,i)=>v<=bv[i]!)&&av.some((v,i)=>v<bv[i]!);
  }
  const tollAdvantage = a.option.tollCostEur - b.option.tollCostEur >= ROUTE_DECISION_POLICY.meaningfulTollEur;
  if (tollAdvantage) return false;
  const valuesA = [a.elapsedSec, cost(a), complianceRank(a), windowRank[a.window], risk(a)];
  const valuesB = [b.elapsedSec, cost(b), complianceRank(b), windowRank[b.window], risk(b)];
  return valuesA.every((v, i) => v <= valuesB[i]!) && valuesA.some((v, i) => v < valuesB[i]!);
}

function reasonAgainst(a: DecisionCandidate, b: DecisionCandidate): RouteDecision["reason"] | null {
  const dt = a.elapsedSec - b.elapsedSec, dc = cost(a) - cost(b);
  if ((dt >= ROUTE_DECISION_POLICY.meaningfulTimeSec && dc <= -ROUTE_DECISION_POLICY.meaningfulCostEur) ||
      (dt <= -ROUTE_DECISION_POLICY.meaningfulTimeSec && dc >= ROUTE_DECISION_POLICY.meaningfulCostEur)) return "MEANINGFUL_TIME_COST_TRADEOFF";
  if (b.option.tollCostEur - a.option.tollCostEur >= ROUTE_DECISION_POLICY.meaningfulTollEur) return "MEANINGFUL_TOLL_TRADEOFF";
  if ((complianceRank(a) < complianceRank(b) || windowRank[a.window] < windowRank[b.window] || risk(a) < risk(b)) &&
      !sameRouteFamily(a.option, b.option)) return "DISTINCT_OPERATIONAL_CORRIDOR";
  return null;
}

/** Pure domain pipeline. All candidates are evaluated before any route becomes selectable. */
export function decideRoutes(candidates: DecisionCandidate[], previousRecommended?: RouteGeometry,context?:OperationalRouteContext): RouteDecisionSet {
  const rank = context ? (a:DecisionCandidate,b:DecisionCandidate)=>complianceRank(a)-complianceRank(b)||windowRank[a.window]-windowRank[b.window]||risk(a)-risk(b)||contextualCost(a,context)-contextualCost(b,context)||a.elapsedSec-b.elapsedSec||a.option.id.localeCompare(b.option.id) : compare;
  const unique = [...new Map(candidates.map((c) => [c.option.id, c])).values()];
  const excluded: RouteDecisionSet["excluded"] = [];
  const executable = unique.filter((c) => {
    const reasons = exclusionReasons(c);
    if (reasons.length) excluded.push({ routeId: c.option.id, reasons, provenance: c.provenance });
    return !reasons.length;
  });
  const families: RouteDecision[] = [];
  for (const c of [...executable].sort(rank)) {
    const family = families.find((f) => sameRouteFamily(f.option, c.option));
    if (family) {
      family.candidateIds.push(c.option.id);
      family.provenance = [...new Set([...family.provenance, ...c.provenance])];
    } else families.push({ ...c, routeId: c.option.id, familyId: routeGeometryHash(c.option.polyline), candidateIds: [c.option.id], reason: "RECOMMENDED", explanation: "Melhor combinação de conformidade, janela, risco, tempo e custo estimado." });
  }
  const nondominated = families.filter((c) => !families.some((a) => a !== c && dominates(a, c,context))).sort(rank);
  let best = nondominated[0];
  const previous = previousRecommended && families.find((c) => sameRouteFamily(c.option, previousRecommended));
  // Retain a confirmed/recommended corridor only for negligible changes, never a hard-invalid plan.
  if (best && previous && (!context || (nondominated.includes(previous) && contextualCost(previous,context)-contextualCost(best,context)<=ROUTE_DECISION_POLICY.stabilityCostEur)) && complianceRank(previous) === complianceRank(best) && windowRank[previous.window] === windowRank[best.window] && risk(previous) === risk(best) &&
      previous.elapsedSec - best.elapsedSec <= ROUTE_DECISION_POLICY.stabilityTimeSec && cost(previous) - cost(best) <= ROUTE_DECISION_POLICY.stabilityCostEur) best = previous;
  const decisions: RouteDecision[] = best ? [{ ...best, reason: "RECOMMENDED" }] : [];
  for (const c of nondominated) {
    if (!best || c === best) continue;
    const reason = reasonAgainst(c, best);
    if (!reason || decisions.some((d) => !reasonAgainst(c, d) && !reasonAgainst(d, c))) continue;
    decisions.push({ ...c, reason, explanation: reason === "MEANINGFUL_TIME_COST_TRADEOFF" ? "Escolha material entre tempo de viagem e custo estimado." : reason === "MEANINGFUL_TOLL_TRADEOFF" ? "Redução material de portagens, com outro impacto operacional." : "Corredor com vantagem operacional material." });
  }
  const issues = [...new Set(decisions.flatMap((c) => [
    ...(!c.coverageComplete ? ["Cobertura de informação rodoviária parcial"] : []),
    ...(c.report?.status === "POTENTIALLY_AFFECTED" ? ["Aplicabilidade de restrições por resolver"] : []),
    ...(c.window === "unknown" ? ["Janela sem data ou por confirmar"] : []),
    ...(c.report?.results.some((r) => r.effect === "advisory" && r.outcome !== "DOES_NOT_APPLY") ? ["Impactos não bloqueantes; duração usa apenas o trânsito reportado pelo fornecedor"] : []),
  ]))];
  const status = best ? issues.length ? "RECOMMENDED_WITH_UNCERTAINTY" : "RECOMMENDED" :
    unique.length && unique.every((c) => c.report && c.report.status !== "EVALUATION_ERROR" && c.option.polyline.length >= 2) ? "NO_EXECUTABLE_ROUTE" : "EVALUATION_UNAVAILABLE";
  const byTime = [...families].sort((a, b) => a.elapsedSec - b.elapsedSec || compare(a, b))[0];
  const byCost = [...families].sort((a, b) => cost(a) - cost(b) || compare(a, b))[0];
  return {
    recommendedRouteId: best?.routeId ?? null, fastestRouteId: byTime?.routeId ?? null,
    bestValueRouteId: best?.routeId ?? null, lowestCostRouteId: byCost?.routeId ?? null,
    decisions, evaluatedCandidateCount: unique.length, executableCandidateCount: executable.length,
    excludedCandidateCount: excluded.length, excluded, decisionStatus: status,
    tradeoffExists: decisions.length > 1, unresolvedIssues: issues,
    analysisSummary: best ? `${unique.length} candidatos avaliados · ${excluded.length} excluídos · ${decisions.length} decisões úteis` : "Nenhuma rota executável foi encontrada; reveja partida, recursos, carga ou evidência das restrições.",
  };
}
