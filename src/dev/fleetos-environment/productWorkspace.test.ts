import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  initialGuidedState,
  guidedLayout,
} from "./guidedWorkspace";
import { DOMAINS } from "./mapTypes";
import {
  GROUP_RULES,
  INTERACTION_GRAPH,
  PAIR_OVERRIDES,
  resolveRelationship,
} from "./interactionGraph";
import { informationDepth, SPATIAL_PRESENTATIONS } from "./spatialPresentation";

function context() {
  let state = changeGuidedState(initialGuidedState(), {
    type: "job",
    id: "J-4217",
  });
  for (const domain of DOMAINS)
    if (!state.active.includes(domain))
      state = changeGuidedState(state, { type: "toggle", domain });
  return changeGuidedState(state, { type: "fuel", id: "F-07" });
}

describe("5.7H product workspace contracts", () => {
  it("keeps the former 30 pairs as evidence with only four sparse specializations", () => {
    expect(INTERACTION_GRAPH).toHaveLength(30);
    expect(Object.keys(PAIR_OVERRIDES)).toHaveLength(4);
    expect(
      INTERACTION_GRAPH.filter((e) => e.classification !== "overridden"),
    ).toHaveLength(26);
    expect(Object.values(GROUP_RULES).flatMap(Object.keys)).toHaveLength(16);
    expect(resolveRelationship("Pricing DEV", "Documents").classification).toBe(
      "generic",
    );
    expect(resolveRelationship("Drivers", "Trucks").classification).toBe(
      "inherited",
    );
    expect(resolveRelationship("Drivers", "Documents").classification).toBe(
      "overridden",
    );
  });
  it("gives local, corridor, overview and hidden questions distinct spatial characters", () => {
    expect(SPATIAL_PRESENTATIONS.CURRENT_ENTITY.character).toBe("local");
    expect(SPATIAL_PRESENTATIONS.NEXT_LEG.character).toBe("corridor");
    expect(SPATIAL_PRESENTATIONS.FULL_ROUTE.aspect).toBeGreaterThan(
      SPATIAL_PRESENTATIONS.CURRENT_ENTITY.aspect,
    );
    expect(SPATIAL_PRESENTATIONS.NONE.prominence).toBe(0);
  });
  it("changes physical map geometry for the same lead at all review sizes", () => {
    const state = changeGuidedState(context(), {
      type: "expand",
      domain: "Drivers",
    });
    for (const [width, height] of [
      [1199, 900],
      [1440, 900],
      [1920, 1080],
    ]) {
      const shapes = (
        ["CURRENT_ENTITY", "NEXT_LEG", "FULL_ROUTE", "NONE"] as const
      ).map((question) =>
        guidedLayout(
          {
            ...state,
            spatial: {
              question,
              target: question === "FULL_ROUTE" ? "job" : "resource",
              source: "user",
            },
          },
          width,
          height,
        ),
      );
      expect(new Set(shapes.map((s) => JSON.stringify(s.map))).size).toBe(4);
      expect(shapes[0].map.width / shapes[0].map.height).toBeLessThan(
        shapes[2].map.width / shapes[2].map.height,
      );
      expect(shapes[3].map.visible).toBe(false);
      for (const layout of shapes)
        if (layout.map.visible) {
          expect(layout.map.x + layout.map.width).toBeLessThanOrEqual(width);
          expect(layout.map.y + layout.map.height).toBeLessThanOrEqual(height);
        }
    }
  });
  it("gains useful lead depth only when both usable width and height are available", () => {
    expect(informationDepth(1000, 600, true)).toBe("DEEP_LEAD");
    expect(informationDepth(1000, 300, true)).toBe("LEAD");
    expect(informationDepth(600, 800, true)).toBe("LEAD");
    expect(informationDepth(350, 300, false)).toBe("SUPPORT");
  });
  it("preserves relevant selections but invalidates removed lenses, anchors and incompatible trucks", () => {
    const state = context();
    expect(
      changeGuidedState(state, { type: "expand", domain: "Drivers" }).selection
        .fuel,
    ).toBe("F-07");
    for (const action of [
      { type: "toggle", domain: "Fuel" },
      { type: "job", id: "J-4218" },
      { type: "assign-truck", id: "T-18" },
    ] as const) {
      const next = changeGuidedState(state, action);
      expect(next.selection.fuel).toBeNull();
      expect(
        next.selectionLog.some(
          (log) => log.id === "F-07" && log.outcome === "cleared",
        ),
      ).toBe(true);
    }
    const document = changeGuidedState(state, {
      type: "document",
      id: "FT-4217",
    });
    expect(
      changeGuidedState(document, { type: "toggle", domain: "Documents" })
        .selection.document,
    ).toBeNull();
  });
  it("rejects unrelated resource and restriction selections while keeping valid resource contracts", () => {
    const state = context();
    expect(
      changeGuidedState(state, { type: "resource", id: "D-99" }).selection
        .resource,
    ).toBeNull();
    expect(
      changeGuidedState(state, { type: "restriction", id: "RI-999" }).selection
        .restriction,
    ).toBeNull();
    const valid = changeGuidedState(state, { type: "resource", id: "D-12" });
    // Fixture identity, rather than an arbitrary non-empty selection, owns relevance.
    const resource = changeGuidedState(state, {
      type: "inspect",
      takeover: { kind: "resource", domain: "Trucks" },
    });
    expect(resource.selection.resource).toBe("T-08");
    expect(
      changeGuidedState(resource, { type: "expand", domain: "Documents" })
        .selection.resource,
    ).toBe("T-08");
    expect(
      changeGuidedState(resource, { type: "toggle", domain: "Trucks" })
        .selection.resource,
    ).toBeNull();
    expect(valid.selectionLog.length).toBeGreaterThan(0);
  });
});
