import { BASE_VARIABLES } from "./composition";
import {
  snapshotLiving,
  type Domain,
  type LivingSnapshot,
} from "./livingEnvironment";
import {
  applyTopology,
  initialTopology,
  type Actor,
  type TopologyOperation,
} from "./representationEngine";

export const TOPOLOGY_FAMILIES = [
  { id: "map-support", label: "01 · Map + apoios" },
  { id: "content", label: "02 · Jobs dominante" },
  { id: "documents", label: "03 · Documents takeover" },
  { id: "bands", label: "04 · Bandas horizontais" },
  { id: "stack", label: "05 · Fluxo vertical" },
  { id: "mixed", label: "06 · Assimétrico" },
  { id: "left", label: "07 · Mapa à esquerda" },
  { id: "right", label: "08 · Mapa à direita" },
  { id: "narrow", label: "09 · Centro estreito" },
  { id: "fullscreen", label: "10 · Map fullscreen" },
  { id: "strips", label: "11 · Conteúdo + strips" },
  { id: "merged", label: "12 · Job + Fuel fundidos" },
  { id: "cluster", label: "13 · Cluster relacionado" },
  { id: "six", label: "14 · Seis contextos" },
  { id: "fuel-primary", label: "15 · Fuel dominante" },
  { id: "reversal", label: "16 · Inversão → mapa" },
] as const;
export type TopologyFamily = (typeof TOPOLOGY_FAMILIES)[number]["id"];
/** Instruments compose operations + continuous demands. No family supplies final rectangles. */
export function topologyScenario(
  previous: LivingSnapshot,
  family: TopologyFamily,
): LivingSnapshot {
  let state = snapshotLiving(previous);
  state.topology = initialTopology();
  state.focus = null;
  state.explorerOpen = false;
  state.reference = false;
  state.intent = "BALANCED";
  state.variables = {
    ...BASE_VARIABLES,
    duration: previous.variables.duration,
    easing: previous.variables.easing,
    mapWidth: 0.68,
    mapHeight: 0.78,
    margin: 20,
  };
  const enabled: Domain[] =
    family === "six"
      ? ["Jobs", "Drivers", "Trucks", "Fuel", "Restrictions", "Documents"]
      : family === "documents"
        ? ["Jobs", "Documents", "Fuel"]
        : family === "map-support"
          ? ["Jobs", "Fuel"]
          : ["Jobs", "Drivers", "Fuel", "Restrictions"];
  state.surfaces = state.surfaces.map((s) => ({
    ...s,
    enabled: enabled.includes(s.id as Domain),
    state: "active",
    demand: 0.6,
    priority: 34,
    x: 0.5,
    y: 0.5,
  }));
  const op = (operation: TopologyOperation) => {
    state = applyTopology(state, operation);
  };
  switch (family) {
    case "content":
      op({ type: "PROMOTE", actor: "Jobs" });
      break;
    case "documents":
      op({ type: "TAKEOVER", actor: "Documents" });
      break;
    case "bands":
      op({ type: "STRIP" });
      state.variables.mapWidth = 0.85;
      state.variables.mapHeight = 0.44;
      state.variables.mapY = 0.65;
      break;
    case "stack":
      op({ type: "STACK" });
      state.variables.mapWidth = 0.44;
      state.variables.mapHeight = 0.86;
      state.variables.mapX = 0.76;
      break;
    case "mixed":
      op({ type: "CLUSTER" });
      state.variables.mapWidth = 0.48;
      state.variables.mapHeight = 0.58;
      state.variables.mapX = 0.3;
      state.variables.mapY = 0.4;
      break;
    case "left":
      state.variables.mapX = 0;
      state.variables.mapWidth = 0.58;
      state.variables.mapHeight = 0.9;
      break;
    case "right":
      state.variables.mapX = 1;
      state.variables.mapWidth = 0.58;
      state.variables.mapHeight = 0.9;
      break;
    case "narrow":
      state.variables.mapX = 0.5;
      state.variables.mapWidth = 0.32;
      state.variables.mapHeight = 0.88;
      break;
    case "fullscreen":
      op({ type: "TAKEOVER", actor: "map" });
      state.focus = "Drivers";
      state.topology!.mapMode = "DRIVER_LOCAL";
      break;
    case "strips":
      op({ type: "PROMOTE", actor: "Jobs" });
      op({ type: "STRIP" });
      for (const a of ["Fuel", "Drivers", "Restrictions"] as Actor[])
        op({ type: "MORPH", actor: a, form: "strip" });
      break;
    case "merged":
      op({ type: "PROMOTE", actor: "Jobs" });
      op({ type: "MERGE", actors: ["Jobs", "Fuel"] });
      break;
    case "cluster":
      op({ type: "CLUSTER" });
      state.variables.mapX = 0.8;
      state.variables.mapWidth = 0.38;
      state.variables.mapHeight = 0.64;
      op({ type: "MORPH", actor: "Jobs", form: "list" });
      op({ type: "MORPH", actor: "Fuel", form: "contextual" });
      break;
    case "six":
      op({ type: "STRIP" });
      state.variables.mapWidth = 0.66;
      state.variables.mapHeight = 0.63;
      state.variables.mapY = 0.4;
      break;
    case "fuel-primary":
      op({ type: "PROMOTE", actor: "Fuel" });
      op({ type: "MORPH", actor: "Fuel", form: "analysis" });
      break;
    case "reversal":
      op({ type: "PROMOTE", actor: "Jobs" });
      op({ type: "SWAP", a: "Jobs", b: "map" });
      state.variables.mapWidth = 0.74;
      state.variables.mapHeight = 0.84;
      state.variables.mapX = 0.55;
      break;
    default:
      break;
  }
  return state;
}
