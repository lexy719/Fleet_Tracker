/** All coordinates are canvas pixels. No DOM, camera, timing or business data. */
export type Bounds = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type ProtectedRegion = { id: string; kind: string; bounds: Bounds };
export type WorkspaceSpace = {
  viewportBounds: Bounds;
  reservedChromeBounds: ProtectedRegion[];
  safetyBounds: Bounds[];
  usableWorkspaceBounds: Bounds;
  usableWorkspaceRegions: Bounds[];
};
export type WorkspaceSurface = {
  id: string;
  priority: number;
  prominence: number;
  demand: number;
  minSize: Size;
  preferredSize: Size;
  maxSize: Size;
  desiredBounds: Bounds;
  canCompress: boolean;
  canMove: boolean;
  canSuspend: boolean;
  canHide: boolean;
  state: "active" | "hidden" | "suspended";
  spatialAffinity: {
    mode: "balanced" | "near" | "away" | "edge";
    anchorId?: string;
  };
  relationGroup?: string;
};
export type AllocationCandidate = {
  region: Bounds;
  bounds: Bounds | null;
  score: number;
  reasons: string[];
};
export type SurfaceAllocation = {
  id: string;
  status: "active" | "compressed" | "suspended" | "hidden" | "unplaced";
  bounds: Bounds | null;
  requestedSize: Size;
  selectedRegion: Bounds | null;
  candidates: AllocationCandidate[];
  reason: string;
};
export type SpatialDesign = {
  minimumGutter: number;
  breathingRoom: number;
  minimumFreeRegionEdge: number;
  intentionalWhitespaceRatio: number;
  maximumProminentSurfaces: number;
  proximityWeight: number;
  balanceWeight: number;
};
export type WorkspaceAllocation = WorkspaceSpace & {
  protectedRegions: ProtectedRegion[];
  surfaces: SurfaceAllocation[];
  occupiedRegions: Bounds[];
  freeRegions: Bounds[];
  availableRegions: Bounds[];
  intentionalNegativeSpaceRegions: {
    bounds: Bounds;
    reason: string;
    reclaimable: boolean;
  }[];
  utilizationRatio: number;
  area: {
    usable: number;
    protected: number;
    occupied: number;
    free: number;
    intentional: number;
  };
  design: SpatialDesign;
};
const EPS = 0.001;
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const area = (r: Bounds) => r.width * r.height;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function intersection(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > EPS && height > EPS ? { x, y, width, height } : null;
}
export function contains(a: Bounds, b: Bounds) {
  return (
    b.x >= a.x - EPS &&
    b.y >= a.y - EPS &&
    b.x + b.width <= a.x + a.width + EPS &&
    b.y + b.height <= a.y + a.height + EPS
  );
}
const orderBounds = (a: Bounds, b: Bounds) =>
  a.y - b.y || a.x - b.x || b.width - a.width || b.height - a.height;
/** Exact disjoint partition: area accounting never double-counts candidate rectangles. */
export function subtractBounds(region: Bounds, blocker: Bounds): Bounds[] {
  const cut = intersection(region, blocker);
  if (!cut) return [region];
  return [
    { x: region.x, y: region.y, width: region.width, height: cut.y - region.y },
    {
      x: region.x,
      y: cut.y + cut.height,
      width: region.width,
      height: region.y + region.height - cut.y - cut.height,
    },
    { x: region.x, y: cut.y, width: cut.x - region.x, height: cut.height },
    {
      x: cut.x + cut.width,
      y: cut.y,
      width: region.x + region.width - cut.x - cut.width,
      height: cut.height,
    },
  ].filter((r) => r.width > EPS && r.height > EPS);
}
export function subtractRegions(regions: Bounds[], blockers: Bounds[]) {
  let result = regions.slice().sort(orderBounds);
  for (const blocker of blockers.slice().sort(orderBounds))
    result = result.flatMap((region) => subtractBounds(region, blocker));
  return result.sort(orderBounds);
}
/** Overlapping maximal empty candidates are separate from the disjoint free-space ledger. */
export function candidateRegions(
  regions: Bounds[],
  blockers: Bounds[],
): Bounds[] {
  let candidates = regions.slice();
  for (const blocker of blockers.slice().sort(orderBounds)) {
    candidates = candidates.flatMap((region) => {
      const cut = intersection(region, blocker);
      if (!cut) return [region];
      return [
        {
          x: region.x,
          y: region.y,
          width: region.width,
          height: cut.y - region.y,
        },
        {
          x: region.x,
          y: cut.y + cut.height,
          width: region.width,
          height: region.y + region.height - cut.y - cut.height,
        },
        {
          x: region.x,
          y: region.y,
          width: cut.x - region.x,
          height: region.height,
        },
        {
          x: cut.x + cut.width,
          y: region.y,
          width: region.x + region.width - cut.x - cut.width,
          height: region.height,
        },
      ].filter((r) => r.width > EPS && r.height > EPS);
    });
    candidates.sort(orderBounds);
    candidates = candidates.filter(
      (r, index, list) =>
        !list.some(
          (other, j) =>
            j !== index &&
            contains(other, r) &&
            (!contains(r, other) || j < index),
        ),
    );
  }
  return candidates.sort(orderBounds);
}
export function createWorkspaceSpace(
  size: Size,
  chrome: ProtectedRegion[],
  safeMargin = 0,
): WorkspaceSpace {
  const viewportBounds = {
    x: 0,
    y: 0,
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
  };
  const margin = clamp(
    safeMargin,
    0,
    Math.min(viewportBounds.width, viewportBounds.height) / 4,
  );
  const reservedChromeBounds = chrome
    .slice()
    .sort((a, b) => compareId(a.id, b.id))
    .flatMap((r) => {
      const bounds = intersection(r.bounds, viewportBounds);
      return bounds ? [{ ...r, bounds }] : [];
    });
  const chromeFree = subtractRegions(
    [viewportBounds],
    reservedChromeBounds.map((r) => r.bounds),
  );
  const outerX = chromeFree.length
    ? Math.min(...chromeFree.map((r) => r.x))
    : 0;
  const outerY = chromeFree.length
    ? Math.min(...chromeFree.map((r) => r.y))
    : 0;
  const outerRight = chromeFree.length
    ? Math.max(...chromeFree.map((r) => r.x + r.width))
    : 0;
  const outerBottom = chromeFree.length
    ? Math.max(...chromeFree.map((r) => r.y + r.height))
    : 0;
  const insetX = Math.min(margin, (outerRight - outerX) / 4),
    insetY = Math.min(margin, (outerBottom - outerY) / 4);
  const safe = {
    x: outerX + insetX,
    y: outerY + insetY,
    width: outerRight - outerX - insetX * 2,
    height: outerBottom - outerY - insetY * 2,
  };
  const usableWorkspaceRegions = chromeFree.flatMap((r) => {
    const clipped = intersection(r, safe);
    return clipped ? [clipped] : [];
  });
  const x = Math.min(...usableWorkspaceRegions.map((r) => r.x)),
    y = Math.min(...usableWorkspaceRegions.map((r) => r.y));
  const right = Math.max(...usableWorkspaceRegions.map((r) => r.x + r.width)),
    bottom = Math.max(...usableWorkspaceRegions.map((r) => r.y + r.height));
  const usableWorkspaceBounds = usableWorkspaceRegions.length
    ? { x, y, width: right - x, height: bottom - y }
    : { x: safe.x, y: safe.y, width: 0, height: 0 };
  return {
    viewportBounds,
    reservedChromeBounds,
    safetyBounds: subtractRegions(chromeFree, [safe]),
    usableWorkspaceBounds,
    usableWorkspaceRegions,
  };
}
export const DEFAULT_DESIGN: SpatialDesign = {
  minimumGutter: 12,
  breathingRoom: 16,
  minimumFreeRegionEdge: 24,
  intentionalWhitespaceRatio: 0.08,
  maximumProminentSurfaces: 2,
  proximityWeight: 0.9,
  balanceWeight: 0.25,
};
const inflate = (r: Bounds, amount: number): Bounds => ({
  x: r.x - amount,
  y: r.y - amount,
  width: r.width + amount * 2,
  height: r.height + amount * 2,
});
const center = (r: Bounds) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export function requestedSurfaceSize(surface: WorkspaceSurface): Size {
  const interpolate = (min: number, preferred: number, max: number) => {
    const ideal = clamp(preferred, min, Math.max(min, max)),
      rawDemand = clamp(surface.demand, 0, 1),
      // Prominence increases intermediate demand without moving the min/max endpoints.
      demand = clamp(
        rawDemand +
          Math.max(0, surface.prominence - 0.5) *
            0.7 *
            rawDemand *
            (1 - rawDemand),
        0,
        1,
      );
    return demand <= 0.5
      ? min + (ideal - min) * demand * 2
      : ideal + (Math.max(min, max) - ideal) * (demand - 0.5) * 2;
  };
  return {
    width: interpolate(
      surface.minSize.width,
      surface.preferredSize.width,
      surface.maxSize.width,
    ),
    height: interpolate(
      surface.minSize.height,
      surface.preferredSize.height,
      surface.maxSize.height,
    ),
  };
}
/** Policy weights and relations rank geometry; no surface identifier has a permanent side. */
export function rankAvailableRegions(
  surface: WorkspaceSurface,
  regions: Bounds[],
  allocated: SurfaceAllocation[],
  allSurfaces: WorkspaceSurface[],
  workspace: Bounds,
  remainingArea: number,
  design: SpatialDesign,
): AllocationCandidate[] {
  const requested = requestedSurfaceSize(surface),
    desired = center(surface.desiredBounds),
    diagonal = Math.max(1, Math.hypot(workspace.width, workspace.height));
  const relatives = allocated.filter(
    (a) =>
      a.bounds &&
      (a.id === surface.spatialAffinity.anchorId ||
        (surface.relationGroup &&
          allSurfaces.find((s) => s.id === a.id)?.relationGroup ===
            surface.relationGroup)),
  );
  const occupied = allocated.filter((a) => a.bounds);
  const relation = relatives.length ? center(relatives[0].bounds!) : desired;
  return regions
    .map((region) => {
      const reasons: string[] = [];
      if (
        region.width + EPS < surface.minSize.width ||
        region.height + EPS < surface.minSize.height
      )
        reasons.push("below-minimum-size");
      if (
        !surface.canCompress &&
        (region.width + EPS < requested.width ||
          region.height + EPS < requested.height)
      )
        reasons.push("compression-disabled");
      let width = Math.min(requested.width, region.width),
        height = Math.min(requested.height, region.height);
      if (width * height > remainingArea + EPS) {
        if (!surface.canCompress) reasons.push("whitespace-budget");
        const ratio = Math.sqrt(
          Math.max(0, remainingArea) / Math.max(1, width * height),
        );
        width = Math.max(surface.minSize.width, width * ratio);
        height = Math.max(surface.minSize.height, height * ratio);
        if (width * height > remainingArea + EPS)
          reasons.push("whitespace-budget");
      }
      const bounds = {
        x: clamp(
          desired.x - width / 2,
          region.x,
          region.x + region.width - width,
        ),
        y: clamp(
          desired.y - height / 2,
          region.y,
          region.y + region.height - height,
        ),
        width,
        height,
      };
      if (
        !surface.canMove &&
        (Math.abs(bounds.x - (desired.x - width / 2)) > EPS ||
          Math.abs(bounds.y - (desired.y - height / 2)) > EPS)
      )
        reasons.push("movement-disabled");
      if (reasons.length) return { region, bounds: null, score: -1, reasons };
      const actual = center(bounds),
        distance =
          Math.hypot(actual.x - desired.x, actual.y - desired.y) / diagonal;
      const relationDistance =
        Math.hypot(actual.x - relation.x, actual.y - relation.y) / diagonal;
      const retention =
        (width * height) / Math.max(1, requested.width * requested.height);
      const aspect =
        Math.min(width / height, requested.width / requested.height) /
        Math.max(width / height, requested.width / requested.height);
      const occupiedCenter = occupied.length
        ? {
            x:
              occupied.reduce((sum, a) => sum + center(a.bounds!).x, 0) /
              occupied.length,
            y:
              occupied.reduce((sum, a) => sum + center(a.bounds!).y, 0) /
              occupied.length,
          }
        : center(workspace);
      const separation =
        Math.hypot(actual.x - occupiedCenter.x, actual.y - occupiedCenter.y) /
        diagonal;
      let affinity = 0;
      if (surface.spatialAffinity.mode === "near")
        affinity = -relationDistance * design.proximityWeight;
      if (surface.spatialAffinity.mode === "away")
        affinity = separation * design.proximityWeight;
      if (surface.spatialAffinity.mode === "edge")
        affinity =
          -Math.min(
            bounds.x - workspace.x,
            bounds.y - workspace.y,
            workspace.x + workspace.width - bounds.x - width,
            workspace.y + workspace.height - bounds.y - height,
          ) / diagonal;
      return {
        region,
        bounds,
        reasons,
        score:
          retention * (1.8 + surface.prominence) +
          aspect * 0.35 -
          distance * design.proximityWeight +
          affinity +
          separation * design.balanceWeight,
      };
    })
    .sort((a, b) => b.score - a.score || orderBounds(a.region, b.region));
}
export function allocateWorkspace(
  space: WorkspaceSpace,
  surfaces: WorkspaceSurface[],
  protectedRegions: ProtectedRegion[] = [],
  overrides: Partial<SpatialDesign> = {},
): WorkspaceAllocation {
  const design = { ...DEFAULT_DESIGN, ...overrides };
  const protectedInside = protectedRegions
    .slice()
    .sort((a, b) => compareId(a.id, b.id))
    .flatMap((p) =>
      space.usableWorkspaceRegions.flatMap((r) => {
        const bounds = intersection(r, p.bounds);
        return bounds ? [{ ...p, bounds }] : [];
      }),
    );
  const usableArea = space.usableWorkspaceRegions.reduce(
    (sum, r) => sum + area(r),
    0,
  );
  const initial = subtractRegions(
    space.usableWorkspaceRegions,
    protectedInside.map((p) => p.bounds),
  );
  const initialCandidates = candidateRegions(
    [space.usableWorkspaceBounds].filter(
      (r) => r.width > EPS && r.height > EPS,
    ),
    [
      ...space.reservedChromeBounds.map((r) => r.bounds),
      ...protectedInside.map((r) => r.bounds),
    ],
  );
  const eligibleArea = initial.reduce((sum, r) => sum + area(r), 0);
  const ordered = surfaces
    .slice()
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.prominence - a.prominence ||
        compareId(a.id, b.id),
    );
  const first = ordered.find((s) => s.state === "active");
  const budget = Math.max(
    eligibleArea * (1 - clamp(design.intentionalWhitespaceRatio, 0, 0.5)),
    Math.min(
      eligibleArea,
      first ? first.minSize.width * first.minSize.height : 0,
    ),
  );
  const allocations: SurfaceAllocation[] = [];
  let prominentCount = 0,
    used = 0;
  for (const surface of ordered) {
    const requestedSize = requestedSurfaceSize(surface);
    const unavailable = (
      reason: string,
      candidates: AllocationCandidate[] = [],
    ): SurfaceAllocation => ({
      id: surface.id,
      status:
        surface.state !== "active"
          ? surface.state
          : surface.canSuspend
            ? "suspended"
            : surface.canHide
              ? "hidden"
              : "unplaced",
      bounds: null,
      requestedSize,
      selectedRegion: null,
      candidates,
      reason,
    });
    if (surface.state !== "active") {
      allocations.push(unavailable("requested-" + surface.state));
      continue;
    }
    if (
      surface.prominence >= 0.72 &&
      prominentCount >= design.maximumProminentSurfaces
    ) {
      allocations.push(unavailable("prominence-limit"));
      continue;
    }
    const blockers = allocations.flatMap((a) =>
      a.bounds
        ? [
            inflate(
              a.bounds,
              design.minimumGutter +
                design.breathingRoom * (1 - surface.prominence) * 0.25,
            ),
          ]
        : [],
    );
    const candidates = rankAvailableRegions(
      surface,
      candidateRegions(initialCandidates, blockers),
      allocations,
      surfaces,
      space.usableWorkspaceBounds,
      Math.max(0, budget - used),
      design,
    );
    const selected = candidates.find((c) => c.bounds);
    if (!selected?.bounds) {
      allocations.push(unavailable("no-viable-region", candidates));
      continue;
    }
    const bounds = selected.bounds;
    const compressed =
      bounds.width < requestedSize.width - EPS ||
      bounds.height < requestedSize.height - EPS;
    allocations.push({
      id: surface.id,
      bounds,
      requestedSize,
      selectedRegion: selected.region,
      candidates,
      status: compressed ? "compressed" : "active",
      reason: compressed
        ? "compressed-to-preserve-space"
        : "preferred-demand-satisfied",
    });
    used += area(bounds);
    if (surface.prominence >= 0.72) prominentCount++;
  }
  allocations.sort((a, b) => compareId(a.id, b.id));
  const occupiedRegions = allocations.flatMap((a) =>
    a.bounds ? [a.bounds] : [],
  );
  const freeRegions = subtractRegions(initial, occupiedRegions);
  const guarded = occupiedRegions.map((r) => inflate(r, design.minimumGutter));
  const gutterRegions = freeRegions.flatMap((r) => {
    const parts = subtractRegions([r], guarded);
    return subtractRegions([r], parts);
  });
  const unguarded = subtractRegions(freeRegions, guarded);
  const thin = unguarded.filter(
    (r) => Math.min(r.width, r.height) < design.minimumFreeRegionEdge,
  );
  const availableRegions = candidateRegions(initialCandidates, guarded).filter(
    (r) => Math.min(r.width, r.height) >= design.minimumFreeRegionEdge,
  );
  const quiet = unguarded
    .filter((r) => Math.min(r.width, r.height) >= design.minimumFreeRegionEdge)
    .sort((a, b) => area(b) - area(a) || orderBounds(a, b))[0];
  const intentionalNegativeSpaceRegions = [
    ...gutterRegions.map((bounds) => ({
      bounds,
      reason: "minimum-gutter",
      reclaimable: false,
    })),
    ...thin.map((bounds) => ({
      bounds,
      reason: "avoid-thin-sliver",
      reclaimable: false,
    })),
    ...(quiet && design.intentionalWhitespaceRatio > 0
      ? [
          {
            bounds: quiet,
            reason: "breathing-room-preferred-demand",
            reclaimable: true,
          },
        ]
      : []),
  ];
  return {
    ...space,
    protectedRegions: protectedInside,
    surfaces: allocations,
    occupiedRegions,
    freeRegions,
    availableRegions,
    intentionalNegativeSpaceRegions,
    utilizationRatio: usableArea ? used / usableArea : 0,
    area: {
      usable: usableArea,
      protected: usableArea - eligibleArea,
      occupied: used,
      free: freeRegions.reduce((sum, r) => sum + area(r), 0),
      intentional: intentionalNegativeSpaceRegions.reduce(
        (sum, r) => sum + area(r.bounds),
        0,
      ),
    },
    design,
  };
}
