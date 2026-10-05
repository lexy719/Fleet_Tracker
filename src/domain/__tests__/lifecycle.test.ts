import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "../../data/types";
import { confirmPlan, setStopCompleted, transitionBlockers, transitionJob, type LifecycleCtx } from "../jobs/lifecycle";
import { index, makeDriver, makeJob, makeTrailer, makeTruck, NOW } from "./fixtures";

const truck = makeTruck();
const driver = makeDriver();
const ctx: LifecycleCtx = { now: NOW, resources: index([truck], [driver], [makeTrailer()]) };
const plan = { truckId: truck.id, driverId: driver.id, mode: "assigned" as const, km: 380, durationMin: 300, costEur: 210 };

function assigned(): Job[] {
  const r = confirmPlan([makeJob()], "job-1", plan, ctx);
  if (!r.ok) throw new Error(r.errors.join());
  return r.value.jobs;
}
function step(jobs: Job[], to: JobStatus, reason?: string): Job[] {
  const r = transitionJob(jobs, "job-1", to, { ...ctx, reason });
  if (!r.ok) throw new Error(`${to}: ${r.errors.join("; ")}`);
  return r.value.jobs;
}
function complete(jobs: Job[], type: "pickup" | "rest"): Job[] {
  let j = jobs[0]!;
  for (const s of j.stops.filter((x) => (type === "pickup" ? x.type === "pickup" : x.type !== "pickup"))) {
    const r = setStopCompleted(j, s.id, true, { now: NOW });
    if (!r.ok) throw new Error(r.errors.join());
    j = r.value.job;
  }
  return [j];
}

describe("confirmPlan", () => {
  it("backlog → assigned with resources, plan PLANNED and the event trail", () => {
    const r = confirmPlan([makeJob()], "job-1", { ...plan, trailerId: "trailer-1" }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const j = r.value.jobs[0]!;
    expect(j.status).toBe("assigned");
    expect(j.planStatus).toBe("PLANNED");
    expect(j.assignedTrailerId).toBe("trailer-1");
    expect(r.value.events.map((e) => e.type)).toEqual(["ASSIGNMENT_CHANGED", "ROUTE_PLANNED", "STATUS_CHANGED"]);
  });
  it("refuses missing / archived resources", () => {
    expect(confirmPlan([makeJob()], "job-1", { ...plan, truckId: "ghost" }, ctx).ok).toBe(false);
    const archived = { ...truck, archivedAt: NOW.toISOString() };
    expect(confirmPlan([makeJob()], "job-1", plan, { ...ctx, resources: index([archived], [driver]) }).ok).toBe(false);
  });
  it("queued mode", () => {
    const r = confirmPlan([makeJob()], "job-1", { ...plan, mode: "queued" }, ctx);
    expect(r.ok && r.value.jobs[0]!.status).toBe("queued");
    expect(r.ok && r.value.jobs[0]!.queuedAt).toBe(NOW.toISOString());
  });
});

describe("transitions", () => {
  it("full happy path assigned → loading → in_transit → delivered → invoiced", () => {
    let jobs = assigned();
    jobs = step(jobs, "loading");
    jobs = complete(jobs, "pickup");
    jobs = step(jobs, "in_transit");
    jobs = complete(jobs, "rest");
    jobs = step(jobs, "delivered");
    jobs = step(jobs, "invoiced");
    expect(jobs[0]!.status).toBe("invoiced");
    expect(jobs[0]!.revision).toBeGreaterThan(5);
  });

  it("no skipping (the old Kanban FORCE_STATUS bypass)", () => {
    const jobs = assigned();
    for (const to of ["in_transit", "delivered", "invoiced"] as JobStatus[]) {
      const r = transitionJob(jobs, "job-1", to, ctx);
      expect(r.ok).toBe(false);
    }
    expect(transitionJob([makeJob()], "job-1", "assigned", ctx).ok).toBe(false); // planner only
    expect(transitionJob([makeJob()], "job-1", "loading", ctx).ok).toBe(false);
  });

  it("in_transit needs completed pickups; delivered needs all other stops", () => {
    let jobs = step(assigned(), "loading");
    expect(transitionBlockers(jobs[0]!, "in_transit", ctx).join()).toMatch(/recolha/);
    jobs = step(complete(jobs, "pickup"), "in_transit");
    expect(transitionBlockers(jobs[0]!, "delivered", ctx).join()).toMatch(/2 paragem/);
  });

  it("loading requires a valid plan and existing, non-archived resources", () => {
    const jobs = assigned();
    expect(transitionBlockers({ ...jobs[0]!, planStatus: "REPLAN_REQUIRED" }, "loading", ctx).join()).toMatch(/replaneada/);
    const gone = { ...ctx, resources: index([], [driver]) };
    expect(transitionBlockers(jobs[0]!, "loading", gone).join()).toMatch(/não resolvida/);
  });

  it("cancel requires a reason; final states are locked; delivered cannot be cancelled", () => {
    const jobs = assigned();
    expect(transitionJob(jobs, "job-1", "cancelled", ctx).ok).toBe(false);
    const c = step(jobs, "cancelled", "cliente cancelou");
    expect(c[0]!.cancelReason).toBe("cliente cancelou");
    expect(transitionJob(c, "job-1", "backlog", ctx).ok).toBe(false);
    let d = step(complete(step(complete(step(assigned(), "loading"), "pickup"), "in_transit"), "rest"), "delivered");
    expect(transitionJob(d, "job-1", "cancelled", { ...ctx, reason: "tarde demais" }).ok).toBe(false);
    d = step(d, "invoiced");
    expect(transitionJob(d, "job-1", "delivered", ctx).ok).toBe(false);
  });

  it("unassign from loading clears resources, plan and reopens pickups", () => {
    const jobs = complete(step(assigned(), "loading"), "pickup");
    const r = transitionJob(jobs, "job-1", "backlog", ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const j = r.value.jobs[0]!;
    expect([j.status, j.assignedTruckId, j.assignedDriverId, j.planStatus]).toEqual(["backlog", undefined, undefined, "UNPLANNED"]);
    expect(j.stops.every((s) => !s.completed)).toBe(true);
    expect(r.value.events.map((e) => e.type)).toEqual(["STATUS_CHANGED", "ASSIGNMENT_CHANGED"]);
  });

  it("in_transit cannot go back to backlog", () => {
    const jobs = step(complete(step(assigned(), "loading"), "pickup"), "in_transit");
    expect(transitionJob(jobs, "job-1", "backlog", ctx).ok).toBe(false);
  });

  it("delivery promotes the next queued job of the same truck+driver line (SYSTEM event)", () => {
    const first = assigned();
    const q = confirmPlan([...first, makeJob("job-2", {}, "J-000002")], "job-2", { ...plan, mode: "queued" }, ctx);
    if (!q.ok) throw new Error();
    let jobs = q.value.jobs;
    jobs = step(jobs, "loading");
    jobs = jobs.map((j) => (j.id === "job-1" ? complete([j], "pickup")[0]! : j));
    jobs = step(jobs, "in_transit");
    jobs = jobs.map((j) => (j.id === "job-1" ? complete([j], "rest")[0]! : j));
    const r = transitionJob(jobs, "job-1", "delivered", ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.jobs.find((j) => j.id === "job-2")!.status).toBe("assigned");
    const promo = r.value.events.find((e) => e.entityId === "job-2")!;
    expect([promo.source, promo.fromStatus, promo.toStatus]).toEqual(["SYSTEM", "queued", "assigned"]);
  });
});

describe("stops", () => {
  it("pickups only while loading/in transit; others only in transit; no reopening pickups after departure", () => {
    const jobs = assigned();
    const pickup = jobs[0]!.stops[0]!.id;
    expect(setStopCompleted(jobs[0]!, pickup, true, { now: NOW }).ok).toBe(false);
    const loading = step(jobs, "loading")[0]!;
    expect(setStopCompleted(loading, loading.stops[2]!.id, true, { now: NOW }).ok).toBe(false);
    const done = setStopCompleted(loading, pickup, true, { now: NOW });
    expect(done.ok && done.value.job.stops[0]!.completedAt).toBe(NOW.toISOString());
    const transit = step(complete([loading], "pickup"), "in_transit")[0]!;
    expect(setStopCompleted(transit, pickup, false, { now: NOW }).ok).toBe(false);
  });
});
