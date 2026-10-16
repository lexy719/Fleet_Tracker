import { describe, expect, it } from "vitest";
import { composeWorkspace, GUIDED_LENSES } from "./compositionGrammar";
import { changeGuidedState, initialGuidedState } from "./guidedWorkspace";

const selected = () =>
  changeGuidedState(initialGuidedState(), { type: "job", id: "J-4217" });
describe("guided composition grammar", () => {
  it("scales participation by groups rather than owning a region per lens", () => {
    let state = changeGuidedState(selected(), {
      type: "expand",
      domain: "Fuel",
    });
    const minimal = composeWorkspace(state, 1440, 900);
    for (const domain of ["Drivers", "Trucks"] as const)
      state = changeGuidedState(state, { type: "toggle", domain });
    const resources = composeWorkspace(state, 1440, 900);
    for (const domain of [
      "Documents",
      "Restrictions",
      "Pricing DEV",
      "Compliance DEV",
    ] as const)
      state = changeGuidedState(state, { type: "toggle", domain });
    const dense = composeWorkspace(state, 1440, 900);
    expect(
      [minimal, resources, dense].map((l) => l.composition.family),
    ).toEqual([
      "SPLIT_DECISION",
      "PRIMARY_SUPPORT_STACK",
      "HORIZONTAL_JOURNEY",
    ]);
    expect(dense.composition.groups.resources).toEqual(["Drivers", "Trucks"]);
    expect(dense.composition.groups.journey).toEqual(["Fuel", "Restrictions"]);
    expect(dense.composition.groups.assurance).toEqual([
      "Documents",
      "Compliance DEV",
    ]);
    expect(dense.composition.participation["Pricing DEV"]?.role).toBe("INLINE");
    expect(Object.keys(dense.zones).length).toBeLessThanOrEqual(3);
    expect(
      composeWorkspace(
        { ...state, active: [...state.active].reverse() },
        1440,
        900,
      ),
    ).toEqual(dense);
  });
  it("keeps every normal participation combination bounded and non-overlapping at review sizes", () => {
    // A single geometry invariant, not hundreds of temporary component tests.
    for (const width of [1199, 1440, 1920])
      for (let mask = 1; mask < 256; mask++) {
        const active = GUIDED_LENSES.filter((_, i) => mask & (1 << i));
        const state = { ...selected(), active, lead: active[0] };
        const layout = composeWorkspace(state, width, 900);
        const regions = [
          ...Object.values(layout.zones),
          ...(layout.map.visible ? [layout.map] : []),
        ];
        for (const a of regions) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.width).toBeLessThanOrEqual(width + 0.001);
          expect(a.y + a.height).toBeLessThanOrEqual(900.001);
          expect(a.width).toBeGreaterThanOrEqual(290);
          expect(a.height).toBeGreaterThanOrEqual(200);
          for (const b of regions)
            if (a !== b)
              expect(
                a.x + a.width <= b.x + 0.001 ||
                  b.x + b.width <= a.x + 0.001 ||
                  a.y + a.height <= b.y + 0.001 ||
                  b.y + b.height <= a.y + 0.001,
              ).toBe(true);
        }
      }
  });
  it("treats spatial and detail takeover as reversible frames without overwriting intent", () => {
    let state = changeGuidedState(selected(), { type: "stress" });
    state = changeGuidedState(state, { type: "expand", domain: "Fuel" });
    state = changeGuidedState(state, { type: "fuel", id: "F-07" });
    const before = structuredClone(state);
    expect(changeGuidedState(state, { type: "map", intent: "fit" })).toEqual(
      before,
    );
    const takeover = changeGuidedState(state, {
      type: "map",
      intent: "expand",
    });
    expect(takeover.anchor).toEqual(before.anchor);
    expect(takeover.lead).toBe("Fuel");
    expect(takeover.active).toEqual(before.active);
    expect(takeover.selection).toEqual(before.selection);
    const layout = composeWorkspace(takeover, 1440, 900);
    // 5.7K: the expanded map is a workspace state, not a takeover. The lead
    // becomes a spatial inspector (Fuel: bottom strip) and supports become cards.
    expect(layout.map.width).toBeGreaterThan(1200);
    expect(takeover.mapFull).toBe(true);
    expect(takeover.takeover).toBeNull();
    expect(layout.zones.fuel!.width).toBeGreaterThan(1100);
    expect(layout.zones.fuel!.y).toBeGreaterThan(layout.map.y + layout.map.height / 2);
    expect(layout.composition.arrangement).toBe("spatial-Fuel-bottom");
    const detail = changeGuidedState(takeover, {
      type: "inspect",
      takeover: { kind: "document", id: "CMR-4217" },
    });
    expect(detail.lead).toBe("Fuel");
    expect(composeWorkspace(detail, 1440, 900).map.visible).toBe(false);
    // Actual history/camera/scroll restoration is checked in the browser.
    expect(state).toEqual(before);
  });
  it("promotes a critical active resource without changing the lead or station", () => {
    let state = changeGuidedState(selected(), { type: "stress" });
    state = changeGuidedState(state, { type: "expand", domain: "Fuel" });
    state = changeGuidedState(state, { type: "fuel", id: "F-07" });
    const before = composeWorkspace(state, 1199, 900);
    state = changeGuidedState(state, { type: "exception" });
    const promoted = composeWorkspace(state, 1199, 900);
    expect(state.lead).toBe("Fuel");
    expect(state.selection.fuel).toBe("F-07");
    expect(before.zones.resources).toBeUndefined();
    expect(promoted.zones.resources).toBeDefined();
    expect(promoted.composition.participation.Drivers?.promoted).toBe(true);
    expect(
      composeWorkspace(
        changeGuidedState(state, { type: "exception" }),
        1199,
        900,
      ),
    ).toEqual(before);
  });
});
