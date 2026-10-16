import { describe, expect, it } from "vitest";
import { INITIAL_CAMERA } from "./composition";
import {
  initialLivingState,
  toggleDomain,
  snapshotLiving,
  transitionTopology,
  enterFocus,
  leaveFocus,
  DOMAINS,
} from "./livingEnvironment";
import {
  initialTopology,
  applyTopology,
  composeRepresentations,
  shapeAffinity,
  resolveRole,
  relationshipWeight,
  representationDensity,
} from "./representationEngine";
import { topologyScenario, TOPOLOGY_FAMILIES } from "./topologyScenarios";
import {
  contains,
  createWorkspaceSpace,
  intersection,
} from "./workspaceGeometry";
import { labChrome } from "./labGeometry";
import { mapRepresentation } from "./mapRepresentation";
const base = () => ({ ...initialLivingState(), topology: initialTopology() });
function model(state: ReturnType<typeof base>, width = 1440, height = 900) {
  return composeRepresentations(
    state,
    { width, height },
    createWorkspaceSpace(
      { width, height },
      [
        ...labChrome({ width, height }, state.explorerOpen),
        {
          id: "spine",
          kind: "orientation",
          bounds: { x: 96, y: 0, width: width - 96, height: 64 },
        },
      ],
      state.variables.margin,
    ),
  );
}
function assertGeometry(result: ReturnType<typeof model>) {
  for (const b of result.occupiedRegions) {
    expect(contains(result.usableWorkspaceBounds, b)).toBe(true);
    for (const c of result.reservedChromeBounds)
      expect(intersection(b, c.bounds)).toBeNull();
  }
  for (let i = 0; i < result.occupiedRegions.length; i++)
    for (let j = i + 1; j < result.occupiedRegions.length; j++)
      expect(
        intersection(result.occupiedRegions[i], result.occupiedRegions[j]),
      ).toBeNull();
  expect(
    result.area.occupied + result.area.protected + result.area.free,
  ).toBeCloseTo(result.area.usable, 2);
  for (const d of result.representations)
    expect(d.bounds).toEqual(
      result.surfaces.find((s) => s.id === d.actor)?.bounds ?? null,
    );
}
describe("joint representation and topology negotiation", () => {
  it.each([1199, 1440, 1920])(
    "all visual families are deterministic and bounded at %i",
    (width) => {
      for (const family of TOPOLOGY_FAMILIES) {
        const state = { ...base(), ...topologyScenario(base(), family.id) },
          result = model(
            state,
            width,
            width === 1920 ? 1080 : width === 1199 ? 884 : 900,
          );
        assertGeometry(result);
        expect(
          model(
            state,
            width,
            width === 1920 ? 1080 : width === 1199 ? 884 : 900,
          ),
        ).toEqual(result);
        expect(result.occupiedRegions.length).toBeGreaterThan(0);
      }
    },
  );
  it("keeps automatic contexts readable instead of reducing them to tiny indicators", () => {
    const state = { ...base(), ...topologyScenario(base(), "six") },
      m = model(state);
    const content = m.representations.filter(
      (d) => d.actor !== "map" && d.bounds,
    );
    expect(content.length).toBeGreaterThan(0);
    for (const d of content) {
      expect([
        "indicator",
        "micro-summary",
        "strip",
        "vertical-strip",
        "contextual",
      ]).not.toContain(d.form);
      expect(d.bounds!.width).toBeGreaterThanOrEqual(360);
      expect(d.bounds!.height).toBeGreaterThanOrEqual(260);
    }
    assertGeometry(m);
  });
  it("shape affinity prefers a band for wide short space and a list for tall space", () => {
    expect(
      shapeAffinity("strip", { width: 1000, height: 180 }),
    ).toBeGreaterThan(shapeAffinity("list", { width: 1000, height: 180 }));
    expect(shapeAffinity("list", { width: 380, height: 650 })).toBeGreaterThan(
      shapeAffinity("flow", { width: 380, height: 650 }),
    );
    expect(shapeAffinity("analysis", { width: 180, height: 100 })).toBe(0);
  });
  it("promotes actual context and demotes the map, then reverses the roles", () => {
    const promoted = applyTopology(base(), { type: "PROMOTE", actor: "Jobs" });
    expect(resolveRole("Jobs", promoted)).toBe("PRIMARY");
    expect(resolveRole("map", promoted)).toBe("SUPPORTING");
    const swapped = applyTopology(promoted, {
      type: "SWAP",
      a: "Jobs",
      b: "map",
    });
    expect(resolveRole("map", swapped)).toBe("PRIMARY");
    expect(swapped.topology?.primary).toBe("map");
    expect(swapped.variables.mapX).toBe(
      promoted.surfaces.find((s) => s.id === "Jobs")?.x,
    );
    expect(
      applyTopology(promoted, { type: "DEMOTE", actor: "Jobs" }).topology
        ?.primary,
    ).toBe("map");
  });
  it("merges related content into one owner and split restores independently selectable actors", () => {
    const promoted = applyTopology(base(), { type: "PROMOTE", actor: "Jobs" }),
      merged = applyTopology(promoted, {
        type: "MERGE",
        actors: ["Jobs", "Fuel"],
      });
    const m = model({ ...base(), ...merged });
    expect(m.representations.find((d) => d.actor === "Jobs")?.members).toEqual([
      "Jobs",
      "Fuel",
    ]);
    expect(m.surfaces.find((d) => d.id === "Fuel")?.reason).toBe(
      "merged-into-related-surface",
    );
    const split = applyTopology(merged, { type: "SPLIT", actor: "Fuel" });
    expect(split.topology?.groups).toEqual([]);
    expect(
      model({ ...base(), ...split }).representations.find(
        (d) => d.actor === "Fuel",
      )?.members,
    ).toEqual(["Fuel"]);
  });
  it("merging a restriction into the map keeps the map as owner", () => {
    const merged = applyTopology(base(), {
        type: "MERGE",
        actors: ["Restrictions", "map"],
      }),
      result = model({ ...base(), ...merged });
    expect(
      result.representations.find((d) => d.actor === "map")?.members,
    ).toEqual(["Restrictions", "map"]);
    expect(result.map.visible).toBe(true);
  });
  it("synthetic relationships are symmetric preferences and cluster changes gravity only", () => {
    expect(relationshipWeight("Jobs", "Fuel")).toBe(
      relationshipWeight("Fuel", "Jobs"),
    );
    expect(relationshipWeight("Drivers", "Trucks")).toBeGreaterThan(
      relationshipWeight("Fuel", "Documents"),
    );
    const cluster = applyTopology(base(), { type: "CLUSTER" });
    expect(cluster.topology?.gravity).toBe(1);
    expect(cluster.variables).toEqual(base().variables);
  });
  it("density changes by intentional form, rather than text scale", () => {
    expect(representationDensity("analysis")).toBeGreaterThan(
      representationDensity("contextual"),
    );
    expect(representationDensity("contextual")).toBeGreaterThan(
      representationDensity("indicator"),
    );
    const state = applyTopology(base(), { type: "PROMOTE", actor: "Fuel" }),
      a = model({ ...base(), ...state });
    const compact = applyTopology(state, {
        type: "MORPH",
        actor: "Fuel",
        form: "strip",
      }),
      b = model({ ...base(), ...compact });
    expect(b.representations.find((d) => d.actor === "Fuel")?.form).toBe(
      "strip",
    );
    expect(
      a.representations.find((d) => d.actor === "Fuel")?.density,
    ).toBeGreaterThan(
      b.representations.find((d) => d.actor === "Fuel")!.density,
    );
  });
  it("primary content consumes useful space instead of leaving a small map and tiny panel", () => {
    const state = { ...base(), ...topologyScenario(base(), "fuel-primary") },
      m = model(state);
    expect(m.representations.find((d) => d.actor === "Fuel")?.form).toBe(
      "analysis",
    );
    expect(m.utilizationRatio).toBeGreaterThan(0.65);
    const primary = m.representations.find((d) => d.actor === "Fuel")!.bounds!;
    expect((primary.width * primary.height) / m.area.usable).toBeGreaterThan(
      0.45,
    );
  });
  it("Esc restores roles, forms, merge state, tools, continuous geometry and event-time camera exactly", () => {
    const state = toggleDomain(base(), "Jobs");
    state.variables.mapX = 0.37;
    state.explorerOpen = true;
    const camera = { ...INITIAL_CAMERA, zoom: 8.19, pitch: 31 };
    const promoted = transitionTopology(
        state,
        { type: "PROMOTE", actor: "Jobs" },
        camera,
      ),
      merged = transitionTopology(
        promoted,
        { type: "MERGE", actors: ["Jobs", "Fuel"] },
        { ...camera, zoom: 6.2 },
      );
    const focus = enterFocus(merged, "Fuel", { ...camera, zoom: 7.21 }),
      document = enterFocus(focus, "Documents", { ...camera, zoom: 9 });
    expect(snapshotLiving(leaveFocus(document))).toEqual(snapshotLiving(focus));
    expect(snapshotLiving(leaveFocus(leaveFocus(document)))).toEqual(
      snapshotLiving(merged),
    );
    const restored = leaveFocus(leaveFocus(leaveFocus(leaveFocus(document))));
    expect(snapshotLiving(restored)).toEqual(snapshotLiving(state));
    expect(restored.cameraRequest?.target).toEqual({ kind: "restore", camera });
  });
  it("interruption history records intermediate camera without mutating earlier merge frames", () => {
    const state = transitionTopology(
        base(),
        { type: "MERGE", actors: ["Jobs", "Documents"] },
        INITIAL_CAMERA,
      ),
      snap = structuredClone(state.history);
    const mid = { ...INITIAL_CAMERA, zoom: 6.85, pitch: 17.3 };
    const interrupted = enterFocus(state, "Drivers", mid);
    expect(interrupted.history[0]).toEqual(snap[0]);
    expect(leaveFocus(interrupted).cameraRequest?.target).toEqual({
      kind: "restore",
      camera: mid,
    });
  });
  it("activation order cannot change deterministic representation targets", () => {
    let a = base(),
      b = base();
    for (const d of DOMAINS) a = { ...a, ...toggleDomain(a, d) };
    for (const d of [...DOMAINS].reverse()) b = { ...b, ...toggleDomain(b, d) };
    expect(model(a)).toEqual(model(b));
  });
  it("over-constrained canvas suspends without unusable rectangles or overlap", () => {
    const state = { ...base(), ...topologyScenario(base(), "six") };
    state.variables.pressureLeft = 1;
    state.variables.pressureRight = 1;
    state.variables.pressureTop = 1;
    state.variables.pressureBottom = 1;
    const m = model(state, 1199, 884);
    assertGeometry(m);
    expect(m.representations.some((d) => d.role === "SUSPENDED")).toBe(true);
  });
  it("map modes alter real layer/control demands and restore full label range", () => {
    expect(mapRepresentation("CONTEXTUAL_MINIMAP").labelZoomOffset).toBe(2);
    expect(mapRepresentation("CONTEXTUAL_MINIMAP").controls).toBe(false);
    expect(mapRepresentation("FULL_OPERATIONAL").labelZoomOffset).toBe(0);
    expect(mapRepresentation("FUEL_CORRIDOR").fuel).toBe(true);
    expect(mapRepresentation("RESTRICTION_SEGMENT").segment).toBe(true);
  });
});
