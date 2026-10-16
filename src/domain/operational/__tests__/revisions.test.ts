import { describe, it, expect } from "vitest";
import { generated } from "./fixtures";
import {
  proposeOperationalPlanRevision,
  acceptOperationalPlanRevision,
  operationalPlanFingerprint,
} from "../planRevisions";
import { compareOperationalPlans } from "../planComparison";
import { inventoryFingerprint } from "../../planning/state";
import {
  closure,
  geometry,
  ROAD_A,
  dataset,
} from "../../../regulations/__tests__/helpers";
import { planningJob, syntheticRouter } from "../../planning/fixtures";

describe("plan revisions", () => {
  it("missing route provenance requires acknowledgement instead of silently accepting a feasible label", async () => {
    const { request, plan } = await generated();
    const proposal = proposeOperationalPlanRevision(null, plan, request);
    if (!proposal.ok) throw Error(proposal.errors.join());
    expect(proposal.value.requiresUncertaintyAcknowledgement).toBe(true);
    expect(proposal.value.proposed.plan.status).toBe("REVIEW_REQUIRED");
    expect(
      acceptOperationalPlanRevision(proposal.value, null, request),
    ).toMatchObject({
      ok: false,
      errors: ["UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED"],
    });
  });
  it("proposes a changed stop against live inventory without overwriting accepted demand", async () => {
    const { request, plan } = await generated();
    const previous = proposeOperationalPlanRevision(null, plan, request);
    if (!previous.ok) throw Error(previous.errors.join());
    const target = structuredClone(request.jobs[0]);
    target.stops[1].lat += 0.1;
    const candidate = await generated({ ...request, jobs: [target] });
    const proposal = proposeOperationalPlanRevision(
      previous.value.proposed,
      candidate.plan,
      { ...request, proposedJobs: [target] },
    );
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) throw Error(proposal.errors.join());
    const before = structuredClone(request.jobs);
    const accepted = acceptOperationalPlanRevision(
      proposal.value,
      previous.value.proposed,
      request,
      true,
    );
    expect(accepted.ok).toBe(true);
    expect(request.jobs).toEqual(before);
    if (accepted.ok) {
      expect(accepted.value.demandSnapshots[0].stops[1].lat).toBe(
        target.stops[1].lat,
      );
      expect(accepted.value.revision).toBe(2);
    }
    expect(proposal.value.consequences!.distance.totalM.delta).not.toBe(0);
    request.jobs[0].notes = "concurrent edit";
    expect(
      acceptOperationalPlanRevision(
        proposal.value,
        previous.value.proposed,
        request,
        true,
      ),
    ).toMatchObject({ ok: false, errors: ["PROPOSAL_INPUTS_CHANGED"] });
  });
  it("pending demand cannot introduce an unknown job or claim a different live revision", async () => {
    const { request, plan } = await generated();
    const target = structuredClone(request.jobs[0]);
    target.revision++;
    expect(
      proposeOperationalPlanRevision(null, plan, {
        ...request,
        proposedJobs: [target],
      }),
    ).toMatchObject({
      ok: false,
      errors: ["PROPOSED_DEMAND_REVISION_INVALID"],
    });
    target.revision--;
    target.id = "missing";
    expect(
      proposeOperationalPlanRevision(null, plan, {
        ...request,
        proposedJobs: [target],
      }),
    ).toMatchObject({
      ok: false,
      errors: ["PROPOSED_DEMAND_REVISION_INVALID"],
    });
  });
  it("cannot clear a different confirmed commitment by supplying a free initial state", async () => {
    const { request, plan } = await generated();
    const other = structuredClone(request.jobs[0]);
    other.id = "other";
    other.status = "assigned";
    other.assignedTruckId = request.trucks[0].id;
    other.plannedDepartureAt = new Date(
      plan.executions[0].startMs,
    ).toISOString();
    other.routeCompliance = {
      route: { arrivalAtIso: new Date(plan.executions[0].endMs).toISOString() },
    } as typeof other.routeCompliance;
    request.jobs.push(other);
    plan.inventoryFingerprint = inventoryFingerprint(
      request.jobs,
      request.trucks,
      request.drivers,
      request.trailers,
    );
    expect(proposeOperationalPlanRevision(null, plan, request)).toMatchObject({
      ok: false,
      errors: ["EXISTING_COMMITMENT_OVERLAP"],
    });
  });
  it("proposal is immutable and acceptance reconstructs derived future state", async () => {
    const { request, plan } = await generated();
    const p = proposeOperationalPlanRevision(null, plan, request);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    plan.executions[0].endMs += 1;
    const a = acceptOperationalPlanRevision(p.value, null, request, true);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.revision).toBe(1);
    expect(
      a.value.plan.futureState.drivers[request.drivers[0].id].availableAt,
    ).toBe(a.value.plan.executions[0].endMs);
    expect(a.value.plan).not.toBe(p.value.proposed.plan);
  });
  it("unchanged plan produces no revision; display-only changes do not change fingerprint", async () => {
    const { request, plan } = await generated();
    const p = proposeOperationalPlanRevision(null, plan, request);
    if (!p.ok) throw Error(p.errors.join());
    plan.id = "display";
    plan.metrics.totalKm = 999;
    plan.executions[0].movements[0].route.title = "renamed";
    expect(operationalPlanFingerprint(plan, request.jobs)).toBe(
      p.value.proposed.contentFingerprint,
    );
    expect(
      proposeOperationalPlanRevision(p.value.proposed, plan, request),
    ).toMatchObject({ ok: false, errors: ["NO_OPERATIONAL_CHANGE"] });
  });
  it.each(["inventory", "dataset", "proposal", "lineage"])(
    "rejects changed %s on acceptance",
    async (kind) => {
      const { request, plan } = await generated();
      const p = proposeOperationalPlanRevision(null, plan, request);
      if (!p.ok) throw Error(p.errors.join());
      if (kind === "inventory") request.drivers[0].availability = "UNAVAILABLE";
      if (kind === "dataset") request.dataset.version = "changed";
      if (kind === "proposal")
        p.value.proposed.plan.executions[0].endMs += 60000;
      const a = acceptOperationalPlanRevision(
        p.value,
        kind === "lineage" ? p.value.proposed : null,
        request,
        true,
      );
      expect(a.ok).toBe(false);
    },
  );
  it.each([
    "driver",
    "trailer",
    "availability",
    "position",
    "baseline",
    "window",
  ])("rejects invalid %s before proposal", async (kind) => {
    const { request, plan } = await generated();
    if (kind === "driver") plan.executions[0].assignment.driverId = "missing";
    if (kind === "trailer") plan.executions[0].assignment.trailerId = "missing";
    if (kind === "availability")
      plan.planningInputs.initialState.drivers[
        request.drivers[0].id
      ].availableAt = plan.executions[0].startMs + 1;
    if (kind === "position")
      plan.planningInputs.initialState.trucks[
        request.trucks[0].id
      ].position!.point = [0, 0];
    if (kind === "baseline")
      plan.planningInputs.initialState.drivers[
        request.drivers[0].id
      ].driving!.drivenTodaySec = 1;
    if (kind === "window")
      request.jobs[0].stops[1].windowEndAt = new Date(
        request.nowMs,
      ).toISOString();
    plan.inventoryFingerprint = inventoryFingerprint(
      request.jobs,
      request.trucks,
      request.drivers,
      request.trailers,
    );
    expect(proposeOperationalPlanRevision(null, plan, request).ok).toBe(false);
  });
  it("stale clear reports cannot conceal a current closure", async () => {
    const base = (await generated()).request;
    const job = planningJob("closure", ROAD_A[0], ROAD_A[1]);
    const request = {
      ...base,
      jobs: [job],
      route: syntheticRouter,
      initialState: {
        trucks: {
          [base.trucks[0].id]: {
            availableAt: base.nowMs,
            position: { point: ROAD_A[0], source: "manual" },
          },
        },
        drivers: base.initialState?.drivers,
      },
    };
    request.initialState.drivers![base.drivers[0].id].position = {
      point: ROAD_A[0],
      source: "manual",
    };
    const built = await generated(request);
    built.request.dataset = dataset(
      [closure("closed", "g", {})],
      [geometry("g", ROAD_A)],
    );
    const p = proposeOperationalPlanRevision(null, built.plan, built.request);
    expect(p).toMatchObject({
      ok: false,
      errors: ["PLAN_RESTRICTION_INFEASIBLE"],
    });
  });
  it("UNKNOWN requires explicit acknowledgement at acceptance", async () => {
    const base = (await generated()).request;
    base.initialState!.drivers![base.drivers[0].id].driving!.known = false;
    const { request, plan } = await generated(base);
    const p = proposeOperationalPlanRevision(null, plan, request);
    if (!p.ok) throw Error(p.errors.join());
    expect(p.value.requiresUncertaintyAcknowledgement).toBe(true);
    expect(acceptOperationalPlanRevision(p.value, null, request)).toMatchObject(
      { ok: false, errors: ["UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED"] },
    );
    expect(acceptOperationalPlanRevision(p.value, null, request, true).ok).toBe(
      true,
    );
  });
});

describe("structured plan consequences", () => {
  it("compares derived distances and tolls rather than stored totals", async () => {
    const { request, plan } = await generated();
    const after = structuredClone(plan);
    after.metrics.totalKm = 99999;
    after.executions[0].movements[0].route.distanceM += 12000;
    after.executions[0].movements[0].route.tollCostEur += 8.2;
    const c = compareOperationalPlans(plan, after, request.jobs);
    expect(c.distance.totalM.delta).toBeCloseTo(12000);
    expect(c.cost.tollEur.delta).toBeCloseTo(8.2);
    expect(c.compliance[0].after).toBe("PASS");
  });
  it("unreplayable timing and unpriced tolls never become zero deltas/PASS", async () => {
    const { request, plan } = await generated();
    const after = structuredClone(plan);
    after.executions[0].endMs += 18 * 60000;
    after.executions[0].movements[0].route.tollDataQuality =
      "unpriced_sections";
    const c = compareOperationalPlans(plan, after, request.jobs);
    expect(c.timing[0].arrivalMs.delta).toBeNull();
    expect(c.cost.tollEur.delta).toBeNull();
    expect(c.compliance[0].after).toBe("UNKNOWN");
  });
  it("a proposed later departure explains ETA and delivery margin changes", async () => {
    const { request, plan } = await generated();
    const later = await generated({
      ...request,
      earliestStartMs: request.earliestStartMs! + 18 * 60000,
    });
    const c = compareOperationalPlans(plan, later.plan, request.jobs);
    expect(c.timing[0].arrivalMs.delta).toBe(18 * 60000);
    expect(c.timing[0].deliveryMarginsSec[1].delta).toBe(-18 * 60);
    const p = proposeOperationalPlanRevision(null, plan, request);
    if (!p.ok) throw Error(p.errors.join());
    const next = proposeOperationalPlanRevision(
      p.value.proposed,
      later.plan,
      request,
    );
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.value.proposed.revision).toBe(2);
      expect(next.value.consequences?.timing[0].arrivalMs.delta).toBe(
        18 * 60000,
      );
    }
  });
});
