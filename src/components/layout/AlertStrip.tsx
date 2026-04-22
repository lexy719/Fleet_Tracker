import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useRouteSessionAlerts } from "../../context/RouteSessionContext";
import { opsAlerts } from "../../data/mockData";

/** Compact ops strip — mirrors carrier "exception first" consoles */
export function AlertStrip() {
  const { routeSessionAlerts } = useRouteSessionAlerts();
  const merged = [...routeSessionAlerts, ...opsAlerts];
  const top = merged.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-2 text-xs backdrop-blur-sm md:px-8"
      style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
    >
      <span
        className="hidden shrink-0 font-semibold uppercase tracking-wider sm:inline"
        style={{ color: "var(--app-muted)" }}
      >
        Exceções
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-thin pb-0.5 sm:pb-0">
        {top.map((a) => (
          <Link
            key={a.id}
            to={
              a.entityType === "route"
                ? "/app/dispatch"
                : a.entityType === "driver"
                  ? "/app/drivers"
                  : a.entityType === "job"
                    ? "/app/jobs"
                    : a.entityType === "maintenance"
                      ? "/app/fleet"
                      : "/app/map"
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 transition hover:bg-black/[0.04]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-fg)" }}
          >
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0"
              style={{
                color: a.severity === "critical" ? "#A84432" : a.severity === "warning" ? "#8B6F47" : "var(--app-muted)",
              }}
            />
            <span className="max-w-[200px] truncate font-medium md:max-w-none">{a.title}</span>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          </Link>
        ))}
      </div>
      <Link
        to="/app"
        className="shrink-0 text-[var(--app-muted)] hover:text-[var(--app-fg)]"
      >
        Todos os alertas
      </Link>
    </div>
  );
}
