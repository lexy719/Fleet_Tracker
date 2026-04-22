import type { Route } from "./types";

/** Operations health for map coloring and filters — mutually exclusive per route. */
export type RouteHealth = "delayed" | "at_risk" | "on_time";

/** Delayed: SLA breach or explicit delayed status. At-risk: minor slip. On-time: within plan. */
export function routeHealthCategory(r: Route): RouteHealth {
  if (r.status === "delayed" || r.delayMin > 15) return "delayed";
  if (r.delayMin > 0) return "at_risk";
  return "on_time";
}

export function countByHealth(routes: Route[], pred: (r: Route) => boolean): Record<RouteHealth, number> {
  const active = routes.filter(pred);
  const out: Record<RouteHealth, number> = { delayed: 0, at_risk: 0, on_time: 0 };
  for (const r of active) {
    out[routeHealthCategory(r)]++;
  }
  return out;
}

/** Lisbon / Tagus corridor — origin, destination, or route code. */
export function touchesLisbonCorridor(r: Route): boolean {
  const s = `${r.origin} ${r.destination} ${r.name}`.toLowerCase();
  return s.includes("lisboa") || s.includes("lisbon") || /\blis\b/i.test(r.name);
}

/**
 * Primary ops headline for the dashboard — short, corridor-aware.
 */
export function buildDashboardInsight(routes: Route[]): string {
  const active = routes.filter((r) => r.status === "active");
  if (active.length === 0) {
    return "No active routes — network idle.";
  }

  const delayed = active.filter((r) => routeHealthCategory(r) === "delayed");
  const atRisk = active.filter((r) => routeHealthCategory(r) === "at_risk");
  const onTime = active.filter((r) => routeHealthCategory(r) === "on_time");

  const delayedLisbon = delayed.filter(touchesLisbonCorridor);

  if (delayedLisbon.length >= 2) {
    return `${delayedLisbon.length} delays detected in the Lisbon corridor — review ETAs and handoffs.`;
  }
  if (delayedLisbon.length === 1) {
    const tail =
      atRisk.length > 0 || delayed.length > 1
        ? ` · ${atRisk.length} at-risk · ${onTime.length} on-time elsewhere on the grid.`
        : ` · ${atRisk.length} at-risk · ${onTime.length} on-time.`;
    return `1 delay detected in the Lisbon corridor${tail}`;
  }
  if (delayed.length > 0 || atRisk.length > 0) {
    return `${delayed.length} delayed · ${atRisk.length} at-risk · ${onTime.length} on-time across active routes.`;
  }
  return `All ${active.length} active route${active.length > 1 ? "s are" : " is"} on-time — network green.`;
}
