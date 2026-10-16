import { demoContext, jobById, JOBS } from "./guidedContent";
import {
  defaultSpatial,
  spatialGeometry,
  spatialCamera,
  type SpatialIntent,
} from "./spatialQuestions";
import { TRANSITION_CONTRACTS, normalizeSelections } from "./interactionGraph";
import {
  INITIAL_CAMERA,
  type Domain,
  type MapCamera,
  type MapPlacement,
  type MapMode,
  type MapScene,
  type CameraTarget,
} from "./mapTypes";
import { composeWorkspace, type CompositionPlan } from "./compositionGrammar";
import type { RegionPlacement } from "./entityComposition";
import { ATTENTION } from "./world";
import { applyFollow, type FleetObject } from "./relations";
import { EDIT_HOME, type EditKind, type Proposal } from "./edits";
import { ANCHOR_LENS, type EntityAnchorKind } from "./entityRecipes";
import {
  sharedWork,
  sharedWorkQuestions,
  type WorkVariant,
} from "./sharedComposition";
export type GuidedLens = Domain | "Pricing DEV" | "Compliance DEV";
export type Takeover = {
  kind: "map" | "document" | "station" | "resource" | "segment";
  id?: string;
  domain?: Domain;
};
export type Anchor =
  | { kind: "jobs" }
  | { kind: "job"; id: string }
  /** An entity anchor carries the transport it executes today (resolved by the world adapter). */
  | { kind: "driver"; id: string; job: string | null }
  | { kind: "truck"; id: string; job: string | null }
  | { kind: "trailer"; id: string; job: string | null }
  | { kind: "document"; id: string; job: string | null }
  | { kind: "restriction"; id: string; job: string | null }
  | { kind: "stop"; id: string; job: string | null };
/** The transport whose world the instruments read (an entity's current transport). */
export const anchorJob = (a: Anchor): string | null =>
  a.kind === "job" ? a.id : a.kind === "jobs" ? null : a.job;
export const isEntityAnchor = (
  a: Anchor,
): a is Extract<Anchor, { kind: EntityAnchorKind }> =>
  a.kind !== "jobs" && a.kind !== "job";
export type GuidedState = {
  anchor: Anchor;
  active: GuidedLens[];
  lead: GuidedLens | null;
  selection: {
    fuel: string | null;
    document: string | null;
    restriction: string | null;
    resource: string | null;
  };
  assignment: { truck: string | null };
  selectionLog: {
    key: string;
    id: string;
    outcome: "kept" | "cleared";
    reason: string;
  }[];
  spatial: SpatialIntent;
  filter: "all" | "moving";
  mapIntent: "auto" | "open";
  takeover: Takeover | null;
  exceptions: { driverTimeCritical: boolean };
  /** DEV honesty scenarios (never production data). */
  dev: { staleBaseline: boolean };
  /** An operator change staged in the workspace, previewed everywhere, awaiting Confirm. */
  pending: Proposal | null;
  /** Temporary focus inside an instrument (Esc restores the captured frame). */
  focus: Focus | null;
  /** Lab-confirmed plan choices (synthetic). */
  planned: { stop: string | null };
  /** Which question the lead domain answers; each facet is an authored composition. */
  facet: FacetState;
  /** The workspace itself is the editor: an open edit recomposes the lead instrument. */
  edit: { kind: EditKind; target: string; returnFacet?: string } | null;
  /** Committed DEV facts, keyed `${kind}:${id}` (synthetic, never persisted). */
  overrides: Record<string, string>;
  /** Spatial working mode: the map is the canvas and survives lens changes. */
  mapFull: boolean;
  /** Explicit expansion inspects one instrument inside the shared work. */
  workInspection?: GuidedLens | null;
  /** A shared operational task; scope and participants retain their identity. */
  workTask?: "auto" | Extract<WorkVariant, "unit" | "departure" | "execution">;
};
export const FACETS = {
  Drivers: [
    "execution",
    "legality",
    "qualifications",
    "corridor",
    "assignment",
  ],
  Trucks: ["load", "restriction", "fuel", "assignment", "maintenance"],
  Fuel: ["management", "comparison", "journey", "stops", "window", "segment"],
  Documents: ["dossier", "diff", "history", "issue", "qualification"],
  Restrictions: ["logic", "missing", "physical", "alternative", "evidence"],
} as const;
export type FacetDomain = keyof typeof FACETS;
export type FacetOf<D extends FacetDomain> = (typeof FACETS)[D][number];
export type FacetState = { [D in FacetDomain]?: FacetOf<D> };
export type Focus =
  | VehicleFocus
  /** Driver day at an exact moment (break, delivery, event). */
  | { kind: "time"; at: number; label: string; stop?: string }
  | {
      kind: "qualification";
      driver: string;
      qual: "licence" | "cpc" | "adr" | "tacho";
    }
  /** A transport revision field (document diff → transport narrative). */
  | { kind: "revision"; field: string }
  /** A delivery and the pallets that belong to it. */
  | { kind: "delivery"; stop: string }
  /** A restriction condition: related facts stay, others soften. */
  | { kind: "predicate"; fact: string };
export type VehiclePart = "firstAxle" | "axles" | "weight" | "height" | "body";
export type VehicleFocus = {
  kind: "vehicle";
  aspect: "load" | "restriction" | "fuel";
  part?: VehiclePart;
};
export type Rect = { x: number; y: number; width: number; height: number };
export type Zone = "jobs" | "fuel" | "resources" | "assurance";
export type GuidedLayout = {
  path: string;
  viewport: { width: number; height: number };
  zones: Partial<Record<Zone, Rect>>;
  map: MapPlacement;
  mode: MapMode;
  inlineFuel: boolean;
  inlineResources: boolean;
  composition: CompositionPlan;
  /** Entity compositions: free regions with a representation each (no fixed zones). */
  regions?: RegionPlacement[];
  recipe?: string;
};
export type GuidedFrame = {
  /** Tab owning the captured frame; geometry and map still belong to one canvas. */
  workspaceId?: string;
  state: GuidedState;
  layout: GuidedLayout;
  camera: MapCamera;
  scroll: Record<string, number>;
  transitionKey?: string;
};
export type GuidedAction =
  | { type: "work-return" }
  | { type: "work-task"; task: NonNullable<GuidedState["workTask"]> }
  | { type: "job-action"; id: string; action: GuidedAction }
  | { type: "scope-day" }
  | { type: "toggle"; domain: GuidedLens }
  | { type: "expand"; domain: GuidedLens }
  | { type: "job"; id: string }
  | { type: "fuel"; id: string }
  | { type: "document"; id: string }
  | { type: "restriction"; id: string }
  | { type: "resource"; id: string }
  | { type: "assign-truck"; id: string }
  | { type: "spatial"; intent: SpatialIntent }
  | { type: "filter"; value: GuidedState["filter"] }
  | { type: "map"; intent: "open" | "auto" | "expand" | "fit" | "segment" }
  | { type: "inspect"; takeover: Takeover }
  | { type: "stress" }
  | { type: "exception" }
  | { type: "stale-baseline" }
  | { type: "stage-stop"; id: string; from: string }
  | { type: "stage-reissue"; id: string }
  | { type: "commit" }
  | { type: "discard" }
  | { type: "attention"; id: string }
  | { type: "focus"; focus: Focus }
  | { type: "enter"; jobId: string; lead: GuidedLens; restriction?: string }
  /** Follow an operational object: it carries its identity into the domain that owns it. */
  | { type: "follow"; object: FleetObject }
  | { type: "facet"; domain: FacetDomain; facet: string }
  | { type: "edit"; kind: EditKind; target: string }
  | { type: "edit-close" }
  | { type: "propose"; proposal: Proposal }
  | { type: "map-exit" }
  /** Rail: bring a lens to the front (perspective); clicking the front lens removes it. */
  | { type: "lens"; domain: GuidedLens }
  /** Rail, content state: switch a lens's information on or off. Never changes what is main
   * (except that the first lens switched on becomes main, and removing the main promotes the next). */
  | { type: "content"; domain: GuidedLens }
  /** Rail, main state: make a lens the perspective the page is organised around. */
  | { type: "main"; domain: GuidedLens }
  /** Open an entity as the anchor: its lens becomes the base, active lenses stay as ordered layers. */
  | { type: "entity"; kind: EntityAnchorKind; id: string; job: string | null }
  | {
      /** A link that names an entity opens exactly that entity, never the previous selection. */
      type: "open";
      domain: GuidedLens;
      restriction?: string;
      document?: string;
      fuel?: string;
      focus?: VehicleFocus;
    };
export const initialGuidedState = (): GuidedState => ({
  anchor: { kind: "jobs" },
  active: [],
  lead: null,
  selection: { fuel: null, document: null, restriction: null, resource: null },
  assignment: { truck: null },
  selectionLog: [],
  spatial: { question: "MULTI_ENTITY", target: "job", source: "automatic" },
  filter: "all",
  mapIntent: "auto",
  takeover: null,
  exceptions: { driverTimeCritical: false },
  dev: { staleBaseline: false },
  pending: null,
  focus: null,
  planned: { stop: null },
  facet: {},
  edit: null,
  overrides: {},
  mapFull: false,
});
/** The lens the page is organised around, per anchor. */
export function mainLens(s: GuidedState): GuidedLens | null {
  if (isEntityAnchor(s.anchor)) return ANCHOR_LENS[s.anchor.kind];
  if (s.anchor.kind === "job") return s.lead ?? "Jobs";
  return s.lead ?? (s.active.includes("Jobs") ? "Jobs" : null);
}
const REAL_LENSES = (l: GuidedLens) =>
  l !== "Pricing DEV" && l !== "Compliance DEV";

/** Leaving an object changes perspective, not confirmed operational facts. */
function collectionState(previous: GuidedState): GuidedState {
  return {
    ...initialGuidedState(),
    overrides: structuredClone(previous.overrides),
    planned: structuredClone(previous.planned),
  };
}

/** Content: on/off. Main: perspective. Two states, two gestures. */
function railChange(
  prev: GuidedState,
  action: { type: "content" | "main"; domain: GuidedLens },
): GuidedState {
  const d = action.domain;
  const main = mainLens(prev);
  const a = prev.anchor;
  if (action.type === "main") {
    if (d === main) return prev;
    if (isEntityAnchor(a)) {
      // On an entity page, another main means looking at the related entity of that kind.
      const job = a.job;
      if (!job) return changeGuidedState(prev, { type: "content", domain: d });
      const ctx = demoContext(jobById(job), prev.assignment);
      if (d === "Jobs")
        return changeGuidedState(
          { ...prev, anchor: { kind: "jobs" } },
          { type: "enter", jobId: job, lead: ANCHOR_LENS[a.kind] },
        );
      const target: [EntityAnchorKind, string] | null =
        d === "Drivers"
          ? ["driver", ctx.driverId]
          : d === "Trucks"
            ? ["truck", ctx.truckId]
            : d === "Documents"
              ? ["document", ctx.documents[0].id]
              : d === "Restrictions"
                ? [
                    "restriction",
                    (prev.selection.restriction ??
                      ctx.restrictions[0]?.id) as string,
                  ]
                : d === "Fuel" && ctx.stops[0]
                  ? ["stop", prev.selection.fuel ?? ctx.stops[0].id]
                  : null;
      if (!target || !target[1]) return prev;
      return changeGuidedState(prev, {
        type: "entity",
        kind: target[0],
        id: target[1],
        job,
      });
    }
    const s = structuredClone(prev);
    s.takeover = null;
    s.edit = null;
    if (!s.active.includes(d)) s.active.push(d);
    if (a.kind === "jobs") s.active = [d, ...s.active.filter((l) => l !== d)];
    s.lead = d === "Jobs" ? null : d;
    normalizeSelections(s);
    s.spatial =
      a.kind === "jobs" ? initialGuidedState().spatial : defaultSpatial(s);
    s.mapIntent = "auto";
    return s;
  }
  // Content.
  // A shared task owns its participating set. Removing the domain associated
  // with the anchor does not change which records the remaining task examines.
  const rest = prev.active.filter((lens) => lens !== d);
  if (prev.active.includes(d) && sharedWork({ active: rest })) {
    const s = structuredClone(prev);
    TRANSITION_CONTRACTS.onLeave(s, d);
    s.focus = null;
    s.takeover = null;
    s.spatial = defaultSpatial(s);
    return s;
  }
  if (isEntityAnchor(a)) {
    if (d === main) {
      // Switching the entity's own lens off leaves the entity for the collection of what remains.
      const rest = prev.active.filter((l) => l !== d && REAL_LENSES(l));
      const s = collectionState(prev);
      s.active = rest;
      s.lead = rest[0] && rest[0] !== "Jobs" ? rest[0] : null;
      return s;
    }
    const s = structuredClone(prev);
    s.active = s.active.includes(d)
      ? s.active.filter((l) => l !== d)
      : [...s.active, d];
    s.focus = null;
    s.takeover = null;
    s.spatial = defaultSpatial(s);
    return s;
  }
  const s = structuredClone(prev);
  s.takeover = null;
  s.edit = null;
  s.focus = null;
  if (s.active.includes(d)) {
    if (a.kind === "job" && d === "Jobs") {
      // The transport is the page: switching it off returns to the operation with the other lenses.
      s.anchor = { kind: "jobs" };
      s.assignment.truck = null;
      s.pending = null;
      s.active = s.active.filter((l) => l !== "Jobs");
      s.lead = s.active.find(REAL_LENSES) ?? null;
      s.selection = {
        fuel: null,
        document: null,
        restriction: null,
        resource: null,
      };
      s.spatial = initialGuidedState().spatial;
      return s;
    }
    TRANSITION_CONTRACTS.onLeave(s, d);
    if (d === main) {
      const next = s.active.find(REAL_LENSES) ?? null;
      s.lead =
        a.kind === "job"
          ? next && next !== "Jobs"
            ? next
            : null
          : next && next !== "Jobs"
            ? next
            : null;
    }
    if (!s.active.length) return collectionState(s);
  } else {
    TRANSITION_CONTRACTS.onEnterAsSupport(s, d);
    // The first lens on the operation becomes its perspective.
    if (a.kind === "jobs" && !main) s.lead = d === "Jobs" ? null : d;
  }
  normalizeSelections(s);
  s.spatial =
    a.kind === "jobs"
      ? initialGuidedState().spatial
      : s.spatial.source === "user"
        ? s.spatial
        : defaultSpatial(s);
  s.mapIntent =
    s.spatial.source === "user" && s.spatial.question !== "NONE"
      ? "open"
      : "auto";
  return s;
}
/** Reducer without entity translation (used by the translation itself). */
function changeGuidedStateUnchecked(
  previous: GuidedState,
  action: GuidedAction,
): GuidedState {
  return changeGuidedState(previous, action, true);
}
export function changeGuidedState(
  previous: GuidedState,
  action: GuidedAction,
  raw = false,
): GuidedState {
  if (action.type === "job-action") {
    if (
      !JOBS.some((job) => job.id === action.id) ||
      action.action.type === "job-action"
    )
      return previous;
    return changeGuidedState(
      changeGuidedState(previous, { type: "job", id: action.id }),
      action.action,
    );
  }
  if (action.type === "work-task" || action.type === "work-return") {
    if (!sharedWork(previous)) return previous;
    const task =
      action.type === "work-task" ? action.task : (previous.workTask ?? "auto");
    if (
      !sharedWorkQuestions(previous).some((question) => question.value === task)
    )
      return previous;
    const next = structuredClone(previous);
    next.workTask = task;
    next.facet = {};
    next.focus = null;
    next.takeover = null;
    next.edit = null;
    next.workInspection = null;
    next.mapFull = previous.mapFull;
    next.spatial = defaultSpatial(next);
    next.mapIntent = "auto";
    return next;
  }
  if (action.type === "content" || action.type === "main")
    return railChange(previous, action);
  // On an entity page, instrument links speak entities (see entityTranslate).
  if (isEntityAnchor(previous.anchor) && !raw) {
    const translated = entityTranslate(previous, action);
    if (translated) return translated;
  }
  const s = structuredClone(previous);
  if (action.type === "scope-day") {
    s.anchor = { kind: "jobs" };
    s.assignment.truck = null;
    s.pending = null;
    s.edit = null;
    s.focus = null;
    s.takeover = null;
    s.facet = {};
    s.workInspection = null;
    s.mapFull = false;
    s.mapIntent = "auto";
    s.filter = "all";
    s.selection = {
      fuel: null,
      document: null,
      restriction: null,
      resource: null,
    };
    s.spatial = defaultSpatial(s);
    return s;
  }
  if (action.type === "spatial") {
    s.spatial = action.intent;
    s.mapIntent =
      action.intent.source === "user" && action.intent.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "entity") {
    const base = ANCHOR_LENS[action.kind];
    const previousBase = isEntityAnchor(s.anchor)
      ? ANCHOR_LENS[s.anchor.kind]
      : s.lead;
    s.anchor = { kind: action.kind, id: action.id, job: action.job };
    // The new entity's lens is the base; everything that was on stays on, in order.
    s.active = [
      base,
      ...s.active.filter(
        (l) => l !== base && (l !== "Jobs" || !!sharedWork(previous)),
      ),
    ];
    if (
      previousBase &&
      previousBase !== base &&
      previousBase !== "Jobs" &&
      !s.active.includes(previousBase)
    )
      s.active.push(previousBase);
    s.lead = base;
    s.takeover = null;
    s.edit = null;
    s.focus = null;
    s.facet = {};
    s.mapFull = false;
    // The opened object is the selection its instruments read.
    s.workInspection = null;
    s.selection = {
      fuel: action.kind === "stop" ? action.id : null,
      document: action.kind === "document" ? action.id : null,
      restriction: action.kind === "restriction" ? action.id : null,
      resource: null,
    };
    s.spatial = defaultSpatial(s);
    s.mapIntent = "auto";
    return s;
  }
  if (action.type === "lens" && isEntityAnchor(s.anchor)) {
    const d = action.domain;
    const base = ANCHOR_LENS[s.anchor.kind];
    s.takeover = null;
    s.edit = null;
    if (d === base) {
      // The base lens of an entity returns to its collection, keeping the layers.
      s.active = [base, ...s.active.filter((l) => l !== base)];
      s.anchor = { kind: "jobs" };
      s.lead = base;
      s.mapFull = false;
      s.selection = {
        fuel: null,
        document: null,
        restriction: null,
        resource: null,
      };
      s.spatial = initialGuidedState().spatial;
      return s;
    }
    // Any other lens is a layer: switching it on or off recomposes the entity.
    s.active = s.active.includes(d)
      ? s.active.filter((l) => l !== d)
      : [...s.active, d];
    s.focus = null;
    s.spatial = defaultSpatial(s);
    return s;
  }
  if (action.type === "lens") {
    const d = action.domain;
    // Operation level already follows the perspective rule.
    if (s.anchor.kind !== "job")
      return changeGuidedState(previous, { type: "toggle", domain: d });
    const front = s.lead ?? "Jobs";
    s.takeover = null;
    s.edit = null;
    s.focus = null;
    if (d === front) {
      if (d === "Jobs") {
        // The transport is the perspective: Transportes returns to every transport, keeping the lenses as context.
        s.anchor = { kind: "jobs" };
        s.assignment.truck = null;
        s.pending = null;
        s.lead = null;
        s.active = ["Jobs", ...s.active.filter((l) => l !== "Jobs")];
        s.selection = {
          fuel: null,
          document: null,
          restriction: null,
          resource: null,
        };
        s.spatial = initialGuidedState().spatial;
        s.mapIntent = "auto";
        return s;
      }
      TRANSITION_CONTRACTS.onLeave(s, d);
      const back = [...s.active]
        .reverse()
        .find(
          (l) => l !== "Jobs" && l !== "Pricing DEV" && l !== "Compliance DEV",
        );
      s.lead = back ?? null;
    } else {
      if (!s.active.includes(d)) s.active.push(d);
      if (!s.active.includes("Jobs")) s.active.unshift("Jobs");
      s.lead = d;
      normalizeSelections(s);
    }
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "map-exit") {
    s.mapFull = false;
    if (s.takeover && ["map", "segment"].includes(s.takeover.kind))
      s.takeover = null;
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    return s;
  }
  if (action.type === "map") {
    if (action.intent === "fit") return s;
    // Expanding is a physical state of the same workspace, not a page: it
    // survives lens changes until the operator leaves it (button or Esc).
    if (action.intent === "expand" || action.intent === "segment") {
      s.mapFull = true;
      s.takeover = null;
      // The canvas asks the lens's spatial question (a dot becomes the vehicle with its transport).
      if (s.spatial.source !== "user" && action.intent === "expand")
        s.spatial = defaultSpatial(s);
    } else {
      s.mapIntent = action.intent === "auto" ? "auto" : "open";
      s.spatial =
        action.intent === "auto"
          ? defaultSpatial(s)
          : {
              question: "USER_REQUESTED",
              target:
                s.selection.fuel &&
                (s.lead === "Drivers" || s.lead === "Trucks")
                  ? "stop"
                  : "job",
              source: "user",
            };
    }
    if (action.intent === "segment")
      s.spatial = {
        question: "AFFECTED_SEGMENT",
        target: "restriction",
        source: "user",
      };
    return s;
  }
  if (action.type === "inspect") {
    s.takeover = action.takeover;
    if (action.takeover.kind === "resource") {
      const c = demoContext(
        jobById(anchorJob(s.anchor) ?? "J-4217"),
        s.assignment,
      );
      s.selection.resource =
        action.takeover.domain === "Trucks" ? c.truckId : c.driverId;
    }
    if (action.takeover.kind === "segment" || action.takeover.kind === "map") {
      s.takeover = null;
      s.mapFull = true;
    }
    if (action.takeover.kind === "segment") {
      if (action.takeover.id) s.selection.restriction = action.takeover.id;
      s.spatial = {
        question: "AFFECTED_SEGMENT",
        target: "restriction",
        source: "user",
      };
    }
    if (action.takeover.kind === "station" && action.takeover.id)
      s.selection.fuel = action.takeover.id;
    if (action.takeover.kind === "document" && action.takeover.id)
      s.selection.document = action.takeover.id;
    normalizeSelections(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "enter") {
    // From an operation-wide domain view into one transport, keeping the domain as lead.
    const anchorChanged =
      s.anchor.kind !== "job" || s.anchor.id !== action.jobId;
    s.anchor = { kind: "job", id: action.jobId };
    if (anchorChanged) {
      s.assignment.truck = null;
      s.pending = null;
    }
    if (!s.active.includes(action.lead)) s.active.push(action.lead);
    if (!s.active.includes("Jobs")) s.active.unshift("Jobs");
    s.lead = action.lead;
    s.takeover = null;
    s.focus = null;
    normalizeSelections(s, anchorChanged);
    if (action.restriction) s.selection.restriction = action.restriction;
    s.spatial = defaultSpatial(s);
    s.mapIntent = "auto";
    return s;
  }
  if (action.type === "open") {
    if (!s.active.includes(action.domain)) s.active.push(action.domain);
    s.lead = action.domain;
    s.takeover = null;
    // A proposal survives following relationships: it is previewed wherever the operator looks.
    if (action.restriction) s.selection.restriction = action.restriction;
    if (action.document) s.selection.document = action.document;
    if (action.fuel) s.selection.fuel = action.fuel;
    s.focus = action.focus ?? null;
    normalizeSelections(s);
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "follow") {
    applyFollow(s, action.object);
    s.workInspection = null;
    s.takeover = null;
    s.edit = null;
    normalizeSelections(s);
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "facet") {
    // An explicit question opens its real instrument; the map instance and
    // captured spatial source stay alive for an exact return.
    s.mapFull = false;
    if (!s.active.includes(action.domain)) s.active.push(action.domain);
    s.lead = action.domain;
    (s.facet as Record<string, string>)[action.domain] = action.facet;
    if (
      action.domain === "Trucks" &&
      ["load", "restriction", "fuel"].includes(action.facet)
    )
      s.focus = {
        kind: "vehicle",
        aspect: action.facet as VehicleFocus["aspect"],
      };
    else s.focus = null;
    s.edit = null;
    s.takeover = null;
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "edit") {
    // Spatial summary inspectors cannot host editors. Recompose around the
    // owning instrument rather than hiding an active edit behind the map.
    s.mapFull = false;
    const home = EDIT_HOME[action.kind];
    if (!s.active.includes(home.domain)) s.active.push(home.domain);
    s.lead = home.domain;
    const facets = s.facet as Record<string, string>;
    s.edit = {
      kind: action.kind,
      target: action.target,
      returnFacet: facets[home.domain],
    };
    facets[home.domain] = home.facet;
    if (home.focus) s.focus = home.focus;
    if (s.pending && s.pending.kind !== action.kind) s.pending = null;
    s.takeover = null;
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.mapIntent =
      s.spatial.source === "user" && s.spatial.question !== "NONE"
        ? "open"
        : "auto";
    return s;
  }
  if (action.type === "edit-close") {
    closeEdit(s);
    if (s.pending && s.pending.kind !== "stop" && s.pending.kind !== "reissue")
      s.pending = null;
    return s;
  }
  if (action.type === "propose") {
    const p = action.proposal;
    // Proposing the current value is not a change: the bar disappears.
    s.pending = p.to !== undefined && p.to === p.from ? null : p;
    return s;
  }
  if (action.type === "focus") {
    if (action.focus.kind === "predicate") {
      if (!s.active.includes("Restrictions")) s.active.push("Restrictions");
      s.lead = "Restrictions";
      s.facet.Restrictions = "logic";
      s.focus = action.focus;
      s.takeover = null;
      if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
      return s;
    }
    // A predicate or question focuses the physical vehicle; the restriction stays active.
    if (!s.active.includes("Trucks")) s.active.push("Trucks");
    s.lead = "Trucks";
    s.focus = action.focus;
    if (action.focus.kind === "vehicle") s.facet.Trucks = action.focus.aspect;
    s.takeover = null;
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    return s;
  }
  if (action.type === "stale-baseline") {
    s.dev.staleBaseline = !s.dev.staleBaseline;
    return s;
  }
  if (action.type === "stage-stop") {
    s.pending =
      action.id === action.from
        ? null
        : { kind: "stop", id: action.id, from: action.from };
    s.selection.fuel = action.id;
    normalizeSelections(s);
    return s;
  }
  if (action.type === "stage-reissue") {
    s.pending = { kind: "reissue", id: action.id, from: action.id };
    return s;
  }
  if (action.type === "commit") {
    const p = s.pending;
    if (p?.kind === "stop") s.planned.stop = p.id;
    else if (p?.kind === "reissue") s.overrides[`reissue:${p.id}`] = "1";
    else if (p) {
      s.overrides[`${p.kind}:${p.id}`] = p.to ?? "1";
      // A new resource invalidates focus bound to the previous one.
      if (["trailer", "truck", "driver"].includes(p.kind)) s.focus = null;
    }
    s.pending = null;
    closeEdit(s);
    normalizeSelections(s);
    return s;
  }
  if (action.type === "discard") {
    if (s.pending?.kind === "stop") s.selection.fuel = s.pending.from;
    s.pending = null;
    closeEdit(s);
    return s;
  }
  if (action.type === "attention") {
    const item = ATTENTION.find((a) => a.id === action.id);
    if (!item) return s;
    const anchorChanged = s.anchor.kind !== "job" || s.anchor.id !== item.jobId;
    s.anchor = { kind: "job", id: item.jobId };
    if (anchorChanged) s.assignment.truck = null;
    s.active = [...item.lenses];
    s.lead = item.lead === "Jobs" ? "Jobs" : item.lead;
    s.takeover = null;
    s.pending = null;
    normalizeSelections(s, anchorChanged);
    s.spatial = defaultSpatial(s);
    s.mapIntent = "auto";
    return s;
  }
  if (action.type === "exception") {
    s.exceptions.driverTimeCritical = !s.exceptions.driverTimeCritical;
    if (s.exceptions.driverTimeCritical && !s.active.includes("Drivers"))
      s.active.push("Drivers");
    return s;
  }
  if (action.type === "stress") {
    s.active = [
      "Jobs",
      "Fuel",
      "Drivers",
      "Trucks",
      "Documents",
      "Restrictions",
      "Pricing DEV",
      "Compliance DEV",
    ];
    if (s.anchor.kind !== "job") {
      s.anchor = { kind: "job", id: "J-4217" };
      normalizeSelections(s, true);
    }
    // Eight lenses need a question to support: keep the current lead or lead with the driver's day.
    s.lead = s.lead ?? "Drivers";
    if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    s.takeover = null;
    return s;
  }
  // Workspace actions intentionally leave any temporary inspection. Esc uses
  // its captured frame, never a guessed default layout.
  s.takeover = null;
  if (!["fuel", "document", "restriction", "resource"].includes(action.type))
    s.focus = null;
  if (action.type === "job" || action.type === "toggle") s.edit = null;
  if (action.type === "toggle") {
    const open = s.active.includes(action.domain);
    if (open) TRANSITION_CONTRACTS.onLeave(s, action.domain);
    else TRANSITION_CONTRACTS.onEnterAsSupport(s, action.domain);
    // Removing a lens does not destroy the selected transport anchor.
    if (s.active.length === 0) {
      s.anchor = { kind: "jobs" };
      s.lead = null;
      s.selection = {
        fuel: null,
        document: null,
        restriction: null,
        resource: null,
      };
      s.spatial = initialGuidedState().spatial;
      s.mapIntent = "auto";
    }
    // Operation level (no transport anchored): there is no question to support yet,
    // so the lens just clicked becomes the perspective and the others annotate it.
    // Removing the perspective falls back to the most recent remaining lens.
    if (s.anchor.kind === "jobs" && s.active.length) {
      const next = open
        ? s.lead === action.domain || !s.lead
          ? (s.active.at(-1) ?? null)
          : s.lead
        : action.domain;
      s.lead = next === "Jobs" ? null : next;
      s.spatial = initialGuidedState().spatial;
    }
    // A single lens on a selected transport has no other question to support:
    // it becomes the lead, so its full instrument (not a support column) answers.
    const lenses = s.active.filter((l) => l !== "Jobs");
    if (
      !s.lead &&
      s.anchor.kind === "job" &&
      !s.active.includes("Jobs") &&
      lenses.length === 1
    ) {
      s.lead = lenses[0];
      if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
    }
  } else if (action.type === "expand") {
    s.workInspection = action.domain;
    TRANSITION_CONTRACTS.onBecomeLead(s, action.domain);
  } else if (action.type === "job") {
    s.workInspection = null;
    const anchorChanged = s.anchor.kind !== "job" || s.anchor.id !== action.id;
    s.anchor = { kind: "job", id: action.id };
    if (anchorChanged) {
      s.assignment.truck = null;
      s.pending = null;
    }
    normalizeSelections(s, anchorChanged);
    if (!s.active.includes("Jobs") && !sharedWork(s)) s.active.push("Jobs");
    s.lead = null;
    s.spatial = defaultSpatial(s);
    s.mapIntent = "auto";
  } else if (action.type === "assign-truck") {
    s.assignment.truck = action.id;
    normalizeSelections(s);
    if (
      s.spatial.source === "automatic" ||
      (s.spatial.target === "stop" && !s.selection.fuel)
    )
      s.spatial = defaultSpatial(s);
  } else if (action.type === "fuel") {
    s.selection.fuel = action.id;
    if (
      s.spatial.source === "automatic" &&
      (s.lead === "Drivers" || s.lead === "Trucks")
    )
      s.spatial = defaultSpatial(s);
  } else if (action.type === "document") s.selection.document = action.id;
  else if (action.type === "restriction") s.selection.restriction = action.id;
  else if (action.type === "resource") s.selection.resource = action.id;
  else s.filter = action.value;
  if (["fuel", "document", "restriction", "resource"].includes(action.type))
    normalizeSelections(s);
  s.mapIntent =
    s.spatial.source === "user" && s.spatial.question !== "NONE"
      ? "open"
      : "auto";
  return s;
}
function closeEdit(s: GuidedState) {
  if (!s.edit) return;
  const home = EDIT_HOME[s.edit.kind];
  const facets = s.facet as Record<string, string | undefined>;
  if (s.edit.returnFacet) facets[home.domain] = s.edit.returnFacet;
  else delete facets[home.domain];
  s.edit = null;
  if (s.spatial.source !== "user") s.spatial = defaultSpatial(s);
}
/**
 * Instrument links were written for the transport workspace. On an entity page
 * every link must still have a visible consequence:
 * - a named object opens its own entity page (the same object drops the layers);
 * - physical facts, fuel, maintenance and alternatives open the entity that owns them;
 * - questions whose home is the transport (deliveries, revisions, qualifications,
 *   lens opens and edits the page cannot host) open the transport with that focus;
 * - «open map» turns the page into its spatial composition.
 */
function entityTranslate(
  prev: GuidedState,
  action: GuidedAction,
): GuidedState | null {
  const a = prev.anchor as Extract<Anchor, { kind: EntityAnchorKind }>;
  const job = a.job;
  const go = (
    kind: EntityAnchorKind,
    id: string,
    extra?: (s: GuidedState) => void,
  ) => {
    let s: GuidedState;
    if (kind === a.kind && id === a.id) {
      // Following the page's own object returns to its base composition.
      s = structuredClone(prev);
      s.active = [ANCHOR_LENS[a.kind]];
      s.mapFull = false;
      s.focus = null;
      s.facet = {};
      s.spatial = defaultSpatial(s);
    } else s = changeGuidedState(prev, { type: "entity", kind, id, job });
    extra?.(s);
    if (extra) s.spatial = defaultSpatial(s);
    return s;
  };
  const toTransport = (then: GuidedAction) => {
    if (!job) return null;
    const lead = ANCHOR_LENS[a.kind];
    let s = changeGuidedState(
      { ...prev, anchor: { kind: "jobs" } },
      { type: "enter", jobId: job, lead },
    );
    s = changeGuidedState(s, then);
    return s;
  };
  const truckId = job
    ? demoContext(jobById(job), prev.assignment).truckId
    : null;
  if (action.type === "follow") {
    const o = action.object;
    switch (o.kind) {
      case "driver":
      case "truck":
      case "trailer":
      case "document":
      case "restriction":
      case "stop":
        return go(o.kind, o.id);
      case "segment":
        return go("restriction", o.id);
      case "alternative":
        return go("restriction", o.id, (s) => {
          s.mapFull = true;
        });
      case "break":
        return go("stop", o.stop);
      case "range":
        return job === "J-4217" ? go("stop", "F-07") : null;
      case "fact":
        return truckId
          ? go("truck", truckId, (s) => {
              s.facet = { Trucks: "restriction" };
              s.focus = {
                kind: "vehicle",
                aspect: "restriction",
                part: o.part,
              };
            })
          : null;
      case "fuel":
        return truckId
          ? go("truck", truckId, (s) => void (s.facet = { Trucks: "fuel" }))
          : null;
      case "maintenance":
        return go(
          "truck",
          o.id,
          (s) => void (s.facet = { Trucks: "maintenance" }),
        );
      case "time":
        return null;
      default:
        return toTransport(action);
    }
  }
  if (action.type === "open") return toTransport(action);
  if (action.type === "inspect") return toTransport(action);
  if (action.type === "edit") {
    if (EDIT_HOME[action.kind].domain !== ANCHOR_LENS[a.kind])
      return toTransport(action);
    // The page's own instrument hosts its editors: return to the base composition, then edit.
    const base = structuredClone(prev);
    base.active = [ANCHOR_LENS[a.kind]];
    base.mapFull = false;
    return changeGuidedStateUnchecked(base, action);
  }
  // Choosing a stop inside a journey opens the stop.
  if (action.type === "fuel") return go("stop", action.id);
  if (
    action.type === "map" &&
    (action.intent === "open" || action.intent === "expand")
  ) {
    const s = structuredClone(prev);
    s.mapFull = true;
    s.spatial = defaultSpatial(s);
    return s;
  }
  if (
    action.type === "lens" &&
    action.domain === "Jobs" &&
    job &&
    a.kind !== "restriction"
  )
    return toTransport({ type: "expand", domain: ANCHOR_LENS[a.kind] });
  return null;
}
/** Grammar selects structure; content demand computes the continuous geometry. */
export function guidedLayout(
  state: GuidedState,
  width: number,
  height: number,
): GuidedLayout {
  return composeWorkspace(state, width, height);
}
export function guidedMapScene(state: GuidedState): MapScene {
  if (!state.active.length && state.anchor.kind !== "jobs")
    return {
      routes: [],
      driver: null,
      fuel: null,
      segment: [],
      showSegment: false,
    };
  return spatialGeometry(state).scene;
}
export function guidedCamera(
  state: GuidedState,
  layout: GuidedLayout,
): CameraTarget {
  if (
    !state.active.length &&
    layout.map.visible &&
    state.anchor.kind !== "jobs" &&
    !state.mapFull
  )
    return { kind: "restore", camera: INITIAL_CAMERA };
  const target = spatialCamera(state);
  // A north/south corridor needs a different orientation in a wide, shallow
  // working strip. Use its recorded extent, rather than fitting all of Europe.
  if (
    target.kind === "scene" &&
    layout.composition.shared &&
    layout.map.width / layout.map.height > 2.1 &&
    target.points.length > 1
  ) {
    const latitudes = target.points.map((p) => p[1]),
      longitudes = target.points.map((p) => p[0]);
    const northSouth = Math.max(...latitudes) - Math.min(...latitudes);
    const eastWest =
      (Math.max(...longitudes) - Math.min(...longitudes)) *
      Math.cos(
        (((Math.max(...latitudes) + Math.min(...latitudes)) / 2) * Math.PI) /
          180,
      );
    if (northSouth > eastWest * 1.3) target.bearing = 90;
  }
  // In spatial mode the camera frames the question in the space the inspectors leave free.
  return target.kind === "scene" && layout.map.inset
    ? { ...target, inset: layout.map.inset }
    : target;
}
