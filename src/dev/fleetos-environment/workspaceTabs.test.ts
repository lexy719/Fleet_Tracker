import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  initialGuidedState,
} from "./guidedWorkspace";
import { INITIAL_CAMERA } from "./mapTypes";
import {
  navigateWorkspace,
  mergeWorkspace,
  separateWorkspace,
  withCurrentWorld,
  workspaceKey,
} from "./workspaceTabs";

const driver = () =>
  changeGuidedState(initialGuidedState(), {
    type: "entity",
    kind: "driver",
    id: "D-14",
    job: "J-4217",
  });

describe("workspace tabs: navigation is a new question, context is explicit", () => {
  it("adding content keeps both domains and gives the merged page its own identity", () => {
    const truck = navigateWorkspace(driver(), "Trucks");
    const both = mergeWorkspace(truck, "Drivers");
    expect(both.anchor).toEqual(truck.anchor);
    expect(both.active).toEqual(["Trucks", "Drivers"]);
    expect(workspaceKey(both)).not.toBe(workspaceKey(truck));
    const pair = guidedLayout(both, 1440, 900);
    expect(pair.path).toBe("shared-matching");
    expect(pair.composition.primary).toBeNull();
    expect(pair.regions!.map((r) => r.rep)).toEqual(["shared-work"]);
    expect(pair.regions![0].lenses).toEqual(["Drivers", "Trucks"]);
    expect(pair.map.visible).toBe(true);
    const triple = mergeWorkspace(both, "Restrictions");
    expect(triple.active).toEqual(["Trucks", "Drivers", "Restrictions"]);
    expect(workspaceKey(triple)).not.toBe(workspaceKey(both));
    expect(
      guidedLayout(triple, 1440, 900).regions!.find((r) => r.role === "lead")
        ?.rep,
    ).toBe("shared-work");
    expect(guidedLayout(triple, 1440, 900).composition.shared?.kind).toBe(
      "journey",
    );
    expect(workspaceKey(mergeWorkspace(both, "Drivers"))).toBe(
      workspaceKey(truck),
    );
    expect(workspaceKey({ ...both, active: [...both.active].reverse() })).toBe(
      workspaceKey(both),
    );
    expect(truck.active).toEqual(["Trucks"]);
  });
  it("every added domain participates in the combined entity page", () => {
    const reps = {
      Drivers: ["driver-day", "driver-strip", "driver-passages"],
      Trucks: [
        "vehicle-object",
        "vehicle-card",
        "trailer-sheet",
        "trailer-fit",
      ],
      Fuel: ["route-strip", "stop-sheet", "stop-compare"],
      Documents: ["document-paper"],
      Restrictions: [
        "restriction-logic",
        "restriction-impacts",
        "restriction-full",
      ],
      Jobs: ["restriction-transports", "trailer-fit"],
    } as const;
    for (const kind of [
      "truck",
      "driver",
      "document",
      "restriction",
      "trailer",
      "stop",
    ] as const) {
      const ids = {
        truck: "T-08",
        driver: "D-14",
        document: "CMR-4217",
        restriction: "RI-042",
        trailer: "PT-3821",
        stop: "F-07",
      };
      const source = changeGuidedState(initialGuidedState(), {
        type: "entity",
        kind,
        id: ids[kind],
        job: "J-4217",
      });
      for (const domain of Object.keys(reps) as (keyof typeof reps)[]) {
        if (source.active.includes(domain)) continue;
        const combined = mergeWorkspace(source, domain);
        const regions = guidedLayout(combined, 1440, 900).regions!;
        expect(
          regions.some(
            (r) =>
              (reps[domain] as readonly string[]).includes(r.rep) ||
              r.lenses?.includes(domain),
          ),
          `${kind} + ${domain}`,
        ).toBe(true);
      }
    }
  });
  it("opens the actual truck, then restriction, with one primary domain each", () => {
    const source = changeGuidedState(driver(), {
      type: "content",
      domain: "Trucks",
    });
    const truck = navigateWorkspace(source, "Trucks");
    expect(truck.anchor).toEqual({ kind: "truck", id: "T-08", job: "J-4217" });
    expect(truck.active).toEqual(["Trucks"]);
    const restriction = navigateWorkspace(truck, "Restrictions");
    expect(restriction.anchor).toEqual({
      kind: "restriction",
      id: "RI-042",
      job: "J-4217",
    });
    expect(restriction.active).toEqual(["Restrictions"]);
    expect(source.anchor.kind).toBe("driver");
    expect(source.active).toEqual(["Drivers", "Trucks"]);
    const followed = separateWorkspace(
      changeGuidedState(source, {
        type: "follow",
        object: { kind: "truck", id: "T-08" },
      }),
    );
    expect(followed.active).toEqual(["Trucks"]);
    expect(followed.anchor.kind).toBe("truck");
    const comparison = separateWorkspace(
      changeGuidedState(source, {
        type: "follow",
        object: { kind: "alternative", id: "RI-042" },
      }),
    );
    expect(comparison.mapFull).toBe(true);
    expect(comparison.active).toEqual(["Restrictions"]);
  });
  it("reuses object identity but distinguishes its collection and journey workspace", () => {
    const source = driver();
    expect(
      workspaceKey(
        navigateWorkspace(navigateWorkspace(source, "Trucks"), "Drivers"),
      ),
    ).toBe(workspaceKey(source));
    expect(workspaceKey(navigateWorkspace(source, "Drivers"))).not.toBe(
      workspaceKey(source),
    );
    const journey = navigateWorkspace(source, "Fuel");
    expect(journey.anchor).toEqual({ kind: "job", id: "J-4217" });
    expect(journey.active).toEqual(["Fuel"]);
    expect(journey.spatial.question).not.toBe("CURRENT_ENTITY");
    expect(workspaceKey(navigateWorkspace(journey, "Drivers"))).toBe(
      workspaceKey(source),
    );
    expect(navigateWorkspace(journey, "Fuel").anchor).toEqual({ kind: "jobs" });
  });
  it("resolves related objects from confirmed assignments", () => {
    const proposed = changeGuidedState(driver(), {
      type: "propose",
      proposal: { kind: "truck", id: "J-4217", from: "T-08", to: "T-18" },
    });
    const committed = changeGuidedState(proposed, { type: "commit" });
    expect(navigateWorkspace(committed, "Trucks").anchor).toEqual({
      kind: "truck",
      id: "T-18",
      job: "J-4217",
    });
  });
  it("keeps a staged proposal in its source tab and shares confirmed facts on restore", () => {
    const source = changeGuidedState(driver(), {
      type: "propose",
      proposal: { kind: "axle", id: "T-08", from: "", to: "1.06" },
    });
    expect(navigateWorkspace(source, "Trucks").pending).toBeNull();
    expect(mergeWorkspace(source, "Trucks").pending).toBeNull();
    expect(source.pending).not.toBeNull();
    const frame = {
      state: source,
      layout: guidedLayout(source, 1440, 900),
      camera: INITIAL_CAMERA,
      scroll: { "driver:D-14": 45 },
    };
    const committed = changeGuidedState(source, { type: "commit" });
    const restored = withCurrentWorld(frame, committed);
    expect(restored.state.overrides).toEqual(committed.overrides);
    expect(restored.state.pending).toEqual(source.pending);
    expect(restored.scroll).toEqual(frame.scroll);
    expect(source.overrides).toEqual({});
  });
});
