import {
  Briefcase,
  FileText,
  Fuel,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { railGeometry } from "./labGeometry";
import type { Size, SurfaceAllocation } from "./workspaceGeometry";
import { DOMAINS, type Domain } from "./livingEnvironment";
import type { LabSurface } from "./labSurfaces";
const ICONS = {
  Jobs: Briefcase,
  Drivers: Users,
  Trucks: Truck,
  Fuel,
  Restrictions: ShieldCheck,
  Documents: FileText,
};
export function ControlRail({
  size,
  surfaces,
  allocations,
  onToggle,
}: {
  size: Size;
  surfaces: LabSurface[];
  allocations: SurfaceAllocation[];
  onToggle(domain: Domain): void;
}) {
  const geometry = railGeometry(size);
  return (
    <aside
      className="environment-rail"
      aria-label="Contextos do laboratório"
      style={{ left: geometry.x, width: geometry.width }}
    >
      <div className="environment-mark" aria-label="FleetOS">
        F
      </div>
      <div className="environment-rail-rule" aria-hidden="true" />
      <div role="toolbar" aria-label="Contextos" aria-orientation="vertical">
        {DOMAINS.map((domain) => {
          const Icon = ICONS[domain],
            active = Boolean(surfaces.find((s) => s.id === domain)?.enabled);
          const status = allocations.find((s) => s.id === domain)?.status;
          return (
            <div className="environment-control" key={domain}>
              <button
                type="button"
                aria-label={domain}
                aria-pressed={active}
                onClick={() => onToggle(domain)}
                data-context-status={status ?? "inactive"}
                aria-describedby={`context-${domain}`}
              >
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <span
                className="environment-tooltip"
                role="tooltip"
                id={`context-${domain}`}
              >
                {domain}
                <span>
                  {active
                    ? status === "suspended"
                      ? "Em espera · clicar para remover"
                      : "Clicar para remover"
                    : "Abrir contexto demo"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
