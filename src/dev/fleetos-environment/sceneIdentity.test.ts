import { describe, expect, it } from "vitest";
import { changeGuidedState, initialGuidedState } from "./guidedWorkspace";
import { sceneIdentity } from "./sceneIdentity";

const driver = () =>
  changeGuidedState(initialGuidedState(), {
    type: "entity",
    kind: "driver",
    id: "D-14",
    job: "J-4217",
  });

describe("living scene identity and confirmed fact continuity", () => {
  it("keeps the person and machine identities when representations and anchors change", () => {
    const day = driver();
    const truck = changeGuidedState(day, { type: "main", domain: "Trucks" });
    expect(sceneIdentity("driver-day", day)).toBe(
      sceneIdentity("driver-strip", truck),
    );
    expect(sceneIdentity("driver-passages", day)).toBe(
      sceneIdentity("driver-day", day),
    );
    expect(sceneIdentity("vehicle-object", day)).toBe(
      sceneIdentity("vehicle-card", truck),
    );
  });
  it("does not reuse a person's instrument for a different person", () => {
    const other = changeGuidedState(driver(), {
      type: "entity",
      kind: "driver",
      id: "D-09",
      job: "J-4219",
    });
    expect(sceneIdentity("driver-day", other)).not.toBe(
      sceneIdentity("driver-day", driver()),
    );
  });
  it("carries confirmed facts back to the collection and through closing its last lens", () => {
    const proposed = changeGuidedState(driver(), {
      type: "propose",
      proposal: { kind: "axle", id: "T-08", from: "", to: "1.06" },
    });
    const committed = changeGuidedState(proposed, { type: "commit" });
    const collection = changeGuidedState(committed, {
      type: "content",
      domain: "Drivers",
    });
    expect(collection.anchor.kind).toBe("jobs");
    expect(collection.overrides).toEqual({ "axle:T-08": "1.06" });
    const trucks = changeGuidedState(collection, {
      type: "content",
      domain: "Trucks",
    });
    const closed = changeGuidedState(trucks, {
      type: "content",
      domain: "Trucks",
    });
    expect(closed.overrides).toEqual(committed.overrides);
    expect(closed.planned).toEqual(committed.planned);
  });
});
