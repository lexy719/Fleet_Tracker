import { beforeEach, describe, expect, it } from "vitest";
import { buildDemoSeed } from "../data/mockData";
import { setWorld } from "./world/active";
import { labWorld } from "./world/lab";
import { opsWorld } from "./world/ops";
import { applyEdit, kmAt, needOf, plan, seedOf, toneOf, windowOptions, worldJobs } from "./model";
import type { OpsSnapshot } from "../repositories/operationalStore";

const planOf = (id: string, e = {}) => {
  const j = applyEdit(id, e);
  return { job: j, pl: plan(j, j.driverId, j.routeId) };
};

describe("studio model · lab world", () => {
  beforeEach(() => setWorld(labWorld()));

  it("each problem transport asks for its own fix", () => {
    const needs = Object.fromEntries(worldJobs().map((j) => [j.id, needOf(...(Object.values(planOf(j.id)) as [never, never]))]));
    expect(needs["J-4220"]).toBe("truck");
    expect(needs["J-4222"]).toBe("trailer");
    expect(needs["J-4218"]).toBe("window");
    expect(needs["J-4221"]).toBe("notify");
    expect(needs["J-4217"]).toBeNull();
  });

  it("a free truck resolves the workshop blocker and gives the job a start", () => {
    const before = planOf("J-4220");
    expect(before.job.blockers.length).toBeGreaterThan(0);
    const after = planOf("J-4220", { truckId: "T-18" });
    expect(after.job.blockers).toHaveLength(0);
    expect(after.pl.start).not.toBeNull();
    expect(toneOf(after.job, after.pl)).not.toBe("bad");
  });

  it("a new delivery window makes the plan meet every window", () => {
    const { job, pl } = planOf("J-4218");
    const ask = windowOptions(job, pl).at(-1)!;
    const after = planOf("J-4218", { windows: ask.windows });
    expect(after.pl.stops.some((s) => s.late)).toBe(false);
    expect(toneOf(after.job, after.pl)).toBe("ok");
  });

  it("the trace never moves backwards along the route", () => {
    const { pl } = planOf("J-4217");
    let last = -1;
    for (let t = 5 * 60; t <= 21 * 60; t += 5) {
      const km = kmAt(pl, t);
      expect(km).toBeGreaterThanOrEqual(last - 1e-6);
      last = km;
    }
  });

  it("swapping the seeded driver keeps the handover time after confirmation", () => {
    const seed = seedOf("J-4219");
    const draft = plan({ ...seed }, "D-40", seed.routeId);
    const committed = planOf("J-4219", { driverId: "D-40" }).pl;
    expect(committed.final).toBeCloseTo(draft.final!, 5);
    expect(committed.handoverMin).toBeGreaterThan(0);
  });
});

describe("studio model · operational world", () => {
  const seed = buildDemoSeed();
  const snap: OpsSnapshot = { ...seed, documents: [] };
  const now = new Date(Date.parse(seed.jobs[0].createdAt) + 60 * 60_000);

  beforeEach(() => setWorld(opsWorld(snap, now, "test")));

  it("maps every open transport and marks routes as not calculated", () => {
    const w = opsWorld(snap, now, "test");
    expect(w.jobs.length).toBeGreaterThan(5);
    for (const j of w.jobs) {
      expect(w.routes[j.routeId].recorded).toBe(false);
      expect(j.stops.at(-1)!.km).toBeCloseTo(w.routes[j.routeId].km, 3);
    }
  });

  it("places in-transit trucks on their line and never invents a driver", () => {
    const w = opsWorld(snap, now, "test");
    const moving = w.jobs.filter((j) => j.status === "in_transit");
    expect(moving.length).toBeGreaterThan(0);
    for (const j of moving) {
      expect(j.positionKm).not.toBeNull();
      expect(j.positionKm!).toBeLessThanOrEqual(w.routes[j.routeId].km);
    }
    const unassigned = w.jobs.find((j) => !j.driverId)!;
    expect(w.driver(unassigned.driverId).name).toBe("");
  });

  it("unassigned transports ask for a route plan (assignment happens on confirmation) and cannot start", () => {
    const w = opsWorld(snap, now, "test");
    const id = w.jobs.find((j) => !j.driverId && !j.truckId)!.id;
    const { job, pl } = planOf(id);
    expect(needOf(job, pl)).toBe("plan");
    expect(pl.start).toBeNull();
    expect(pl.trace).toHaveLength(0);
  });
});

describe("studio model · phases and refuel", () => {
  beforeEach(() => setWorld(labWorld()));

  it("a transport on the road never asks for a driver/truck swap", () => {
    for (const j of worldJobs().filter((x) => x.status === "in_transit" || x.status === "loading")) {
      const { job, pl } = planOf(j.id);
      expect(["driver", "truck", "trailer"]).not.toContain(needOf(job, pl));
    }
  });

  it("an expired qualification mid-trip becomes an exception, and recording it resolves it", () => {
    const { job, pl } = planOf("J-4219");
    expect(needOf(job, pl)).toBe("exception");
    const after = planOf("J-4219", { exception: "registada" });
    expect(needOf(after.job, after.pl)).not.toBe("exception");
    expect(toneOf(after.job, after.pl)).not.toBe("bad");
  });

  it("a route refuel stop becomes a stop in the day and moves the arrival", () => {
    const base = planOf("J-4217").pl;
    const j = applyEdit("J-4217", {});
    const withFuel = plan(j, j.driverId, j.routeId, [{ km: 400, name: "Posto" }]);
    expect(withFuel.trace.some((g) => g.kind === "fuel")).toBe(true);
    expect(withFuel.fuelStops[0]?.km).toBeCloseTo(400, 3);
    expect(withFuel.final!).toBeGreaterThan(base.final!);
  });
});
