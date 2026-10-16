import type { GuidedState } from "./guidedWorkspace";
import { labWorld } from "./fx/model";
import { anchorJob } from "./guidedWorkspace";
import { TRUCKS } from "./world";

/** A representation is a form of an object, never the identity of a screen. */
export function sceneIdentity(
  representation: string,
  state: GuidedState,
  w = labWorld(state),
): string {
  if (representation === "shared-work" && anchorJob(state.anchor))
    return `shared-work:job:${anchorJob(state.anchor)}`;
  if (state.anchor.kind !== "jobs" && !anchorJob(state.anchor)) {
    const anchor = `${state.anchor.kind}:${state.anchor.id}`;
    if (representation.startsWith("vehicle-") && state.anchor.kind === "truck")
      return `truck:${TRUCKS[state.anchor.id]?.plate ?? state.anchor.id}`;
    return representation.startsWith("driver-") &&
      state.anchor.kind === "driver"
      ? anchor
      : `${representation}:${anchor}`;
  }
  if (representation.startsWith("driver-")) return `driver:${w.driver.id}`;
  if (representation.startsWith("vehicle-")) return `truck:${w.truck.plate}`;
  if (representation === "route-strip") return `route:${w.jobId}`;
  if (representation === "document-paper")
    return `document:${state.anchor.kind === "document" ? state.anchor.id : w.ledger[0].id}`;
  if (representation.startsWith("trailer-"))
    return `trailer:${state.anchor.kind === "trailer" ? state.anchor.id : w.job.trailerId}`;
  const anchor =
    state.anchor.kind === "jobs"
      ? "operation"
      : `${state.anchor.kind}:${state.anchor.id}`;
  // Logic and impact supports belong to the transport, and remain context when
  // following its driver/vehicle. Facts belong to the specifically opened object.
  if (
    representation.startsWith("restriction-") &&
    representation !== "restriction-full"
  )
    return `${representation}:${w.jobId}`;
  return `${representation}:${anchor}`;
}
