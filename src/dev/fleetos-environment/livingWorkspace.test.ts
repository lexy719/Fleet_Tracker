import { describe, expect, it } from "vitest";
import {
  changeGuidedState,
  guidedLayout,
  initialGuidedState,
  type GuidedAction,
  type GuidedState,
} from "./guidedWorkspace";
import { RELATIONS } from "./relations";
import { labWorld } from "./fx/model";
import { impactOf } from "./fx/impact";

const run = (...actions: GuidedAction[]) =>
  actions.reduce<GuidedState>(
    (s, a) => changeGuidedState(s, a),
    initialGuidedState(),
  );
const onJob = (id = "J-4217") => run({ type: "job", id });
const vci = (s: GuidedState, preview = true) =>
  labWorld(s, preview).restrictions.find((r) => r.id === "RI-042")!;

describe("5.7K · relationships carry objects, not pages", () => {
  it("every relation names a lead lens and a back rule", () => {
    const kinds = RELATIONS.map((r) => r.object);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const r of RELATIONS) {
      expect([
        "Jobs",
        "Drivers",
        "Trucks",
        "Fuel",
        "Restrictions",
        "Documents",
      ]).toContain(r.lead);
      expect(r.back.length).toBeGreaterThan(0);
    }
  });
  it("Flow D: a break followed from the route lands on the driver's exact time and keeps the stop", () => {
    let s = run(
      { type: "job", id: "J-4217" },
      { type: "open", domain: "Fuel" },
      { type: "fuel", id: "F-07" },
    );
    s = changeGuidedState(s, {
      type: "follow",
      object: { kind: "break", stop: "F-07", at: 632, label: "Pausa" },
    });
    expect(s.lead).toBe("Drivers");
    expect(s.focus).toEqual({
      kind: "time",
      at: 632,
      label: "Pausa",
      stop: "F-07",
    });
    expect(s.selection.fuel).toBe("F-07");
    expect(s.active).toContain("Fuel");
    expect(s.spatial.question).toBe("NEXT_LEG");
  });
  it("Flow A: an expired qualification opens Documents focused on it, Driver stays active", () => {
    let s = run(
      { type: "toggle", domain: "Drivers" },
      { type: "enter", jobId: "J-4219", lead: "Drivers" },
    );
    s = changeGuidedState(s, {
      type: "follow",
      object: { kind: "qualification", driver: "D-09", qual: "cpc" },
    });
    expect(s.lead).toBe("Documents");
    expect(s.facet.Documents).toBe("qualification");
    expect(s.active).toContain("Drivers");
    expect(s.focus).toEqual({
      kind: "qualification",
      driver: "D-09",
      qual: "cpc",
    });
  });
  it("following another transport clears the previous transport's selections", () => {
    let s = run(
      { type: "job", id: "J-4217" },
      { type: "open", domain: "Fuel" },
      { type: "fuel", id: "F-07" },
    );
    s = changeGuidedState(s, {
      type: "follow",
      object: { kind: "job", id: "J-4218" },
    });
    expect(s.anchor).toEqual({ kind: "job", id: "J-4218" });
    expect(s.selection.fuel).toBeNull();
  });
});

describe("5.7K · editing is a reversible proposal previewed before commit", () => {
  it("Flow B: a measured first axle previews the VCI verdict without committing", () => {
    let s = changeGuidedState(onJob(), {
      type: "follow",
      object: { kind: "restriction", id: "RI-042" },
    });
    s = changeGuidedState(s, { type: "edit", kind: "axle", target: "T-08" });
    expect(s.lead).toBe("Trucks");
    expect(s.facet.Trucks).toBe("restriction");
    s = changeGuidedState(s, {
      type: "propose",
      proposal: { kind: "axle", id: "T-08", from: "", to: "1.06" },
    });
    expect(vci(s, false).result).toBe("UNKNOWN");
    expect(vci(s).result).toBe("DOES_NOT_APPLY");
    const impact = impactOf(s)!;
    expect(impact.changes.map((c) => c.text)).toContain(
      "VCI Porto: Desconhecido → Não se aplica",
    );
    const confirmed = changeGuidedState(s, { type: "commit" });
    expect(confirmed.pending).toBeNull();
    expect(confirmed.edit).toBeNull();
    expect(confirmed.overrides["axle:T-08"]).toBe("1.06");
    expect(vci(confirmed, false).result).toBe("DOES_NOT_APPLY");
  });
  it("an axle at or above 1,10 m leaves the exemption deciding: still unknown, never «allowed»", () => {
    const s = run(
      { type: "job", id: "J-4217" },
      {
        type: "propose",
        proposal: { kind: "axle", id: "T-08", from: "", to: "1.15" },
      },
    );
    expect(vci(s).result).toBe("UNKNOWN");
    const noAuth = changeGuidedState(changeGuidedState(s, { type: "commit" }), {
      type: "propose",
      proposal: { kind: "authorization", id: "T-08", from: "", to: "0" },
    });
    expect(vci(noAuth).result).toBe("APPLIES");
  });
  it("Flow C: cancelling a trailer change restores the original vehicle and facet", () => {
    const before = changeGuidedState(onJob(), {
      type: "follow",
      object: { kind: "truck", id: "T-08" },
    });
    let s = changeGuidedState(before, {
      type: "edit",
      kind: "trailer",
      target: "J-4217",
    });
    expect(s.facet.Trucks).toBe("assignment");
    s = changeGuidedState(s, {
      type: "propose",
      proposal: {
        kind: "trailer",
        id: "J-4217",
        from: "PT-3821",
        to: "PT-1021",
      },
    });
    expect(labWorld(s).trailer?.id).toBe("PT-1021");
    expect(labWorld(s, false).trailer?.id).toBe("PT-3821");
    s = changeGuidedState(s, { type: "discard" });
    expect(s.pending).toBeNull();
    expect(s.edit).toBeNull();
    expect(s.facet).toEqual(before.facet);
    expect(labWorld(s).trailer?.id).toBe("PT-3821");
  });
  it("a committed trailer change keeps the issued CMR historical (diff, not rewrite)", () => {
    const s = run(
      { type: "job", id: "J-4217" },
      {
        type: "propose",
        proposal: {
          kind: "trailer",
          id: "J-4217",
          from: "PT-3821",
          to: "PT-1021",
        },
      },
      { type: "commit" },
    );
    const w = labWorld(s);
    expect(w.ledger[0].state).toBe("ISSUED");
    expect(w.ledger[0].number).toBe("CMR 2026/000412");
    expect(w.trailer?.id).toBe("PT-1021");
  });
  it("issuing a draft CMR adds a version; the invoice stays blocked", () => {
    const s = run(
      { type: "job", id: "J-4218" },
      {
        type: "propose",
        proposal: { kind: "issue", id: "CMR-4218", from: "DRAFT", to: "1" },
      },
    );
    expect(labWorld(s, false).ledger[0].state).toBe("DRAFT");
    expect(labWorld(s).ledger[0].state).toBe("ISSUED");
    expect(labWorld(s).ledger[1].state).toBe("BLOCKED");
  });
  it("proposing the current value is not a change", () => {
    const s = run(
      { type: "job", id: "J-4217" },
      {
        type: "propose",
        proposal: { kind: "fuel-reading", id: "T-08", from: "31", to: "31" },
      },
    );
    expect(s.pending).toBeNull();
  });
  it("a qualification renewal previews in the driver everywhere", () => {
    const s = run(
      { type: "job", id: "J-4219" },
      {
        type: "propose",
        proposal: {
          kind: "qualification",
          id: "D-09:cpc",
          from: "2 out 2026",
          to: "2 out 2031",
        },
      },
    );
    expect(
      labWorld(s, false).driver.qualifications.find((q) => q.kind === "cpc")!
        .state,
    ).toBe("EXPIRED");
    expect(
      labWorld(s).driver.qualifications.find((q) => q.kind === "cpc")!.state,
    ).toBe("VALID");
    expect(impactOf(s)!.uncertain.length).toBeGreaterThan(0);
  });
});

describe("5.7K · the map is a workspace state", () => {
  it("Flow G: spatial mode survives lens changes and exits to the prior composition", () => {
    let s = changeGuidedState(onJob(), {
      type: "follow",
      object: { kind: "driver", id: "D-14" },
    });
    const before = guidedLayout(s, 1440, 900);
    s = changeGuidedState(s, { type: "map", intent: "expand" });
    expect(s.mapFull).toBe(true);
    s = changeGuidedState(s, { type: "toggle", domain: "Documents" });
    s = changeGuidedState(s, { type: "toggle", domain: "Trucks" });
    expect(s.mapFull).toBe(true);
    expect(s.lead).toBe("Drivers");
    const layout = guidedLayout(s, 1440, 900);
    expect(layout.map.width).toBeGreaterThan(1200);
    expect(layout.zones.resources!.x).toBeGreaterThan(
      layout.map.x + layout.map.width / 2,
    );
    expect(layout.zones.assurance).toBeDefined();
    expect(layout.map.inset!.right).toBeGreaterThan(0);
    s = changeGuidedState(s, { type: "map-exit" });
    expect(s.mapFull).toBe(false);
    expect(guidedLayout(s, 1440, 900).map.width).toBeLessThan(
      before.map.width + 400,
    );
  });
  it("keeps instrument geometry while joint spatial work retains its shared question", () => {
    const at = (a: GuidedAction) =>
      guidedLayout(
        run({ type: "job", id: "J-4217" }, a, {
          type: "map",
          intent: "expand",
        }),
        1440,
        900,
      ).composition.arrangement;
    expect(at({ type: "follow", object: { kind: "driver", id: "D-14" } })).toBe(
      "spatial-Drivers-right",
    );
    expect(at({ type: "follow", object: { kind: "truck", id: "T-08" } })).toBe(
      "spatial-Trucks-left",
    );
    expect(at({ type: "open", domain: "Fuel" })).toBe("shared-execution");
    expect(
      at({ type: "follow", object: { kind: "restriction", id: "RI-042" } }),
    ).toBe("spatial-Restrictions-right");
  });
  it("Flow F: an alternative followed in spatial mode keeps the map and leads with Route", () => {
    let s = changeGuidedState(onJob(), {
      type: "follow",
      object: { kind: "restriction", id: "RI-042" },
    });
    s = changeGuidedState(s, { type: "map", intent: "expand" });
    s = changeGuidedState(s, {
      type: "follow",
      object: { kind: "alternative", id: "RI-042" },
    });
    expect(s.mapFull).toBe(true);
    expect(s.lead).toBe("Fuel");
    expect(s.spatial.question).toBe("AFFECTED_SEGMENT");
    expect(s.selection.restriction).toBe("RI-042");
  });
  it("facets without geography hide the map; spatial mode falls back to the whole route", () => {
    let s = changeGuidedState(onJob(), {
      type: "follow",
      object: { kind: "driver", id: "D-14" },
    });
    s = changeGuidedState(s, {
      type: "facet",
      domain: "Drivers",
      facet: "legality",
    });
    expect(s.spatial.question).toBe("NONE");
    expect(guidedLayout(s, 1440, 900).map.visible).toBe(false);
    s = changeGuidedState(s, { type: "map", intent: "expand" });
    s = changeGuidedState(s, {
      type: "facet",
      domain: "Drivers",
      facet: "qualifications",
    });
    expect(s.mapFull).toBe(false);
    expect(s.spatial.question).toBe("NONE");
    expect(s.facet.Drivers).toBe("qualifications");
    s = changeGuidedState(s, { type: "map", intent: "expand" });
    expect(s.spatial.question).toBe("FULL_ROUTE");
    expect(s.facet.Drivers).toBe("qualifications");
  });
});
