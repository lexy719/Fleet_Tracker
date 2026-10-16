import type { Driver, Job, Trailer, Truck } from "../../data/types";
import type { OperationalEvent } from "../events";
import { canonicalJson, hashString } from "../../regulations/decisionInputs";
import {
  driverPlanningSpecification,
  truckPlanningSpecification,
  trailerPlanningSpecification,
} from "../planning/state";
import { operationalDemand } from "./executionTimeline";

export type DerivedArtifact =
  | "timing"
  | "passage_windows"
  | "restrictions"
  | "driving_feasibility"
  | "capacity"
  | "future_resources"
  | "alternatives"
  | "stop_candidates"
  | "document_diff";
const dependencies: Record<string, DerivedArtifact[]> = {
  demand: [
    "timing",
    "passage_windows",
    "restrictions",
    "capacity",
    "future_resources",
    "alternatives",
    "stop_candidates",
    "document_diff",
  ],
  assignment: [
    "timing",
    "passage_windows",
    "restrictions",
    "driving_feasibility",
    "capacity",
    "future_resources",
    "alternatives",
    "stop_candidates",
    "document_diff",
  ],
  route: [
    "timing",
    "passage_windows",
    "restrictions",
    "driving_feasibility",
    "future_resources",
    "alternatives",
    "stop_candidates",
  ],
  driver: [
    "timing",
    "passage_windows",
    "restrictions",
    "driving_feasibility",
    "future_resources",
    "alternatives",
    "stop_candidates",
  ],
  truck: [
    "timing",
    "passage_windows",
    "driving_feasibility",
    "capacity",
    "restrictions",
    "future_resources",
    "alternatives",
    "stop_candidates",
    "document_diff",
  ],
  trailer: [
    "timing",
    "passage_windows",
    "driving_feasibility",
    "capacity",
    "restrictions",
    "future_resources",
    "alternatives",
    "stop_candidates",
    "document_diff",
  ],
  observations: ["future_resources", "stop_candidates"],
  dataset: ["restrictions", "alternatives", "stop_candidates"],
};
export type OperationalResources = {
  trucks: Truck[];
  drivers: Driver[];
  trailers: Trailer[];
};
export function captureOperationalInputs(
  job: Job,
  resources: OperationalResources,
  datasetVersion: string,
) {
  const truck = resources.trucks.find((t) => t.id === job.assignedTruckId),
    driver = resources.drivers.find((d) => d.id === job.assignedDriverId),
    trailer = resources.trailers.find((t) => t.id === job.assignedTrailerId);
  return structuredClone({
    demand: operationalDemand(job),
    assignment: {
      truckId: job.assignedTruckId,
      driverId: job.assignedDriverId,
      trailerId: job.assignedTrailerId,
    },
    route:
      job.operationalPlan?.execution.movements.map((m) => ({
        kind: m.kind,
        departMs: m.departMs,
        driver: m.drivingBefore,
        timingModel: m.timingModel,
        id: m.route.id,
        points: m.route.polyline,
        distanceM: m.route.distanceM,
        durationSec: m.route.durationSec,
        legDurationSec: m.route.legDurationSec,
        legPointCounts: m.route.legPointCounts,
        routing: m.route.routing,
        tollCostEur: m.route.tollCostEur,
        tollDataQuality: m.route.tollDataQuality,
        fuelCostEur: m.route.fuelCostEur,
      })) ??
      job.routeCompliance?.route ??
      null,
    driver: driver ? driverPlanningSpecification(driver) : null,
    truck: truck ? truckPlanningSpecification(truck) : null,
    trailer: trailer ? trailerPlanningSpecification(trailer) : null,
    observations: truck
      ? {
          demoTelemetry: truck.demoTelemetry,
          fuelLevelPct: truck.fuelLevelPct,
          fuelCapacityL: truck.fuelCapacityL,
          odometerKm: truck.odometerKm,
        }
      : null,
    dataset: datasetVersion,
  });
}
export type OperationalInputs = ReturnType<typeof captureOperationalInputs>;
export const operationalInputFingerprint = (input: OperationalInputs) =>
  hashString(canonicalJson(input));
export function compareOperationalInputs(
  before: OperationalInputs,
  after: OperationalInputs,
) {
  const changed = (
    Object.keys(dependencies) as (keyof OperationalInputs)[]
  ).filter((k) => canonicalJson(before[k]) !== canonicalJson(after[k]));
  return {
    changed,
    invalidated: [...new Set(changed.flatMap((k) => dependencies[k]))].sort(),
  };
}
/** Event invalidation is conservative; precise read boundaries also compare the complete input projection. */
export function invalidationForEvents(
  events: OperationalEvent[],
): DerivedArtifact[] {
  return [
    ...new Set(
      events.flatMap((event) => {
        if (event.type === "NOTES_UPDATED") return [];
        if (event.type.startsWith("DOCUMENT_"))
          return ["document_diff"] as DerivedArtifact[];
        if (
          event.type === "JOB_EDITED" &&
          Array.isArray(event.data?.planningChanges) &&
          !event.data.planningChanges.length
        )
          return [];
        if (event.type === "ASSIGNMENT_CHANGED") return dependencies.assignment;
        if (
          event.type === "ROUTE_PLANNED" ||
          event.type === "ROUTE_INVALIDATED"
        )
          return dependencies.route;
        if (event.type.startsWith("RESOURCE_")) return dependencies.assignment;
        if (
          event.type === "STOP_UPDATED" ||
          event.type === "STATUS_CHANGED" ||
          event.type === "JOB_CANCELLED"
        )
          return dependencies.route;
        if (event.entityType === "job") return dependencies.demand;
        return [];
      }),
    ),
  ].sort();
}
