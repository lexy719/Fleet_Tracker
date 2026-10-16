import {
  anchorJob,
  changeGuidedState,
  initialGuidedState,
  mainLens,
  type GuidedFrame,
  type GuidedLens,
  type GuidedState,
} from "./guidedWorkspace";
import { defaultSpatial } from "./spatialQuestions";
import { labWorld } from "./fx/model";
import { sharedWork } from "./sharedComposition";

export type WorkspaceTab = {
  id: string;
  title: string;
  frame: GuidedFrame;
  history: GuidedFrame[];
};

export function workspaceKey(state: GuidedState): string {
  const a = state.anchor;
  return JSON.stringify([
    a.kind,
    "id" in a ? a.id : null,
    anchorJob(a),
    sharedWork(state) ? "shared-work" : mainLens(state),
    [...new Set(state.active)].sort(),
  ]);
}

/** Adding/removing content creates a composition, keeping its existing anchor
 * and all participating domains. The source frame remains in its own tab. */
export function mergeWorkspace(
  previous: GuidedState,
  domain: GuidedLens,
): GuidedState {
  const next = changeGuidedState(previous, { type: "content", domain });
  if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
  next.pending = null;
  next.edit = null;
  next.focus = null;
  next.takeover = null;
  next.facet = {};
  next.workInspection = null;
  next.workTask = "auto";
  next.spatial = defaultSpatial(next);
  return next;
}

/** A new object owns its canvas. Extra context belongs to the source tab. */
export function separateWorkspace(state: GuidedState): GuidedState {
  const next = structuredClone(state);
  const domain = mainLens(next);
  next.active = domain ? [domain] : [];
  next.lead = domain === "Jobs" ? null : domain;
  next.pending = null;
  next.edit = null;
  next.takeover = null;
  next.workTask = "auto";
  next.spatial = defaultSpatial(next);
  return next;
}

/** Menu navigation opens a question of its own. Context is added deliberately
 * through the secondary gesture, never carried into a new tab by default.
 */
export function navigateWorkspace(
  previous: GuidedState,
  domain: GuidedLens,
): GuidedState {
  let next: GuidedState;
  const job = anchorJob(previous.anchor);
  if (
    previous.anchor.kind !== "jobs" &&
    (mainLens(previous) === domain || !job)
  ) {
    next = {
      ...initialGuidedState(),
      overrides: { ...previous.overrides },
      planned: { ...previous.planned },
      active: [domain],
      lead: domain === "Jobs" ? null : domain,
    };
  } else if (job && (domain === "Fuel" || domain === "Jobs")) {
    next = {
      ...previous,
      anchor: { kind: "job", id: job },
    };
  } else if (
    job &&
    ["Drivers", "Trucks", "Documents", "Restrictions"].includes(domain)
  ) {
    const w = labWorld(previous, false);
    const target =
      domain === "Drivers"
        ? { kind: "driver" as const, id: w.driver.id }
        : domain === "Trucks"
          ? { kind: "truck" as const, id: w.truck.id }
          : domain === "Documents"
            ? { kind: "document" as const, id: w.ledger[0].id }
            : {
                kind: "restriction" as const,
                id:
                  previous.selection.restriction ??
                  w.restrictions.find((r) => r.result === "UNKNOWN")?.id ??
                  w.restrictions[0].id,
              };
    next = changeGuidedState(previous, {
      type: "entity",
      ...target,
      job,
    });
  } else next = changeGuidedState(previous, { type: "main", domain });
  next = structuredClone(next);
  next.active = [domain];
  next.lead = domain === "Jobs" ? null : domain;
  next.focus = null;
  next.mapFull = false;
  next.mapIntent = "auto";
  return separateWorkspace(next);
}

/** Confirmed world facts are shared; each tab's selection/editor remains local. */
export function withCurrentWorld(
  frame: GuidedFrame,
  current: GuidedState,
): GuidedFrame {
  return {
    ...frame,
    state: {
      ...structuredClone(frame.state),
      overrides: { ...current.overrides },
      planned: { ...current.planned },
    },
  };
}
