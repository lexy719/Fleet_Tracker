import { SPATIAL_PRESENTATIONS, informationDepth } from "./spatialPresentation";
import { JOBS } from "./guidedContent";
import { composeEntityLayout } from "./entityComposition";
import type {
  GuidedLayout,
  GuidedLens,
  GuidedState,
  Rect,
  Zone,
} from "./guidedWorkspace";
import type { MapMode } from "./mapTypes";
import {
  sharedWork,
  usesSharedWork,
  type SharedWork,
} from "./sharedComposition";

export type SemanticGroup = "operation" | "resources" | "journey" | "assurance";
export type ParticipationRole =
  | "LEAD"
  | "SUPPORTING"
  | "INLINE"
  | "HIDDEN_BUT_ACTIVE";
export type InformationForm =
  | "INLINE"
  | "SUPPORT"
  | "MEDIUM"
  | "LEAD"
  | "DEEP_LEAD";
export type CompositionFamily =
  | "PRIMARY_SUPPORT_STACK"
  | "SPATIAL_DOMINANT"
  | "HORIZONTAL_JOURNEY"
  | "CENTERED_WORK"
  | "NO_MAP_ASSURANCE"
  | "SPLIT_DECISION"
  | "ENTITY_COMPOSITION";
type DomainContract = {
  group: SemanticGroup;
  priority: number;
  preferredWidth: [number, number];
  map: "route" | "local" | "segment" | "optional";
  merge: GuidedLens[];
  lead: string;
  support: string;
  inline: string;
  promotion?: "driver-time";
};
/** Authored information contracts, shared by normal, lead and temporary paths.
 * Adding an inline lens extends a group, not a branch for every combination. */
export const LENS_CONTRACTS: Record<GuidedLens, DomainContract> = {
  Jobs: {
    group: "operation",
    priority: 100,
    preferredWidth: [480, 1050],
    map: "route",
    merge: ["Pricing DEV"],
    lead: "Transportes, progresso e janela",
    support: "Identidade do transporte e tempo de entrega",
    inline: "Âncora, ETA e janela",
  },
  Drivers: {
    group: "resources",
    priority: 80,
    preferredWidth: [520, 920],
    map: "local",
    merge: ["Trucks"],
    lead: "Turno, condução e próxima tarefa",
    support: "Tempo legal e compatibilidade da pausa",
    inline: "Identidade e tempo restante",
    promotion: "driver-time",
  },
  Trucks: {
    group: "resources",
    priority: 75,
    preferredWidth: [520, 920],
    map: "local",
    merge: ["Drivers"],
    lead: "Veículo, combustível e capacidade",
    support: "Autonomia, consumo e conjunto",
    inline: "Veículo e autonomia",
  },
  Fuel: {
    group: "journey",
    priority: 90,
    preferredWidth: [620, 1080],
    map: "route",
    merge: ["Restrictions"],
    lead: "Comparar paragem, desvio e tempo",
    support: "Próxima paragem útil",
    inline: "Posto selecionado ou proposta",
  },
  Restrictions: {
    group: "journey",
    priority: 65,
    preferredWidth: [550, 920],
    map: "segment",
    merge: ["Fuel"],
    lead: "Acesso e condições da próxima etapa",
    support: "Condições relevantes à execução",
    inline: "Acesso e janela a confirmar",
  },
  Documents: {
    group: "assurance",
    priority: 60,
    preferredWidth: [700, 1160],
    map: "optional",
    merge: ["Compliance DEV"],
    lead: "Documento, intervenientes e status",
    support: "Autorização e comprovativo",
    inline: "Estado documental relevante",
  },
  "Pricing DEV": {
    group: "operation",
    priority: 10,
    preferredWidth: [560, 940],
    map: "optional",
    merge: ["Jobs"],
    lead: "Ensaio de participação comercial",
    support: "Contexto comercial de demonstração",
    inline: "Preço por confirmar · DEV",
  },
  "Compliance DEV": {
    group: "assurance",
    priority: 15,
    preferredWidth: [560, 940],
    map: "optional",
    merge: ["Documents"],
    lead: "Ensaio de participação de assurance",
    support: "Estado de conformidade de demonstração",
    inline: "Conformidade por rever · DEV",
  },
};
export const GUIDED_LENSES = Object.keys(LENS_CONTRACTS) as GuidedLens[];
export type Participation = {
  group: SemanticGroup;
  role: ParticipationRole;
  form: InformationForm;
  question: string;
  promoted: boolean;
};
export type CompositionPlan = {
  shared?: SharedWork;
  family: CompositionFamily;
  arrangement: string;
  spatialCharacter: string;
  primary: GuidedLens | null;
  primaryZone: Zone | null;
  groups: Partial<Record<SemanticGroup, GuidedLens[]>>;
  participation: Partial<Record<GuidedLens, Participation>>;
  mapUseful: boolean;
  density: "calm" | "working" | "dense";
  explanation: string;
};
const zoneFor: Record<SemanticGroup, Zone> = {
  operation: "jobs",
  resources: "resources",
  journey: "fuel",
  assurance: "assurance",
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const MAP_MIN_WIDTH = { route: 330, local: 310, segment: 360, optional: 310 };
/** Geometry affinity: is the selected transport's corridor taller than wide? */
function portraitRoute(state: GuidedState) {
  if (state.anchor.kind !== "job") return false;
  const id = state.anchor.id;
  const route = JOBS.find((j) => j.id === id)?.route ?? [];
  if (route.length < 2) return false;
  const lngs = route.map((p) => p[0]),
    lats = route.map((p) => p[1]);
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const w =
    (Math.max(...lngs) - Math.min(...lngs)) *
    Math.cos((midLat * Math.PI) / 180);
  const h = Math.max(...lats) - Math.min(...lats);
  return h > w * 1.25;
}

/** Intent decides structure. Demand chooses exact geometry inside that family. */
export function participationPlan(
  state: GuidedState,
  width: number,
): CompositionPlan {
  const groups: CompositionPlan["groups"] = {};
  const participation: CompositionPlan["participation"] = {};
  const primary =
    state.lead ??
    [...state.active].sort(
      (a, b) => LENS_CONTRACTS[b].priority - LENS_CONTRACTS[a].priority,
    )[0] ??
    null;
  const primaryZone = primary ? zoneFor[LENS_CONTRACTS[primary].group] : null;
  for (const lens of GUIDED_LENSES.filter((l) => state.active.includes(l))) {
    const c = LENS_CONTRACTS[lens];
    (groups[c.group] ??= []).push(lens);
    const promoted =
      c.promotion === "driver-time" && state.exceptions.driverTimeCritical;
    let role: ParticipationRole =
      lens === primary
        ? state.lead
          ? "LEAD"
          : "SUPPORTING"
        : c.group === "resources" || (lens === "Fuel" && primaryZone !== "fuel")
          ? "SUPPORTING"
          : "INLINE";
    if (
      lens === "Fuel" &&
      (primaryZone === "assurance" || primary === "Restrictions")
    )
      role = "INLINE";
    if (
      c.group === "resources" &&
      width < 1300 &&
      state.active.length >= 6 &&
      primaryZone !== "resources" &&
      !promoted
    )
      role = "INLINE";
    if (primaryZone === "assurance" && c.group === "resources" && !promoted)
      role = "INLINE";
    if (state.takeover) role = "HIDDEN_BUT_ACTIVE";
    const docs = primary === "Documents" || primary === "Compliance DEV";
    const question =
      docs && c.group === "resources"
        ? "Identidade e status dos intervenientes"
        : docs && lens === "Fuel"
          ? "Autorização e comprovativo da paragem"
          : primary === "Drivers" && lens === "Fuel"
            ? "Próxima paragem e pausa"
            : lens === primary
              ? c.lead
              : role === "INLINE"
                ? c.inline
                : c.support;
    participation[lens] = {
      group: c.group,
      role,
      form:
        role === "LEAD"
          ? "LEAD"
          : lens === primary
            ? "MEDIUM"
            : role === "SUPPORTING"
              ? "SUPPORT"
              : "INLINE",
      question,
      promoted,
    };
  }
  const mapUseful =
    (!state.takeover || ["map", "segment"].includes(state.takeover.kind)) &&
    (state.spatial.question !== "NONE" || state.mapFull);
  const n = Object.keys(groups).length;
  let family: CompositionFamily = "PRIMARY_SUPPORT_STACK";
  let explanation = "Área principal e coluna de apoios semânticos.";
  if (state.mapFull && !state.takeover) {
    family = "SPATIAL_DOMINANT";
    explanation =
      "Modo espacial: o mapa é a tela; a lente principal torna-se um inspetor espacial e as outras lentes acrescentam contexto.";
  } else if (state.takeover) {
    family = ["map", "segment"].includes(state.takeover.kind)
      ? "SPATIAL_DOMINANT"
      : "CENTERED_WORK";
    explanation =
      "Inspeção temporária; a âncora, lead e lentes permanecem guardados.";
  } else if (!primary || (!state.lead && primary === "Jobs")) {
    family = "SPATIAL_DOMINANT";
    explanation =
      state.anchor.kind === "jobs"
        ? "Coleção operacional com geografia dominante."
        : "Geografia do transporte e faixa operacional agrupada.";
  } else if (!mapUseful) {
    family = n >= 3 || width >= 1650 ? "NO_MAP_ASSURANCE" : "CENTERED_WORK";
    explanation =
      "Área de trabalho sem geografia; profundidade cresce com espaço útil.";
  } else if (
    width < 1050 ||
    (primary &&
      width <
        LENS_CONTRACTS[primary].preferredWidth[0] +
          MAP_MIN_WIDTH[LENS_CONTRACTS[primary].map] +
          152) ||
    (SPATIAL_PRESENTATIONS[state.spatial.question].character === "overview" &&
      n >= 4)
  ) {
    family = "HORIZONTAL_JOURNEY";
    explanation =
      "Journey partilhado: mapa largo e trabalho/apoios na outra faixa.";
  } else if (state.spatial.question === "AFFECTED_SEGMENT") {
    family = "PRIMARY_SUPPORT_STACK";
    explanation = "Análise da condição com geografia local legível.";
  } else if (
    primaryZone === "resources" ||
    primaryZone === "assurance" ||
    SPATIAL_PRESENTATIONS[state.spatial.question].character === "local"
  ) {
    family = "CENTERED_WORK";
    explanation = "Trabalho central com geografia lateral e apoios integrados.";
  } else if (n <= 2) {
    family = "SPLIT_DECISION";
    explanation =
      "Decisão e geografia equilibradas, sem apoios que exijam coluna.";
  }
  return {
    family,
    arrangement: "base",
    spatialCharacter: SPATIAL_PRESENTATIONS[state.spatial.question].character,
    primary,
    primaryZone,
    groups,
    participation,
    mapUseful,
    density:
      state.active.length >= 6
        ? "dense"
        : state.active.length > 2
          ? "working"
          : "calm",
    explanation,
  };
}

export function composeWorkspace(
  state: GuidedState,
  width: number,
  height: number,
): GuidedLayout {
  const plan = participationPlan(
    usesSharedWork(state)
      ? {
          ...state,
          lead: null,
          active: GUIDED_LENSES.filter((lens) => state.active.includes(lens)),
        }
      : state,
    width,
  );
  // The anchor strip states the transport context once, above every region.
  const STRIP = 50;
  const margin = width >= 1700 ? 32 : 22,
    x = width < 800 ? 76 : 104,
    y = margin + STRIP;
  const W = Math.max(120, width - x - margin),
    H = Math.max(180, height - margin * 2 - STRIP),
    gap = width >= 1700 ? 28 : 20;
  const rect = (rx: number, ry: number, rw: number, rh: number): Rect => ({
    x: rx,
    y: ry,
    width: Math.max(1, rw),
    height: Math.max(1, rh),
  });
  const full = rect(x, y, W, H);
  if (usesSharedWork(state)) {
    const work = sharedWork(state)!;
    // Shared task, rather than domain priority, chooses the working structure.
    const spatial = work.kind === "journey";
    const day = state.anchor.kind === "jobs";
    const scopedJob =
      state.anchor.kind === "job"
        ? state.anchor.id
        : state.anchor.kind === "jobs"
          ? null
          : state.anchor.job;
    // The spatial read boundary supplies NONE for missing/unassigned objects.
    // Keep this composer independent of runtime read models and their imports.
    const mapVisible =
      (work.variant !== "credentials" || state.mapFull) &&
      (day ||
        (!!scopedJob &&
          JOBS.some((job) => job.id === scopedJob) &&
          state.spatial.question !== "NONE"));
    const stacked = (spatial && day) || width < 1000;
    const mapWidth = Math.min(W, Math.max(310, W * 0.35));
    const workHeight = Math.min(
      H * 0.72,
      clamp(H * (spatial ? 0.44 : 0.62), 300, spatial ? 420 : 520),
    );
    let workRect = !mapVisible
      ? full
      : !day && spatial && width >= 1000
        ? rect(x + W * 0.54 + gap, y, W * 0.46 - gap, H)
        : stacked
          ? rect(x, y + H - workHeight, W, workHeight)
          : rect(x, y, W - mapWidth - gap, H);
    let sharedMap =
      !day && spatial && width >= 1000
        ? rect(x, y, W * 0.54, H)
        : stacked
          ? rect(x, y, W, H - workHeight - gap)
          : rect(x + W - mapWidth, y, mapWidth, H);
    if (mapVisible && width >= 1000) {
      if (["schedule", "capacity"].includes(work.variant)) {
        const mapHeight = Math.max(
          200,
          H * (work.variant === "schedule" ? 0.36 : 0.24),
        );
        workRect = rect(x, y, W, H - mapHeight - gap);
        sharedMap = rect(x, y + H - mapHeight, W, mapHeight);
      } else if (["route-choice", "execution-records"].includes(work.variant)) {
        const mapHeight = H * (work.variant === "route-choice" ? 0.56 : 0.5);
        sharedMap = rect(x, y, W, mapHeight - gap);
        workRect = rect(x, y + mapHeight, W, H - mapHeight);
      } else if (work.variant === "range") {
        sharedMap = rect(x, y, W * 0.66 - gap, H);
        workRect = rect(x + W * 0.66, y, W * 0.34, H);
      } else if (work.variant === "clearance") {
        const corridorWidth = Math.max(310, W * 0.29);
        workRect = rect(x, y, W - corridorWidth - gap, H);
        sharedMap = rect(x + W - corridorWidth, y, corridorWidth, H);
      }
    } else if (mapVisible && width < 1000) {
      // Keep the task's reading order in a narrow workspace. Equipment,
      // records and duty questions start with the work; spatial execution
      // starts with geography, with enough room left for an actual decision.
      const workFirst = [
        "unit",
        "capacity",
        "schedule",
        "clearance",
        "departure",
      ].includes(work.variant);
      const mapHeight = Math.max(200, H * (workFirst ? 0.28 : 0.4));
      sharedMap = rect(x, workFirst ? y + H - mapHeight : y, W, mapHeight);
      workRect = rect(
        x,
        workFirst ? y : y + mapHeight + gap,
        W,
        H - mapHeight - gap,
      );
    }
    if (mapVisible && state.mapFull) {
      const strip = ["unit", "capacity", "schedule", "route-choice"].includes(
        work.variant,
      );
      if (strip || width < 1000) {
        const stripHeight = Math.min(H * 0.55, Math.max(300, H * 0.38));
        sharedMap = rect(x, y, W, H - stripHeight - gap);
        workRect = rect(x, y + H - stripHeight, W, stripHeight);
      } else {
        const workingWidth = Math.min(W * 0.44, Math.max(350, W * 0.32));
        const left =
          work.variant === "departure" || work.variant === "credentials";
        workRect = rect(left ? x : x + W - workingWidth, y, workingWidth, H);
        sharedMap = rect(
          left ? x + workingWidth + gap : x,
          y,
          W - workingWidth - gap,
          H,
        );
      }
    }
    const joint: CompositionPlan = {
      ...plan,
      shared: work,
      family: spatial ? "HORIZONTAL_JOURNEY" : "CENTERED_WORK",
      primary: null,
      primaryZone: null,
      arrangement: `shared-${work.variant}`,
      explanation: work.question,
      mapUseful: mapVisible,
    };
    // Every participating domain belongs to the joint instrument; none retains
    // a separate lead rectangle or disappears into an appended context column.
    for (const role of Object.values(joint.participation)) {
      role.role = "SUPPORTING";
      role.form = "MEDIUM";
      role.question = work.question;
    }
    return {
      path: `shared-${work.kind}`,
      viewport: { width, height },
      zones: {},
      regions: [
        {
          id: "shared-work",
          rep: "shared-work",
          rect: workRect,
          role: "lead",
          lenses: GUIDED_LENSES.filter((lens) => state.active.includes(lens)),
        },
      ],
      map: {
        ...sharedMap,
        visible: mapVisible,
        opacity: mapVisible ? 1 : 0,
        radius: 14,
      },
      mode: mapVisible ? (day ? "FULL_OPERATIONAL" : "ROUTE_FOCUS") : "HIDDEN",
      inlineFuel: false,
      inlineResources: false,
      composition: joint,
    };
  }
  if (
    state.anchor.kind !== "jobs" &&
    state.anchor.kind !== "job" &&
    !state.takeover
  )
    return composeEntityLayout(state, width, height, plan);
  const zones: GuidedLayout["zones"] = {};
  let mapRect = full,
    mapVisible = plan.mapUseful;
  const p = plan.primaryZone;
  const selected = state.anchor.kind === "job";
  const resourceSupport =
    Object.entries(plan.participation).some(
      ([, r]) => r.group === "resources" && r.role === "SUPPORTING",
    ) && p !== "resources";
  const fuelSupport =
    plan.participation.Fuel?.role === "SUPPORTING" && p !== "fuel";
  const promoted = Object.values(plan.participation).some((r) => r.promoted);
  let inlineFuel = !!plan.participation.Fuel && plan.primary !== "Fuel",
    inlineResources = !!plan.groups.resources && p !== "resources";
  const supportZone: Zone | null = resourceSupport
    ? "resources"
    : fuelSupport
      ? "fuel"
      : null;
  const demand = plan.primary
    ? LENS_CONTRACTS[plan.primary].preferredWidth
    : [480, 1050];
  // Semantic content demand adjusts inside authored ranges, never scores candidates.
  const ratio = clamp(
    (demand[0] + (demand[1] - demand[0]) * 0.45) / W +
      Object.keys(plan.groups).length * 0.015,
    0.48,
    0.68,
  );
  let inset: Rect | undefined;
  if (state.mapFull && !state.takeover) {
    // The map fills the canvas. The lead becomes a spatial inspector whose
    // shape depends on the lens; supporting lenses become small context cards.
    mapRect = rect(x, y, W, H);
    const pad = 14;
    const lead = plan.primary;
    const contexts = (Object.keys(plan.groups) as SemanticGroup[])
      .map((g) => zoneFor[g])
      .filter((z) => z !== p && !(z === "jobs" && selected));
    let side: "left" | "right" | "bottom" = "right";
    if (!selected) {
      const w = clamp(W * 0.3, 360, 520);
      if (p) zones[p] = rect(x + pad, y + pad + 56, w, H - pad * 2 - 56);
      side = "left";
      inset = { x: w + pad * 2, y: 0, width: 0, height: 0 };
    } else if (lead === "Fuel") {
      const h = clamp(H * 0.3, 230, 300);
      zones.fuel = rect(x + pad, y + H - h - pad, W - pad * 2, h);
      side = "bottom";
      inset = { x: 0, y: 0, width: 0, height: h + pad * 2 };
    } else if (lead === "Trucks") {
      const w = clamp(W * 0.34, 420, 560),
        h = clamp(H * 0.5, 360, 470);
      zones.resources = rect(x + pad, y + H - h - pad, w, h);
      side = "left";
      inset = { x: w + pad * 2, y: 0, width: 0, height: 0 };
    } else if (!lead || lead === "Jobs") {
      const w = clamp(W * 0.28, 340, 440);
      zones.jobs = rect(x + pad, y + pad + 56, w, H - pad * 2 - 56);
      side = "left";
      inset = { x: w + pad * 2, y: 0, width: 0, height: 0 };
    } else {
      // Drivers, Restrictions, Documents: an edge inspector on the right.
      const w = clamp(W * (lead === "Restrictions" ? 0.3 : 0.27), 340, 470);
      if (p) zones[p] = rect(x + W - w - pad, y + pad, w, H - pad * 2);
      side = "right";
      inset = { x: 0, y: 0, width: w + pad * 2, height: 0 };
    }
    // Context cards stack on the side opposite the inspector (top-left for right inspectors).
    const cw = clamp(W * 0.2, 260, 320),
      ch = 150;
    contexts.slice(0, 3).forEach((z, i) => {
      const cx = side === "right" ? x + pad : x + W - cw - pad;
      const cy = y + pad + 56 + i * (ch + 10);
      zones[z] = rect(
        cx,
        cy,
        cw,
        side === "bottom"
          ? Math.min(ch, H - (H * 0.3 + 60) - i * (ch + 10))
          : ch,
      );
    });
    if (contexts.length && inset) {
      if (side === "right") inset.x = cw + pad * 2;
      else inset.width = cw + pad * 2;
    }
    plan.arrangement = `spatial-${lead ?? "operation"}-${side}`;
    plan.mapUseful = true;
    mapVisible = true;
  } else if (state.takeover) {
    if (["map", "segment"].includes(state.takeover.kind)) {
      mapRect = rect(x, y, W, H);
    } else {
      const zone: Zone =
        state.takeover.kind === "document"
          ? "assurance"
          : state.takeover.kind === "station"
            ? "fuel"
            : "resources";
      // Wide screens give the inspected object more structure, not side margins.
      zones[zone] = rect(x, y, W, H);
      mapVisible = false;
      mapRect = rect(x, y, W, H);
    }
  } else if (!plan.primary && state.anchor.kind === "jobs") {
    // Today's journeys share the map, with compact controls along its edge.
    const stripHeight = clamp(H * 0.25, 180, 208);
    zones.jobs = rect(x, y + H - stripHeight, W, stripHeight);
    mapRect = rect(x, y, W, H - stripHeight - 12);
    plan.arrangement = "operation-map / journey-strip";
  } else if (plan.primary && state.anchor.kind === "jobs" && width >= 900) {
    // Operation-wide perspective: one view of every transport beside the fleet map.
    // Other active lenses annotate its rows; they never open empty support regions.
    const wide =
      plan.primary === "Trucks" ||
      plan.primary === "Jobs" ||
      plan.primary === "Documents";
    const listWidth =
      width >= 1700
        ? clamp(W * (wide ? 0.62 : 0.56), 900, 1240)
        : clamp(W * (wide ? 0.64 : 0.6), 620, 900);
    if (p) zones[p] = rect(x, y, mapVisible ? listWidth : W, H);
    mapRect = rect(x + listWidth + gap, y, W - listWidth - gap, H);
    plan.arrangement = mapVisible
      ? "operation-view-left / fleet-map-right"
      : "operation-view-full";
  } else if (!plan.primary) {
    mapRect = full;
  } else if (width < 900) {
    if (p) zones[p] = rect(x, y, W, mapVisible ? H * 0.65 - gap : H);
    mapRect = rect(x, y + H * 0.65, W, H * 0.35);
  } else if (plan.family === "SPATIAL_DOMINANT") {
    if (!selected) {
      const count =
        state.filter === "moving"
          ? JOBS.filter((j) => j.status === "Em trânsito").length
          : JOBS.length;
      const listWidth =
        width >= 1700 ? clamp(W * 0.52, 900, 1100) : clamp(W * 0.6, 640, 860);
      void count;
      zones.jobs = rect(x, y, listWidth, H);
      mapRect = rect(x + listWidth + gap, y, W - listWidth - gap, H);
    } else if (portraitRoute(state) && W >= 1000) {
      // A north–south transport reads in portrait; the overview takes the width.
      const mapW = clamp(W * 0.32, 340, 600);
      mapRect = rect(x + W - mapW, y, mapW, H);
      zones.jobs = rect(x, y, W - mapW - gap, H);
      plan.arrangement = "overview-left / portrait-route-right";
    } else {
      const strip = clamp(H * 0.5, 360, 500),
        mapH = H - strip - gap;
      mapRect = rect(x, y, W, mapH);
      const supportWidth = supportZone ? clamp(W * 0.3, 310, 470) : 0;
      zones.jobs = rect(
        x,
        y + mapH + gap,
        W - (supportWidth ? supportWidth + gap : 0),
        strip,
      );
      if (supportZone)
        zones[supportZone] = rect(
          x + W - supportWidth,
          y + mapH + gap,
          supportWidth,
          strip,
        );
    }
  } else if (
    plan.family === "NO_MAP_ASSURANCE" ||
    (plan.family === "CENTERED_WORK" && !mapVisible)
  ) {
    const side = resourceSupport ? clamp(W * 0.27, 300, 410) : 0;
    const workW = W - (side ? side + gap : 0);
    if (p)
      zones[p] = rect(
        x + (W - workW - (side ? side + gap : 0)) / 2,
        y,
        workW,
        H,
      );
    if (side) zones.resources = rect(zones[p!]!.x + workW + gap, y, side, H);
    mapVisible = false;
    mapRect = rect(x + W * 0.72, y, W * 0.28, H * 0.35);
  } else if (
    SPATIAL_PRESENTATIONS[state.spatial.question].character === "local" &&
    mapVisible
  ) {
    const affinity = SPATIAL_PRESENTATIONS[state.spatial.question];
    const mapW = clamp(
      W * (state.spatial.question === "AFFECTED_SEGMENT" ? 0.43 : 0.34),
      330,
      620,
    );
    const mapH = Math.min(
      mapW / affinity.aspect,
      H - (supportZone ? 240 + gap : 70),
    );
    const mapRight =
      plan.primary === "Trucks" || plan.primaryZone === "assurance";
    const mx = mapRight ? x + W - mapW : x;
    mapRect = rect(
      mx,
      y + (supportZone ? 0 : (H - mapH) * 0.33),
      mapW,
      Math.max(280, mapH),
    );
    if (p) zones[p] = rect(mapRight ? x : x + mapW + gap, y, W - mapW - gap, H);
    if (supportZone)
      zones[supportZone] = rect(
        mx,
        y + mapRect.height + gap,
        mapW,
        H - mapRect.height - gap,
      );
    plan.arrangement = mapRight
      ? "local-right / work-left"
      : "local-left / work-right";
  } else if (state.spatial.question === "NEXT_LEG" && mapVisible) {
    const mapW = clamp(
        W * (plan.primary === "Drivers" ? 0.34 : 0.45),
        380,
        750,
      ),
      mapH = clamp(mapW / 1.65, 290, H * 0.55);
    mapRect = rect(x + W - mapW, y, mapW, mapH);
    if (p) zones[p] = rect(x, y, W - mapW - gap, H);
    if (supportZone)
      zones[supportZone] = rect(
        x + W - mapW,
        y + mapH + gap,
        mapW,
        H - mapH - gap,
      );
    plan.arrangement = "work-left / corridor-right";
  } else if (
    state.spatial.question === "ROUTE_AND_STOP" &&
    state.spatial.target === "candidates" &&
    mapVisible &&
    selected &&
    portraitRoute(state) &&
    W >= 1000
  ) {
    // The route strip is the linear instrument; real geography of a north–south
    // corridor reads in portrait beside it instead of a wide, shallow band.
    const mapW = clamp(W * 0.3, 330, 560);
    const mapH = supportZone ? clamp(H * 0.56, 320, H - 220) : H;
    mapRect = rect(x + W - mapW, y, mapW, mapH);
    if (p) zones[p] = rect(x, y, W - mapW - gap, H);
    if (supportZone)
      zones[supportZone] = rect(
        x + W - mapW,
        y + mapH + gap,
        mapW,
        H - mapH - gap,
      );
    plan.arrangement = "decision-left / portrait-route-right";
  } else if (
    plan.family === "HORIZONTAL_JOURNEY" ||
    (selected &&
      SPATIAL_PRESENTATIONS[state.spatial.question].character === "overview")
  ) {
    const mapAbove = plan.primaryZone === "fuel";
    const affinity = SPATIAL_PRESENTATIONS[state.spatial.question];
    const mapH = clamp(
        H * (plan.primary === "Fuel" ? 0.27 : affinity.prominence),
        plan.primary === "Fuel" ? 220 : 290,
        H * 0.5,
      ),
      workH = H - mapH - gap;
    mapRect = rect(x, mapAbove ? y : y + workH + gap, W, mapH);
    const workY = mapAbove ? y + mapH + gap : y;
    plan.arrangement = mapAbove
      ? "overview-above / decision-below"
      : "work-above / overview-below";
    const side =
      supportZone && W >= 1000
        ? clamp(W * (promoted ? 0.32 : 0.27), 310, 480)
        : 0;
    if (p) zones[p] = rect(x, workY, W - (side ? side + gap : 0), workH);
    if (side && supportZone)
      zones[supportZone] = rect(x + W - side, workY, side, workH);
  } else if (plan.family === "CENTERED_WORK") {
    const mapW = clamp(W * 0.32, 310, 570),
      workW = W - mapW - gap;
    mapRect = rect(x, y + H * 0.12, mapW, H * 0.76);
    if (p) zones[p] = rect(x + mapW + gap, y, workW, H);
  } else {
    const preferredW =
      plan.primary === "Jobs" && !selected
        ? W * clamp(width >= 1700 ? 0.55 : 0.51, 0.48, 0.6)
        : W * ratio;
    const primaryW = Math.min(
      preferredW,
      W - gap - MAP_MIN_WIDTH[LENS_CONTRACTS[plan.primary!].map],
    );
    const sideW = W - primaryW - gap;
    // Balanced family mirrors on wide screens; stack family reserves real support demand.
    const mirror = plan.family === "SPLIT_DECISION" && width >= 1700;
    const primaryX = mirror ? x + sideW + gap : x,
      sideX = mirror ? x : x + primaryW + gap;
    if (p) zones[p] = rect(primaryX, y, primaryW, H);
    const supportH = supportZone
      ? clamp(H * (promoted ? 0.43 : 0.34), 260, promoted ? 420 : 340)
      : 0;
    mapRect = rect(sideX, y, sideW, H - (supportH ? supportH + gap : 0));
    if (supportH && supportZone)
      zones[supportZone] = rect(sideX, y + H - supportH, sideW, supportH);
  }
  if (zones.fuel && plan.participation.Fuel?.role !== "INLINE")
    inlineFuel = false;
  if (zones.resources) inlineResources = false;
  // Actual allocated space decides information forms, including merged/inline supports.
  for (const [lens, r] of Object.entries(plan.participation) as [
    GuidedLens,
    Participation,
  ][]) {
    if (state.takeover) continue;
    if (state.mapFull) {
      r.form = lens === plan.primary ? "MEDIUM" : "SUPPORT";
      continue;
    }
    if (lens === plan.primary && state.lead && zones[zoneFor[r.group]]) {
      const allocated = zones[zoneFor[r.group]]!;
      r.form = informationDepth(allocated.width, allocated.height, true);
    }
    const zone = zoneFor[r.group];
    if (lens !== plan.primary && !zones[zone]) {
      r.role = "INLINE";
      r.form = "INLINE";
    } else if (r.role === "SUPPORTING" && zones[zone] && lens !== plan.primary)
      r.form = zones[zone]!.height >= 390 ? "MEDIUM" : "SUPPORT";
  }
  let mode: MapMode = "SUPPORTING_MAP";
  if (state.spatial.question === "AFFECTED_SEGMENT")
    mode = "RESTRICTION_SEGMENT";
  else if (
    [
      "FULL_ROUTE",
      "RESOURCE_AND_JOB",
      "MULTI_ENTITY",
      "ORIGIN_DESTINATION",
      "USER_REQUESTED",
    ].includes(state.spatial.question)
  )
    mode = "ROUTE_FOCUS";
  else if (state.spatial.question === "ROUTE_AND_STOP") mode = "FUEL_ROUTE";
  else if (state.spatial.question === "NEXT_LEG") mode = "ROUTE_CORRIDOR";
  if (!state.active.length) mode = "FULL_OPERATIONAL";
  if (!mapVisible) mode = "HIDDEN";
  return {
    path: state.takeover
      ? `temporary-${state.takeover.kind}`
      : state.mapFull
        ? `spatial-${plan.primary ?? "base"}`
        : `${plan.family.toLowerCase()}-${plan.primary ?? "base"}`,
    viewport: { width, height },
    zones,
    map: {
      ...mapRect,
      radius: state.takeover?.kind === "map" || state.mapFull ? 12 : 14,
      visible: mapVisible,
      opacity: mapVisible ? 1 : 0,
      ...(inset
        ? {
            inset: {
              top: inset.y + 70,
              left: inset.x,
              right: inset.width,
              bottom: inset.height,
            },
          }
        : {}),
    },
    mode,
    inlineFuel,
    inlineResources,
    composition: plan,
  };
}
