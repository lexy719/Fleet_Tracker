import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  initialGuidedState,
  guidedLayout,
  guidedCamera,
} from "./guidedWorkspace";
import { INTERACTION_GRAPH } from "./interactionGraph";
import { spatialGeometry } from "./spatialQuestions";
import { DOMAINS } from "./mapTypes";
const selected = () => {
  let state = changeGuidedState(initialGuidedState(), {
    type: "job",
    id: "J-4217",
  });
  for (const domain of DOMAINS)
    if (!state.active.includes(domain))
      state = changeGuidedState(state, { type: "toggle", domain });
  state = changeGuidedState(state, { type: "fuel", id: "F-07" });
  state = changeGuidedState(state, { type: "document", id: "FT-4217" });
  state = changeGuidedState(state, { type: "restriction", id: "RI-058" });
  return state;
};
describe("5.7G semantic interaction graph", () => {
  it("declares all pairwise contracts, preserving selections through explicit lead transitions", () => {
    expect(INTERACTION_GRAPH).toHaveLength(30);
    for (const edge of INTERACTION_GRAPH) {
      const from = changeGuidedState(selected(), {
        type: "expand",
        domain: edge.from,
      });
      const to = changeGuidedState(from, { type: "expand", domain: edge.to });
      expect(to.lead).toBe(edge.to);
      expect(to.anchor).toEqual(from.anchor);
      expect(to.active).toEqual(from.active);
      expect(to.selection).toEqual(from.selection);
      expect(edge.relevant.length).toBeGreaterThan(10);
      expect(edge.supportMap).toBe("preserve");
    }
  });
  it("activation adds support and keeps both the lead and a user spatial question", () => {
    let state = changeGuidedState(initialGuidedState(), {
      type: "job",
      id: "J-4217",
    });
    state = changeGuidedState(state, { type: "expand", domain: "Drivers" });
    state = changeGuidedState(state, {
      type: "spatial",
      intent: {
        question: "CURRENT_ENTITY",
        target: "resource",
        source: "user",
      },
    });
    const next = changeGuidedState(state, {
      type: "toggle",
      domain: "Documents",
    });
    expect(next.lead).toBe("Drivers");
    expect(next.spatial).toEqual(state.spatial);
    expect(next.active).toContain("Documents");
    const docs = changeGuidedState(next, {
      type: "expand",
      domain: "Documents",
    });
    expect(docs.lead).toBe("Documents");
    expect(docs.spatial).toEqual(state.spatial);
    const automatic = changeGuidedState(docs, { type: "map", intent: "auto" });
    expect(automatic.spatial.question).toBe("NONE");
    const open = changeGuidedState(automatic, { type: "map", intent: "open" });
    expect(open.lead).toBe("Documents");
    expect(open.spatial.question).toBe("USER_REQUESTED");
  });
  it("frames Driver differently for location, next leg, whole Job and restriction without pitch presets", () => {
    const state = changeGuidedState(selected(), {
      type: "expand",
      domain: "Drivers",
    });
    const sets = [
      { question: "CURRENT_ENTITY", target: "resource" },
      { question: "NEXT_LEG", target: "stop" },
      { question: "FULL_ROUTE", target: "job" },
      { question: "AFFECTED_SEGMENT", target: "restriction" },
    ] as const;
    const points = sets.map(
      (x) =>
        spatialGeometry({ ...state, spatial: { ...x, source: "user" } }).points,
    );
    expect(new Set(points.map((x) => JSON.stringify(x))).size).toBe(4);
    const camera = guidedCamera(state, guidedLayout(state, 1440, 900));
    expect(camera.kind).toBe("scene");
    if (camera.kind === "scene") {
      expect(camera.pitch).toBe(0);
      expect(camera.bearing).toBe(0);
    }
  });
  it("clears only lens-owned selections on removal and clears all related selections when anchor changes", () => {
    const state = selected();
    const removed = changeGuidedState(state, {
      type: "toggle",
      domain: "Fuel",
    });
    expect(removed.selection.fuel).toBeNull();
    expect(removed.selection.document).toBe("FT-4217");
    expect(removed.selection.restriction).toBe("RI-058");
    expect(
      changeGuidedState(state, { type: "job", id: "J-4218" }).selection,
    ).toEqual({
      fuel: null,
      document: null,
      restriction: null,
      resource: null,
    });
    const resource = changeGuidedState(state, {
      type: "inspect",
      takeover: { kind: "resource", domain: "Trucks" },
    });
    expect(resource.selection.resource).toBe("T-08");
    expect(
      changeGuidedState(resource, { type: "toggle", domain: "Trucks" })
        .selection.resource,
    ).toBeNull();
  });
  it("takeover retains the current next-leg question and nested spatial frames are reversible", () => {
    const driver = changeGuidedState(selected(), {
      type: "expand",
      domain: "Drivers",
    });
    expect(driver.spatial.question).toBe("NEXT_LEG");
    const before = structuredClone(driver);
    const expanded = changeGuidedState(driver, {
      type: "map",
      intent: "expand",
    });
    expect(expanded.spatial).toEqual(driver.spatial);
    expect(expanded.selection).toEqual(driver.selection);
    expect(spatialGeometry(expanded).points).toEqual(
      spatialGeometry(driver).points,
    );
    const segment = changeGuidedState(expanded, {
      type: "inspect",
      takeover: { kind: "segment", id: "RI-058" },
    });
    expect(segment.selection.restriction).toBe("RI-058");
    expect(segment.spatial.question).toBe("AFFECTED_SEGMENT");
    expect(driver).toEqual(before); // Browser verifies real frame/camera/scroll restoration.
  });
});
