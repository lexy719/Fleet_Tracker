import type { Domain, LivingSnapshot } from "./livingEnvironment";
import {
  composeRepresentationCandidate,
  initialTopology,
  resolveRole,
  relationshipWeight,
  type Actor,
  type MapMode,
  type RepresentationComposition,
  type Topology,
} from "./representationEngine";
import { dataShape } from "./representationLibrary";
import {
  area,
  clamp,
  createWorkspaceSpace,
  contains,
  intersection,
  type Size,
  type WorkspaceSpace,
} from "./workspaceGeometry";

export const CANDIDATE_BUDGET = 8;
export type QualityTerms = {
  semantic: number;
  hierarchy: number;
  utilization: number;
  emptiness: number;
  relationships: number;
  shape: number;
  continuity: number;
  mapRelevance: number;
  repetition: number;
  symmetry: number;
  ghostGrid: number;
  clutter: number;
  slivers: number;
};
export type CandidateSummary = {
  id: number;
  score: number;
  accepted: boolean;
  rejection: string[];
  terms: QualityTerms;
  signature: string;
  reasons: string[];
};
export type SynthesisDiagnostics = {
  budget: number;
  generated: number;
  rejected: number;
  winner: number;
  candidates: CandidateSummary[];
  topologySignature: string;
  geometrySignature: string;
  representationSignature: string;
  reasons: string[];
};
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function semanticSignature(state: LivingSnapshot) {
  const t = state.topology ?? initialTopology();
  return JSON.stringify({
    primary: t.primary,
    focus: state.focus,
    depth: t.depth ?? 0,
    intent: t.intent ?? "overview",
    facts: Object.fromEntries(
      state.surfaces
        .filter((s) => s.enabled)
        .map((s) => s.id as Domain)
        .sort()
        .map((domain) => [domain, dataShape(domain, t.facts?.[domain])]),
    ),
    groups: t.groups,
    roles: Object.fromEntries(
      Object.entries(t.roles).sort(([a], [b]) => a.localeCompare(b)),
    ),
    actors: state.surfaces
      .filter((s) => s.enabled)
      .map((s) => s.id)
      .sort(),
  });
}
export function captureContinuity(
  model: RepresentationComposition,
): Topology["continuity"] {
  const f = model.frame;
  return {
    primary: model.topology.primary,
    forms: Object.fromEntries(
      model.representations
        .filter((d) => d.bounds)
        .map((d) => [d.actor, d.family ?? d.form]),
    ),
    regions: Object.fromEntries(
      model.representations
        .filter((d) => d.bounds)
        .map((d) => {
          const b = d.bounds!;
          return [
            d.actor,
            {
              x: (b.x + b.width / 2 - f.x) / f.width,
              y: (b.y + b.height / 2 - f.y) / f.height,
              width: b.width / f.width,
              height: b.height / f.height,
            },
          ];
        }),
    ),
  };
}
export function captureRetained(
  model: RepresentationComposition,
): Topology["retained"] {
  const f = model.frame;
  return Object.fromEntries(
    model.representations
      .filter((d) => d.actor !== "map" && d.bounds && !d.layer)
      .map((d) => {
        const b = d.bounds!;
        return [
          d.actor,
          {
            frame: { width: f.width, height: f.height },
            geometry: {
              x: (b.x - f.x) / f.width,
              y: (b.y - f.y) / f.height,
              width: b.width / f.width,
              height: b.height / f.height,
            },
            form: d.form,
            role: d.role,
            members: d.members,
            family: d.family,
          },
        ];
      }),
  );
}
function overlayComposition(
  state: LivingSnapshot,
  size: Size,
  space: WorkspaceSpace,
): RepresentationComposition {
  const context = state.topology!.overlay!,
    base = structuredClone(state);
  base.topology!.overlay = undefined;
  if (context.fullMap) {
    space = createWorkspaceSpace(size, space.reservedChromeBounds, 0);
    Object.assign(base.variables, {
      margin: 0,
      radius: 0,
      reservedLeft: 0,
      reservedRight: 0,
      reservedTop: 0,
      reservedBottom: 0,
      pressureLeft: 0,
      pressureRight: 0,
      pressureTop: 0,
      pressureBottom: 0,
    });
    base.topology!.retained = {};
    base.topology!.focusIsolation = false;
    base.topology!.groups = [];
    base.topology!.primary = "map";
    base.topology!.roles = { map: "TAKEOVER" };
    for (const s of base.surfaces)
      base.topology!.roles[s.id as Domain] = "SUSPENDED";
    base.variables.visible = true;
    base.topology!.mapAutomatic = false;
    base.topology!.mapMode =
      context.actor === "Fuel"
        ? "FUEL_ROUTE"
        : context.actor === "Drivers"
          ? "DRIVER_LOCAL"
          : context.actor === "Trucks"
            ? "TRUCK_LOCAL"
            : context.actor === "Restrictions"
              ? "RESTRICTION_SEGMENT"
              : "ROUTE_FOCUS";
  }
  const model = synthesize(base, size, space),
    f = model.frame,
    facts = dataShape(context.actor, state.topology!.facts?.[context.actor]);
  const width = Math.min(560, f.width - 40),
    height = Math.min(700, f.height - 56),
    bounds = {
      x: f.x + f.width - width - 24,
      y: f.y + (f.height - height) / 2,
      width,
      height,
    };
  const decision = {
    actor: context.actor,
    role: "PRIMARY" as const,
    form: "workspace" as const,
    family: `${context.actor.toUpperCase()}_FLOATING_WORKSPACE`,
    facts,
    content: { [context.actor]: facts },
    members: [context.actor],
    density: 1,
    score: 1,
    bounds,
    reason: context.fullMap
      ? "explicit-map-context-overlay"
      : "new-context-without-compacting-existing",
    layer: "overlay" as const,
  };
  return {
    ...model,
    topology: { ...model.topology, overlay: context },
    representations: [
      ...model.representations.filter((d) => d.actor !== context.actor),
      decision,
    ],
    surfaces: [
      ...model.surfaces.filter((s) => s.id !== context.actor),
      {
        id: context.actor,
        status: "active",
        bounds,
        requestedSize: bounds,
        selectedRegion: bounds,
        candidates: [],
        reason: decision.reason,
      },
    ],
    synthesis: {
      ...model.synthesis!,
      reasons: [decision.reason, ...model.synthesis!.reasons],
    },
  };
}
export function selectMapMode(state: LivingSnapshot, aspect: number): MapMode {
  const t = state.topology ?? initialTopology();
  if (!state.variables.visible || t.roles.map === "SUSPENDED") return "HIDDEN";
  if (t.mapAutomatic === false) return t.mapMode;
  if (t.roles.map === "TAKEOVER") return "LARGE_SPATIAL";
  const primary = t.primary,
    facts = primary === "map" ? null : dataShape(primary, t.facts?.[primary]);
  if (primary === "map")
    return state.focus === "Drivers"
      ? "DRIVER_LOCAL"
      : state.focus === "Trucks"
        ? "TRUCK_LOCAL"
        : aspect > 2.4
          ? "ROUTE_CORRIDOR_HORIZONTAL"
          : aspect < 0.65
            ? "ROUTE_CORRIDOR_VERTICAL"
            : "FULL_OPERATIONAL";
  if ((facts?.mapRelevance ?? 0) < 0.2) return "BACKGROUND_CONTEXT";
  if (primary === "Fuel") return "FUEL_ROUTE";
  if (primary === "Restrictions") return "RESTRICTION_SEGMENT";
  if (primary === "Drivers" && facts?.selected && facts.detail > 0.6)
    return "DRIVER_LOCAL";
  if (primary === "Trucks" && facts?.selected) return "TRUCK_LOCAL";
  if (aspect > 2.4) return "ROUTE_CORRIDOR_HORIZONTAL";
  if (aspect < 0.65) return "ROUTE_CORRIDOR_VERTICAL";
  return facts?.selected ? "ROUTE_FOCUS" : "SUPPORTING_MAP";
}
/** Explore intent-driven placement hypotheses, not a list of named dashboard layouts. */
export function generateCandidates(state: LivingSnapshot): LivingSnapshot[] {
  const original = state.topology ?? initialTopology();
  const active: Actor[] = [
    ...(state.variables.visible ? ["map" as const] : []),
    ...state.surfaces
      .filter(
        (s) =>
          s.enabled &&
          s.state === "active" &&
          resolveRole(s.id as Domain, state) !== "SUSPENDED",
      )
      .map((s) => s.id as Domain),
  ];
  const semantic = hash(semanticSignature(state));
  const candidates: LivingSnapshot[] = [];
  for (let index = 0; index < CANDIDATE_BUDGET; index++) {
    const candidate = structuredClone(state),
      t = candidate.topology ?? initialTopology();
    candidate.topology = t;
    if (
      index > 0 &&
      !Object.keys(original.regions ?? {}).length &&
      active.length > 1
    ) {
      const primary = t.primary,
        facts =
          primary === "map" ? null : dataShape(primary, t.facts?.[primary]);
      const angle = (semantic % 6283) / 1000 + index * 2.399963229728653;
      const contentDemand = facts
        ? clamp(
            0.43 + facts.detail * 0.16 + Math.min(1, facts.count / 30) * 0.14,
            0.43,
            0.76,
          )
        : 0.6;
      const primaryArea =
        primary === "map"
          ? clamp(
              0.47 +
                state.variables.dominance * 0.3 +
                (active.length <= 2 ? 0.12 : 0),
              0.42,
              0.91,
            )
          : contentDemand;
      const aspect =
        primary === "map"
          ? (state.variables.mapWidth * 1.6) /
            Math.max(0.1, state.variables.mapHeight)
          : t.intent === "dispatch"
            ? 3.2
            : t.intent === "compare"
              ? 1.9
              : facts?.selected
                ? 1.25
                : 1.8;
      // Each hypothesis varies shape as well as position. Geometry is normalized and clamped later.
      const a = aspect * (0.72 + (index % 3) * 0.28);
      const w = clamp(Math.sqrt((primaryArea * a) / 1.6), 0.33, 0.98),
        h = clamp(primaryArea / w, 0.26, 0.97);
      const x = clamp(0.5 + Math.cos(angle) * (1 - w) * 0.48, 0.04, 0.96),
        y = clamp(0.5 + Math.sin(angle) * (1 - h) * 0.48, 0.04, 0.96);
      if (primary !== "map" || !t.geometryManual)
        t.regions = { [primary]: { x, y, width: w, height: h } };
      if (primary === "map" && !t.geometryManual)
        Object.assign(candidate.variables, {
          mapX: x,
          mapY: y,
          mapWidth: w,
          mapHeight: h,
          dominance: 0,
        });
      candidate.surfaces = candidate.surfaces.map((s) => {
        if (!s.enabled || s.id === primary) return s;
        const relation = relationshipWeight(primary, s.id as Actor),
          phase = angle + (hash(s.id) % 100) / 14;
        return {
          ...s,
          x: clamp(
            x + Math.cos(phase) * (0.28 + (1 - relation) * 0.12),
            0.06,
            0.94,
          ),
          y: clamp(
            y + Math.sin(phase) * (0.25 + (1 - relation) * 0.12),
            0.06,
            0.94,
          ),
        };
      });
      if (primary !== "map" && !t.geometryManual) {
        const relevance = facts?.mapRelevance ?? 0.5;
        const mapShare = clamp(0.08 + relevance * 0.16, 0.08, 0.24);
        const mapAspect = index % 3 === 0 ? 3.6 : index % 3 === 1 ? 0.48 : 1.5;
        const mw = clamp(Math.sqrt((mapShare * mapAspect) / 1.6), 0.18, 0.72),
          mh = clamp(mapShare / mw, 0.18, 0.78);
        Object.assign(candidate.variables, {
          mapWidth: mw,
          mapHeight: mh,
          mapX: clamp(0.5 - Math.cos(angle) * 0.46, 0.06, 0.94),
          mapY: clamp(0.5 - Math.sin(angle) * 0.46, 0.06, 0.94),
          dominance: 0,
        });
      }
      // Optional relation hypothesis is scored against separate contexts, never forced by focus.
      if (
        index >= 6 &&
        t.autoMerge !== false &&
        !t.groups.length &&
        t.intent === "relations"
      ) {
        const related = active
          .filter((a) => a !== primary && a !== "map")
          .sort(
            (a, b) =>
              relationshipWeight(primary, b) - relationshipWeight(primary, a) ||
              a.localeCompare(b),
          )[0];
        if (related && relationshipWeight(primary, related) > 0.65)
          t.groups = [[primary, related]];
      }
    }
    const mapAspect =
      (candidate.variables.mapWidth * 1.6) /
      Math.max(0.1, candidate.variables.mapHeight);
    t.mapMode = selectMapMode(candidate, mapAspect);
    candidates.push(candidate);
  }
  // Empty / explicit takeover / explicit area exchanges need only one meaningful hypothesis.
  return active.length <= 1 ||
    Object.values(original.roles).includes("TAKEOVER") ||
    Object.keys(original.regions ?? {}).length
    ? candidates.slice(0, 1)
    : candidates;
}
export function signatures(model: RepresentationComposition) {
  const f = model.frame;
  const actors = model.representations
    .filter((d) => d.bounds)
    .sort((a, b) => a.actor.localeCompare(b.actor));
  const geometry = actors
    .map((d) => {
      const b = d.bounds!;
      return `${d.actor}:${[b.x - f.x, b.y - f.y, b.width, b.height].map((v, i) => Math.round((v / (i % 2 ? f.height : f.width)) * 20)).join(",")}`;
    })
    .join("|");
  const topology = actors
    .map((d) => {
      const b = d.bounds!,
        x = (b.x + b.width / 2 - f.x) / f.width,
        y = (b.y + b.height / 2 - f.y) / f.height;
      return `${d.actor}:${d.role}:${d.form}:${Math.floor(x * 3)},${Math.floor(y * 3)}:${b.width / b.height > 2.4 ? "wide" : b.width / b.height < 0.65 ? "tall" : "square"}:${d.members.slice().sort().join("+")}`;
    })
    .join("|");
  return {
    geometrySignature: geometry,
    topologySignature: topology,
    representationSignature: actors
      .map((d) => `${d.actor}:${d.family ?? d.form}`)
      .join("|"),
  };
}
export function scoreComposition(
  model: RepresentationComposition,
  state: LivingSnapshot,
  id = 0,
): CandidateSummary {
  const decisions = model.representations.filter((d) => d.bounds),
    f = model.frame,
    total = Math.max(1, area(f)),
    diagonal = Math.hypot(f.width, f.height),
    t = state.topology ?? initialTopology();
  const rejection: string[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const b = decisions[i].bounds!;
    if (!contains(model.usableWorkspaceBounds, b))
      rejection.push("outside-workspace");
    if (
      model.reservedChromeBounds.some((c) => intersection(b, c.bounds)) ||
      model.protectedRegions.some((c) => intersection(b, c.bounds))
    )
      rejection.push("protected-overlap");
    if (decisions.slice(i + 1).some((d) => intersection(b, d.bounds!)))
      rejection.push("surface-overlap");
    if (b.width < 100 || b.height < 44) rejection.push("unusable-surface");
  }
  const wanted = state.surfaces.filter(
    (s) =>
      s.enabled &&
      s.state === "active" &&
      resolveRole(s.id as Domain, state) !== "SUSPENDED",
  );
  let semantic = 0,
    hierarchy = 0,
    relationships = 0,
    shape = 0,
    continuity = 0,
    repetition = 0,
    symmetry = 0,
    ghostGrid = 0,
    clutter = 0,
    slivers = 0;
  for (const s of wanted) {
    const d = decisions.find((d) => d.members.includes(s.id as Domain));
    semantic += d
      ? 1 + (s.id === t.primary ? 1 : 0)
      : -(s.id === t.primary ? 4 : 1.5);
  }
  for (const d of decisions) {
    const b = d.bounds!,
      share = area(b) / total;
    if (d.actor === t.primary) hierarchy += share * 3.5;
    shape +=
      Math.max(-1, Math.min(1, d.score / 8)) / Math.max(1, decisions.length);
    if (
      d.actor !== "map" &&
      share < 0.025 &&
      !["indicator", "strip", "micro-summary"].includes(d.form)
    )
      slivers += 1;
    const previous = t.continuity?.regions[d.actor];
    if (previous) {
      const center = {
        x: (b.x + b.width / 2 - f.x) / f.width,
        y: (b.y + b.height / 2 - f.y) / f.height,
      };
      continuity +=
        Math.hypot(center.x - previous.x, center.y - previous.y) +
        (Math.abs(b.width / f.width - previous.width) +
          Math.abs(b.height / f.height - previous.height)) *
          0.3;
    }
    for (const other of decisions.filter((o) => o.actor > d.actor)) {
      const c = other.bounds!,
        distance =
          Math.hypot(
            b.x + b.width / 2 - c.x - c.width / 2,
            b.y + b.height / 2 - c.y - c.height / 2,
          ) / Math.max(1, diagonal);
      relationships +=
        ((1 - distance) *
          relationshipWeight(d.actor, other.actor) *
          t.gravity) /
        Math.max(1, decisions.length);
      if (d.form === other.form && d.actor !== "map" && other.actor !== "map")
        repetition += 0.28;
      if (
        Math.abs(b.width - c.width) < 12 &&
        Math.abs(b.height - c.height) < 12
      )
        repetition += 0.2;
      if (
        Math.abs(
          b.x + b.width / 2 + (c.x + c.width / 2) - 2 * (f.x + f.width / 2),
        ) < 18 &&
        Math.abs(b.y - c.y) < 18
      )
        symmetry += 0.2;
      if (
        Math.abs(b.x - c.x) < 8 ||
        Math.abs(b.x + b.width - c.x - c.width) < 8
      )
        ghostGrid += 0.1;
      if (
        Math.abs(b.y - c.y) < 8 ||
        Math.abs(b.y + b.height - c.y - c.height) < 8
      )
        ghostGrid += 0.1;
    }
  }
  if (
    decisions.filter((d) => d.role === "PRIMARY" || d.role === "TAKEOVER")
      .length > 1
  )
    clutter += 2;
  if (
    decisions.filter((d) => d.actor !== "map" && d.form === "contextual")
      .length > 3
  )
    clutter += 0.6;
  if (
    decisions.filter((d) => d.actor !== "map").length >= 4 &&
    new Set(decisions.filter((d) => d.actor !== "map").map((d) => d.form))
      .size === 1
  )
    repetition += 2;
  const freeIslands =
    model.freeRegions
      .filter((r) => r.width > 180 && r.height > 160)
      .reduce((n, r) => n + area(r), 0) / total;
  if (clutter >= 2) rejection.push("dominance-overload");
  if (
    decisions.filter((d) => d.actor !== "map").length >= 6 &&
    repetition >= 2 &&
    !Object.keys(t.forms).length
  )
    rejection.push("uniform-morphology");
  if (slivers > 1) rejection.push("thin-unusable-regions");
  const unmet = Math.max(
    0,
    wanted.length - decisions.filter((d) => d.actor !== "map").length,
  );
  const emptiness =
    Math.max(0, model.accidentalFreeRatio) * (wanted.length ? 1 : 0.1) +
    freeIslands * (unmet ? 0.8 : 0.3);
  const map = model.representations.find((d) => d.actor === "map"),
    primaryFacts =
      t.primary === "map" ? null : dataShape(t.primary, t.facts?.[t.primary]);
  const mapRelevance = map?.bounds
    ? (primaryFacts?.mapRelevance ?? 0.7) *
      Math.min(0.35, area(map.bounds) / total)
    : state.variables.visible && (primaryFacts?.mapRelevance ?? 0.7) > 0.4
      ? -0.8
      : 0;
  const semanticChange = t.continuity?.primary !== t.primary;
  const terms = {
    semantic,
    hierarchy,
    utilization: model.utilizationRatio,
    emptiness,
    relationships,
    shape,
    continuity,
    repetition,
    symmetry,
    ghostGrid,
    clutter,
    slivers,
    mapRelevance,
  };
  const score =
    semantic * 2.8 +
    hierarchy +
    model.utilizationRatio * 3.2 -
    emptiness * 5 +
    relationships * 1.2 +
    shape +
    mapRelevance -
    continuity * (semanticChange ? 0.3 : 1.3) -
    repetition -
    symmetry -
    ghostGrid -
    clutter * 2 -
    slivers;
  const reasons = [
    `semantic coverage ${semantic.toFixed(2)}`,
    `useful area ${(model.utilizationRatio * 100).toFixed(0)}%`,
    `unused penalty ${emptiness.toFixed(2)}`,
    `continuity ${continuity.toFixed(2)}`,
    `repetition / grid ${(repetition + ghostGrid).toFixed(2)}`,
    `relationship affinity ${relationships.toFixed(2)}`,
  ];
  return {
    id,
    score,
    accepted: !rejection.length,
    rejection: [...new Set(rejection)],
    terms,
    signature: signatures(model).topologySignature,
    reasons,
  };
}
/** A bounded deterministic design search. No RNG, DOM reads, timers or external services. */
export function synthesize(
  state: LivingSnapshot,
  size: Size,
  space: WorkspaceSpace,
): RepresentationComposition {
  if (state.topology?.overlay) return overlayComposition(state, size, space);
  if (state.topology?.focusIsolation && state.focus) {
    const isolated = structuredClone(state);
    isolated.topology!.focusIsolation = false;
    isolated.topology!.retained = {};
    isolated.topology!.groups = [];
    for (const s of isolated.surfaces)
      if (s.id !== state.focus)
        isolated.topology!.roles[s.id as Domain] = "SUSPENDED";
    return synthesize(isolated, size, space);
  }
  const states = generateCandidates(state),
    summaries: CandidateSummary[] = [];
  let best: RepresentationComposition | undefined,
    winner: CandidateSummary | undefined;
  for (let i = 0; i < states.length; i++) {
    const candidate = composeRepresentationCandidate(states[i], size, space),
      summary = scoreComposition(candidate, states[i], i);
    summaries.push(summary);
    if (summary.accepted && (!winner || summary.score > winner.score + 1e-8)) {
      best = candidate;
      winner = summary;
    }
  }
  if (!best) {
    best = composeRepresentationCandidate(state, size, space);
    winner = scoreComposition(best, state, 0);
  }
  return {
    ...best,
    synthesis: {
      budget: CANDIDATE_BUDGET,
      generated: states.length,
      rejected: summaries.filter((s) => !s.accepted).length,
      winner: winner!.id,
      candidates: summaries,
      ...signatures(best),
      reasons: winner!.reasons,
    },
  };
}
