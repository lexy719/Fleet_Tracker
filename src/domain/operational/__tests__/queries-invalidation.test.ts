import { describe, it, expect } from "vitest";
import { confirmed } from "./fixtures";
import { createOperationalQueries } from "../../../application/operationalQueries";
import {
  captureOperationalInputs,
  compareOperationalInputs,
  operationalInputFingerprint,
  invalidationForEvents,
} from "../invalidation";
import { driverHoursForPlanning } from "../../drivers/drivers";
import { initialFleetState } from "../../planning/state";
import {
  closure,
  geometry,
  ROAD_B,
} from "../../../regulations/__tests__/helpers";

describe("read-only operational queries", () => {
  it("changed commercial demand cannot release a resource using the prior execution", async () => {
    const { job, snapshot, request } = await confirmed();
    job.totalWeightKg += 1;
    expect(
      initialFleetState({ ...request, jobs: snapshot.jobs }).trucks[
        request.trucks[0].id
      ].blocked,
    ).toContain("COMMITTED_DEMAND_CHANGED");
  });
  it("returned route/timeline values cannot mutate the captured operational state", async () => {
    const { snapshot, request, job } = await confirmed();
    const q = createOperationalQueries(
      snapshot,
      request.dataset,
      request.nowMs,
    );
    q.getOperationalTimeline(
      job.id,
    ).timeline!.movements[0].timeline.routeInput.points[0][0] = 0;
    q.getRouteAlternatives(
      job.id,
    ).alternatives[0].timing!.routeInput.points[0][0] = 0;
    expect(q.getOperationalTimeline(job.id).status).toBe("READY");
  });
  it("exposes confirmed assignment, execution and one physical route without mutating data", async () => {
    const { request, snapshot, job } = await confirmed();
    const before = structuredClone(snapshot);
    const q = createOperationalQueries(
      snapshot,
      request.dataset,
      request.nowMs,
    );
    expect(q.getResourceAssignment(job.id).status).toBe("CURRENT");
    expect(q.getOperationalTimeline(job.id).status).toBe("READY");
    expect(q.getRouteAlternatives(job.id).alternatives).toHaveLength(1);
    expect(snapshot).toEqual(before);
    expect(q.getOperationalTimeline("missing").status).toBe("UNAVAILABLE");
  });
  it.each(["resource", "assignment", "service", "cargo", "departure"])(
    "does not expose stale %s timing",
    async (kind) => {
      const { request, snapshot, job } = await confirmed();
      if (kind === "resource") snapshot.drivers = [];
      if (kind === "assignment") job.assignedTruckId = "other";
      if (kind === "service")
        job.operationalRequirements!.serviceSecByStop![job.stops[0].id] += 60;
      if (kind === "cargo") job.totalWeightKg += 10;
      if (kind === "departure")
        job.plannedDepartureAt = new Date(request.nowMs).toISOString();
      const q = createOperationalQueries(
        snapshot,
        request.dataset,
        request.nowMs,
      );
      expect(q.getOperationalTimeline(job.id).timeline).toBeNull();
      expect(q.getRouteAlternatives(job.id).status).toBe("UNAVAILABLE");
    },
  );
  it("query snapshot remains stable if caller mutates source inventory", async () => {
    const { request, snapshot, job } = await confirmed();
    const q = createOperationalQueries(
      snapshot,
      request.dataset,
      request.nowMs,
    );
    snapshot.drivers = [];
    expect(q.getOperationalTimeline(job.id).status).toBe("READY");
  });
  it("future resources carry end position/time and driving sequentially", async () => {
    const { request, snapshot, job } = await confirmed();
    const state = initialFleetState({ ...request, jobs: snapshot.jobs });
    const id = request.drivers[0].id;
    expect(state.drivers[id].driving).toEqual(
      job.operationalPlan!.execution.drivingAfter,
    );
    expect(state.drivers[id].availableAt).toBe(
      job.operationalPlan!.execution.endMs,
    );
    expect(state.trucks[request.trucks[0].id].position!.source).toBe(
      `CONFIRMED_JOB:${job.id}`,
    );
    const future = createOperationalQueries(
      snapshot,
      request.dataset,
      request.nowMs,
    ).getResourceFutureState(request.initialState);
    expect(future.drivers[id].driving.status).toBe("KNOWN");
    expect(future.drivers[id].nextAssignments).toHaveLength(1);
    expect(future.trucks[request.trucks[0].id].position.status).toBe("ASSUMED");
  });
  it("a changed commitment cannot propagate fictitious availability", async () => {
    const { request, snapshot, job } = await confirmed();
    job.operationalRequirements!.serviceSecByStop![job.stops[0].id] += 60;
    const state = initialFleetState({ ...request, jobs: snapshot.jobs });
    expect(state.trucks[request.trucks[0].id].blocked).toContain(
      "COMMITTED_EXECUTION_CHANGED",
    );
  });
  it("overlapping commitments block shared resources", async () => {
    const { request, job } = await confirmed();
    const clone = structuredClone(job);
    clone.id = "second";
    clone.operationalPlan!.execution.jobId = "second";
    const state = initialFleetState({ ...request, jobs: [job, clone] });
    expect(state.drivers[request.drivers[0].id].blocked).toContain(
      "OVERLAPPING_COMMITMENTS",
    );
  });
  it("unrelated and missing restrictions return clear/UNKNOWN with fresh inputs", async () => {
    const { request, snapshot, job } = await confirmed();
    request.dataset.regulations = [closure("remote", "b", {})];
    request.dataset.geometries = [geometry("b", ROAD_B)];
    const q = createOperationalQueries(
      snapshot,
      request.dataset,
      request.nowMs,
    );
    expect(q.getRestrictionImpact(job.id, "remote").status).toBe("PASS");
    expect(q.getRestrictionImpact(job.id, "missing").status).toBe("UNKNOWN");
  });
  it("future-recorded driver baseline is never current knowledge", async () => {
    const { request } = await confirmed();
    const d = request.drivers[0];
    d.hours!.recordedAt = new Date(request.nowMs + 3600_000).toISOString();
    expect(driverHoursForPlanning(d, request.nowMs)).toMatchObject({
      todayKnown: false,
      weekKnown: false,
    });
  });
  it("invalid departure does not throw or imply known hours", async () => {
    const { request } = await confirmed();
    expect(driverHoursForPlanning(request.drivers[0], NaN)).toMatchObject({
      todayKnown: false,
      weekKnown: false,
    });
  });
});

describe("explicit invalidation", () => {
  it("captured inputs do not retain mutable references to the live job", async () => {
    const { snapshot, job, request } = await confirmed();
    const before = captureOperationalInputs(
      job,
      snapshot,
      request.dataset.version,
    );
    job.operationalRequirements!.serviceSecByStop![job.stops[0].id] += 60;
    expect(
      compareOperationalInputs(
        before,
        captureOperationalInputs(job, snapshot, request.dataset.version),
      ).changed,
    ).toContain("demand");
  });
  it("route events invalidate passage and feasibility; document events only document consequences", () => {
    const event = {
      id: "e",
      type: "ROUTE_INVALIDATED" as const,
      entityType: "job" as const,
      entityId: "j",
      at: new Date().toISOString(),
      source: "LOCAL_USER" as const,
    };
    expect(invalidationForEvents([event])).toEqual(
      expect.arrayContaining([
        "timing",
        "passage_windows",
        "restrictions",
        "driving_feasibility",
        "future_resources",
      ]),
    );
    expect(
      invalidationForEvents([{ ...event, type: "DOCUMENT_ISSUED" }]),
    ).toEqual(["document_diff"]);
  });
  it.each(["route", "driver", "trailer", "dataset", "service"])(
    "invalidates dependent results when %s changes",
    async (kind) => {
      const { snapshot, job, request } = await confirmed();
      const before = structuredClone(
        captureOperationalInputs(job, snapshot, request.dataset.version),
      );
      if (kind === "route")
        job.operationalPlan!.execution.movements[0].route.polyline[1][1] += 0.001;
      if (kind === "driver") snapshot.drivers[0].hours!.currentSpellMin = 1;
      if (kind === "trailer") job.assignedTrailerId = "changed";
      if (kind === "dataset") request.dataset.version = "new";
      if (kind === "service")
        job.operationalRequirements!.serviceSecByStop![job.stops[0].id] += 60;
      const after = captureOperationalInputs(
        job,
        snapshot,
        request.dataset.version,
      );
      expect(operationalInputFingerprint(after)).not.toBe(
        operationalInputFingerprint(before),
      );
      expect(compareOperationalInputs(before, after).invalidated).toContain(
        "restrictions",
      );
      if (kind !== "dataset")
        expect(compareOperationalInputs(before, after).invalidated).toContain(
          "timing",
        );
    },
  );
  it("notes do not invalidate operational derivations", async () => {
    const { snapshot, job, request } = await confirmed();
    const before = captureOperationalInputs(
      job,
      snapshot,
      request.dataset.version,
    );
    job.notes = "a note";
    const after = captureOperationalInputs(
      job,
      snapshot,
      request.dataset.version,
    );
    expect(compareOperationalInputs(before, after).invalidated).toEqual([]);
    expect(
      invalidationForEvents([
        {
          id: "e",
          type: "NOTES_UPDATED",
          entityType: "job",
          entityId: job.id,
          at: new Date().toISOString(),
          source: "LOCAL_USER",
        },
      ]),
    ).toEqual([]);
  });
});
