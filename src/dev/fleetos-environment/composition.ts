import { labChrome } from "./labGeometry";
import {
  allocateWorkspace,
  clamp,
  createWorkspaceSpace,
  type ProtectedRegion,
  type WorkspaceAllocation,
  type WorkspaceSpace,
  type WorkspaceSurface,
} from "./workspaceGeometry";

/** Semantic intent chooses policy. Continuous values choose the actual composition. */
export type MapPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  opacity: number;
  visible: boolean;
};
export type MapCamera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  padding: { top: number; right: number; bottom: number; left: number };
};
export const INITIAL_CAMERA: MapCamera = {
  center: [-5, 39.7],
  zoom: 5.35,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};
export type CanvasSize = { width: number; height: number };
export const EASINGS = {
  controlled: "cubic-bezier(0.22, 1, 0.36, 1)",
  snappy: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  gentle: "cubic-bezier(0.4, 0, 0.2, 1)",
  linear: "linear",
} as const;
export type CompositionVariables = {
  mapWidth: number;
  mapHeight: number;
  mapX: number;
  mapY: number;
  reservedLeft: number;
  reservedRight: number;
  reservedTop: number;
  reservedBottom: number;
  pressureLeft: number;
  pressureRight: number;
  pressureTop: number;
  pressureBottom: number;
  biasX: number;
  biasY: number;
  margin: number;
  radius: number;
  visible: boolean;
  dominance: number;
  density: number;
  duration: number;
  easing: keyof typeof EASINGS;
};
export const BASE_VARIABLES: Readonly<CompositionVariables> = Object.freeze({
  mapWidth: 0.62,
  mapHeight: 0.62,
  mapX: 0.5,
  mapY: 0.5,
  reservedLeft: 0,
  reservedRight: 0,
  reservedTop: 0,
  reservedBottom: 0,
  pressureLeft: 0,
  pressureRight: 0,
  pressureTop: 0,
  pressureBottom: 0,
  biasX: 0,
  biasY: 0,
  margin: 24,
  radius: 28,
  visible: true,
  dominance: 0,
  density: 0.5,
  duration: 320,
  easing: "controlled",
});

// Future semantic adapters contain composition intent only. No domain data or workflows.
const POLICIES = {
  BALANCED: {
    pressureGain: 1,
    focusGain: 1,
    defaultFocus: 0,
    defaultVisible: true,
  },
  CONTEXT_MAP: {
    pressureGain: 1.2,
    focusGain: 0.8,
    defaultFocus: 0,
    defaultVisible: true,
  },
  MAP_FOCUS: {
    pressureGain: 0.7,
    focusGain: 1.2,
    defaultFocus: 0.85,
    defaultVisible: true,
  },
  CONTENT_TAKEOVER: {
    pressureGain: 1.3,
    focusGain: 0.8,
    defaultFocus: 0,
    defaultVisible: false,
  },
  JOB_FOCUS: {
    pressureGain: 0.9,
    focusGain: 1.1,
    defaultFocus: 0.3,
    defaultVisible: true,
  },
  DRIVER_FOCUS: {
    pressureGain: 1,
    focusGain: 1,
    defaultFocus: 0.2,
    defaultVisible: true,
  },
  FUEL_CONTEXT: {
    pressureGain: 1.15,
    focusGain: 0.9,
    defaultFocus: 0.1,
    defaultVisible: true,
  },
  DOCUMENT_TAKEOVER: {
    pressureGain: 1.3,
    focusGain: 0.8,
    defaultFocus: 0,
    defaultVisible: false,
  },
} as const;
export type SemanticIntent = keyof typeof POLICIES;
export const LAB_INTENTS = [
  { id: "BALANCED", label: "Balanced" },
  { id: "CONTEXT_MAP", label: "Contextual" },
  { id: "MAP_FOCUS", label: "Dominant" },
  { id: "CONTENT_TAKEOVER", label: "Content takeover" },
] as const;
export type NumericVariable = Exclude<
  keyof CompositionVariables,
  "visible" | "easing"
>;
export type ParameterDefinition = {
  key: NumericVariable;
  label: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  unit: string;
};
export const PARAMETER_GROUPS: {
  label: string;
  parameters: ParameterDefinition[];
}[] = [
  {
    label: "Geometria do mapa",
    parameters: [
      {
        key: "mapWidth",
        label: "Largura do mapa",
        min: 16,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "mapHeight",
        label: "Altura do mapa",
        min: 16,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "mapX",
        label: "Posição X",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "mapY",
        label: "Posição Y",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "radius",
        label: "Raio dos cantos",
        min: 0,
        max: 64,
        step: 1,
        scale: 1,
        unit: "px",
      },
    ],
  },
  {
    label: "Espaço reservado",
    parameters: [
      {
        key: "reservedLeft",
        label: "Reserva à esquerda",
        min: 0,
        max: 45,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "reservedRight",
        label: "Reserva à direita",
        min: 0,
        max: 45,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "reservedTop",
        label: "Reserva no topo",
        min: 0,
        max: 45,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "reservedBottom",
        label: "Reserva na base",
        min: 0,
        max: 45,
        step: 1,
        scale: 100,
        unit: "%",
      },
    ],
  },
  {
    label: "Pressão de futuras superfícies",
    parameters: [
      {
        key: "pressureLeft",
        label: "Pressão à esquerda",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "pressureRight",
        label: "Pressão à direita",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "pressureTop",
        label: "Pressão no topo",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "pressureBottom",
        label: "Pressão na base",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
    ],
  },
  {
    label: "Equilíbrio e presença",
    parameters: [
      {
        key: "biasX",
        label: "Bias horizontal",
        min: -100,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "biasY",
        label: "Bias vertical",
        min: -100,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "margin",
        label: "Margem exterior",
        min: 0,
        max: 96,
        step: 1,
        scale: 1,
        unit: "px",
      },
      {
        key: "dominance",
        label: "Dominância do mapa",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "density",
        label: "Densidade do layout",
        min: 0,
        max: 100,
        step: 1,
        scale: 100,
        unit: "%",
      },
      {
        key: "duration",
        label: "Duração da transição",
        min: 0,
        max: 800,
        step: 10,
        scale: 1,
        unit: "ms",
      },
    ],
  },
];
export function constrainVariables(
  input: CompositionVariables,
): CompositionVariables {
  const values = { ...input };
  for (const { parameters } of PARAMETER_GROUPS)
    for (const p of parameters) {
      values[p.key] = clamp(
        Number.isFinite(values[p.key]) ? values[p.key] : BASE_VARIABLES[p.key],
        p.min / p.scale,
        p.max / p.scale,
      );
    }
  if (!(values.easing in EASINGS)) values.easing = BASE_VARIABLES.easing;
  return values;
}
export function chooseIntent(
  intent: SemanticIntent,
  values: CompositionVariables,
): CompositionVariables {
  return {
    ...values,
    dominance: POLICIES[intent].defaultFocus,
    visible: POLICIES[intent].defaultVisible,
  };
}
export type EnvironmentComposition = WorkspaceAllocation & {
  map: MapPlacement;
  frame: WorkspaceSpace["usableWorkspaceBounds"];
  allocated: { left: number; right: number; top: number; bottom: number };
  constrained: boolean;
};

/** Map demand is a generic surface request; the allocator owns every occupied/free region. */
export function composeWorkspace(
  intent: SemanticIntent,
  input: CompositionVariables,
  size: CanvasSize,
  options: {
    surfaces?: WorkspaceSurface[];
    chrome?: ProtectedRegion[];
    space?: WorkspaceSpace;
  } = {},
): EnvironmentComposition {
  const v = constrainVariables(input),
    policy = POLICIES[intent];
  const space =
    options.space ??
    createWorkspaceSpace(size, options.chrome ?? labChrome(size), v.margin);
  const frame = space.usableWorkspaceBounds;
  const minSize = {
    width: Math.min(240, frame.width),
    height: Math.min(180, frame.height),
  };
  const breathing = (1 - v.density) * 24;
  const inset = (reserve: number, pressure: number, axis: number) =>
    reserve * axis +
    pressure * axis * 0.34 * policy.pressureGain +
    (reserve || pressure ? breathing : 0);
  const requests = {
    left: inset(v.reservedLeft, v.pressureLeft, frame.width),
    right: inset(v.reservedRight, v.pressureRight, frame.width),
    top: inset(v.reservedTop, v.pressureTop, frame.height),
    bottom: inset(v.reservedBottom, v.pressureBottom, frame.height),
  };
  const budgetX = Math.min(
    1,
    (frame.width - minSize.width) / Math.max(1, requests.left + requests.right),
  );
  const budgetY = Math.min(
    1,
    (frame.height - minSize.height) /
      Math.max(1, requests.top + requests.bottom),
  );
  const allocated = {
    left: requests.left * budgetX,
    right: requests.right * budgetX,
    top: requests.top * budgetY,
    bottom: requests.bottom * budgetY,
  };
  const middleWidth = frame.width - allocated.left - allocated.right;
  const protectedRegions: ProtectedRegion[] = [
    {
      id: "left-reservation",
      kind: "reserved-demand",
      bounds: {
        x: frame.x,
        y: frame.y,
        width: allocated.left,
        height: frame.height,
      },
    },
    {
      id: "right-reservation",
      kind: "reserved-demand",
      bounds: {
        x: frame.x + frame.width - allocated.right,
        y: frame.y,
        width: allocated.right,
        height: frame.height,
      },
    },
    {
      id: "top-reservation",
      kind: "reserved-demand",
      bounds: {
        x: frame.x + allocated.left,
        y: frame.y,
        width: middleWidth,
        height: allocated.top,
      },
    },
    {
      id: "bottom-reservation",
      kind: "reserved-demand",
      bounds: {
        x: frame.x + allocated.left,
        y: frame.y + frame.height - allocated.bottom,
        width: middleWidth,
        height: allocated.bottom,
      },
    },
  ].filter((r) => r.bounds.width > 0 && r.bounds.height > 0);
  const focus = clamp(v.dominance * policy.focusGain, 0, 1),
    densityScale = 0.9 + 0.2 * v.density;
  const requestedWidth = frame.width * v.mapWidth * densityScale,
    requestedHeight = frame.height * v.mapHeight * densityScale;
  const preferredSize = {
    width: clamp(
      requestedWidth + (frame.width - requestedWidth) * focus,
      minSize.width,
      frame.width,
    ),
    height: clamp(
      requestedHeight + (frame.height - requestedHeight) * focus,
      minSize.height,
      frame.height,
    ),
  };
  const desiredBounds = {
    x:
      frame.x +
      frame.width * v.mapX +
      v.biasX * Math.max(0, frame.width - preferredSize.width) * 0.35 -
      preferredSize.width / 2,
    y:
      frame.y +
      frame.height * v.mapY +
      v.biasY * Math.max(0, frame.height - preferredSize.height) * 0.35 -
      preferredSize.height / 2,
    ...preferredSize,
  };
  const mapSurface: WorkspaceSurface = {
    id: "map",
    priority: 40 + focus * 20,
    prominence: focus,
    demand: 0.5,
    minSize,
    preferredSize,
    maxSize: { width: frame.width, height: frame.height },
    desiredBounds,
    canCompress: true,
    canMove: true,
    canSuspend: true,
    canHide: true,
    state: v.visible ? "active" : "hidden",
    spatialAffinity: { mode: "balanced" },
  };
  const surfaces = [mapSurface, ...(options.surfaces ?? [])];
  const fullSolo =
    surfaces.filter((s) => s.state === "active").length === 1 &&
    v.visible &&
    preferredSize.width >= frame.width - 0.001 &&
    preferredSize.height >= frame.height - 0.001;
  const allocation = allocateWorkspace(space, surfaces, protectedRegions, {
    minimumGutter: 12 + (1 - v.density) * 8,
    breathingRoom: 24 * (1 - v.density),
    intentionalWhitespaceRatio: fullSolo ? 0 : (1 - v.density) * 0.16,
    proximityWeight: policy.pressureGain,
    balanceWeight: 0.2 + (1 - v.density) * 0.25,
  });
  const allocatedMap = allocation.surfaces.find((s) => s.id === "map")!;
  // Suspended/hidden renderers retain a positive, bounded host; only visible allocations occupy space.
  const fallback = {
    ...preferredSize,
    x: clamp(
      desiredBounds.x,
      frame.x,
      frame.x + frame.width - preferredSize.width,
    ),
    y: clamp(
      desiredBounds.y,
      frame.y,
      frame.y + frame.height - preferredSize.height,
    ),
  };
  const bounds = allocatedMap.bounds ?? fallback;
  const visible = v.visible && Boolean(allocatedMap.bounds);
  return {
    ...allocation,
    frame,
    allocated,
    constrained:
      budgetX < 1 ||
      budgetY < 1 ||
      allocation.surfaces.some(
        (s) =>
          s.status === "compressed" ||
          s.status === "suspended" ||
          s.status === "unplaced",
      ) ||
      Math.abs(bounds.x - desiredBounds.x) > 0.01 ||
      Math.abs(bounds.y - desiredBounds.y) > 0.01,
    map: {
      ...bounds,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      radius: v.radius,
      visible,
      opacity: visible ? 1 : 0,
    },
  };
}
export function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
/** Reproducible, unbounded sequence of different parameter vectors; constraints are applied by the solver. */
export function randomComposition(
  seed: number,
  motion: Pick<CompositionVariables, "duration" | "easing">,
): CompositionVariables {
  let state = seed >>> 0;
  const random = () => {
    state = nextSeed(state);
    return state / 4294967296;
  };
  const pressure = () => (random() > 0.5 ? random() * 0.6 : 0);
  return {
    ...BASE_VARIABLES,
    ...motion,
    mapWidth: 0.2 + random() * 0.8,
    mapHeight: 0.2 + random() * 0.8,
    mapX: 0.12 + random() * 0.76,
    mapY: 0.12 + random() * 0.76,
    reservedLeft: random() * 0.18,
    reservedRight: random() * 0.18,
    reservedTop: random() * 0.13,
    reservedBottom: random() * 0.13,
    pressureLeft: pressure(),
    pressureRight: pressure(),
    pressureTop: pressure(),
    pressureBottom: pressure(),
    biasX: random() * 2 - 1,
    biasY: random() * 2 - 1,
    margin: 8 + random() * 80,
    radius: random() * 64,
    visible: random() > 0.08,
    dominance: random() * 0.7,
    density: random(),
  };
}
/** Stress envelopes are instruments, not layout states. Each pass varies their continuous values. */
export function stressComposition(
  index: number,
  motion: Pick<CompositionVariables, "duration" | "easing">,
): CompositionVariables {
  const sample = randomComposition(nextSeed(index + 73), motion),
    phase = index % 8;
  const wave = Math.sin(index * 0.618) * 0.07;
  const clean = {
    ...BASE_VARIABLES,
    ...motion,
    radius: sample.radius,
    margin: sample.margin,
  };
  switch (phase) {
    case 0:
      return { ...clean, mapWidth: 0.8 + wave, mapHeight: 0.76 - wave };
    case 1:
      return {
        ...clean,
        mapWidth: 0.22 + wave,
        mapHeight: 0.25,
        mapX: 0.73 + wave,
        mapY: 0.23 - wave,
      };
    case 2:
      return {
        ...clean,
        mapWidth: 0.88,
        mapHeight: 0.3 + wave,
        mapX: 0.48,
        mapY: 0.73,
        reservedTop: 0.2,
        pressureTop: 0.25,
      };
    case 3:
      return {
        ...clean,
        mapWidth: 0.3 + wave,
        mapHeight: 0.86,
        mapX: 0.25 + wave,
        mapY: 0.44,
        pressureRight: 0.6,
      };
    case 4:
      return { ...clean, dominance: 0.98, margin: 8 + sample.margin * 0.15 };
    case 5:
      return {
        ...clean,
        mapWidth: 0.16,
        mapHeight: 0.17,
        mapX: 0.64 + wave,
        mapY: 0.58 - wave,
        reservedLeft: 0.25,
        pressureTop: 0.4,
        pressureBottom: 0.3,
      };
    case 6:
      return { ...sample, visible: false };
    default:
      return { ...BASE_VARIABLES, ...motion };
  }
}
