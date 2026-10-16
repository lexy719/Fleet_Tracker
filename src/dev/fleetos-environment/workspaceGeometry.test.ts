import { describe, expect, it } from "vitest";
import {
  BASE_VARIABLES,
  composeWorkspace,
  nextSeed,
  randomComposition,
} from "./composition";
import { labChrome } from "./labGeometry";
import { INITIAL_SURFACES, labSurfaceRequests } from "./labSurfaces";
import {
  allocateWorkspace,
  area,
  candidateRegions,
  contains,
  createWorkspaceSpace,
  intersection,
  requestedSurfaceSize,
  subtractRegions,
  type WorkspaceAllocation,
  type WorkspaceSurface,
} from "./workspaceGeometry";

const SIZE = { width: 1440, height: 900 };
const SPACE = createWorkspaceSpace(SIZE, labChrome(SIZE));
function surface(
  id: string,
  overrides: Partial<WorkspaceSurface> = {},
): WorkspaceSurface {
  return {
    id,
    priority: 60,
    prominence: 0.4,
    demand: 0.5,
    minSize: { width: 220, height: 160 },
    preferredSize: { width: 400, height: 300 },
    maxSize: { width: 900, height: 700 },
    desiredBounds: { x: 480, y: 300, width: 400, height: 300 },
    canCompress: true,
    canMove: true,
    canSuspend: true,
    canHide: true,
    state: "active",
    spatialAffinity: { mode: "balanced" },
    ...overrides,
  };
}
function assertLedger(result: WorkspaceAllocation) {
  expect(
    result.area.occupied + result.area.protected + result.area.free,
  ).toBeCloseTo(result.area.usable, 5);
  expect(result.utilizationRatio).toBeGreaterThanOrEqual(0);
  expect(result.utilizationRatio).toBeLessThanOrEqual(1);
  for (const r of result.occupiedRegions) {
    expect(contains(result.usableWorkspaceBounds, r)).toBe(true);
    for (const p of [
      ...result.reservedChromeBounds,
      ...result.protectedRegions,
    ])
      expect(intersection(r, p.bounds)).toBeNull();
    for (const free of result.freeRegions)
      expect(intersection(r, free)).toBeNull();
  }
  for (let i = 0; i < result.occupiedRegions.length; i++)
    for (let j = i + 1; j < result.occupiedRegions.length; j++) {
      const a = result.occupiedRegions[i],
        b = result.occupiedRegions[j],
        gutter = result.design.minimumGutter;
      expect(intersection(a, b)).toBeNull();
      expect(
        a.x + a.width + gutter <= b.x + 0.001 ||
          b.x + b.width + gutter <= a.x + 0.001 ||
          a.y + a.height + gutter <= b.y + 0.001 ||
          b.y + b.height + gutter <= a.y + 0.001,
      ).toBe(true);
    }
  for (let i = 0; i < result.freeRegions.length; i++)
    for (let j = i + 1; j < result.freeRegions.length; j++)
      expect(
        intersection(result.freeRegions[i], result.freeRegions[j]),
      ).toBeNull();
}
describe("explicit usable workspace", () => {
  it.each([
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 320, height: 480 },
  ])(
    "defines 100% against the full rail-protected workspace at $width × $height",
    (size) => {
      const space = createWorkspaceSpace(size, labChrome(size));
      const right = labChrome(size)[0].bounds.width;
      expect(space.viewportBounds).toEqual({ x: 0, y: 0, ...size });
      expect(space.usableWorkspaceBounds).toEqual({
        x: right,
        y: 0,
        width: size.width - right,
        height: size.height,
      });
      const composed = composeWorkspace(
        "MAP_FOCUS",
        {
          ...BASE_VARIABLES,
          mapWidth: 1,
          mapHeight: 1,
          dominance: 1,
          margin: 0,
        },
        size,
      );
      expect(composed.surfaces.find((s) => s.id === "map")?.bounds).toEqual(
        space.usableWorkspaceBounds,
      );
      expect(composed.freeRegions).toEqual([]);
      assertLedger(composed);
    },
  );
  it("reserves an explicit safe margin after chrome and releases temporary instruments", () => {
    const open = createWorkspaceSpace(SIZE, labChrome(SIZE, true), 24);
    const closed = createWorkspaceSpace(SIZE, labChrome(SIZE), 24);
    expect(closed.usableWorkspaceBounds).toEqual({
      x: 120,
      y: 24,
      width: 1296,
      height: 852,
    });
    expect(open.usableWorkspaceBounds.width).toBe(
      closed.usableWorkspaceBounds.width - 342,
    );
    expect(closed.reservedChromeBounds).toHaveLength(1);
    expect(open.reservedChromeBounds).toHaveLength(2);
  });
  it("tracks an interior chrome exclusion without losing an adjacent maximal region", () => {
    const viewport = { width: 1000, height: 800 },
      chrome = [
        {
          id: "interior",
          kind: "chrome",
          bounds: { x: 400, y: 300, width: 200, height: 200 },
        },
      ];
    const space = createWorkspaceSpace(viewport, chrome);
    const result = allocateWorkspace(
      space,
      [
        surface("A", {
          minSize: { width: 300, height: 700 },
          preferredSize: { width: 350, height: 750 },
          maxSize: viewport,
        }),
      ],
      [],
      { intentionalWhitespaceRatio: 0 },
    );
    expect(result.surfaces[0].bounds?.height).toBe(750);
    assertLedger(result);
  });
});
describe("white-space partition and allocation", () => {
  it("partitions occupied holes exactly and ranks overlapping candidates separately", () => {
    const whole = { x: 0, y: 0, width: 1000, height: 800 },
      hole = { x: 400, y: 300, width: 200, height: 200 };
    const free = subtractRegions([whole], [hole]);
    expect(free.reduce((sum, r) => sum + area(r), 0)).toBe(760000);
    expect(free.every((r) => !intersection(r, hole))).toBe(true);
    expect(
      candidateRegions([whole], [hole]).some(
        (r) => r.width === 400 && r.height === 800,
      ),
    ).toBe(true);
    expect(subtractRegions([whole], [hole, hole])).toEqual(free);
  });
  it("interpolates demand through minimum, preferred and maximum with bounded compression", () => {
    const request = surface("A");
    expect(requestedSurfaceSize({ ...request, demand: 0 })).toEqual(
      request.minSize,
    );
    expect(requestedSurfaceSize(request)).toEqual(request.preferredSize);
    expect(requestedSurfaceSize({ ...request, demand: 1 })).toEqual(
      request.maxSize,
    );
    const small = createWorkspaceSpace({ width: 350, height: 240 }, []);
    const result = allocateWorkspace(small, [request]);
    expect(result.surfaces[0].status).toBe("compressed");
    expect(result.surfaces[0].bounds!.width).toBeGreaterThanOrEqual(
      request.minSize.width,
    );
    expect(result.surfaces[0].bounds!.height).toBeGreaterThanOrEqual(
      request.minSize.height,
    );
    expect(result.surfaces[0].bounds!.width).toBeLessThanOrEqual(
      request.maxSize.width,
    );
    assertLedger(result);
  });
  it("preserves gutters, useful maximum sizes and intentional breathing room", () => {
    const result = allocateWorkspace(SPACE, [surface("A"), surface("B")]);
    assertLedger(result);
    expect(result.surfaces.every((s) => s.bounds)).toBe(true);
    expect(result.utilizationRatio).toBeLessThan(0.5);
    expect(
      result.intentionalNegativeSpaceRegions.some(
        (r) => r.reason === "minimum-gutter",
      ),
    ).toBe(true);
    expect(
      result.intentionalNegativeSpaceRegions.some((r) => r.reclaimable),
    ).toBe(true);
    for (const r of result.availableRegions)
      expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(
        result.design.minimumFreeRegionEdge,
      );
  });
  it("reallocates and expands remaining demand when an occupant is removed", () => {
    const main = surface("map", {
      priority: 40,
      preferredSize: SPACE.usableWorkspaceBounds,
      maxSize: SPACE.usableWorkspaceBounds,
    });
    const supporting = surface("A", {
      desiredBounds: { x: 96, y: 240, width: 300, height: 300 },
    });
    const before = allocateWorkspace(SPACE, [main, supporting]);
    const after = allocateWorkspace(SPACE, [main]);
    expect(area(after.surfaces[0].bounds!)).toBeGreaterThan(
      area(before.surfaces.find((s) => s.id === "map")!.bounds!),
    );
    assertLedger(before);
    assertLedger(after);
  });
  it("moves the same surface to materially different regions without ID-specific slots", () => {
    const left = allocateWorkspace(SPACE, [
      surface("A", {
        desiredBounds: { x: 130, y: 120, width: 400, height: 300 },
      }),
    ]);
    const right = allocateWorkspace(SPACE, [
      surface("A", {
        desiredBounds: { x: 990, y: 430, width: 400, height: 300 },
      }),
    ]);
    expect(
      right.surfaces[0].bounds!.x - left.surfaces[0].bounds!.x,
    ).toBeGreaterThan(700);
    const renamed = allocateWorkspace(SPACE, [
      surface("Other", {
        desiredBounds: { x: 990, y: 430, width: 400, height: 300 },
      }),
    ]);
    expect(renamed.surfaces[0].bounds).toEqual(right.surfaces[0].bounds);
  });
  it("uses relationships, affinity and priorities in ranking", () => {
    const anchor = surface("anchor", {
      priority: 90,
      relationGroup: "context",
    });
    const dependent = surface("dependent", {
      relationGroup: "context",
      spatialAffinity: { mode: "near", anchorId: "anchor" },
    });
    const near = allocateWorkspace(SPACE, [anchor, dependent]);
    const away = allocateWorkspace(SPACE, [
      anchor,
      { ...dependent, spatialAffinity: { mode: "away" } },
    ]);
    expect(
      near.surfaces.find((s) => s.id === "dependent")!.candidates[0].score,
    ).not.toBe(
      away.surfaces.find((s) => s.id === "dependent")!.candidates[0].score,
    );
    assertLedger(near);
    assertLedger(away);
  });
  it("compresses and suspends excess demand instead of producing slivers or overflow", () => {
    const space = createWorkspaceSpace({ width: 700, height: 480 }, []);
    const requests = Array.from({ length: 12 }, (_, i) =>
      surface(`Surface ${i}`, {
        priority: 90 - i,
        demand: 1,
        prominence: i < 4 ? 0.9 : 0.4,
      }),
    );
    const result = allocateWorkspace(space, requests);
    expect(result.surfaces.some((s) => s.status === "compressed")).toBe(true);
    expect(result.surfaces.some((s) => s.status === "suspended")).toBe(true);
    expect(result.surfaces.filter((s) => s.bounds)).toHaveLength(1);
    for (const allocation of result.surfaces.filter((s) => s.bounds)) {
      expect(allocation.bounds!.width).toBeGreaterThanOrEqual(220);
      expect(allocation.bounds!.height).toBeGreaterThanOrEqual(160);
    }
    assertLedger(result);
  });
  it("limits simultaneous prominent surfaces and explains unplaceable noncompressible demand", () => {
    const result = allocateWorkspace(SPACE, [
      surface("A", { prominence: 0.9 }),
      surface("B", { prominence: 0.9 }),
      surface("C", { prominence: 0.9 }),
    ]);
    expect(result.surfaces.find((s) => s.id === "C")?.reason).toBe(
      "prominence-limit",
    );
    const small = createWorkspaceSpace({ width: 250, height: 180 }, []);
    const fixed = allocateWorkspace(small, [
      surface("fixed", {
        canCompress: false,
        canSuspend: false,
        canHide: false,
      }),
    ]);
    expect(fixed.surfaces[0].status).toBe("unplaced");
    expect(fixed.surfaces[0].candidates[0].reasons).toContain(
      "compression-disabled",
    );
    const hideable = allocateWorkspace(small, [
      surface("hideable", {
        canCompress: false,
        canSuspend: false,
        canHide: true,
      }),
    ]);
    expect(hideable.surfaces[0].status).toBe("hidden");
  });
  it("releases hidden/suspended occupants and restores the exact clean composition", () => {
    const base = composeWorkspace("BALANCED", { ...BASE_VARIABLES }, SIZE);
    const space = createWorkspaceSpace(
      SIZE,
      labChrome(SIZE),
      BASE_VARIABLES.margin,
    );
    const active = labSurfaceRequests(
      INITIAL_SURFACES.map((s) => ({ ...s, enabled: true })),
      space.usableWorkspaceBounds,
    );
    const withSurfaces = composeWorkspace(
      "BALANCED",
      { ...BASE_VARIABLES },
      SIZE,
      { surfaces: active },
    );
    expect(withSurfaces.occupiedRegions).not.toEqual(base.occupiedRegions);
    const hidden = composeWorkspace("BALANCED", { ...BASE_VARIABLES }, SIZE, {
      surfaces: active.map((s) => ({ ...s, state: "hidden" })),
    });
    const suspended = composeWorkspace(
      "BALANCED",
      { ...BASE_VARIABLES },
      SIZE,
      { surfaces: active.map((s) => ({ ...s, state: "suspended" })) },
    );
    expect(hidden.occupiedRegions).toEqual(base.occupiedRegions);
    expect(suspended.freeRegions).toEqual(base.freeRegions);
    expect(composeWorkspace("BALANCED", { ...BASE_VARIABLES }, SIZE)).toEqual(
      base,
    );
  });
  it("is invariant to input order and continues smoothly between geometry values", () => {
    const requests = [surface("C"), surface("A"), surface("B")];
    expect(allocateWorkspace(SPACE, requests)).toEqual(
      allocateWorkspace(SPACE, requests.slice().reverse()),
    );
    const start = allocateWorkspace(SPACE, [surface("A")]),
      next = allocateWorkspace(SPACE, [
        surface("A", {
          desiredBounds: { x: 480.1, y: 300, width: 400, height: 300 },
        }),
      ]);
    expect(
      next.surfaces[0].bounds!.x - start.surfaces[0].bounds!.x,
    ).toBeCloseTo(0.1);
  });
  it("increases intermediate demand with prominence while preserving min/max endpoints", () => {
    const supporting = surface("A"),
      primary = { ...supporting, prominence: 0.9 };
    expect(requestedSurfaceSize(primary).width).toBeGreaterThan(
      requestedSurfaceSize(supporting).width,
    );
    expect(requestedSurfaceSize({ ...primary, demand: 0 })).toEqual(
      primary.minSize,
    );
    expect(requestedSurfaceSize({ ...primary, demand: 1 })).toEqual(
      primary.maxSize,
    );
  });
  it("keeps immovable content anchored and rejects overlap instead of moving it silently", () => {
    const anchor = surface("anchor", { priority: 90 });
    const fixed = surface("fixed", { canMove: false, canCompress: false });
    const result = allocateWorkspace(SPACE, [anchor, fixed]);
    expect(result.surfaces.find((s) => s.id === "fixed")?.status).toBe(
      "suspended",
    );
    expect(
      result.surfaces
        .find((s) => s.id === "fixed")
        ?.candidates.some((c) => c.reasons.includes("movement-disabled")),
    ).toBe(true);
    assertLedger(result);
  });
  it("handles a fully excluded viewport without NaN or overflowing allocations", () => {
    const space = createWorkspaceSpace({ width: 200, height: 100 }, [
      {
        id: "all",
        kind: "chrome",
        bounds: { x: 0, y: 0, width: 200, height: 100 },
      },
    ]);
    const result = allocateWorkspace(space, [surface("A")]);
    expect(result.area.usable).toBe(0);
    expect(result.surfaces[0].status).toBe("suspended");
    expect(result.utilizationRatio).toBe(0);
    expect(result.occupiedRegions).toEqual([]);
  });
  it.each([
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
    { width: 320, height: 480 },
  ])(
    "preserves space accounting through 120 conflicting multi-surface requests at $width × $height",
    (size) => {
      let seed = 42;
      for (let i = 0; i < 120; i++) {
        seed = nextSeed(seed);
        const variables = randomComposition(seed, BASE_VARIABLES),
          space = createWorkspaceSpace(size, labChrome(size), variables.margin);
        const configs = INITIAL_SURFACES.map((s, n) => ({
          ...s,
          enabled: true,
          demand: (i % 13) / 12,
          prominence: (i % 9) / 8,
          priority: 70 - n * 5,
          x: ((i + n * 7) % 23) / 22,
          y: ((i + n * 11) % 19) / 18,
        }));
        const result = composeWorkspace("BALANCED", variables, size, {
          surfaces: labSurfaceRequests(configs, space.usableWorkspaceBounds),
        });
        assertLedger(result);
        for (const r of result.surfaces.filter((s) => s.bounds)) {
          const minimum =
            r.id === "map"
              ? {
                  width: Math.min(240, space.usableWorkspaceBounds.width),
                  height: Math.min(180, space.usableWorkspaceBounds.height),
                }
              : { width: 220, height: 160 };
          expect(r.bounds!.width + 0.001).toBeGreaterThanOrEqual(minimum.width);
          expect(r.bounds!.height + 0.001).toBeGreaterThanOrEqual(
            minimum.height,
          );
        }
      }
    },
  );
});
