import { dataShape } from "./representationLibrary";
import {
  BASE_VARIABLES,
  composeWorkspace,
  type CompositionVariables,
  type MapCamera,
  type SemanticIntent,
} from "./composition";
import { labSurfaceRequests, type LabSurface } from "./labSurfaces";
import {
  createWorkspaceSpace,
  type Bounds,
  type Size,
  type WorkspaceSpace,
} from "./workspaceGeometry";
import { labChrome } from "./labGeometry";
import {
  applyTopology,
  composeRepresentations,
  type Topology,
  type TopologyOperation,
  type MapMode,
} from "./representationEngine";

/** Identity and visual demand only. These shells never access operational services. */
export const DOMAINS = [
  "Jobs",
  "Drivers",
  "Trucks",
  "Fuel",
  "Restrictions",
  "Documents",
] as const;
export type Domain = (typeof DOMAINS)[number];
export const INITIAL_DOMAINS: readonly LabSurface[] = DOMAINS.map((id) => ({
  id,
  enabled: false,
  state: "active",
  demand: 0.5,
  prominence: 0.2,
  priority: 34,
  width: 0.24,
  height: 0.28,
  x: 0.5,
  y: 0.5,
  affinity: "balanced",
  grouped: false,
}));
export type LivingSnapshot = {
  intent: SemanticIntent;
  variables: CompositionVariables;
  surfaces: LabSurface[];
  focus: Domain | null;
  explorerOpen: boolean;
  reference: boolean;
  topology?: Topology;
};
export type FocusFrame = { snapshot: LivingSnapshot; camera: MapCamera };
export type CameraTarget =
  | { kind: "focus"; domain: Domain }
  | { kind: "mode"; mode: MapMode; insetRight?: number }
  | { kind: "restore"; camera: MapCamera };
export type LivingState = LivingSnapshot & {
  history: FocusFrame[];
  cameraRequest: { revision: number; target: CameraTarget } | null;
};
export function initialLivingState(): LivingState {
  return {
    intent: "BALANCED",
    variables: { ...BASE_VARIABLES },
    surfaces: INITIAL_DOMAINS.map((s) => ({ ...s })),
    focus: null,
    explorerOpen: false,
    reference: true,
    history: [],
    cameraRequest: null,
  };
}
export function toggleDomain(state: LivingState, domain: Domain): LivingState {
  if (state.focus === domain && state.history.length) {
    const restored = leaveFocus(state);
    return {
      ...restored,
      surfaces: restored.surfaces.map((s) =>
        s.id === domain ? { ...s, enabled: false } : s,
      ),
    };
  }
  return {
    ...state,
    surfaces: state.surfaces.map((s) =>
      s.id === domain ? { ...s, enabled: !s.enabled, state: "active" } : s,
    ),
  };
}
export function snapshotLiving(state: LivingSnapshot): LivingSnapshot {
  return structuredClone({
    intent: state.intent,
    variables: state.variables,
    surfaces: state.surfaces,
    focus: state.focus,
    explorerOpen: state.explorerOpen,
    reference: state.reference,
    ...(state.topology ? { topology: state.topology } : {}),
  });
}
/** Snapshots are actual states and camera values, including interruption halfway through a focus. */
export function enterFocus(
  state: LivingState,
  domain: Domain,
  camera: MapCamera,
  continuity?: Topology["continuity"],
): LivingState {
  if (state.focus === domain) return state;
  if (state.topology) {
    const next = applyTopology(
      {
        ...snapshotLiving(state),
        topology: {
          ...state.topology,
          continuity: continuity ?? state.topology.continuity,
        },
      },
      { type: "CONTENT_FOCUS", actor: domain },
    );
    next.focus = domain;
    next.topology!.focusIsolation = true;
    next.reference = false;
    next.topology!.depth = (state.topology.depth ?? 0) + 1;
    next.topology!.facts = {
      ...next.topology!.facts,
      [domain]: {
        ...dataShape(domain, next.topology!.facts?.[domain]),
        selected:
          next.topology!.facts?.[domain]?.selected ?? `DEMO-${domain[0]}01`,
        detail: Math.max(0.65, next.topology!.facts?.[domain]?.detail ?? 0.5),
      },
    };
    return {
      ...next,
      history: [
        ...state.history,
        { snapshot: snapshotLiving(state), camera: structuredClone(camera) },
      ],
      cameraRequest: {
        revision: (state.cameraRequest?.revision ?? 0) + 1,
        target: { kind: "mode", mode: next.topology!.mapMode },
      },
    };
  }
  const document = domain === "Documents",
    fullscreen = domain === "Drivers";
  const intent: SemanticIntent = document
    ? "DOCUMENT_TAKEOVER"
    : fullscreen
      ? "MAP_FOCUS"
      : domain === "Jobs"
        ? "JOB_FOCUS"
        : domain === "Fuel"
          ? "FUEL_CONTEXT"
          : "CONTEXT_MAP";
  const variables: CompositionVariables = {
    ...state.variables,
    mapWidth: fullscreen ? 1 : 0.7,
    mapHeight: fullscreen ? 1 : 0.76,
    mapX: 0.5,
    mapY: 0.5,
    biasX: 0,
    biasY: 0,
    reservedLeft: 0,
    reservedRight: 0,
    reservedTop: 0,
    reservedBottom: 0,
    pressureLeft: 0,
    pressureRight: 0,
    pressureTop: 0,
    pressureBottom: 0,
    margin: fullscreen ? 0 : 24,
    radius: fullscreen ? 0 : 26,
    dominance: fullscreen ? 1 : 0.1,
    visible: !document,
  };
  const surfaces = state.surfaces.map((s) => ({
    ...s,
    enabled: s.enabled || s.id === domain,
    state: (s.id === domain && !fullscreen
      ? "active"
      : "suspended") as LabSurface["state"],
    ...(s.id === domain
      ? {
          priority: 90,
          prominence: document ? 0.85 : 0.35,
          demand: 0.5,
          width: document ? 0.57 : 0.24,
          height: document ? 0.9 : 0.3,
          x: 0.5,
          y: 0.5,
        }
      : {}),
  }));
  return {
    ...state,
    intent,
    variables,
    surfaces,
    focus: domain,
    explorerOpen: false,
    reference: false,
    history: [
      ...state.history,
      { snapshot: snapshotLiving(state), camera: structuredClone(camera) },
    ],
    cameraRequest: {
      revision: (state.cameraRequest?.revision ?? 0) + 1,
      target: { kind: "focus", domain },
    },
  };
}
export function leaveFocus(state: LivingState): LivingState {
  const frame = state.history.at(-1);
  if (!frame) return state;
  return {
    ...snapshotLiving(frame.snapshot),
    history: state.history.slice(0, -1),
    cameraRequest: {
      revision: (state.cameraRequest?.revision ?? 0) + 1,
      target: { kind: "restore", camera: structuredClone(frame.camera) },
    },
  };
}
export function transitionTopology(
  state: LivingState,
  operation: TopologyOperation,
  camera: MapCamera,
  continuity?: Topology["continuity"],
): LivingState {
  const next = applyTopology(
    continuity && state.topology
      ? {
          ...snapshotLiving(state),
          topology: { ...state.topology, continuity },
        }
      : snapshotLiving(state),
    operation,
  );
  if (JSON.stringify(next) === JSON.stringify(snapshotLiving(state)))
    return state;
  return {
    ...next,
    reference: false,
    history: [
      ...state.history,
      { snapshot: snapshotLiving(state), camera: structuredClone(camera) },
    ],
    cameraRequest: {
      revision: (state.cameraRequest?.revision ?? 0) + 1,
      target: { kind: "mode", mode: next.topology!.mapMode },
    },
  };
}
export function domainRequests(state: LivingSnapshot, bounds: Bounds) {
  return labSurfaceRequests(state.surfaces, bounds).map((request) => {
    // A paper-shaped takeover is a size preference, not a fixed screen slot.
    if (state.focus === "Documents" && request.id === "Documents") {
      const width = Math.min(740, bounds.width),
        height = Math.min(bounds.height, width * 1.3);
      return {
        ...request,
        prominence: 0.7,
        minSize: {
          width: Math.min(320, bounds.width),
          height: Math.min(400, bounds.height),
        },
        preferredSize: { width, height },
        maxSize: { width, height },
        desiredBounds: {
          x: bounds.x + (bounds.width - width) / 2,
          y: bounds.y + (bounds.height - height) / 2,
          width,
          height,
        },
      };
    }
    return request;
  });
}
/** Keep the map's geometry when context minimums fit. If every active context
 * would be lost, negotiate priority and run the same allocator again. Explicit
 * map dominance and pressure still allow suspension. No domain slots. */
export function composeLivingWorkspace(
  state: LivingSnapshot,
  size: Size,
  suppliedSpace?: WorkspaceSpace,
) {
  const space =
    suppliedSpace ??
    createWorkspaceSpace(
      size,
      labChrome(size, state.explorerOpen),
      state.variables.margin,
    );
  if (state.topology) return composeRepresentations(state, size, space);
  const requests = domainRequests(state, space.usableWorkspaceBounds);
  const first = composeWorkspace(state.intent, state.variables, size, {
    space,
    surfaces: requests,
  });
  const active = requests.filter((r) => r.state === "active");
  const supportVisible = active.some(
    (r) => first.surfaces.find((s) => s.id === r.id)?.bounds,
  );
  if (
    active.length &&
    !supportVisible &&
    first.map.visible &&
    state.variables.dominance < 0.5 &&
    !first.protectedRegions.length
  ) {
    return {
      ...composeWorkspace(state.intent, state.variables, size, {
        space,
        surfaces: requests.map((r) =>
          r.state === "active"
            ? { ...r, priority: Math.max(61, r.priority) }
            : r,
        ),
      }),
      contextNegotiated: true,
    };
  }
  return { ...first, contextNegotiated: false };
}
export const SYNTHETIC_ROUTE: [number, number][] = [
  [-9.18, 38.73],
  [-8.95, 39.05],
  [-8.55, 39.52],
  [-8.43, 40.18],
  [-8.53, 40.64],
  [-8.62, 41.16],
];
export const SYNTHETIC_FUEL: [number, number] = [-8.55, 39.52];
export const SYNTHETIC_DRIVER: [number, number] = [-8.62, 41.16];
export const SYNTHETIC_SEGMENT: [number, number][] = [
  [-8.43, 40.18],
  [-8.53, 40.64],
];
/** Shared CSS/camera easing, monotone and bounded; retarget from the rendered value. */
export function motionProgress(
  t: number,
  easing: CompositionVariables["easing"] = "controlled",
) {
  const p = Math.max(0, Math.min(1, t));
  if (p === 0 || p === 1 || easing === "linear") return p;
  const curves = {
    controlled: [0.22, 1, 0.36, 1],
    snappy: [0.2, 0.8, 0.2, 1],
    gentle: [0.4, 0, 0.2, 1],
  } as const;
  const [x1, y1, x2, y2] = curves[easing];
  const bezier = (u: number, a: number, b: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let low = 0,
    high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (bezier(mid, x1, x2) < p) low = mid;
    else high = mid;
  }
  return bezier((low + high) / 2, y1, y2);
}
export function interpolateCamera(
  from: MapCamera,
  to: MapCamera,
  progress: number,
): MapCamera {
  const p = Math.max(0, Math.min(1, progress)),
    mix = (a: number, b: number) => a + (b - a) * p;
  const bearingDelta = ((to.bearing - from.bearing + 540) % 360) - 180;
  return {
    center: [
      mix(from.center[0], to.center[0]),
      mix(from.center[1], to.center[1]),
    ],
    zoom: mix(from.zoom, to.zoom),
    bearing: p === 1 ? to.bearing : from.bearing + bearingDelta * p,
    pitch: mix(from.pitch, to.pitch),
    padding: {
      top: mix(from.padding.top, to.padding.top),
      right: mix(from.padding.right, to.padding.right),
      bottom: mix(from.padding.bottom, to.padding.bottom),
      left: mix(from.padding.left, to.padding.left),
    },
  };
}
