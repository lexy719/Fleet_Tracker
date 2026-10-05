import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { buildDemoSeed, legacyDemoJobs } from "../../data/mockData";
import { bragaDraft, driverDraft, trailerDraft, truckDraft } from "../../domain/__tests__/fixtures";
import { jobToDraft } from "../../domain/jobs/jobDraft";
import { routingProfileForTruck } from "../../domain/fleet/routingProfile";
import { driverHoursForPlanning } from "../../domain/drivers/drivers";
import { buildRouteStops, buildTransportFacts } from "../../regulations/fleetFacts";
import { assessPlannedJob } from "../../regulations/reevaluate";
import { REGULATION_DATASET } from "../../regulations/repository";
import { bootstrapOperationalStore } from "../../repositories/bootstrap";
import { IdbOperationalStore, MemoryOperationalStore, OPS_DB } from "../../repositories/operationalStore";
import { OperationsService } from "../operations";

let tick = Date.parse("2026-10-04T10:00:00Z");
const clock = () => new Date((tick += 1_000));

async function fresh(factory = new IDBFactory()) {
  const store = await IdbOperationalStore.open(OPS_DB, factory);
  const svc = new OperationsService(store, clock);
  await svc.load();
  return { svc, store, factory };
}
function must<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.value;
}

describe("duplicate-ID regression (the old in-memory counter reset on reload)", () => {
  it("jobs created across reloads never share an id or a job number", async () => {
    const factory = new IDBFactory();
    const seen = new Set<string>();
    const numbers = new Set<string>();
    for (let reload = 0; reload < 3; reload++) {
      const { svc, store } = await fresh(factory);
      for (let i = 0; i < 4; i++) {
        const j = must(await svc.createJob(bragaDraft()));
        seen.add(j.id);
        numbers.add(j.jobNumber);
      }
      store.close();
    }
    expect(seen.size).toBe(12);
    expect(numbers.size).toBe(12);
    expect([...numbers].sort()[0]).toBe("J-000001");
  });

  it("concurrent creates in one session also get distinct numbers", async () => {
    const { svc } = await fresh();
    const made = await Promise.all(Array.from({ length: 10 }, () => svc.createJob(bragaDraft())));
    expect(new Set(made.map((r) => must(r).jobNumber)).size).toBe(10);
  });

  it("after bootstrap, new numbers continue above legacy/demo numbers", async () => {
    const store = new MemoryOperationalStore();
    await bootstrapOperationalStore({ store, seed: buildDemoSeed(), legacySeedJobs: legacyDemoJobs, legacyRaw: null, legacyMarker: false, now: new Date() });
    const svc = new OperationsService(store, clock);
    await svc.load();
    expect(must(await svc.createJob(bragaDraft())).jobNumber).toBe("J-004204");
  });
});

describe("integration: resources → job → plan → execution → history, persisted", () => {
  it("full chain survives reload with an append-only event history", async () => {
    const { svc, store, factory } = await fresh();
    const truck = must(await svc.createTruck(truckDraft()));
    const driver = must(await svc.createDriver(driverDraft()));
    const trailer = must(await svc.createTrailer(trailerDraft()));
    const job = must(await svc.createJob(bragaDraft()));

    must(await svc.confirmPlan(job.id, { truckId: truck.id, driverId: driver.id, trailerId: trailer.id, mode: "assigned", km: 370, durationMin: 290, costEur: 260 }));
    must(await svc.transition(job.id, "loading"));
    const loaded = svc.getState().jobs.find((j) => j.id === job.id)!;
    must(await svc.setStopCompleted(job.id, loaded.stops[0]!.id, true));
    must(await svc.transition(job.id, "in_transit"));
    for (const s of loaded.stops.slice(1)) must(await svc.setStopCompleted(job.id, s.id, true));
    must(await svc.transition(job.id, "delivered"));
    must(await svc.transition(job.id, "invoiced"));
    store.close();

    const { svc: after, store: s2 } = await fresh(factory);
    const j = after.getState().jobs.find((x) => x.id === job.id)!;
    expect([j.status, j.assignedTruckId, j.assignedTrailerId, j.planStatus]).toEqual(["invoiced", truck.id, trailer.id, "PLANNED"]);
    const history = await after.listEvents(job.id);
    expect(history.map((e) => e.type)).toEqual([
      "JOB_CREATED", "ASSIGNMENT_CHANGED", "ROUTE_PLANNED", "STATUS_CHANGED", "STATUS_CHANGED",
      "STOP_UPDATED", "STATUS_CHANGED", "STOP_UPDATED", "STOP_UPDATED", "STATUS_CHANGED", "STATUS_CHANGED",
    ]);
    expect(history.every((e) => e.source === "LOCAL_USER")).toBe(true);
    s2.close();
  });

  it("the Kanban path (transition) cannot bypass guards", async () => {
    const { svc } = await fresh();
    const job = must(await svc.createJob(bragaDraft()));
    const r = await svc.transition(job.id, "in_transit");
    expect(r.ok).toBe(false);
    expect(svc.getState().jobs[0]!.status).toBe("backlog");
  });

  it("editing a planned job invalidates the route and blocks loading until replanned", async () => {
    const { svc } = await fresh();
    const t = must(await svc.createTruck(truckDraft()));
    const d = must(await svc.createDriver(driverDraft()));
    const job = must(await svc.createJob(bragaDraft()));
    must(await svc.confirmPlan(job.id, { truckId: t.id, driverId: d.id, mode: "assigned", km: 1, durationMin: 1, costEur: 1 }));
    const planned = svc.getState().jobs[0]!;
    const draft = jobToDraft(planned);
    const edit = must(await svc.editJob(job.id, { ...draft, plannedDepartureAt: "2026-10-06T06:00:00+01:00" }));
    expect(edit.invalidated).toBe(true);
    expect((await svc.transition(job.id, "loading")).ok).toBe(false);
    must(await svc.confirmPlan(job.id, { truckId: t.id, driverId: d.id, mode: "assigned", km: 1, durationMin: 1, costEur: 1 }));
    must(await svc.transition(job.id, "loading"));
    const types = (await svc.listEvents(job.id)).map((e) => e.type);
    expect(types).toContain("ROUTE_INVALIDATED");
    expect(types.filter((x) => x === "ROUTE_PLANNED")).toHaveLength(2);
  });

  it("resources: archive instead of delete; live jobs block archiving; referenced records cannot be deleted", async () => {
    const { svc } = await fresh();
    const t = must(await svc.createTruck(truckDraft()));
    const d = must(await svc.createDriver(driverDraft()));
    const job = must(await svc.createJob(bragaDraft()));
    must(await svc.confirmPlan(job.id, { truckId: t.id, driverId: d.id, mode: "assigned", km: 1, durationMin: 1, costEur: 1 }));
    expect((await svc.setArchived("truck", t.id, true)).ok).toBe(false);
    expect((await svc.deleteResource("truck", t.id)).ok).toBe(false);
    must(await svc.transition(job.id, "cancelled", "teste"));
    must(await svc.setArchived("truck", t.id, true));
    expect(svc.getState().trucks[0]!.archivedAt).toBeTruthy();
    expect((await svc.deleteResource("truck", t.id)).ok).toBe(false); // history still references it
    const spare = must(await svc.createTruck(truckDraft({ plate: "CC-22-DD" })));
    must(await svc.deleteResource("truck", spare.id));
    expect(svc.getState().trucks.some((x) => x.id === spare.id)).toBe(false);
    // the archived truck is no longer a valid plan target
    const j2 = must(await svc.createJob(bragaDraft()));
    expect((await svc.confirmPlan(j2.id, { truckId: t.id, driverId: d.id, mode: "assigned", km: 1, durationMin: 1, costEur: 1 })).ok).toBe(false);
  });

  it("a failed write leaves published state unchanged", async () => {
    const store = new MemoryOperationalStore();
    const svc = new OperationsService(store, clock);
    await svc.load();
    store.commit = async () => {
      throw new Error("disco cheio");
    };
    const r = await svc.createTruck(truckDraft());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatch(/disco cheio/);
    expect(svc.getState().trucks).toHaveLength(0);
  });
});

describe("Road Intelligence integration (frozen module, new records)", () => {
  it("a persisted truck record feeds transport facts and the routing profile", async () => {
    const { svc } = await fresh();
    const t = must(await svc.createTruck(truckDraft({ firstAxleHeightM: 1.3, ownerCategory: "private" })));
    const job = must(await svc.createJob(bragaDraft()));
    const facts = buildTransportFacts(t, job, routingProfileForTruck(t).preset);
    expect(facts["vehicle.axleCount"]).toMatchObject({ status: "known", value: 5 });
    expect(facts["vehicle.firstAxleHeightM"]).toMatchObject({ status: "known", value: 1.3 });
  });

  it("intermediate stops ('stop') flow into route stops with dated windows untouched", () => {
    const stops = buildRouteStops({ ...bragaJob() }, REGULATION_DATASET.areas);
    expect(stops.map((s) => s.type)).toEqual(["pickup", "stop", "delivery"]);
  });

  it("the planned departure drives EU 561 hours (baseline from another week → unknown, 0 h)", () => {
    const h = driverHoursForPlanning({ ...driverDraft(), id: "d", createdAt: "", updatedAt: "" }, Date.parse("2026-10-06T06:30:00Z"));
    expect([h.hoursToday, h.hoursWeek, h.weekKnown]).toEqual([0, 0, false]);
  });

  it("a job without a stored decision is reported as such (no false green)", () => {
    const a = assessPlannedJob({ ...bragaJob(), status: "assigned" }, null, REGULATION_DATASET);
    expect(a.state).toBe("INSUFFICIENT_SAVED_ROUTE_DATA");
  });
});

function bragaJob() {
  const d = bragaDraft();
  return {
    id: "j", jobNumber: "J-000001", reference: d.reference, client: d.client, status: "backlog" as const, priority: d.priority, cargoType: d.cargoType,
    totalWeightKg: 12_400, totalPallets: 18, cargo: [], planStatus: "UNPLANNED" as const, revision: 1, updatedAt: "", createdAt: "",
    pickupDeadline: "2026-10-06T09:00:00+01:00", deliveryDeadline: "2026-10-06T15:30:00+01:00", slaStatus: "on_track" as const, rateEur: 0,
    plannedDepartureAt: d.plannedDepartureAt,
    stops: d.stops.map((s, i) => ({ ...s, id: `s${i}`, sequence: i + 1, scheduledTime: "", windowEnd: "", cargoDescription: "", weightKg: 0, pallets: 0, completed: false })),
  };
}
