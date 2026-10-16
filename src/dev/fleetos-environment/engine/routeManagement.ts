import type { OperationalWorldProvider } from "./contracts";

/** A read composition, not another planner. Unknown or stale timing cannot become a green route. */
export function readRouteManagement(
  provider: OperationalWorldProvider,
  jobId: string,
) {
  const assignment = provider.getResourceAssignment(jobId);
  const execution = provider.getOperationalTimeline(jobId);
  const alternatives = provider.getRouteAlternatives(jobId);
  const future = provider.getResourceFutureState();
  const stops = execution.timeline?.stops ?? [];
  const outstanding = stops.filter((s) => !s.completed);
  const next = outstanding[0] ?? null;
  const restrictions = provider
    .related({ kind: "job", id: jobId }, "restriction")
    .map((node) => ({
      node,
      impact: provider.getRestrictionImpact(jobId, node.ref.id),
    }));
  const resources = (["truck", "driver", "trailer"] as const).map((kind) => {
    const id = assignment.assignment?.[`${kind}Id`];
    const group =
      kind === "truck"
        ? future.trucks
        : kind === "driver"
          ? future.drivers
          : future.trailers;
    return {
      kind,
      id: id ?? null,
      node: id ? provider.entity({ kind, id }) : null,
      future: id ? (group[id] ?? null) : null,
    };
  });
  const blocked =
    assignment.status === "REVIEW_REQUIRED" ||
    resources.some((r) => r.future?.blocked) ||
    stops.some((s) => s.window === "FAIL") ||
    restrictions.some((r) => r.impact.status === "FAIL") ||
    execution.timeline?.legalDriving === "FAIL";
  // All alternatives in this lab still lack fresh timing; this is never dispatch clearance.
  const status = blocked ? "BLOCKED" : "REVIEW_REQUIRED";
  return {
    jobId,
    status,
    assignment,
    execution,
    alternatives,
    stops,
    outstanding,
    next,
    restrictions,
    resources,
  };
}
