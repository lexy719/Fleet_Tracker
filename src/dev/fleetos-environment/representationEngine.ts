import { composeWorkspace, type EnvironmentComposition } from "./composition";
import type { Domain, LivingSnapshot } from "./livingEnvironment";
import {
  dataShape,
  dataSuitability,
  DOMAIN_LIBRARY,
  type DataShape,
  type UserIntent,
} from "./representationLibrary";
import type { SynthesisDiagnostics } from "./liquidSynthesis";
export { synthesize as composeRepresentations } from "./liquidSynthesis";
import {
  allocateWorkspace,
  area,
  candidateRegions,
  clamp,
  rankAvailableRegions,
  type Bounds,
  type Size,
  type SurfaceAllocation,
  type WorkspaceSpace,
  type WorkspaceSurface,
  DEFAULT_DESIGN,
} from "./workspaceGeometry";

export type Actor = Domain | "map";
export type Role =
  | "PRIMARY"
  | "SUPPORTING"
  | "PERIPHERAL"
  | "INDICATOR"
  | "SUSPENDED"
  | "TAKEOVER";
export type Representation =
  | "indicator"
  | "strip"
  | "vertical-strip"
  | "contextual"
  | "list"
  | "flow"
  | "grid"
  | "analysis"
  | "workspace"
  | "takeover"
  | "micro-summary"
  | "wide-list"
  | "dense-grid"
  | "timeline"
  | "relation"
  | "suspended"
  | "map";
// Each grammar has a domain-specific renderer and vocabulary in DOMAIN_LIBRARY.
export const MAP_MODES = [
  "FULL_OPERATIONAL",
  "ROUTE_FOCUS",
  "DRIVER_LOCAL",
  "ROUTE_CORRIDOR",
  "FUEL_CORRIDOR",
  "RESTRICTION_SEGMENT",
  "CONTEXTUAL_MINIMAP",
  "SUPPORTING_MAP",
  "HIDDEN",
  "LARGE_SPATIAL",
  "TRUCK_LOCAL",
  "ROUTE_CORRIDOR_HORIZONTAL",
  "ROUTE_CORRIDOR_VERTICAL",
  "FUEL_ROUTE",
  "BACKGROUND_CONTEXT",
] as const;
export type MapMode = (typeof MAP_MODES)[number];
export type Topology = {
  primary: Actor;
  roles: Partial<Record<Actor, Role>>;
  forms: Partial<Record<Actor, Representation>>;
  flow: "auto" | "horizontal" | "vertical" | "mixed";
  mapMode: MapMode;
  groups: Actor[][];
  gravity: number;
  whitespace: number;
  intent?: UserIntent;
  facts?: Partial<Record<Domain, DataShape>>;
  depth?: number;
  mapAutomatic?: boolean;
  autoMerge?: boolean;
  geometryManual?: boolean;
  retained?: Partial<
    Record<
      Actor,
      {
        geometry: { x: number; y: number; width: number; height: number };
        frame?: { width: number; height: number };
        form: Representation;
        role: Role;
        members: Actor[];
        family?: string;
      }
    >
  >;
  focusIsolation?: boolean;
  overlay?: { actor: Domain; fullMap: boolean };
  continuity?: {
    regions: Partial<
      Record<Actor, { x: number; y: number; width: number; height: number }>
    >;
    forms: Partial<Record<Actor, string>>;
    primary: Actor;
  };
  regions?: Partial<
    Record<Actor, { x: number; y: number; width: number; height: number }>
  >;
};
export const initialTopology = (): Topology => ({
  primary: "map",
  roles: {},
  forms: {},
  flow: "auto",
  mapMode: "FULL_OPERATIONAL",
  groups: [],
  gravity: 0.65,
  whitespace: 0.07,
  intent: "overview",
  mapAutomatic: true,
  autoMerge: true,
  depth: 0,
});
export type TopologyOperation =
  | { type: "PROMOTE" | "DEMOTE" | "SUSPEND" | "TAKEOVER"; actor: Actor }
  | { type: "MORPH"; actor: Actor; form: Representation }
  | {
      type: "SWAP";
      a: Actor;
      b: Actor;
      geometry?: {
        a: { x: number; y: number; width: number; height: number };
        b: { x: number; y: number; width: number; height: number };
      };
    }
  | { type: "MERGE"; actors: Actor[] }
  | { type: "SPLIT"; actor: Actor }
  | { type: "STACK" | "STRIP" | "CLUSTER" }
  | { type: "MAP_MODE"; mode: MapMode }
  | { type: "CONTEXTUALIZE" | "RESTORE" | "CONTENT_FOCUS"; actor: Actor }
  | { type: "MAP_FOCUS" }
  | { type: "MAP_OVERLAY"; actor: Domain }
  | { type: "INTENT"; intent: UserIntent }
  | { type: "DATA_SHAPE"; actor: Domain; values: Partial<DataShape> };

/** Synthetic gravity is a preference graph, never a screen slot or business relation. */
export const RELATIONSHIPS: readonly (readonly [Actor, Actor, number])[] = [
  ["Jobs", "Drivers", 0.8],
  ["Jobs", "Trucks", 0.65],
  ["Jobs", "Fuel", 1],
  ["Jobs", "Restrictions", 0.9],
  ["Jobs", "Documents", 0.8],
  ["Drivers", "Trucks", 1],
  ["map", "Restrictions", 0.9],
  ["map", "Fuel", 0.7],
];
export function relationshipWeight(a: Actor, b: Actor) {
  return (
    RELATIONSHIPS.find(
      ([x, y]) => (x === a && y === b) || (x === b && y === a),
    )?.[2] ?? 0
  );
}
export function resolveRole(actor: Actor, state: LivingSnapshot): Role {
  const topology = state.topology ?? initialTopology();
  const config = state.surfaces.find((s) => s.id === actor);
  if (
    (actor === "map" &&
      (!state.variables.visible || topology.mapMode === "HIDDEN")) ||
    (config && config.state !== "active")
  )
    return "SUSPENDED";
  if (topology.roles[actor]) return topology.roles[actor]!;
  if (topology.primary === actor) return "PRIMARY";
  if (actor === "map") return "SUPPORTING";
  const count = state.surfaces.filter((s) => s.enabled).length;
  if (count < 3 || (config?.demand ?? 0) > 0.65) return "SUPPORTING";
  if (actor === "Documents") return "INDICATOR";
  return actor === "Jobs" || actor === "Fuel" ? "SUPPORTING" : "PERIPHERAL";
}
export function applyTopology(
  snapshot: LivingSnapshot,
  operation: TopologyOperation,
): LivingSnapshot {
  const state = structuredClone(snapshot),
    t = state.topology ?? initialTopology();
  state.topology = t;
  const activate = (actor: Actor) => {
    if (actor === "map") {
      state.variables.visible = true;
      if (t.mapMode === "HIDDEN") t.mapMode = "FULL_OPERATIONAL";
    } else
      state.surfaces = state.surfaces.map((s) =>
        s.id === actor ? { ...s, enabled: true, state: "active" } : s,
      );
  };
  const promote = (actor: Actor, takeover = false) => {
    t.retained = {};
    t.overlay = undefined;
    t.focusIsolation = false;
    t.geometryManual = false;
    t.regions = {};
    activate(actor);
    t.roles[t.primary] = "SUPPORTING";
    t.primary = actor;
    t.roles[actor] = takeover ? "TAKEOVER" : "PRIMARY";
    delete t.forms[actor];
    state.focus = takeover && actor !== "map" ? actor : null;
    state.explorerOpen = false;
    for (const s of state.surfaces)
      if (s.id !== actor)
        t.roles[s.id as Domain] = takeover
          ? "SUSPENDED"
          : (state.surfaces.find((x) => x.id === s.id)?.demand ?? 0.5) > 0.55
            ? "SUPPORTING"
            : "PERIPHERAL";
    // Priority changes semantic demand, never a focus rectangle.
    t.mapAutomatic = true;
    if (actor !== "map") {
      t.groups = t.groups
        .map((g) => g.filter((a) => a !== actor))
        .filter((g) => g.length > 1);
      t.roles.map = takeover ? "SUSPENDED" : "SUPPORTING";
      state.variables.visible = !takeover;
      if (takeover) t.mapMode = "HIDDEN";
    } else {
      state.variables.visible = true;
      if (takeover) t.mapMode = "LARGE_SPATIAL";
    }
  };
  switch (operation.type) {
    case "MAP_OVERLAY":
      activate(operation.actor);
      t.overlay = { actor: operation.actor, fullMap: true };
      state.explorerOpen = false;
      break;
    case "DATA_SHAPE":
      t.facts = {
        ...t.facts,
        [operation.actor]: dataShape(operation.actor, {
          ...t.facts?.[operation.actor],
          ...operation.values,
        }),
      };
      break;
    case "INTENT":
      t.intent = operation.intent;
      t.mapAutomatic = true;
      break;
    case "MAP_FOCUS":
      promote("map");
      t.intent = "monitor";
      break;
    case "CONTENT_FOCUS":
      promote(operation.actor);
      t.intent = "inspect";
      break;
    case "CONTEXTUALIZE":
      activate(operation.actor);
      t.roles[operation.actor] = "PERIPHERAL";
      delete t.forms[operation.actor];
      break;
    case "RESTORE":
      activate(operation.actor);
      delete t.roles[operation.actor];
      delete t.forms[operation.actor];
      break;
    case "PROMOTE":
      promote(operation.actor);
      break;
    case "TAKEOVER":
      promote(operation.actor, true);
      break;
    case "DEMOTE":
      t.roles[operation.actor] = "PERIPHERAL";
      if (t.primary === operation.actor)
        promote(operation.actor === "map" ? "Jobs" : "map");
      break;
    case "SUSPEND":
      t.roles[operation.actor] = "SUSPENDED";
      if (operation.actor === "map") {
        t.mapMode = "HIDDEN";
        state.variables.visible = false;
      }
      break;
    case "MORPH":
      if (t.retained) delete t.retained[operation.actor];
      if (operation.form === "takeover") promote(operation.actor, true);
      activate(operation.actor);
      if (operation.form === "suspended") {
        t.roles[operation.actor] = "SUSPENDED";
        break;
      }
      if (t.roles[operation.actor] === "SUSPENDED")
        delete t.roles[operation.actor];
      t.forms[operation.actor] = operation.form;
      break;
    case "SWAP": {
      state.explorerOpen = false;
      activate(operation.a);
      activate(operation.b);
      const aRole = resolveRole(operation.a, state),
        bRole = resolveRole(operation.b, state);
      t.roles[operation.a] = bRole;
      t.roles[operation.b] = aRole;
      if (t.primary === operation.a) t.primary = operation.b;
      else if (t.primary === operation.b) t.primary = operation.a;
      const position = (actor: Actor) =>
        actor === "map"
          ? {
              x: state.variables.mapX,
              y: state.variables.mapY,
              width: state.variables.mapWidth,
              height: state.variables.mapHeight,
            }
          : state.surfaces.find((s) => s.id === actor)!;
      const a = operation.geometry?.a ?? { ...position(operation.a) },
        b = operation.geometry?.b ?? { ...position(operation.b) };
      if (operation.geometry)
        t.regions = { ...t.regions, [operation.a]: b, [operation.b]: a };
      for (const [actor, p] of [
        [operation.a, b],
        [operation.b, a],
      ] as const) {
        if (actor === "map") {
          state.variables.mapX = p.x;
          state.variables.mapY = p.y;
          state.variables.mapWidth = p.width;
          state.variables.mapHeight = p.height;
          t.mapMode =
            t.primary === "map" ? "FULL_OPERATIONAL" : "SUPPORTING_MAP";
        } else
          state.surfaces = state.surfaces.map((s) =>
            s.id === actor
              ? { ...s, x: p.x, y: p.y, width: p.width, height: p.height }
              : s,
          );
      }
      break;
    }
    case "MERGE": {
      const members = [...new Set(operation.actors)];
      members.forEach(activate);
      const previous = t.groups
        .filter((g) => g.some((a) => members.includes(a)))
        .flat();
      t.groups = t.groups.filter((g) => !g.some((a) => members.includes(a)));
      const group = [...new Set([...members, ...previous])];
      if (group.length > 1) t.groups.push(group);
      break;
    }
    case "SPLIT":
      t.autoMerge = false;
      t.groups = t.groups.filter((g) => !g.includes(operation.actor));
      break;
    case "STACK":
      t.flow = "vertical";
      break;
    case "STRIP":
      t.flow = "horizontal";
      break;
    case "CLUSTER":
      t.gravity = 1;
      t.flow = "mixed";
      break;
    case "MAP_MODE":
      t.mapAutomatic = false;
      t.mapMode = operation.mode;
      state.variables.visible = operation.mode !== "HIDDEN";
      if (operation.mode !== "HIDDEN" && t.roles.map === "SUSPENDED") {
        delete t.roles.map;
        if (t.roles[t.primary] === "TAKEOVER") t.roles[t.primary] = "PRIMARY";
      }
      break;
  }
  return state;
}

type FormProfile = {
  id: Representation;
  min: Size;
  aspect: number;
  density: number;
};
export const FORMS: readonly FormProfile[] = [
  { id: "indicator", min: { width: 138, height: 46 }, aspect: 3.6, density: 0 },
  { id: "strip", min: { width: 280, height: 76 }, aspect: 6.5, density: 0.15 },
  {
    id: "vertical-strip",
    min: { width: 110, height: 250 },
    aspect: 0.45,
    density: 0.2,
  },
  {
    id: "contextual",
    min: { width: 250, height: 186 },
    aspect: 1.6,
    density: 0.35,
  },
  { id: "list", min: { width: 265, height: 285 }, aspect: 0.72, density: 0.65 },
  { id: "flow", min: { width: 460, height: 155 }, aspect: 4, density: 0.5 },
  { id: "grid", min: { width: 510, height: 310 }, aspect: 1.8, density: 0.8 },
  {
    id: "analysis",
    min: { width: 590, height: 365 },
    aspect: 1.7,
    density: 0.95,
  },
  {
    id: "workspace",
    min: { width: 500, height: 400 },
    aspect: 1.35,
    density: 1,
  },
  {
    id: "micro-summary",
    min: { width: 190, height: 100 },
    aspect: 2.3,
    density: 0.18,
  },
  {
    id: "wide-list",
    min: { width: 480, height: 225 },
    aspect: 2.6,
    density: 0.72,
  },
  {
    id: "dense-grid",
    min: { width: 450, height: 260 },
    aspect: 1.7,
    density: 0.95,
  },
  {
    id: "timeline",
    min: { width: 440, height: 185 },
    aspect: 3.4,
    density: 0.55,
  },
  {
    id: "relation",
    min: { width: 390, height: 270 },
    aspect: 1.5,
    density: 0.7,
  },
  { id: "takeover", min: { width: 400, height: 400 }, aspect: 1.5, density: 1 },
];
const ROLE_DENSITY: Record<Role, number> = {
  PRIMARY: 0.9,
  SUPPORTING: 0.6,
  PERIPHERAL: 0.2,
  INDICATOR: 0,
  SUSPENDED: 0,
  TAKEOVER: 1,
};
export function shapeAffinity(form: Representation, region: Size) {
  const profile = FORMS.find((f) => f.id === form);
  if (
    !profile ||
    region.width < profile.min.width ||
    region.height < profile.min.height
  )
    return 0;
  const ratio = region.width / region.height;
  return Math.min(ratio / profile.aspect, profile.aspect / ratio);
}
export function representationDensity(form: Representation) {
  return FORMS.find((f) => f.id === form)?.density ?? 0;
}
export type RepresentationDecision = {
  actor: Actor;
  role: Role;
  form: Representation;
  density: number;
  members: Actor[];
  score: number;
  bounds: Bounds | null;
  reason: string;
  family?: string;
  facts?: DataShape;
  content?: Partial<Record<Domain, DataShape>>;
  layer?: "overlay";
};
export type RepresentationComposition = EnvironmentComposition & {
  representations: RepresentationDecision[];
  topology: Topology;
  contextNegotiated: boolean;
  accidentalFreeRatio: number;
  synthesis?: SynthesisDiagnostics;
};

/** Jointly score form + shape + region + gravity. Only the resulting requests enter the
 * existing geometric allocator; domains and topology operations contain no pixel slots. */
export function composeRepresentationCandidate(
  state: LivingSnapshot,
  size: Size,
  space: WorkspaceSpace,
): RepresentationComposition {
  const t = state.topology ?? initialTopology(),
    v = state.variables;
  const scaffold = composeWorkspace(state.intent, v, size, { space });
  const frame = space.usableWorkspaceBounds;
  const initialRegions = candidateRegions(
    space.usableWorkspaceRegions,
    scaffold.protectedRegions.map((p) => p.bounds),
  );
  const active: Actor[] = [
    ...(v.visible && t.mapMode !== "HIDDEN" ? ["map" as const] : []),
    ...state.surfaces.filter((s) => s.enabled).map((s) => s.id as Domain),
  ];
  const owners = new Map<Actor, Actor[]>();
  for (const group of t.groups) {
    const members = group.filter(
      (a) => active.includes(a) && resolveRole(a, state) !== "SUSPENDED",
    );
    if (members.length < 2) continue;
    const owner = members.includes("map")
      ? "map"
      : members.includes(t.primary)
        ? t.primary
        : members[0];
    owners.set(owner, members);
  }
  const actors = active.filter(
    (a) => ![...owners.entries()].some(([o, g]) => o !== a && g.includes(a)),
  );
  const rolePriority: Record<Role, number> = {
    TAKEOVER: 100,
    PRIMARY: 90,
    SUPPORTING: 60,
    PERIPHERAL: 40,
    INDICATOR: 20,
    SUSPENDED: 0,
  };
  actors.sort(
    (a, b) =>
      Number(Boolean(t.retained?.[b])) - Number(Boolean(t.retained?.[a])) ||
      rolePriority[resolveRole(b, state)] -
        rolePriority[resolveRole(a, state)] ||
      (a === "map" ? -1 : b === "map" ? 1 : a.localeCompare(b)),
  );
  const placed: SurfaceAllocation[] = [];
  const requests: WorkspaceSurface[] = [];
  const decisions: RepresentationDecision[] = [];
  const gutter = 12 + (1 - v.density) * 6;
  const inflate = (b: Bounds) => ({
    x: b.x - gutter,
    y: b.y - gutter,
    width: b.width + gutter * 2,
    height: b.height + gutter * 2,
  });
  const diagonal = Math.max(1, Math.hypot(frame.width, frame.height));
  const desiredCenter = (actor: Actor) => {
    const hint = t.regions?.[actor];
    if (hint)
      return {
        x: frame.x + frame.width * hint.x,
        y: frame.y + frame.height * hint.y,
      };
    const cfg = state.surfaces.find((s) => s.id === actor);
    if (
      t.flow === "vertical" &&
      actor !== "map" &&
      resolveRole(actor, state) === "SUPPORTING"
    ) {
      const peers = actors.filter(
        (a) => a !== "map" && resolveRole(a, state) === "SUPPORTING",
      );
      const index = peers.indexOf(actor);
      return {
        x:
          frame.x +
          frame.width * (t.primary === "map" && v.mapX > 0.5 ? 0.24 : 0.76),
        y: frame.y + (frame.height * (index + 0.5)) / Math.max(1, peers.length),
      };
    }
    return actor === "map"
      ? {
          x: frame.x + frame.width * clamp(v.mapX + v.biasX * 0.15, 0, 1),
          y: frame.y + frame.height * clamp(v.mapY + v.biasY * 0.15, 0, 1),
        }
      : {
          x: frame.x + frame.width * (cfg?.x ?? 0.5),
          y: frame.y + frame.height * (cfg?.y ?? 0.5),
        };
  };
  for (const actor of actors) {
    const role = resolveRole(actor, state),
      members = owners.get(actor) ?? [actor],
      cfg = state.surfaces.find((s) => s.id === actor);
    const retained = t.retained?.[actor];
    if (retained && role !== "SUSPENDED") {
      const g = retained.geometry,
        resizing = Boolean(
          retained.frame &&
          (Math.abs(retained.frame.width - frame.width) > 0.1 ||
            Math.abs(retained.frame.height - frame.height) > 0.1),
        ),
        desired = {
          x: frame.x + g.x * frame.width,
          y: frame.y + g.y * frame.height,
          width: resizing
            ? Math.max(360, g.width * frame.width)
            : g.width * frame.width,
          height: resizing
            ? Math.max(260, g.height * frame.height)
            : g.height * frame.height,
        };
      const request: WorkspaceSurface = {
        id: actor,
        priority: 1000,
        prominence: 0.5,
        demand: 0.5,
        minSize: { width: desired.width, height: desired.height },
        preferredSize: { width: desired.width, height: desired.height },
        maxSize: { width: desired.width, height: desired.height },
        desiredBounds: desired,
        state: "active",
        canMove: resizing,
        canCompress: false,
        canSuspend: true,
        canHide: true,
        spatialAffinity: { mode: "balanced" },
      };
      // Only a viewport change may relocate an existing context. Opening a new
      // context keeps its exact rectangle; narrower viewports keep readable sizes.
      const regions = candidateRegions(
        initialRegions,
        placed.flatMap((p) => (p.bounds ? [inflate(p.bounds)] : [])),
      );
      const b = resizing
        ? (rankAvailableRegions(
            request,
            regions,
            placed,
            requests,
            frame,
            area(frame),
            { ...DEFAULT_DESIGN, intentionalWhitespaceRatio: 0 },
          )[0]?.bounds ?? desired)
        : desired;
      request.desiredBounds = b;
      request.canMove = false;
      requests.push(request);
      placed.push({
        id: actor,
        status: "active",
        bounds: b,
        requestedSize: b,
        selectedRegion: b,
        candidates: [],
        reason: "existing-context-retained",
      });
      decisions.push({
        actor,
        role: retained.role,
        form: retained.form,
        members: retained.members,
        family: retained.family,
        density: representationDensity(retained.form),
        score: 6,
        bounds: b,
        reason: "existing-context-retained",
        facts: actor !== "map" ? dataShape(actor, t.facts?.[actor]) : undefined,
        content: Object.fromEntries(
          retained.members
            .filter((a) => a !== "map")
            .map((a) => [a, dataShape(a as Domain, t.facts?.[a as Domain])]),
        ),
      });
      continue;
    }
    if (role === "SUSPENDED") {
      decisions.push({
        actor,
        role,
        form: "suspended",
        density: 0,
        members,
        score: 0,
        bounds: null,
        reason: "role-suspended",
      });
      continue;
    }
    const regions = candidateRegions(
      initialRegions,
      placed.flatMap((p) => (p.bounds ? [inflate(p.bounds)] : [])),
    );
    const map = actor === "map",
      primary = role === "PRIMARY" || role === "TAKEOVER";
    const profiles = map
      ? [
          {
            id: "map" as const,
            min: { width: 240, height: 180 },
            aspect: primary
              ? (v.mapWidth * frame.width) /
                Math.max(1, v.mapHeight * frame.height)
              : 1.6,
            density: primary ? 0.9 : 0.25,
          },
        ]
      : FORMS.filter((f) =>
          role === "TAKEOVER"
            ? f.id === "takeover"
            : f.id !== "takeover" &&
              (role !== "INDICATOR" || f.id === "indicator"),
        )
          .filter((f) =>
            t.forms[actor]
              ? true
              : ![
                  "indicator",
                  "micro-summary",
                  "strip",
                  "vertical-strip",
                  "contextual",
                ].includes(f.id),
          )
          .map((f) =>
            t.forms[actor]
              ? f
              : {
                  ...f,
                  min: {
                    width: Math.max(360, f.min.width),
                    height: Math.max(260, f.min.height),
                  },
                },
          );
    let best:
      | {
          request: WorkspaceSurface;
          candidate: SurfaceAllocation;
          decision: RepresentationDecision;
        }
      | undefined;
    for (const profile of profiles)
      for (const region of regions) {
        const hint = t.regions?.[actor];
        if (
          hint &&
          (profile.min.width > frame.width * hint.width ||
            profile.min.height > frame.height * hint.height)
        )
          continue;
        if (
          region.width < profile.min.width ||
          region.height < profile.min.height
        )
          continue;
        const facts = !map ? dataShape(actor, t.facts?.[actor]) : undefined;
        const densityTarget = ROLE_DENSITY[role] + (v.density - 0.5) * 0.2;
        const share =
          role === "TAKEOVER"
            ? 1
            : primary
              ? 0.64
              : role === "SUPPORTING"
                ? 0.18
                : role === "PERIPHERAL"
                  ? 0.06
                  : 0.014;
        const targetArea =
          area(frame) *
          share *
          (0.85 + (cfg?.demand ?? 0.5) * 0.3) *
          (primary || map
            ? 1
            : clamp((cfg?.width ?? 0.24) / 0.24, 0.3, 2) *
              clamp((cfg?.height ?? 0.28) / 0.28, 0.3, 2));
        let width = Math.sqrt(targetArea * profile.aspect),
          height = width / profile.aspect;
        if (map) {
          width = frame.width * (v.mapWidth + (1 - v.mapWidth) * v.dominance);
          height =
            frame.height * (v.mapHeight + (1 - v.mapHeight) * v.dominance);
        }
        if (role === "TAKEOVER") {
          width = region.width;
          height = region.height;
        }
        // Grow useful content into the chosen region, constrained by its representation.
        const scale = Math.min(1, region.width / width, region.height / height);
        width = clamp(width * scale, profile.min.width, region.width);
        height = clamp(height * scale, profile.min.height, region.height);
        if (
          t.flow === "vertical" &&
          role === "SUPPORTING" &&
          !map &&
          profile.id === "list"
        ) {
          const peerCount = actors.filter(
            (a) => a !== "map" && resolveRole(a, state) === "SUPPORTING",
          ).length;
          height = clamp(
            frame.height / Math.max(1, peerCount) - gutter * 2,
            profile.min.height,
            region.height,
          );
          width = clamp(
            height * profile.aspect,
            profile.min.width,
            region.width,
          );
        }
        if (hint) {
          width = clamp(
            frame.width * hint.width,
            profile.min.width,
            region.width,
          );
          height = clamp(
            frame.height * hint.height,
            profile.min.height,
            region.height,
          );
        }
        if (profile.id === "indicator") {
          width = Math.min(region.width, 210);
          height = 46;
        }
        if (profile.id === "strip") height = Math.min(region.height, 96);
        if (profile.id === "vertical-strip")
          width = Math.min(region.width, 132);
        if (
          primary &&
          !hint &&
          !map &&
          [
            "grid",
            "analysis",
            "workspace",
            "list",
            "wide-list",
            "dense-grid",
            "relation",
          ].includes(profile.id)
        ) {
          width = clamp(
            frame.width * (0.56 + Math.min(0.16, (facts?.detail ?? 0.5) * 0.2)),
            profile.min.width,
            region.width,
          );
          height = clamp(
            frame.height * 0.86,
            profile.min.height,
            region.height,
          );
        }
        const c = desiredCenter(actor);
        // Sparse grammars cannot claim analysis-sized empty bodies merely to improve the ledger.
        if (profile.id === "micro-summary") {
          height = Math.min(height, 130);
          width = Math.min(width, 420);
        }
        if (
          profile.id === "grid" &&
          facts &&
          facts.count <= 9 &&
          !facts.selected &&
          !t.geometryManual
        )
          height = Math.min(height, 160 + Math.ceil(facts.count / 3) * 116);
        const request: WorkspaceSurface = {
          id: actor,
          priority: rolePriority[role],
          prominence: primary ? 0.8 : 0.3,
          demand: 0.5,
          minSize: { width, height },
          preferredSize: { width, height },
          maxSize: { width, height },
          desiredBounds: {
            x: c.x - width / 2,
            y: c.y - height / 2,
            width,
            height,
          },
          state: "active",
          canCompress: false,
          canMove: true,
          canSuspend: true,
          canHide: true,
          spatialAffinity: { mode: "balanced" },
        };
        const candidate = rankAvailableRegions(
          request,
          [region],
          placed,
          requests,
          frame,
          area(frame),
          { ...DEFAULT_DESIGN, intentionalWhitespaceRatio: 0 },
        )[0];
        if (!candidate?.bounds) continue;
        const b = candidate.bounds;
        const retained = Math.min(1, area(b) / Math.max(1, targetArea));
        const shape = map
          ? Math.min(
              b.width / b.height / profile.aspect,
              profile.aspect / (b.width / b.height),
            )
          : shapeAffinity(profile.id, b);
        let preference = 1 - Math.abs(profile.density - densityTarget);
        if (
          (actor === "Fuel" &&
            (profile.id === "flow" || profile.id === "contextual")) ||
          (actor === "Jobs" &&
            (profile.id === "list" || profile.id === "grid")) ||
          (actor === "Documents" && profile.id === "workspace")
        )
          preference += 0.18;
        if (t.forms[actor])
          preference += profile.id === t.forms[actor] ? 3 : -1.2;
        if (t.flow === "horizontal" && !primary)
          preference +=
            profile.id === "flow" || profile.id === "strip" ? 0.85 : 0;
        if (t.flow === "vertical")
          preference +=
            profile.id === "list" || profile.id === "vertical-strip" ? 0.8 : 0;
        if (t.flow === "mixed")
          preference +=
            (actor === "Fuel" && profile.id === "flow") ||
            (actor === "Drivers" && profile.id === "vertical-strip")
              ? 0.35
              : 0;
        let gravity = 0;
        for (const p of placed)
          if (p.bounds) {
            const distance =
              Math.hypot(
                b.x + b.width / 2 - p.bounds.x - p.bounds.width / 2,
                b.y + b.height / 2 - p.bounds.y - p.bounds.height / 2,
              ) / diagonal;
            gravity +=
              (1 - distance) *
              relationshipWeight(actor, p.id as Actor) *
              t.gravity *
              0.3;
          }
        const centerDistance =
          Math.hypot(b.x + b.width / 2 - c.x, b.y + b.height / 2 - c.y) /
          diagonal;
        const suitability = facts
          ? dataSuitability(
              actor as Domain,
              profile.id,
              facts,
              role,
              t.intent ?? "overview",
              t.depth ?? 0,
              members.length > 1,
            )
          : 0;
        const score =
          suitability * 1.2 +
          preference * 2.7 +
          retained * 1.5 +
          shape * 0.55 -
          centerDistance * (map ? 3 : 1.2) +
          gravity;
        if (!best || score > best.decision.score)
          best = {
            request: { ...request, desiredBounds: b, canMove: false },
            candidate: {
              id: actor,
              status: "active",
              bounds: b,
              requestedSize: { width, height },
              selectedRegion: region,
              candidates: [candidate],
              reason: "representation-region-negotiated",
            },
            decision: {
              actor,
              role,
              form: profile.id,
              density: profile.density,
              members,
              score,
              bounds: b,
              reason: "data-shape-role-density-gravity",
              family: map
                ? t.mapMode
                : DOMAIN_LIBRARY[actor].find((f) => f.form === profile.id)?.id,
              facts,
              content: Object.fromEntries(
                members
                  .filter((a) => a !== "map")
                  .map((a) => [
                    a,
                    dataShape(a as Domain, t.facts?.[a as Domain]),
                  ]),
              ),
            },
          };
      }
    if (best) {
      requests.push(best.request);
      placed.push(best.candidate);
      decisions.push(best.decision);
    } else
      decisions.push({
        actor,
        role: "SUSPENDED",
        form: "suspended",
        density: 0,
        members,
        score: 0,
        bounds: null,
        reason: "no-viable-representation",
      });
  }
  const allocation = allocateWorkspace(
    space,
    requests,
    scaffold.protectedRegions,
    {
      minimumGutter: gutter,
      breathingRoom: 0,
      intentionalWhitespaceRatio: 0,
      maximumProminentSurfaces: 2,
    },
  );
  for (const decision of decisions)
    decision.bounds =
      allocation.surfaces.find((s) => s.id === decision.actor)?.bounds ?? null;
  for (const actor of active.filter((a) => !actors.includes(a)))
    allocation.surfaces.push({
      id: actor,
      status: "hidden",
      bounds: null,
      requestedSize: { width: 0, height: 0 },
      selectedRegion: null,
      candidates: [],
      reason: "merged-into-related-surface",
    });
  for (const d of decisions.filter((d) => !d.bounds))
    if (!allocation.surfaces.some((s) => s.id === d.actor))
      allocation.surfaces.push({
        id: d.actor,
        status: "suspended",
        bounds: null,
        requestedSize: { width: 0, height: 0 },
        selectedRegion: null,
        candidates: [],
        reason: d.reason,
      });
  const mapDecision = decisions.find((d) => d.actor === "map");
  const mapBounds = mapDecision?.bounds ?? scaffold.map;
  const freeRatio = allocation.area.usable
    ? allocation.area.free / allocation.area.usable
    : 0;
  return {
    ...scaffold,
    ...allocation,
    contextNegotiated: true,
    topology: t,
    representations: decisions,
    accidentalFreeRatio: state.surfaces.some((s) => s.enabled)
      ? Math.max(
          0,
          freeRatio -
            allocation.area.intentional / Math.max(1, allocation.area.usable) -
            t.whitespace,
        )
      : 0,
    map: {
      ...mapBounds,
      radius: v.radius,
      visible: Boolean(mapDecision?.bounds),
      opacity: mapDecision?.bounds ? 1 : 0,
    },
    constrained: decisions.some((d) => !d.bounds),
  };
}
