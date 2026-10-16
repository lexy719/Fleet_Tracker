import { clamp, type Bounds, type WorkspaceSurface } from "./workspaceGeometry";

export type LabSurface = {
  id: string;
  enabled: boolean;
  state: WorkspaceSurface["state"];
  demand: number;
  prominence: number;
  priority: number;
  width: number;
  height: number;
  x: number;
  y: number;
  affinity: WorkspaceSurface["spatialAffinity"]["mode"];
  grouped: boolean;
};
export const INITIAL_SURFACES: ReadonlyArray<LabSurface> = [
  {
    id: "Surface A",
    enabled: false,
    state: "active",
    demand: 0.5,
    prominence: 0.35,
    priority: 70,
    width: 0.28,
    height: 0.34,
    x: 0.5,
    y: 0.5,
    affinity: "balanced",
    grouped: false,
  },
  {
    id: "Surface B",
    enabled: false,
    state: "active",
    demand: 0.5,
    prominence: 0.45,
    priority: 65,
    width: 0.23,
    height: 0.48,
    x: 0.5,
    y: 0.5,
    affinity: "balanced",
    grouped: false,
  },
  {
    id: "Surface C",
    enabled: false,
    state: "active",
    demand: 0.5,
    prominence: 0.3,
    priority: 60,
    width: 0.48,
    height: 0.2,
    x: 0.5,
    y: 0.5,
    affinity: "balanced",
    grouped: false,
  },
];
export function labSurfaceRequests(
  configs: readonly LabSurface[],
  workspace: Bounds,
): WorkspaceSurface[] {
  return configs
    .filter((s) => s.enabled)
    .map((s) => {
      const minSize = { width: 220, height: 160 };
      const supportingWidth = Math.min(workspace.width, 1000);
      const prominenceScale = clamp((s.prominence - 0.5) * 2, 0, 1);
      const maxSize = {
        width: Math.max(
          minSize.width,
          Math.min(
            workspace.width,
            supportingWidth +
              (workspace.width - supportingWidth) * prominenceScale,
          ),
        ),
        height: Math.max(minSize.height, workspace.height),
      };
      const preferredSize = {
        width: workspace.width * s.width,
        height: workspace.height * s.height,
      };
      return {
        id: s.id,
        priority: s.priority,
        prominence: s.prominence,
        demand: s.demand,
        minSize,
        preferredSize,
        maxSize,
        desiredBounds: {
          x: workspace.x + workspace.width * s.x - preferredSize.width / 2,
          y: workspace.y + workspace.height * s.y - preferredSize.height / 2,
          ...preferredSize,
        },
        canCompress: true,
        canMove: true,
        canSuspend: true,
        canHide: true,
        state: s.state,
        spatialAffinity: { mode: s.affinity },
        relationGroup: s.grouped ? "abstract-context" : undefined,
      };
    });
}
