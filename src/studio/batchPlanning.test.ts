import { describe, expect, it } from "vitest";
import { planFleet } from "../domain/planning/planner";
import { fleetFixture } from "../domain/planning/fixtures";
import { OperationsService } from "../application/operations";
import { MemoryOperationalStore } from "../repositories/operationalStore";
import type { PlanningRequest } from "../domain/planning/types";
import { confirmBatches, orderForBatches, previewBatches } from "./batchPlanning";

/** A tight per-run search budget, like the app's 64-request router limit. */
const TIGHT = { beamWidth: 4, extensionsPerState: 8, maxRouteRequests: 24 };

async function setup() {
  const base = fleetFixture();
  const store = new MemoryOperationalStore();
  await store.commit({ put: { jobs: base.jobs, trucks: base.trucks, drivers: base.drivers, trailers: base.trailers } });
  const service = new OperationsService(store, () => new Date(base.nowMs));
  await service.load();
  const request = (scope: string[], initialState?: PlanningRequest["initialState"]): PlanningRequest => ({
    ...base,
    ...service.getState(),
    scopeJobIds: scope,
    search: TIGHT,
    initialState: initialState ?? base.initialState,
  });
  return { base, service, request };
}

describe("studio batch planning", () => {
  it("plans at least as many jobs in batches as one budget-limited run, and confirms them", async () => {
    const { base, service, request } = await setup();
    const scope = orderForBatches(base.jobs);
    const single = await planFleet(request(scope));
    const preview = await previewBatches({
      scope,
      makeRequest: request,
      service,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    const singleCount = single.recommended?.executions.length ?? 0;
    // On this fixture one tight run plans 9 of 20; batches plan all 20.
    expect(preview.executions.length).toBeGreaterThan(singleCount);
    expect(preview.executions.length).toBeGreaterThan(0);
    // Every job is either planned once or listed as unassigned — never both, never lost.
    const planned = preview.executions.map((e) => e.jobId);
    expect(new Set(planned).size).toBe(planned.length);
    for (const id of scope) expect(planned.includes(id) !== preview.unassignedJobIds.includes(id)).toBe(true);

    const outcome = await confirmBatches({
      preview,
      service,
      dataset: base.dataset,
      acknowledge: true,
      makeRequest: (ids) => request(ids),
      onProgress: () => undefined,
    });
    // Either everything approved is confirmed, or the run stops with an explicit reason.
    if (outcome.stoppedAt === null) expect(outcome.confirmed).toBe(preview.executions.length);
    else expect(outcome.reason).toBeTruthy();
    const assigned = service.getState().jobs.filter((j) => j.status === "assigned" || j.status === "queued");
    expect(assigned.length).toBe(outcome.confirmed);
  }, 240_000);
});
