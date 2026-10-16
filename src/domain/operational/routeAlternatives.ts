import type { RoutePlanOption } from "../../tomtom/planRoutes";
import type {
  ComplianceReport,
  EvaluationInput,
  RegulationDataset,
} from "../../regulations/types";
import {
  evaluateCompliance,
  DEFAULT_EVALUATE_OPTIONS,
} from "../../regulations/evaluate";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import {
  DEFAULT_TIMING_MODEL,
  type TimingModel,
} from "../../regulations/timeline";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import {
  assumed,
  calculated,
  unknown,
  type OperationalValue,
  type Feasibility,
} from "./values";

export type RouteIntent =
  | "fastest"
  | "no_tolls"
  | "fuel_efficient"
  | "restriction_avoiding"
  | "other";
export type OperationalRouteAlternative = {
  id: string;
  intent: RouteIntent;
  geometry: OperationalValue<{
    fingerprint: string;
    points: [number, number][];
  }>;
  distanceM: OperationalValue<number>;
  durationSec: OperationalValue<number>;
  tollEur: OperationalValue<number>;
  provenance: {
    provider: string;
    request: Record<string, string>;
    avoidedRestrictionIds: string[];
  };
  timing: ReturnType<typeof operationalTimeline> | null;
  restrictions: ComplianceReport | null;
  feasibility: Feasibility;
  infeasibilityReasons: string[];
  unknownReasons: string[];
};

export type AlternativeContext = {
  departMs: number;
  timingModel?: TimingModel;
  driverKnown: boolean;
  dataset: RegulationDataset;
  facts: EvaluationInput["facts"];
  stops: EvaluationInput["stops"];
  nowMs: number;
};

/** No manufactured alternatives and no display-card assumptions. Intent is request provenance, not a colour/label. */
export function toOperationalRouteAlternative(
  option: RoutePlanOption,
  context: AlternativeContext,
  intent?: RouteIntent,
): OperationalRouteAlternative {
  const request = option.routing?.params ?? {};
  const routeType = request.routeType;
  const inferred: RouteIntent = option.routing?.avoidAreas?.length
    ? "restriction_avoiding"
    : option.routing?.role === "toll_avoiding" ||
        /tollRoads/.test(request.avoid ?? "")
      ? "no_tolls"
      : routeType === "eco"
        ? "fuel_efficient"
        : routeType === "fastest" || option.routing?.role === "primary"
          ? "fastest"
          : "other";
  const unknownReasons: string[] = [],
    infeasibilityReasons: string[] = [];
  const validGeometry =
    option.polyline.length >= 2 &&
    option.polyline.every(
      ([lat, lng]) =>
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180,
    );
  if (!validGeometry) unknownReasons.push("ROUTE_GEOMETRY_UNKNOWN");
  if (!context.driverKnown) unknownReasons.push("DRIVING_BASELINE_UNKNOWN");
  if (
    !context.timingModel ||
    context.timingModel.driver.continuousSec === undefined
  )
    unknownReasons.push("DRIVER_TIMING_STATE_UNKNOWN");
  if (!option.routing) unknownReasons.push("PROVIDER_PROVENANCE_UNKNOWN");
  if (option.error) infeasibilityReasons.push("PROVIDER_ERROR");
  if (option.departAtIso && Date.parse(option.departAtIso) !== context.departMs)
    infeasibilityReasons.push("STALE_PROVIDER_DEPARTURE");
  const validNumber = (n: number) => Number.isFinite(n) && n >= 0;
  if (
    !validNumber(option.distanceM) ||
    !validNumber(option.durationSec) ||
    option.durationSec === 0
  )
    infeasibilityReasons.push("INVALID_ROUTE_METRICS");
  let timing: OperationalRouteAlternative["timing"] = null,
    restrictions: ComplianceReport | null = null;
  if (validGeometry && !infeasibilityReasons.length) {
    try {
      timing = operationalTimeline(
        option,
        context.departMs,
        0,
        context.timingModel ?? DEFAULT_TIMING_MODEL,
      );
      unknownReasons.push(...timing.metadataIssues);
      restrictions = evaluateCompliance(
        context.dataset,
        {
          route: timing.routeInput,
          facts: context.facts,
          stops: context.stops,
          routeRoadNumbers: option.roadNumbers,
        },
        DEFAULT_EVALUATE_OPTIONS,
        new Date(context.nowMs),
      );
      if (restrictions.status === "ROUTE_AFFECTED")
        infeasibilityReasons.push("MANDATORY_RESTRICTION_APPLIES");
      if (
        restrictions.status === "POTENTIALLY_AFFECTED" ||
        restrictions.status === "EVALUATION_ERROR"
      )
        unknownReasons.push("RESTRICTION_EVALUATION_UNKNOWN");
    } catch {
      infeasibilityReasons.push("INVALID_TIMING_INPUT");
    }
  }
  const tollEur: OperationalValue<number> =
    option.tollDataQuality === "priced" && validNumber(option.tollPricedEur)
      ? { status: "KNOWN", value: option.tollPricedEur, source: "provider" }
      : option.tollDataQuality === "none" &&
          option.tollSectionCount === 0 &&
          option.tollCostEur === 0
        ? calculated(0)
        : (option.tollDataQuality === "estimated" ||
              option.tollDataQuality === "mixed") &&
            validNumber(option.tollCostEur)
          ? {
              status: "ASSUMED",
              value: option.tollCostEur,
              source: "assumed",
              reason: "Tolls include modelled prices",
            }
          : unknown("Toll price unavailable for all sections");
  return {
    id: option.id,
    intent: intent ?? inferred,
    geometry: validGeometry
      ? option.routing
        ? {
            status: "KNOWN",
            value: {
              fingerprint: hashString(canonicalJson(option.polyline)),
              points: structuredClone(option.polyline),
            },
            source: "provider",
          }
        : assumed(
            {
              fingerprint: hashString(canonicalJson(option.polyline)),
              points: structuredClone(option.polyline),
            },
            "Geometry provenance missing",
          )
      : unknown("Route geometry unavailable"),
    distanceM: validNumber(option.distanceM)
      ? option.routing
        ? { status: "KNOWN", value: option.distanceM, source: "provider" }
        : assumed(option.distanceM, "Distance provenance missing")
      : unknown("Route distance invalid"),
    durationSec: validNumber(option.durationSec)
      ? option.routing
        ? { status: "KNOWN", value: option.durationSec, source: "provider" }
        : assumed(option.durationSec, "Duration provenance missing")
      : unknown("Route duration invalid"),
    tollEur,
    provenance: {
      provider: option.routing ? "tomtom" : "unknown",
      request: { ...request },
      avoidedRestrictionIds: [],
    },
    timing,
    restrictions,
    feasibility: infeasibilityReasons.length
      ? "FAIL"
      : unknownReasons.length
        ? "UNKNOWN"
        : "PASS",
    infeasibilityReasons,
    unknownReasons,
  };
}

export function operationalRouteAlternatives(
  options: RoutePlanOption[],
  context: AlternativeContext,
): OperationalRouteAlternative[] {
  return options.map((option) =>
    toOperationalRouteAlternative(option, context),
  );
}
