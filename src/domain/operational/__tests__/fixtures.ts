import { singleJobFixture } from "../../planning/fixtures";
import { planFleet } from "../../planning/planner";
import { confirmOperationalPlan } from "../../planning/confirmation";
import { dataset } from "../../../regulations/__tests__/helpers";
import type { PlanningRequest } from "../../planning/types";
import type { OpsSnapshot } from "../../../repositories/operationalStore";

export async function generated(over: Partial<PlanningRequest> = {}) {
  const request = { ...singleJobFixture(), dataset: dataset([], []), ...over };
  const result = await planFleet(request);
  if (!result.recommended) throw new Error(JSON.stringify(result.diagnostics));
  return { request, plan: result.recommended };
}
export async function confirmed() {
  const { request, plan } = await generated();
  const result = confirmOperationalPlan({
    ...request,
    selected: plan,
    recommended: plan,
    now: new Date(request.nowMs),
    id: "confirmed-test",
    acknowledgeUncertainty: true,
  });
  if (!result.ok) throw new Error(result.errors.join(","));
  const snapshot: OpsSnapshot = {
    jobs: result.value.jobs,
    trucks: request.trucks,
    drivers: request.drivers,
    trailers: request.trailers,
    documents: [],
    customers: [],
    sites: [],
  };
  return { request, plan, snapshot, job: snapshot.jobs[0] };
}
