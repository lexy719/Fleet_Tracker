import type { WorkspaceAllocation } from "./workspaceGeometry";

export function SpatialDiagnostics({
  allocation,
  selected,
}: {
  allocation: WorkspaceAllocation;
  selected: string;
}) {
  const chosen = allocation.surfaces.find((s) => s.id === selected);
  return (
    <svg
      className="environment-spatial-overlay"
      data-testid="spatial-diagnostics"
      viewBox={`0 0 ${allocation.viewportBounds.width} ${allocation.viewportBounds.height}`}
      aria-label="DEV · geometria espacial"
      role="img"
    >
      <defs>
        <pattern
          id="spatial-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0,8 8,0" stroke="#b57461" strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect
        {...allocation.viewportBounds}
        className="environment-debug-viewport"
      />
      <rect
        {...allocation.usableWorkspaceBounds}
        className="environment-debug-workspace"
      />
      {allocation.reservedChromeBounds.map((r) => (
        <g key={r.id}>
          <rect {...r.bounds} className="environment-debug-chrome" />
          <text x={r.bounds.x + 5} y={r.bounds.y + 14}>
            {r.id}
          </text>
        </g>
      ))}
      {allocation.protectedRegions.map((r, i) => (
        <rect
          {...r.bounds}
          className="environment-debug-reservation"
          key={`${r.id}-${i}`}
        />
      ))}
      {allocation.availableRegions.map((r, i) => (
        <rect {...r} className="environment-debug-free" key={`free-${i}`} />
      ))}
      {allocation.intentionalNegativeSpaceRegions.map((r, i) => (
        <rect
          {...r.bounds}
          className="environment-debug-negative"
          key={`negative-${i}`}
        />
      ))}
      {allocation.surfaces
        .filter((s) => s.bounds)
        .map((s) => (
          <g key={s.id}>
            <rect {...s.bounds!} className="environment-debug-occupied" />
            <text x={s.bounds!.x + 8} y={s.bounds!.y + 16}>
              {s.id} · {s.status}
            </text>
          </g>
        ))}
      {chosen?.selectedRegion && (
        <rect
          {...chosen.selectedRegion}
          className="environment-debug-selected"
        />
      )}
      {chosen?.candidates
        .filter((c) => c.reasons.length)
        .slice(0, 8)
        .map((c, i) => (
          <rect
            {...c.region}
            className="environment-debug-rejected"
            key={`rejected-${i}`}
          />
        ))}
    </svg>
  );
}
