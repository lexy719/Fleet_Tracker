import { describe, it, expect } from "vitest";
import {
  initialGuidedState,
  guidedLayout,
  changeGuidedState,
} from "./guidedWorkspace";
import { createSyntheticProvider } from "./engine/synthetic";
import { readRouteManagement } from "./engine/routeManagement";
import { mergeWorkspace } from "./workspaceTabs";

describe("route management respects operational evidence", () => {
  it("planned time passing does not complete an outstanding delivery", () => {
    const provider = createSyntheticProvider(initialGuidedState());
    const overdue = { ...provider, nowMs: provider.nowMs + 24 * 3600_000 };
    const m = readRouteManagement(overdue, "J-4217");
    expect(m.next?.stopId).toBe("S2");
    expect(m.outstanding.map((s) => s.stopId)).toEqual(["S2", "S3"]);
  });
  it("official segment geometry is neither a fabricated complete distance nor clearance", () => {
    const m = readRouteManagement(
      createSyntheticProvider(initialGuidedState()),
      "J-4217",
    );
    const segment = m.alternatives.alternatives.find(
      (a) => a.scope === "official_segment",
    )!;
    expect(segment.distanceM.status).toBe("UNKNOWN");
    expect(segment.durationSec.status).toBe("UNKNOWN");
    expect(segment.feasibility).toBe("UNKNOWN");
    expect(m.status).toBe("REVIEW_REQUIRED");
    expect(
      m.alternatives.alternatives.find((a) => a.intent === "no_tolls")
        ?.distanceM,
    ).toMatchObject({ status: "KNOWN", source: "provider" });
  });
  it.each(["J-4219", "J-4220", "J-4222"])(
    "%s surfaces resource blockers without a release time",
    (job) => {
      const m = readRouteManagement(
        createSyntheticProvider(initialGuidedState()),
        job,
      );
      expect(m.status).toBe("BLOCKED");
      expect(
        m.resources.some(
          (r) => r.future?.blocked && r.future.availableAt.status === "UNKNOWN",
        ),
      ).toBe(true);
    },
  );
  it("stale driver timing removes estimates instead of leaving a usable itinerary", () => {
    const state = initialGuidedState();
    state.dev.staleBaseline = true;
    const m = readRouteManagement(createSyntheticProvider(state), "J-4217");
    expect(m.execution).toMatchObject({ status: "STALE", timeline: null });
    expect(m.stops).toEqual([]);
    expect(m.status).toBe("REVIEW_REQUIRED");
    expect(
      m.resources.every((r) => r.future?.availableAt.status === "UNKNOWN"),
    ).toBe(true);
  });
  it("future availability and endpoint remain assumptions", () => {
    const m = readRouteManagement(
      createSyntheticProvider(initialGuidedState()),
      "J-4217",
    );
    expect(m.resources[0].future?.availableAt.status).toBe("ASSUMED");
    expect(m.resources[0].future?.position.status).toBe("ASSUMED");
  });
  it("adding route content reshapes the whole merged page and preserves its source", () => {
    let source = changeGuidedState(initialGuidedState(), {
      type: "entity",
      kind: "truck",
      id: "T-08",
      job: "J-4217",
    });
    source = mergeWorkspace(source, "Drivers");
    source = mergeWorkspace(source, "Restrictions");
    const before = structuredClone(source);
    const route = mergeWorkspace(source, "Fuel");
    const layout = guidedLayout(route, 1440, 900);
    expect(source).toEqual(before);
    expect(route.active).toEqual(["Trucks", "Drivers", "Restrictions", "Fuel"]);
    expect(layout.path).toBe("shared-journey");
    expect(layout.regions?.find((r) => r.role === "lead")).toMatchObject({
      rep: "shared-work",
    });
    expect(layout.composition.shared?.domains).toEqual([
      "Drivers",
      "Trucks",
      "Fuel",
      "Restrictions",
    ]);
    expect(layout.composition.primary).toBeNull();
    expect(layout.map.width).toBeGreaterThan(layout.regions![0].rect.width);
    expect(
      guidedLayout(mergeWorkspace(route, "Fuel"), 1440, 900).composition.shared
        ?.domains,
    ).toEqual(["Drivers", "Trucks", "Restrictions"]);
  });
});
