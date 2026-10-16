import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  initialGuidedState,
  type GuidedState,
} from "./guidedWorkspace";
import { labWorld } from "./fx/model";
import { ledger, snapshotDiff, trailerWorld } from "./world";

function restrictionLead(): GuidedState {
  let s = changeGuidedState(initialGuidedState(), {
    type: "job",
    id: "J-4217",
  });
  for (const domain of ["Trucks", "Restrictions"] as const)
    s = changeGuidedState(s, { type: "toggle", domain });
  return changeGuidedState(s, { type: "expand", domain: "Restrictions" });
}

describe("5.7J temporary instrument focus", () => {
  it("a restriction predicate focuses the vehicle part without dropping the restriction context", () => {
    const s = changeGuidedState(restrictionLead(), {
      type: "focus",
      focus: { kind: "vehicle", aspect: "restriction", part: "firstAxle" },
    });
    expect(s.lead).toBe("Trucks");
    expect(s.focus).toEqual({
      kind: "vehicle",
      aspect: "restriction",
      part: "firstAxle",
    });
    expect(s.active).toContain("Restrictions");
    expect(s.anchor).toEqual({ kind: "job", id: "J-4217" });
  });
  it("focus is temporary: a change of perspective clears it, selections do not", () => {
    const focused = changeGuidedState(restrictionLead(), {
      type: "focus",
      focus: { kind: "vehicle", aspect: "load" },
    });
    expect(
      changeGuidedState(focused, { type: "restriction", id: "RI-042" }).focus,
    ).not.toBeNull();
    expect(
      changeGuidedState(focused, { type: "expand", domain: "Restrictions" })
        .focus,
    ).toBeNull();
    expect(
      changeGuidedState(focused, { type: "toggle", domain: "Documents" }).focus,
    ).toBeNull();
  });
});

describe("single-lens contexts", () => {
  it("a lone lens on a selected transport becomes the lead", () => {
    let s = changeGuidedState(initialGuidedState(), {
      type: "job",
      id: "J-4217",
    });
    s = changeGuidedState(s, { type: "toggle", domain: "Drivers" });
    expect(s.lead).toBeNull();
    s = changeGuidedState(s, { type: "toggle", domain: "Jobs" });
    expect(s.active).toEqual(["Drivers"]);
    expect(s.lead).toBe("Drivers");
  });
  it("entering from an operation-wide view anchors the transport with the domain as lead", () => {
    let s = changeGuidedState(initialGuidedState(), {
      type: "toggle",
      domain: "Drivers",
    });
    expect(s.anchor).toEqual({ kind: "jobs" });
    s = changeGuidedState(s, {
      type: "enter",
      jobId: "J-4219",
      lead: "Drivers",
    });
    expect(s.anchor).toEqual({ kind: "job", id: "J-4219" });
    expect(s.lead).toBe("Drivers");
    expect(s.active).toContain("Jobs");
  });
});

describe("operation-level lens connections", () => {
  it("every lens clicked at operation level becomes the perspective; the others stay as context", () => {
    let s = changeGuidedState(initialGuidedState(), {
      type: "toggle",
      domain: "Drivers",
    });
    expect(s.lead).toBe("Drivers");
    s = changeGuidedState(s, { type: "toggle", domain: "Jobs" });
    expect(s.lead).toBeNull(); // Jobs collection leads by priority
    expect(s.active).toEqual(["Drivers", "Jobs"]);
    s = changeGuidedState(s, { type: "toggle", domain: "Trucks" });
    expect(s.lead).toBe("Trucks");
    s = changeGuidedState(s, { type: "toggle", domain: "Trucks" });
    expect(s.active).toEqual(["Drivers", "Jobs"]);
    expect(s.lead).toBeNull();
  });
  it("operation views never open empty support regions", () => {
    let s = changeGuidedState(initialGuidedState(), {
      type: "toggle",
      domain: "Drivers",
    });
    s = changeGuidedState(s, { type: "toggle", domain: "Documents" });
    s = changeGuidedState(s, { type: "toggle", domain: "Trucks" });
    const l = guidedLayout(s, 1440, 900);
    expect(Object.keys(l.zones)).toEqual([]);
    expect(l.regions?.map((region) => region.rep)).toEqual(["shared-work"]);
    expect(l.composition.shared?.kind).toBe("handover");
    expect(l.composition.primary).toBeNull();
    expect(l.map.visible).toBe(true);
  });
});

describe("album fixes (navigation album 2026-10-07)", () => {
  const onJob = () =>
    changeGuidedState(initialGuidedState(), { type: "job", id: "J-4217" });
  it("links open the named entity, not the previous selection", () => {
    let s = changeGuidedState(onJob(), {
      type: "toggle",
      domain: "Restrictions",
    });
    s = changeGuidedState(s, { type: "restriction", id: "RI-063" });
    s = changeGuidedState(s, {
      type: "open",
      domain: "Restrictions",
      restriction: "RI-042",
    });
    expect(s.lead).toBe("Restrictions");
    expect(s.selection.restriction).toBe("RI-042");
    const fuel = changeGuidedState(onJob(), {
      type: "open",
      domain: "Trucks",
      focus: { kind: "vehicle", aspect: "fuel" },
    });
    expect(fuel.focus).toMatchObject({ aspect: "fuel" });
  });
  it("collection rows enter with their own restriction", () => {
    let s = changeGuidedState(initialGuidedState(), {
      type: "toggle",
      domain: "Restrictions",
    });
    s = changeGuidedState(s, {
      type: "enter",
      jobId: "J-4217",
      lead: "Restrictions",
      restriction: "RI-058",
    });
    expect(s.selection.restriction).toBe("RI-058");
  });
  it("confirming another break stop re-times the transport and requires replanning", () => {
    let s = changeGuidedState(onJob(), { type: "toggle", domain: "Fuel" });
    expect(labWorld(s).job.plan).toBe("PLANNED");
    s = changeGuidedState(s, { type: "stage-stop", id: "F-03", from: "F-07" });
    s = changeGuidedState(s, { type: "commit" });
    const w = labWorld(s);
    expect(w.job.plan).toBe("REPLAN_REQUIRED");
    expect(w.job.stops.find((st) => st.id === "S2")?.eta).toBe("12:46");
    expect(
      w.driver.duty.some(
        (d) => d.planned && d.kind === "break" && d.from === 10 * 60 + 26,
      ),
    ).toBe(true);
  });
  it("each transport has its own dossier and no substitute trailer", () => {
    expect(ledger("J-4221")[0].state).toBe("MISSING");
    expect(ledger("J-4218")[0].state).toBe("DRAFT");
    expect(snapshotDiff("J-4219").every((d) => !d.changed)).toBe(true);
    expect(trailerWorld("PT-3302")).toBeNull();
    const w = labWorld(
      changeGuidedState(initialGuidedState(), { type: "job", id: "J-4222" }),
    );
    expect(w.trailerMissing).toBe(true);
    expect(w.positionKnown).toBe(false);
  });
});
