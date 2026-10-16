import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  guidedMapScene,
  initialGuidedState,
  type GuidedState,
} from "./guidedWorkspace";
import { demoContext, jobById } from "./guidedContent";

function selectedJob(): GuidedState {
  let state = changeGuidedState(initialGuidedState(), {
    type: "job",
    id: "J-4217",
  });
  for (const domain of [
    "Fuel",
    "Drivers",
    "Trucks",
    "Documents",
    "Restrictions",
  ] as const)
    state = changeGuidedState(state, { type: "toggle", domain });
  return state;
}
describe("guided workspace contract", () => {
  it("preserves the transport and its internal selections when the lead lens changes", () => {
    let state = changeGuidedState(selectedJob(), { type: "fuel", id: "F-07" });
    state = changeGuidedState(state, { type: "document", id: "FT-4217" });
    for (const domain of ["Fuel", "Drivers", "Trucks", "Documents"] as const) {
      state = changeGuidedState(state, { type: "expand", domain });
      expect(state.anchor).toEqual({ kind: "job", id: "J-4217" });
      expect(state.selection).toMatchObject({
        fuel: "F-07",
        document: "FT-4217",
      });
      expect(state.lead).toBe(domain);
      expect(state.active).toEqual(selectedJob().active);
    }
    const withoutJobs = changeGuidedState(state, {
      type: "toggle",
      domain: "Jobs",
    });
    expect(withoutJobs.anchor).toEqual(state.anchor);
    expect(withoutJobs.lead).toBe("Documents");
  });
  it("uses non-overlapping useful regions, combines resources and hides the map for Documents", () => {
    for (const [width, height] of [
      [1199, 900],
      [1440, 900],
      [1920, 1080],
    ]) {
      for (const domain of [
        "Jobs",
        "Fuel",
        "Drivers",
        "Trucks",
        "Documents",
        "Restrictions",
      ] as const) {
        const state = changeGuidedState(selectedJob(), {
          type: "expand",
          domain,
        });
        const layout = guidedLayout(state, width, height);
        const regions = [
          ...Object.values(layout.zones),
          ...(layout.map.visible ? [layout.map] : []),
        ];
        expect(layout.map.visible).toBe(domain !== "Documents");
        expect(layout.composition.groups.resources).toEqual([
          "Drivers",
          "Trucks",
        ]);
        expect(
          Object.keys(layout.zones).filter((z) => z === "resources").length,
        ).toBeLessThanOrEqual(1);
        for (const a of regions) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.width).toBeLessThanOrEqual(width);
          expect(a.y + a.height).toBeLessThanOrEqual(height);
          expect(a.width).toBeGreaterThanOrEqual(290);
          expect(a.height).toBeGreaterThanOrEqual(200);
          for (const b of regions)
            if (a !== b)
              expect(
                a.x + a.width <= b.x ||
                  b.x + b.width <= a.x ||
                  a.y + a.height <= b.y ||
                  b.y + b.height <= a.y,
              ).toBe(true);
        }
      }
    }
  });
  it("keeps synthetic routes, vehicle identity and document identifiers tied to the selected job", () => {
    const state = changeGuidedState(selectedJob(), {
      type: "job",
      id: "J-4218",
    });
    const job = jobById("J-4218"),
      context = demoContext(job);
    const scene = guidedMapScene(state);
    expect(scene.routes).toEqual([job.route]);
    // J-4218 has no known position: the map must not draw a vehicle there.
    expect(scene.driver).toBeNull();
    expect(scene.fuel).toBeNull();
    expect(context.documents[0].id).toBe("CMR-4218");
    expect(context.plate).not.toBe(demoContext(jobById("J-4217")).plate);
    expect(state.selection).toEqual({
      fuel: null,
      document: null,
      restriction: null,
      resource: null,
    });
  });
});
