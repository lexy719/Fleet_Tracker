import type { Anchor, GuidedLens, GuidedState } from "./guidedWorkspace";

/**
 * Entity compositions are chosen by the semantic question, not by "one more box":
 * the anchor entity plus the ordered layers decide which representation leads,
 * which ones support it and what (if anything) the map is for.
 */
export type EntityRecipe =
  | "ROUTE_OPERATIONS"
  | "DRIVER_DAY"
  | "DRIVER_AND_VEHICLE"
  | "DRIVER_THROUGH_RESTRICTIONS"
  | "DRIVER_VEHICLE_RESTRICTIONS"
  | "DRIVER_SPATIAL"
  | "TRUCK_OBJECT"
  | "TRUCK_WITH_DRIVER"
  | "TRUCK_SUITABILITY"
  | "TRUCK_SPATIAL"
  | "TRAILER_SHEET"
  | "TRAILER_COMPATIBILITY"
  | "DOCUMENT_PAPER"
  | "DOCUMENT_PARTIES"
  | "DOCUMENT_ROUTE"
  | "RESTRICTION_LOGIC"
  | "RESTRICTION_PHYSICAL"
  | "RESTRICTION_TIME"
  | "RESTRICTION_TRANSPORTS"
  | "RESTRICTION_SPATIAL"
  | "STOP_DECISION"
  | "STOP_WITH_DRIVER"
  | "STOP_SPATIAL";

export type EntityAnchorKind =
  | "driver"
  | "truck"
  | "trailer"
  | "document"
  | "restriction"
  | "stop";
export type EntityAnchor = Extract<Anchor, { kind: EntityAnchorKind }>;
export const ENTITY_KINDS: EntityAnchorKind[] = [
  "driver",
  "truck",
  "trailer",
  "document",
  "restriction",
  "stop",
];
export const isEntity = (a: Anchor): a is EntityAnchor =>
  (ENTITY_KINDS as string[]).includes(a.kind);

/** The rail lens that is the base of each entity page. */
export const ANCHOR_LENS: Record<EntityAnchorKind, GuidedLens> = {
  driver: "Drivers",
  truck: "Trucks",
  trailer: "Trucks",
  document: "Documents",
  restriction: "Restrictions",
  stop: "Fuel",
};
const CONTEXTUAL = new Set<GuidedLens>([
  "Jobs",
  "Pricing DEV",
  "Compliance DEV",
]);

/** Layers in the order they were switched on (the base lens excluded). */
export function entityLayers(state: GuidedState): GuidedLens[] {
  if (!isEntity(state.anchor)) return [];
  const base = ANCHOR_LENS[state.anchor.kind];
  return state.active.filter((l) => l !== base && !CONTEXTUAL.has(l));
}
/** Transports is a layer too on entity pages that list the transports they touch. */
const wantsTransports = (state: GuidedState) => state.active.includes("Jobs");

export function entityRecipe(state: GuidedState): EntityRecipe | null {
  const a = state.anchor;
  if (!isEntity(a)) return null;
  const L = entityLayers(state);
  const has = (l: GuidedLens) => L.includes(l);
  switch (a.kind) {
    case "driver":
      if (state.mapFull) return "DRIVER_SPATIAL";
      if (a.job && has("Fuel")) return "ROUTE_OPERATIONS";
      if (has("Trucks") && has("Restrictions"))
        return "DRIVER_VEHICLE_RESTRICTIONS";
      if (has("Trucks")) return "DRIVER_AND_VEHICLE";
      if (has("Restrictions")) return "DRIVER_THROUGH_RESTRICTIONS";
      return "DRIVER_DAY";
    case "truck":
      if (state.mapFull) return "TRUCK_SPATIAL";
      if (a.job && has("Fuel")) return "ROUTE_OPERATIONS";
      if (has("Drivers") && has("Restrictions"))
        return "DRIVER_VEHICLE_RESTRICTIONS";
      if (has("Restrictions")) return "TRUCK_SUITABILITY";
      if (has("Drivers")) return "TRUCK_WITH_DRIVER";
      return "TRUCK_OBJECT";
    case "trailer":
      return has("Restrictions") || has("Documents") || wantsTransports(state)
        ? "TRAILER_COMPATIBILITY"
        : "TRAILER_SHEET";
    case "document":
      if (has("Fuel")) return "DOCUMENT_ROUTE";
      if (has("Drivers") || has("Trucks")) return "DOCUMENT_PARTIES";
      return "DOCUMENT_PAPER";
    case "restriction":
      if (state.mapFull) return "RESTRICTION_SPATIAL";
      if (wantsTransports(state)) return "RESTRICTION_TRANSPORTS";
      if (has("Trucks")) return "RESTRICTION_PHYSICAL";
      if (has("Drivers")) return "RESTRICTION_TIME";
      return "RESTRICTION_LOGIC";
    case "stop":
      if (state.mapFull) return "STOP_SPATIAL";
      if (has("Drivers")) return "STOP_WITH_DRIVER";
      return "STOP_DECISION";
  }
}

export const RECIPE_QUESTION: Record<EntityRecipe, string> = {
  ROUTE_OPERATIONS:
    "Que entrega vem a seguir, o que impede a rota e quando fica o conjunto disponível?",
  DRIVER_DAY: "O que faz o motorista hoje e quando tem de parar?",
  DRIVER_AND_VEHICLE:
    "O conjunto chega à pausa e ao destino com este motorista?",
  DRIVER_THROUGH_RESTRICTIONS:
    "Quando é que o motorista passa nos troços condicionados?",
  DRIVER_VEHICLE_RESTRICTIONS:
    "Este motorista, com esta viatura, pode passar no que está à frente?",
  DRIVER_SPATIAL: "Onde está o motorista e o que vem a seguir?",
  TRUCK_OBJECT: "Que conjunto é este e o que leva?",
  TRUCK_WITH_DRIVER: "Quem conduz este conjunto e com que margem?",
  TRUCK_SUITABILITY: "A viatura cumpre as condições da rota?",
  TRUCK_SPATIAL: "Onde está a viatura e por onde vai?",
  TRAILER_SHEET: "Que reboque é este, onde está e o que pode levar?",
  TRAILER_COMPATIBILITY: "Este reboque serve a carga, a rota e a guia?",
  DOCUMENT_PAPER: "O que diz a guia e o que mudou desde a emissão?",
  DOCUMENT_PARTIES: "Quem e o quê a guia fixou — e ainda corresponde?",
  DOCUMENT_ROUTE: "Onde se toma a carga e onde se entrega, segundo a guia?",
  RESTRICTION_LOGIC: "Esta regra aplica-se, porquê, e onde?",
  RESTRICTION_PHYSICAL: "Que facto da viatura decide esta regra?",
  RESTRICTION_TIME: "A que horas se passa no troço, e isso conta?",
  RESTRICTION_TRANSPORTS: "Que transportes de hoje atravessam esta restrição?",
  RESTRICTION_SPATIAL: "Onde fica o troço e qual é a alternativa?",
  STOP_DECISION: "Esta paragem serve a pausa e o abastecimento?",
  STOP_WITH_DRIVER: "O motorista chega aqui antes do limite?",
  STOP_SPATIAL: "Como se chega à paragem e quanto desvia?",
};
