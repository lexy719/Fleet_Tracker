import type { CompositionPlan } from "./compositionGrammar";
import type { GuidedLayout, GuidedState, Rect } from "./guidedWorkspace";
import type { MapMode } from "./mapTypes";
import {
  entityLayers,
  ANCHOR_LENS,
  isEntity,
  entityRecipe,
  RECIPE_QUESTION,
  type EntityRecipe,
} from "./entityRecipes";

/**
 * Representations an entity composition can place. Each answers a different
 * question about the same object; the recipe decides which one leads.
 */
export type Representation =
  | "shared-work" // one joint operational structure, independent of the original domain
  | "driver-day" // full continuous day (EU 561 axis, notes)
  | "driver-strip" // compressed day: margin, next event, counters
  | "driver-passages" // day axis with restriction passage times
  | "vehicle-object" // large technical elevation + load / restriction facts
  | "vehicle-card" // compact physical combination
  | "restriction-logic" // causal chain for one restriction
  | "restriction-impacts" // every restriction on the route, by adapter impact
  | "route-strip" // the journey as one km axis with layers
  | "entity-facts" // assignment, availability, events (adapter reads)
  | "context-cards" // remaining layers as one line each
  | "trailer-sheet" // trailer identity, capabilities, where, which transports it fits
  | "trailer-fit" // the trailer compared against every transport of the day
  | "document-paper" // the dossier: requirements, snapshot vs current, the paper
  | "restriction-full" // the full causal chain
  | "restriction-transports" // every transport of the day through this restriction
  | "stop-sheet" // a stop as a decision: arrival, break margin, detour, price, access
  | "stop-compare"; // the other candidates

export type RegionPlacement = {
  id: string;
  rep: Representation;
  rect: Rect;
  role: "lead" | "support" | "context";
  lenses?: GuidedState["active"];
};
export type MapRole = "hidden" | "inset" | "corridor" | "half" | "dominant";

type Recipe = {
  family: string;
  /** Regions in a unit square [x, y, w, h] of the working area. */
  regions: {
    id: string;
    rep: Representation;
    at: [number, number, number, number];
    role: RegionPlacement["role"];
    lenses?: GuidedState["active"];
  }[];
  map: { role: MapRole; at?: [number, number, number, number] };
};

/** Explicit participation; a relationship summary counts, an unrelated box does not. */
export function representedDomains(
  regions: Pick<RegionPlacement, "rep" | "lenses">[],
): Set<GuidedState["active"][number]> {
  const domains = new Set<GuidedState["active"][number]>();
  for (const { rep, lenses } of regions) {
    lenses?.forEach((l) => domains.add(l));
    if (rep.startsWith("driver-")) domains.add("Drivers");
    if (rep.startsWith("vehicle-") || rep.startsWith("trailer-"))
      domains.add("Trucks");
    if (rep.startsWith("restriction-")) domains.add("Restrictions");
    if (rep === "restriction-transports" || rep === "trailer-fit")
      domains.add("Jobs");
    if (rep === "document-paper") domains.add("Documents");
    if (rep === "route-strip" || rep.startsWith("stop-")) domains.add("Fuel");
  }
  return domains;
}

// Machine and shift share the width of one canvas, rather than appending a
// miniature driver panel to the existing truck page.
const MACHINE_AND_SHIFT: Recipe = {
  family: "MACHINE_AND_SHIFT",
  regions: [
    { id: "vehicle", rep: "vehicle-object", at: [0, 0, 1, 0.44], role: "lead" },
    {
      id: "driver",
      rep: "driver-day",
      at: [0, 0.47, 1, 0.53],
      role: "support",
    },
  ],
  map: { role: "hidden" },
};

/**
 * Authored compositions. Coordinates are fractions of the working area; the
 * same region id keeps its identity across recipes so the object moves and
 * resizes (continuity) instead of being replaced.
 */
const RECIPES: Record<EntityRecipe, Recipe> = {
  ROUTE_OPERATIONS: {
    family: "ROUTE_OPERATIONS",
    regions: [
      { id: "route", rep: "route-strip", at: [0, 0, 1, 0.68], role: "lead" },
    ],
    map: { role: "hidden" },
  },
  // Time is the instrument: the day takes the whole width, the map is a small corridor.
  DRIVER_DAY: {
    family: "TIMELINE_CANVAS",
    regions: [
      { id: "driver", rep: "driver-day", at: [0, 0, 0.66, 1], role: "lead" },
      {
        id: "facts",
        rep: "entity-facts",
        at: [0.68, 0.46, 0.32, 0.54],
        role: "support",
      },
    ],
    map: { role: "inset", at: [0.68, 0, 0.32, 0.43] },
  },
  // Person + machine: two physical/temporal objects side by side, no geography.
  DRIVER_AND_VEHICLE: MACHINE_AND_SHIFT,
  // When does the person pass the conditioned segments: time + segment geography.
  DRIVER_THROUGH_RESTRICTIONS: {
    family: "TIME_AND_SEGMENT",
    regions: [
      {
        id: "driver",
        rep: "driver-passages",
        at: [0, 0, 0.56, 0.58],
        role: "lead",
      },
      {
        id: "impacts",
        rep: "restriction-impacts",
        at: [0, 0.61, 0.56, 0.39],
        role: "support",
      },
    ],
    map: { role: "half", at: [0.58, 0, 0.42, 1] },
  },
  // The journey is the shared axis; logic bound to vehicle facts underneath.
  DRIVER_VEHICLE_RESTRICTIONS: {
    family: "JOURNEY_AXIS",
    regions: [
      { id: "route", rep: "route-strip", at: [0, 0, 1, 0.5], role: "lead" },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0, 0.53, 0.38, 0.47],
        role: "support",
      },
      {
        id: "vehicle",
        rep: "vehicle-card",
        at: [0.4, 0.53, 0.24, 0.47],
        role: "support",
      },
      {
        id: "driver",
        rep: "driver-strip",
        at: [0.66, 0.53, 0.34, 0.47],
        role: "support",
      },
    ],
    map: { role: "hidden" },
  },
  // The person in space: map dominant, compact day on the edge.
  DRIVER_SPATIAL: {
    family: "SPATIAL_DOMINANT",
    regions: [
      {
        id: "driver",
        rep: "driver-strip",
        at: [0.74, 0, 0.26, 1],
        role: "lead",
      },
    ],
    map: { role: "dominant", at: [0, 0, 0.725, 1] },
  },
  // The machine as a large technical object; location as an inset.
  TRUCK_OBJECT: {
    family: "TECHNICAL_OBJECT",
    regions: [
      {
        id: "vehicle",
        rep: "vehicle-object",
        at: [0, 0, 0.7, 1],
        role: "lead",
      },
      {
        id: "facts",
        rep: "entity-facts",
        at: [0.72, 0.44, 0.28, 0.56],
        role: "support",
      },
    ],
    map: { role: "inset", at: [0.72, 0, 0.28, 0.41] },
  },
  TRUCK_WITH_DRIVER: MACHINE_AND_SHIFT,
  // Suitability: physical facts lead, the causal logic answers beside them.
  TRUCK_SUITABILITY: {
    family: "CAUSAL_OBJECT",
    regions: [
      {
        id: "vehicle",
        rep: "vehicle-object",
        at: [0, 0, 0.6, 0.7],
        role: "lead",
      },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0.62, 0, 0.38, 0.7],
        role: "support",
      },
      {
        id: "driver",
        rep: "driver-strip",
        at: [0, 0.73, 0.6, 0.27],
        role: "context",
      },
      {
        id: "impacts",
        rep: "restriction-impacts",
        at: [0.62, 0.73, 0.38, 0.27],
        role: "context",
      },
    ],
    map: { role: "hidden" },
  },
  TRUCK_SPATIAL: {
    family: "SPATIAL_DOMINANT",
    regions: [
      {
        id: "vehicle",
        rep: "vehicle-card",
        at: [0.75, 0, 0.25, 0.5],
        role: "lead",
      },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0.75, 0.52, 0.25, 0.48],
        role: "support",
      },
    ],
    map: { role: "dominant", at: [0, 0, 0.735, 1] },
  },
  // A trailer is a capacity: its sheet leads, where it is only if it is somewhere.
  TRAILER_SHEET: {
    family: "TECHNICAL_SHEET",
    regions: [
      {
        id: "trailer",
        rep: "trailer-sheet",
        at: [0, 0, 0.62, 1],
        role: "lead",
      },
      {
        id: "facts",
        rep: "entity-facts",
        at: [0.64, 0.44, 0.36, 0.56],
        role: "support",
      },
    ],
    map: { role: "inset", at: [0.64, 0, 0.36, 0.41] },
  },
  // Compatibility: one comparison across the day's transports, the rules underneath.
  TRAILER_COMPATIBILITY: {
    family: "COMPARISON",
    regions: [
      { id: "trailer", rep: "trailer-fit", at: [0, 0, 1, 0.6], role: "lead" },
      {
        id: "impacts",
        rep: "restriction-impacts",
        at: [0, 0.63, 0.5, 0.37],
        role: "support",
      },
      {
        id: "facts",
        rep: "entity-facts",
        at: [0.52, 0.63, 0.48, 0.37],
        role: "context",
      },
    ],
    map: { role: "hidden" },
  },
  // A document expels the map: the paper and its snapshot are the question.
  DOCUMENT_PAPER: {
    family: "DOCUMENT",
    regions: [
      { id: "document", rep: "document-paper", at: [0, 0, 1, 1], role: "lead" },
    ],
    map: { role: "hidden" },
  },
  DOCUMENT_PARTIES: {
    family: "DOCUMENT_AND_PARTIES",
    regions: [
      {
        id: "document",
        rep: "document-paper",
        at: [0, 0, 0.64, 1],
        role: "lead",
      },
      {
        id: "driver",
        rep: "driver-strip",
        at: [0.66, 0, 0.34, 0.55],
        role: "support",
      },
      {
        id: "vehicle",
        rep: "vehicle-card",
        at: [0.66, 0.58, 0.34, 0.42],
        role: "support",
      },
    ],
    map: { role: "hidden" },
  },
  DOCUMENT_ROUTE: {
    family: "DOCUMENT_AND_PLACES",
    regions: [
      {
        id: "document",
        rep: "document-paper",
        at: [0, 0, 0.58, 1],
        role: "lead",
      },
      {
        id: "facts",
        rep: "entity-facts",
        at: [0.6, 0.6, 0.4, 0.4],
        role: "context",
      },
    ],
    map: { role: "half", at: [0.6, 0, 0.4, 0.57] },
  },
  // The rule leads; geography and the day's transports support it.
  RESTRICTION_LOGIC: {
    family: "CAUSAL_LOGIC",
    regions: [
      {
        id: "logic",
        rep: "restriction-full",
        at: [0, 0, 0.64, 1],
        role: "lead",
      },
      {
        id: "transports",
        rep: "restriction-transports",
        at: [0.66, 0.6, 0.34, 0.4],
        role: "support",
      },
    ],
    map: { role: "half", at: [0.66, 0, 0.34, 0.57] },
  },
  RESTRICTION_PHYSICAL: {
    family: "CAUSAL_OBJECT",
    regions: [
      {
        id: "vehicle",
        rep: "vehicle-object",
        at: [0, 0, 0.6, 1],
        role: "lead",
      },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0.62, 0, 0.38, 1],
        role: "support",
      },
    ],
    map: { role: "hidden" },
  },
  RESTRICTION_TIME: {
    family: "TIME_AND_SEGMENT",
    regions: [
      {
        id: "driver",
        rep: "driver-passages",
        at: [0, 0, 0.6, 0.6],
        role: "lead",
      },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0, 0.63, 0.6, 0.37],
        role: "support",
      },
    ],
    map: { role: "half", at: [0.62, 0, 0.38, 1] },
  },
  RESTRICTION_TRANSPORTS: {
    family: "COLLECTION_ON_SEGMENT",
    regions: [
      {
        id: "transports",
        rep: "restriction-transports",
        at: [0, 0, 0.48, 1],
        role: "lead",
      },
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0.5, 0.6, 0.5, 0.4],
        role: "support",
      },
    ],
    map: { role: "half", at: [0.5, 0, 0.5, 0.57] },
  },
  RESTRICTION_SPATIAL: {
    family: "SPATIAL_DOMINANT",
    regions: [
      {
        id: "logic",
        rep: "restriction-logic",
        at: [0.73, 0, 0.27, 1],
        role: "lead",
      },
    ],
    map: { role: "dominant", at: [0, 0, 0.715, 1] },
  },
  // A stop is a decision: arrival, margin, detour, access — then its place.
  STOP_DECISION: {
    family: "DECISION",
    regions: [
      { id: "stop", rep: "stop-sheet", at: [0, 0, 0.52, 1], role: "lead" },
      {
        id: "compare",
        rep: "stop-compare",
        at: [0.54, 0.6, 0.46, 0.4],
        role: "support",
      },
    ],
    map: { role: "half", at: [0.54, 0, 0.46, 0.57] },
  },
  STOP_WITH_DRIVER: {
    family: "TIME_AND_PLACE",
    regions: [
      {
        id: "driver",
        rep: "driver-strip",
        at: [0, 0, 0.32, 1],
        role: "support",
      },
      { id: "stop", rep: "stop-sheet", at: [0.34, 0, 0.66, 0.6], role: "lead" },
      {
        id: "compare",
        rep: "stop-compare",
        at: [0.34, 0.63, 0.3, 0.37],
        role: "context",
      },
    ],
    map: { role: "corridor", at: [0.66, 0.63, 0.34, 0.37] },
  },
  STOP_SPATIAL: {
    family: "SPATIAL_DOMINANT",
    regions: [
      { id: "stop", rep: "stop-sheet", at: [0.73, 0, 0.27, 1], role: "lead" },
    ],
    map: { role: "dominant", at: [0, 0, 0.715, 1] },
  },
};

/** Recipes that keep driver context when the truck is the anchor. */
function adapt(recipe: EntityRecipe, state: GuidedState): Recipe {
  const authored = RECIPES[recipe];
  // Any page can become spatial; pages without an authored spatial recipe keep their lead beside a dominant map.
  let r: Recipe =
    state.mapFull && authored.map.role !== "dominant"
      ? {
          family: "SPATIAL_DOMINANT",
          regions: [
            {
              ...authored.regions.find((x) => x.role === "lead")!,
              at: [0.7, 0, 0.3, 1],
            },
          ],
          map: { role: "dominant", at: [0, 0, 0.685, 1] },
        }
      : authored;
  // The map changes the working geometry, not the selected content set.
  if (r.map.role === "dominant") {
    const lead = r.regions.find((x) => x.role === "lead")!;
    const shown = representedDomains([lead]);
    if (isEntity(state.anchor)) shown.add(ANCHOR_LENS[state.anchor.kind]);
    const remaining = state.active.filter(
      (l) => !shown.has(l) && l !== "Pricing DEV" && l !== "Compliance DEV",
    );
    return remaining.length
      ? {
          ...r,
          regions: [
            { ...lead, at: [0.67, 0, 0.33, 0.52] },
            {
              id: "context",
              rep: "context-cards",
              role: "context",
              lenses: remaining,
              at: [0.67, 0.55, 0.33, 0.45],
            },
          ],
          map: { role: "dominant", at: [0, 0, 0.65, 1] },
        }
      : {
          ...r,
          regions: [{ ...lead, at: [0.67, 0, 0.33, 1] }],
          map: { role: "dominant", at: [0, 0, 0.65, 1] },
        };
  }
  const layers = entityLayers(state);
  if (recipe === "ROUTE_OPERATIONS") {
    const supports: Recipe["regions"] = [];
    if (state.active.includes("Trucks"))
      supports.push({
        id: "vehicle",
        rep: "vehicle-card",
        at: [0, 0, 1, 1],
        role: "support",
      });
    if (state.active.includes("Drivers"))
      supports.push({
        id: "driver",
        rep: "driver-strip",
        at: [0, 0, 1, 1],
        role: "support",
      });
    if (state.active.includes("Restrictions"))
      supports.push({
        id: "impacts",
        rep: "restriction-impacts",
        at: [0, 0, 1, 1],
        role: "support",
      });
    const extra = state.active.filter((l) => l === "Jobs" || l === "Documents");
    if (extra.length)
      supports.push({
        id: "context",
        rep: "context-cards",
        at: [0, 0, 1, 1],
        role: "context",
        lenses: extra,
      });
    return {
      ...r,
      regions: [
        ...r.regions,
        ...supports.map((s, i) => ({
          ...s,
          at: [i / supports.length, 0.71, 1 / supports.length, 0.29] as [
            number,
            number,
            number,
            number,
          ],
        })),
      ],
    };
  }
  if (recipe === "TRUCK_SUITABILITY" && !layers.includes("Drivers"))
    r = {
      ...r,
      regions: r.regions
        .filter((x) => x.id !== "driver")
        .map((x) =>
          x.id === "impacts"
            ? {
                ...x,
                at: [0, 0.73, 1, 0.27] as [number, number, number, number],
              }
            : x,
        ),
    };
  if (recipe === "DOCUMENT_PARTIES") {
    const keep = r.regions.filter(
      (x) =>
        x.id === "document" ||
        (x.id === "driver"
          ? layers.includes("Drivers")
          : layers.includes("Trucks")),
    );
    r = {
      ...r,
      regions: keep.map((x) =>
        x.id !== "document" && keep.length === 2
          ? { ...x, at: [0.66, 0, 0.34, 1] as [number, number, number, number] }
          : x,
      ),
    };
  }
  // Layers without a dedicated representation in this recipe join as context lines.
  const shown = new Set(r.regions.map((x) => x.rep));
  const extra = [
    ...layers,
    ...(state.active.includes("Jobs") &&
    state.anchor.kind !== "restriction" &&
    state.anchor.kind !== "trailer"
      ? (["Jobs"] as const)
      : []),
  ].filter(
    (l) =>
      ((l === "Jobs" &&
        !shown.has("restriction-transports") &&
        !shown.has("trailer-fit")) ||
        (l === "Documents" && !shown.has("document-paper")) ||
        (l === "Fuel" &&
          !shown.has("route-strip") &&
          !shown.has("stop-sheet")) ||
        (l === "Drivers" &&
          ![...shown].some((rep) => rep.startsWith("driver-"))) ||
        (l === "Trucks" &&
          !shown.has("vehicle-object") &&
          !shown.has("vehicle-card")) ||
        (l === "Restrictions" &&
          ![...shown].some((rep) => rep.startsWith("restriction-")))) &&
      !shown.has("context-cards"),
  );
  if (!extra.length || r.map.role === "dominant") return r;
  if (r.family === "MACHINE_AND_SHIFT")
    return {
      ...r,
      regions: [
        ...r.regions.map((region) => {
          const [x, y, w, h] = region.at;
          return {
            ...region,
            at: [x, y * 0.89, w, h * 0.89] as [number, number, number, number],
          };
        }),
        {
          id: "context",
          rep: "context-cards",
          at: [0, 0.92, 1, 0.08],
          role: "context",
          lenses: extra,
        },
      ],
    };
  // Context lines take the lower part of the support column (or of the map side);
  // a page with a single region gives them a narrow column beside the lead.
  const support = r.regions.find((x) => x.role !== "lead");
  if (!support) {
    const lead = r.regions[0];
    return {
      ...r,
      regions: [
        { ...lead, at: [0, 0, 0.72, 1] as [number, number, number, number] },
        {
          id: "context",
          rep: "context-cards",
          at: [0.74, 0, 0.26, 0.42],
          role: "context",
          lenses: extra,
        },
      ],
    };
  }
  if (support) {
    const [x, y, w, h] = support.at;
    return {
      ...r,
      regions: [
        ...r.regions.map((g) =>
          g === support
            ? {
                ...g,
                at: [x, y, w, h * 0.62] as [number, number, number, number],
              }
            : g,
        ),
        {
          id: "context",
          rep: "context-cards",
          at: [x, y + h * 0.65, w, h * 0.35],
          role: "context",
          lenses: extra,
        },
      ],
    };
  }
  return r;
}

export function composeEntityLayout(
  state: GuidedState,
  width: number,
  height: number,
  plan: CompositionPlan,
): GuidedLayout {
  const recipeId = entityRecipe(state)!;
  const recipe = adapt(recipeId, state);
  const STRIP = state.active.length > 1 ? 80 : 50;
  const margin = width >= 1700 ? 32 : 22,
    x0 = width < 800 ? 76 : 104,
    y0 = margin + STRIP;
  const W = Math.max(120, width - x0 - margin),
    H = Math.max(180, height - margin * 2 - STRIP);
  const gap = width >= 1700 ? 24 : 18;
  // Fractions → pixels, with gaps only between neighbouring regions.
  const place = ([fx, fy, fw, fh]: [number, number, number, number]): Rect => {
    const left = x0 + fx * W + (fx > 0 ? gap / 2 : 0);
    const top = y0 + fy * H + (fy > 0 ? gap / 2 : 0);
    const right = x0 + (fx + fw) * W - (fx + fw < 0.999 ? gap / 2 : 0);
    const bottom = y0 + (fy + fh) * H - (fy + fh < 0.999 ? gap / 2 : 0);
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };
  // Narrow screens stack the support regions under the lead instead of squeezing columns.
  const narrow =
    width < 1250 &&
    recipe.regions.length > 1 &&
    recipe.map.role !== "dominant" &&
    recipe.family !== "MACHINE_AND_SHIFT";
  let regions: RegionPlacement[] = recipe.regions.map((r) => ({
    id: r.id,
    rep: r.rep,
    role: r.role,
    lenses: r.lenses,
    rect: place(r.at),
  }));
  let mapRect = recipe.map.at
    ? place(recipe.map.at)
    : { x: x0 + W * 0.7, y: y0, width: W * 0.3, height: H * 0.3 };
  // Compact grammar: one readable lead and a shared relationship summary.
  // Keeping four miniature instruments abreast made their content unusable.
  const compact = width < 1000;
  if (compact && recipe.map.role === "dominant") {
    mapRect = place([0, 0, 1, 0.35]);
    const lead = recipe.regions.find((r) => r.role === "lead")!;
    const context = recipe.regions.find((r) => r.rep === "context-cards");
    regions = [
      { ...lead, rect: place([0, 0.38, 1, context ? 0.29 : 0.62]) },
      ...(context ? [{ ...context, rect: place([0, 0.7, 1, 0.3]) }] : []),
    ];
  } else if (compact) {
    const lead = recipe.regions.find((r) => r.role === "lead")!;
    const shown = representedDomains([lead]);
    const lenses = state.active.filter(
      (l) => !shown.has(l) && l !== "Pricing DEV" && l !== "Compliance DEV",
    );
    regions = [
      { ...lead, rect: place([0, 0, 1, lenses.length ? 0.55 : 1]) },
      ...(lenses.length
        ? [
            {
              id: "context",
              rep: "context-cards" as const,
              role: "context" as const,
              lenses,
              rect: place([0, 0.58, 1, 0.42]),
            },
          ]
        : []),
    ];
  } else if (narrow) {
    const lead = recipe.regions.find((r) => r.role === "lead")!;
    const rest = recipe.regions.filter((r) => r !== lead);
    const leadH =
      recipe.family === "ROUTE_OPERATIONS"
        ? 0.68
        : recipe.map.role === "hidden"
          ? 0.62
          : 0.58;
    regions = [
      {
        id: lead.id,
        rep: lead.rep,
        role: lead.role,
        rect: place([0, 0, recipe.map.role === "hidden" ? 1 : 0.64, leadH]),
      },
      ...rest.map((r, i) => ({
        id: r.id,
        rep: r.rep,
        role: r.role,
        lenses: r.lenses,
        rect: place([
          i / rest.length,
          leadH + 0.02,
          1 / rest.length,
          1 - leadH - 0.02,
        ]),
      })),
    ];
    if (recipe.map.role !== "hidden") mapRect = place([0.66, 0, 0.34, leadH]);
  }
  const visible =
    recipe.map.role !== "hidden" &&
    state.spatial.question !== "NONE" &&
    (!compact || state.mapFull);
  const mode: MapMode = !visible
    ? "HIDDEN"
    : state.spatial.question === "AFFECTED_SEGMENT"
      ? "RESTRICTION_SEGMENT"
      : state.spatial.question === "NEXT_LEG"
        ? "ROUTE_CORRIDOR"
        : "ROUTE_FOCUS";
  plan.family = "ENTITY_COMPOSITION";
  plan.arrangement = `${recipe.family.toLowerCase()} · ${recipeId}`;
  plan.explanation = RECIPE_QUESTION[recipeId];
  plan.mapUseful = visible;
  return {
    path: `entity-${state.anchor.kind}-${recipeId}`,
    viewport: { width, height },
    zones: {},
    regions,
    recipe: recipeId,
    map: { ...mapRect, radius: 14, visible, opacity: visible ? 1 : 0 },
    mode,
    inlineFuel: false,
    inlineResources: false,
    composition: plan,
  };
}
