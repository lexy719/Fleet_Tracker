import { describe, expect, it } from "vitest";
import { composeWorkspace } from "./compositionGrammar";
import {
  changeGuidedState,
  guidedCamera,
  initialGuidedState,
  type GuidedState,
} from "./guidedWorkspace";
import {
  sharedWork,
  sharedWorkQuestions,
  usesSharedWork,
  WORK_DOMAINS,
} from "./sharedComposition";
import {
  sharedScope,
  sharedWorkRows,
  sharedWorkSituation,
} from "./sharedReadModel";
import { mergeWorkspace, workspaceKey } from "./workspaceTabs";
import { providerFor } from "./engine/synthetic";
import { sceneIdentity } from "./sceneIdentity";

describe("shared day workspace", () => {
  it("distinguishes a missing required qualification from an irrelevant ADR record", () => {
    const state = {
      ...initialGuidedState(),
      active: [...WORK_DOMAINS],
      anchor: { kind: "job" as const, id: "J-4217" },
      workTask: "unit" as const,
    };
    const row = structuredClone(sharedWorkRows(state)[0]);
    const work = sharedWork(state)!;
    expect(sharedWorkSituation(row, work).mode).toBe("in-transit");
    row.world.driver.qualifications = row.world.driver.qualifications.map(
      (q) => (q.kind === "cpc" ? { ...q, state: "MISSING" } : q),
    );
    expect(sharedWorkSituation(row, work).mode).toBe("missing-qualification");
    expect(sharedWorkSituation(row, work).question).toContain("em falta");
  });
  it("keeps joint map work spatial while explicit edits reveal their actual instrument", () => {
    const source = {
      ...initialGuidedState(),
      active: [...WORK_DOMAINS],
      mapFull: true,
      anchor: { kind: "job" as const, id: "J-4217" },
    };
    const task = changeGuidedState(source, { type: "work-task", task: "unit" });
    expect(task.mapFull).toBe(true);
    expect(composeWorkspace(task, 1440, 900).regions![0].rep).toBe(
      "shared-work",
    );
    const edit = changeGuidedState(task, {
      type: "edit",
      kind: "axle",
      target: "T-08",
    });
    expect(edit.mapFull).toBe(false);
    expect(edit.edit?.kind).toBe("axle");
    expect(source.mapFull).toBe(true);
  });
  it("inspects a rule predicate without introducing vehicle content", () => {
    const source = {
      ...initialGuidedState(),
      active: ["Restrictions"] as GuidedState["active"],
      anchor: { kind: "job" as const, id: "J-4217" },
    };
    const target = changeGuidedState(source, {
      type: "focus",
      focus: { kind: "predicate", fact: "journey.destination" },
    });
    expect(target.active).toEqual(["Restrictions"]);
    expect(target.lead).toBe("Restrictions");
    expect(target.facet.Restrictions).toBe("logic");
    expect(target.focus).toEqual({
      kind: "predicate",
      fact: "journey.destination",
    });
  });
  it("changes the working question without changing scope, participants or composition tab identity", () => {
    const source = {
      ...initialGuidedState(),
      active: [...WORK_DOMAINS],
      anchor: { kind: "job" as const, id: "J-4217" },
    };
    const variants = new Set<string>();
    for (const question of sharedWorkQuestions(source)) {
      const target = changeGuidedState(source, {
        type: "work-task",
        task: question.value,
      });
      expect(target.anchor).toEqual(source.anchor);
      expect(target.active).toEqual(source.active);
      expect(workspaceKey(target)).toBe(workspaceKey(source));
      expect(composeWorkspace(target, 1440, 900).regions![0].rep).toBe(
        "shared-work",
      );
      expect(sharedWork(target)!.domains).toEqual([...WORK_DOMAINS]);
      variants.add(sharedWork(target)!.variant);
    }
    expect([...variants].sort()).toEqual([
      "departure",
      "execution",
      "execution-records",
      "unit",
    ]);
    expect(source.workTask).toBeUndefined();
  });
  it("carries the requested action from the day into its actual journey", () => {
    const source = {
      ...initialGuidedState(),
      active: ["Trucks", "Restrictions"] as GuidedState["active"],
    };
    const target = changeGuidedState(source, {
      type: "job-action",
      id: "J-4217",
      action: { type: "edit", kind: "axle", target: "T-08" },
    });
    expect(target.anchor).toEqual({ kind: "job", id: "J-4217" });
    expect(target.edit).toMatchObject({ kind: "axle", target: "T-08" });
    expect(target.active).toEqual(source.active);
    expect(
      changeGuidedState(source, {
        type: "job-action",
        id: "J-missing",
        action: { type: "edit", kind: "axle", target: "T-08" },
      }),
    ).toBe(source);
    expect(source.anchor).toEqual({ kind: "jobs" });
  });
  it("keeps the staged and accepted facts while returning from an inspection", () => {
    const source = {
      ...initialGuidedState(),
      active: [...WORK_DOMAINS],
      pending: { kind: "stop" as const, id: "F-12", from: "F-07" },
      overrides: { "axle:T-08": "1.06" },
    };
    const inspection = changeGuidedState(source, {
      type: "facet",
      domain: "Documents",
      facet: "history",
    });
    const target = changeGuidedState(inspection, { type: "work-return" });
    expect(usesSharedWork(target)).toBe(true);
    expect(target.pending).toEqual(source.pending);
    expect(target.overrides).toEqual(source.overrides);
    expect(target.active).toEqual(source.active);
    expect(target.facet).toEqual({});
  });
  it("uses the actual assignment and appointment to change the work situation", () => {
    const active = ["Jobs", "Drivers", "Trucks"] as GuidedState["active"];
    const state = { ...initialGuidedState(), active };
    const work = sharedWork(state)!;
    const rows = sharedWorkRows(state);
    expect(
      sharedWorkSituation(rows.find((r) => r.world.jobId === "J-4217")!, work)
        .mode,
    ).toBe("in-transit");
    expect(
      sharedWorkSituation(rows.find((r) => r.world.jobId === "J-4222")!, work)
        .mode,
    ).toBe("missing-trailer");
    expect(
      sharedWorkSituation(rows.find((r) => r.world.jobId === "J-4220")!, work)
        .mode,
    ).toBe("unavailable-truck");
    expect(
      sharedWorkSituation(rows.find((r) => r.world.jobId === "J-4219")!, work)
        .mode,
    ).toBe("expired-qualification");
    expect(
      sharedWorkSituation(rows.find((r) => r.world.jobId === "J-4218")!, work)
        .mode,
    ).toBe("changed-window");
    // Cargo storage order differs from the route's unloading order.
    const row = rows.find((r) => r.world.jobId === "J-4217")!;
    expect(row.world.job.cargo.map((c) => c.dropAt)).toEqual([
      "Porto",
      "Coimbra",
    ]);
    expect(row.unloads.map((u) => u.cargo.dropAt)).toEqual([
      "Coimbra",
      "Porto",
    ]);
  });
  it("fits a north/south route along a wide working strip and retains upright framing in a tall map", () => {
    const state: GuidedState = {
      ...initialGuidedState(),
      anchor: { kind: "job", id: "J-4217" },
      active: ["Jobs", "Trucks"],
    };
    expect(
      guidedCamera(state, composeWorkspace(state, 1440, 900)),
    ).toMatchObject({ kind: "scene", bearing: 90 });
    const tall = {
      ...state,
      active: ["Trucks", "Fuel"] as GuidedState["active"],
    };
    expect(guidedCamera(tall, composeWorkspace(tall, 1440, 900))).toMatchObject(
      { kind: "scene", bearing: 0 },
    );
  });
  it("changes the instrument and geography to match distinct operational relationships", () => {
    const cases = [
      [["Drivers", "Trucks"], "unit"],
      [["Jobs", "Trucks"], "capacity"],
      [["Drivers", "Fuel"], "schedule"],
      [["Trucks", "Restrictions"], "clearance"],
      [["Drivers", "Documents"], "credentials"],
      [["Trucks", "Fuel"], "range"],
      [["Fuel", "Restrictions"], "route-choice"],
      [["Jobs", "Documents"], "departure"],
      [["Drivers", "Trucks", "Restrictions"], "execution"],
      [["Fuel", "Documents"], "execution-records"],
    ] as const;
    const layouts = cases.map(([active, variant]) => {
      const state = { ...initialGuidedState(), active: [...active] };
      expect(sharedWork(state)?.variant).toBe(variant);
      const layout = composeWorkspace(state, 1440, 900);
      if (variant === "credentials") expect(layout.map.visible).toBe(false);
      if (variant === "capacity" || variant === "schedule")
        expect(
          layout.regions![0].rect.y + layout.regions![0].rect.height,
        ).toBeLessThan(layout.map.y);
      if (variant === "range")
        expect(layout.map.width).toBeGreaterThan(layout.regions![0].rect.width);
      return JSON.stringify([layout.map, layout.regions![0].rect]);
    });
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(7);
  });
  it("gives the opening map 70–80% of the working area at desktop sizes", () => {
    for (const [width, height] of [
      [1199, 900],
      [1440, 900],
      [1920, 1080],
    ]) {
      const layout = composeWorkspace(initialGuidedState(), width, height);
      const strip = layout.zones.jobs!;
      const share = layout.map.height / (layout.map.height + strip.height);
      expect(share).toBeGreaterThanOrEqual(0.7);
      expect(share).toBeLessThanOrEqual(0.8);
      expect(layout.map.width).toBe(strip.width);
      expect(layout.map.y + layout.map.height).toBeLessThan(strip.y);
    }
  });
  it("resolves all 57 multi-domain sets without an original-domain owner", () => {
    let count = 0;
    for (let mask = 1; mask < 64; mask++) {
      const active = WORK_DOMAINS.filter((_, i) => mask & (1 << i));
      if (active.length < 2) continue;
      count++;
      const state = { ...initialGuidedState(), active, lead: active[0] };
      const reverse = {
        ...state,
        active: [...active].reverse(),
        lead: active.at(-1)!,
      };
      expect(sharedWork(reverse)).toEqual(sharedWork(state));
      expect(workspaceKey(reverse)).toBe(workspaceKey(state));
      for (const [width, height] of [
        [1199, 768],
        [1440, 900],
        [1920, 1080],
      ]) {
        const layout = composeWorkspace(state, width, height);
        expect(composeWorkspace(reverse, width, height)).toEqual(layout);
        expect(layout.composition.primary).toBeNull();
        expect(layout.composition.shared?.domains).toEqual(active);
        expect(Object.keys(layout.zones)).toHaveLength(0);
        const region = layout.regions![0];
        expect(region.rep).toBe("shared-work");
        for (const rect of [region.rect, layout.map]) {
          expect(rect.width).toBeGreaterThanOrEqual(310);
          expect(rect.height).toBeGreaterThanOrEqual(200);
          expect(rect.x + rect.width).toBeLessThanOrEqual(width);
          expect(rect.y + rect.height).toBeLessThanOrEqual(height);
        }
        if (layout.map.visible)
          expect(
            region.rect.y >= layout.map.y + layout.map.height ||
              region.rect.x + region.rect.width <= layout.map.x ||
              region.rect.y + region.rect.height <= layout.map.y ||
              region.rect.x >= layout.map.x + layout.map.width,
          ).toBe(true);
      }
    }
    expect(count).toBe(57);
  });
  it("changes the work structure as relationships change and keeps source state", () => {
    const source = {
      ...initialGuidedState(),
      active: ["Drivers" as const],
      lead: "Drivers" as const,
    };
    const unit = mergeWorkspace(source, "Trucks");
    const passage = mergeWorkspace(unit, "Restrictions");
    const handover = mergeWorkspace(unit, "Documents");
    expect([unit, passage, handover].map((s) => sharedWork(s)?.kind)).toEqual([
      "matching",
      "journey",
      "handover",
    ]);
    expect(source.active).toEqual(["Drivers"]);
    expect(usesSharedWork({ ...unit, takeover: { kind: "resource" } })).toBe(
      false,
    );
    expect(usesSharedWork({ ...unit, mapFull: true })).toBe(true);
  });
  it("stacks a shared instrument at narrow widths instead of squeezing it to a pixel", () => {
    for (const [active, workFirst] of [
      [["Drivers", "Trucks"], true],
      [["Jobs", "Documents"], true],
      [["Fuel", "Restrictions"], false],
    ] as const) {
      const state = { ...initialGuidedState(), active: [...active] };
      for (const width of [414, 768]) {
        const layout = composeWorkspace(state, width, 900);
        const work = layout.regions![0].rect;
        expect(work.width).toBeGreaterThanOrEqual(300);
        expect(work.width).toBe(layout.map.width);
        if (workFirst) expect(work.y + work.height).toBeLessThan(layout.map.y);
        else expect(work.y).toBeGreaterThan(layout.map.y + layout.map.height);
        expect(work.y + work.height).toBeLessThanOrEqual(900);
      }
    }
  });
  it("reads each assignment without leaking the last selection across the day", () => {
    const rows = sharedWorkRows({
      ...initialGuidedState(),
      assignment: { truck: "T-18" },
    });
    expect(rows.find((r) => r.world.jobId === "J-4217")!.world.truck.id).toBe(
      "T-08",
    );
    expect(
      rows.find((r) => r.world.jobId === "J-4222")!.world.trailer,
    ).toBeNull();
    expect(
      rows.find((r) => r.world.jobId === "J-4222")!.decisions[0].label,
    ).toContain("reboque");
    expect(
      sharedWorkRows({
        ...initialGuidedState(),
        dev: { staleBaseline: true },
      }).every((r) => r.timeline.timeline === null),
    ).toBe(true);
  });
  it("reflects confirmed facts in shared decisions without rewriting the source", () => {
    const state = initialGuidedState();
    const row = sharedWorkRows(state).find((r) => r.world.jobId === "J-4220")!;
    expect(
      row.decisions.some((d) => d.label.includes("Viatura indisponível")),
    ).toBe(true);
    const proposed = changeGuidedState(state, {
      type: "propose",
      proposal: {
        kind: "maintenance",
        id: row.world.truck.id,
        from: "MAINTENANCE",
        to: "AVAILABLE",
      },
    });
    const committed = changeGuidedState(proposed, { type: "commit" });
    const updated = sharedWorkRows(committed).find(
      (r) => r.world.jobId === "J-4220",
    )!;
    expect(updated.world.truck.availability).toBe("AVAILABLE");
    expect(
      updated.decisions.some((d) => d.label.includes("Viatura indisponível")),
    ).toBe(false);
    expect(row.world.truck.availability).toBe("MAINTENANCE");
  });
});

describe("shared object workspace", () => {
  const anchors: GuidedState["anchor"][] = [
    { kind: "job", id: "J-4217" },
    { kind: "driver", id: "D-14", job: "J-4217" },
    { kind: "truck", id: "T-08", job: "J-4217" },
    { kind: "trailer", id: "PT-3821", job: "J-4217" },
    { kind: "document", id: "CMR-4217", job: "J-4217" },
    { kind: "restriction", id: "RI-042", job: "J-4217" },
    { kind: "stop", id: "F-03", job: "J-4217" },
  ];
  it("resolves every shared set at every anchor without borrowing another journey", () => {
    for (const anchor of anchors) {
      for (let mask = 1; mask < 64; mask++) {
        const active = WORK_DOMAINS.filter((_, i) => mask & (1 << i));
        if (active.length < 2) continue;
        const state: GuidedState = { ...initialGuidedState(), anchor, active };
        expect(sharedScope(state).status, JSON.stringify(anchor)).toBe(
          "SELECTED",
        );
        expect(sharedWorkRows(state).map((r) => r.world.jobId)).toEqual([
          "J-4217",
        ]);
        const layout = composeWorkspace(state, 1440, 900);
        expect(layout.composition.shared?.domains).toEqual(active);
        expect(layout.composition.primary).toBeNull();
        expect(layout.regions?.[0].rep).toBe("shared-work");
        const reversed = { ...state, active: [...active].reverse() };
        expect(composeWorkspace(reversed, 1440, 900)).toEqual(layout);
        expect(sceneIdentity("shared-work", state)).toBe(
          "shared-work:job:J-4217",
        );
      }
    }
  });
  it("preserves explicit journey participation when following an assigned resource", () => {
    const source = mergeWorkspace(
      changeGuidedState(initialGuidedState(), { type: "job", id: "J-4217" }),
      "Drivers",
    );
    const target = changeGuidedState(source, {
      type: "entity",
      kind: "truck",
      id: "T-08",
      job: "J-4217",
    });
    expect(sharedWork(target)?.domains).toEqual(["Jobs", "Drivers", "Trucks"]);
    expect(sharedScope(target).jobIds).toEqual(["J-4217"]);
    expect(source.active).toEqual(["Jobs", "Drivers"]);
    const day = changeGuidedState(target, { type: "scope-day" });
    expect(day.anchor).toEqual({ kind: "jobs" });
    expect(day.active).toEqual(target.active);
    expect(sharedWorkRows(day)).toHaveLength(6);
  });
  it("uses the selected journey as scope without adding an unrequested domain", () => {
    for (let mask = 1; mask < 64; mask++) {
      const active = WORK_DOMAINS.filter((_, i) => mask & (1 << i));
      if (active.length < 2) continue;
      const source: GuidedState = { ...initialGuidedState(), active };
      const selected = changeGuidedState(source, { type: "job", id: "J-4217" });
      expect(sharedWork(selected)?.domains).toEqual(active);
      const followed = changeGuidedState(source, {
        type: "follow",
        object: { kind: "job", id: "J-4217" },
      });
      expect(sharedWork(followed)?.domains).toEqual(active);
    }
  });
  it("can remove an anchor's domain while the remaining shared task retains its scope", () => {
    const domainOf = {
      jobs: "Jobs",
      job: "Jobs",
      driver: "Drivers",
      truck: "Trucks",
      trailer: "Trucks",
      document: "Documents",
      restriction: "Restrictions",
      stop: "Fuel",
    } as const;
    for (const anchor of anchors) {
      const state: GuidedState = {
        ...initialGuidedState(),
        anchor,
        active: [...WORK_DOMAINS],
      };
      const domain = domainOf[anchor.kind];
      const changed = mergeWorkspace(state, domain);
      expect(changed.anchor).toEqual(anchor);
      expect(changed.active).toEqual(state.active.filter((d) => d !== domain));
      expect(sharedWorkRows(changed).map((row) => row.world.jobId)).toEqual([
        "J-4217",
      ]);
    }
  });
  it("keeps unavailable and unassigned records explicit with no fallback journey", () => {
    for (const anchor of [
      { kind: "job", id: "J-missing" },
      { kind: "truck", id: "T-missing", job: "J-4217" },
      { kind: "driver", id: "D-40", job: null },
      { kind: "trailer", id: "PT-1021", job: null },
      { kind: "driver", id: "D-14", job: "J-4218" },
    ] satisfies GuidedState["anchor"][]) {
      const state: GuidedState = {
        ...initialGuidedState(),
        anchor,
        active: [...WORK_DOMAINS],
        spatial: { question: "NONE", source: "automatic", target: "job" },
      };
      expect(sharedWorkRows(state)).toEqual([]);
      expect(composeWorkspace(state, 1440, 900).map.visible).toBe(false);
      expect(sharedScope(state).status).not.toBe("SELECTED");
    }
  });
  it("can inspect a participating domain and resume shared work when following its journey", () => {
    const state: GuidedState = {
      ...initialGuidedState(),
      anchor: anchors[1],
      active: [...WORK_DOMAINS],
    };
    const inspection = changeGuidedState(state, {
      type: "expand",
      domain: "Drivers",
    });
    expect(usesSharedWork(inspection)).toBe(false);
    const resumed = changeGuidedState(inspection, {
      type: "follow",
      object: { kind: "job", id: "J-4217" },
    });
    expect(usesSharedWork(resumed)).toBe(true);
    expect(
      providerFor(resumed).getResourceAssignment("J-4217").assignment?.driverId,
    ).toBe("D-14");
  });
});
