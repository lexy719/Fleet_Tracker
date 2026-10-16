import type {
  Focus,
  GuidedLens,
  GuidedState,
  VehiclePart,
} from "./guidedWorkspace";
import type { SpatialIntent } from "./spatialQuestions";
import { sharedWork } from "./sharedComposition";

/** An operational object the operator can follow across domains. */
export type FleetObject =
  | { kind: "job"; id: string }
  | { kind: "driver"; id: string }
  | { kind: "truck"; id: string }
  | { kind: "trailer"; id: string }
  | { kind: "stop"; id: string }
  | { kind: "break"; stop: string; at: number; label: string }
  | { kind: "time"; at: number; label: string }
  | { kind: "delivery"; stop: string }
  | { kind: "document"; id: string }
  | { kind: "revision"; field: string }
  | {
      kind: "qualification";
      driver: string;
      qual: "licence" | "cpc" | "adr" | "tacho";
    }
  | { kind: "restriction"; id: string }
  | { kind: "segment"; id: string }
  | { kind: "alternative"; id: string }
  | { kind: "fact"; part: VehiclePart }
  | { kind: "fuel" }
  | { kind: "range" }
  | { kind: "maintenance"; id: string };
type Kind = FleetObject["kind"];

/**
 * Generic semantic relationships: the followed object decides the lead, the
 * facet (which question that lead answers), the temporary focus and the map
 * question. The previous lead stays active as context. Pair-specific overrides
 * are not needed — the object carries enough meaning.
 */
export type Relation = {
  object: Kind;
  lead: GuidedLens;
  facet?: string;
  context: string;
  map: SpatialIntent["question"] | "automatic";
  focus: string;
  invalidation: string;
  back: string;
};
export const RELATIONS: Relation[] = [
  {
    object: "job",
    lead: "Jobs",
    context: "Lente anterior fica ativa",
    map: "automatic",
    focus: "Narrativa do transporte",
    invalidation: "Outro transporte limpa seleções do anterior",
    back: "Esc devolve a lente e o foco anteriores",
  },
  {
    object: "driver",
    lead: "Drivers",
    facet: "execution",
    context: "Lente anterior anota o dia",
    map: "automatic",
    focus: "Dia do motorista",
    invalidation: "Mudar o motorista atribuído limpa o foco",
    back: "Esc exato",
  },
  {
    object: "truck",
    lead: "Trucks",
    facet: "load",
    context: "Motorista fica como relação",
    map: "automatic",
    focus: "Alçado e carga",
    invalidation: "Mudar a viatura limpa o foco físico",
    back: "Esc exato",
  },
  {
    object: "trailer",
    lead: "Trucks",
    facet: "assignment",
    context: "Carga e restrições comparam o conjunto",
    map: "NONE",
    focus: "Conjunto atual e reboques compatíveis",
    invalidation: "Confirmar outro reboque limpa o foco do anterior",
    back: "Esc exato",
  },
  {
    object: "stop",
    lead: "Fuel",
    facet: "stops",
    context: "Motorista e viatura anotam a paragem",
    map: "ROUTE_AND_STOP",
    focus: "Paragem selecionada",
    invalidation:
      "Limpa se a paragem deixar de ser candidata (outro transporte)",
    back: "Esc exato",
  },
  {
    object: "break",
    lead: "Drivers",
    facet: "execution",
    context: "Paragem mantém-se selecionada",
    map: "NEXT_LEG",
    focus: "Hora exata da pausa",
    invalidation: "Limpa se a paragem for trocada",
    back: "Esc devolve o percurso com a paragem",
  },
  {
    object: "time",
    lead: "Drivers",
    facet: "execution",
    context: "Lente anterior fica ativa",
    map: "automatic",
    focus: "Momento no dia",
    invalidation: "Limpa com outro transporte",
    back: "Esc exato",
  },
  {
    object: "delivery",
    lead: "Jobs",
    context: "Viatura anota as paletes dessa entrega",
    map: "automatic",
    focus: "Entrega e janela",
    invalidation: "Limpa se a paragem sair do transporte",
    back: "Esc exato",
  },
  {
    object: "document",
    lead: "Documents",
    facet: "dossier",
    context: "Intervenientes ficam ativos",
    map: "NONE",
    focus: "Documento exato",
    invalidation: "Versões emitidas continuam históricas",
    back: "Esc exato",
  },
  {
    object: "revision",
    lead: "Jobs",
    context: "Documentos fica ativo",
    map: "automatic",
    focus: "Campo alterado na revisão",
    invalidation: "Histórico nunca é invalidado",
    back: "Esc devolve o diff",
  },
  {
    object: "qualification",
    lead: "Documents",
    facet: "qualification",
    context: "Motorista fica visível",
    map: "NONE",
    focus: "Habilitação exata",
    invalidation: "Limpa se o motorista do transporte mudar",
    back: "Esc devolve o motorista",
  },
  {
    object: "restriction",
    lead: "Restrictions",
    facet: "logic",
    context: "Viatura e percurso anotam os factos",
    map: "AFFECTED_SEGMENT",
    focus: "Restrição exata",
    invalidation: "Limpa se a rota deixar de a cruzar",
    back: "Esc exato",
  },
  {
    object: "segment",
    lead: "Restrictions",
    facet: "logic",
    context: "Mapa no troço",
    map: "AFFECTED_SEGMENT",
    focus: "Troço afetado",
    invalidation: "Como restrição",
    back: "Esc exato",
  },
  {
    object: "alternative",
    lead: "Fuel",
    facet: "segment",
    context: "Restrição fica como contexto",
    map: "AFFECTED_SEGMENT",
    focus: "Rota atual vs alternativa",
    invalidation: "Limpa se a restrição sair",
    back: "Esc devolve a restrição",
  },
  {
    object: "fact",
    lead: "Trucks",
    facet: "restriction",
    context: "Restrição fica como contexto",
    map: "NONE",
    focus: "Peça física exata",
    invalidation: "Limpa se a viatura mudar",
    back: "Esc exato",
  },
  {
    object: "fuel",
    lead: "Trucks",
    facet: "fuel",
    context: "Percurso anota a autonomia",
    map: "NEXT_LEG",
    focus: "Depósito e proveniência",
    invalidation: "Limpa se a viatura mudar",
    back: "Esc exato",
  },
  {
    object: "range",
    lead: "Fuel",
    facet: "stops",
    context: "Viatura fica como contexto",
    map: "ROUTE_AND_STOP",
    focus: "Próxima paragem viável",
    invalidation: "Sem candidatas não há seleção",
    back: "Esc exato",
  },
  {
    object: "maintenance",
    lead: "Trucks",
    facet: "maintenance",
    context: "Transporte afetado fica visível",
    map: "NONE",
    focus: "Estado de oficina",
    invalidation: "Limpa quando a viatura volta a disponível",
    back: "Esc exato",
  },
];
export const relationOf = (kind: Kind) =>
  RELATIONS.find((r) => r.object === kind)!;

export function applyFollow(s: GuidedState, o: FleetObject) {
  const r = relationOf(o.kind);
  const joint = !!sharedWork(s);
  if (o.kind === "job" && (s.anchor.kind !== "job" || s.anchor.id !== o.id)) {
    s.anchor = { kind: "job", id: o.id };
    s.assignment.truck = null;
    s.pending = null;
    s.selection = {
      fuel: null,
      document: null,
      restriction: null,
      resource: null,
    };
  }
  if (!s.active.includes(r.lead) && !(joint && r.lead === "Jobs"))
    s.active.push(r.lead);
  if (
    !joint &&
    r.lead !== "Jobs" &&
    s.anchor.kind === "job" &&
    !s.active.includes("Jobs")
  )
    s.active.unshift("Jobs");
  s.lead = r.lead;
  if (r.facet) (s.facet as Record<string, string>)[r.lead] = r.facet;
  let focus: Focus | null = null;
  switch (o.kind) {
    case "stop":
      s.selection.fuel = o.id;
      break;
    case "break":
      s.selection.fuel = o.stop;
      if (!s.active.includes("Fuel")) s.active.push("Fuel");
      focus = { kind: "time", at: o.at, label: o.label, stop: o.stop };
      break;
    case "time":
      focus = { kind: "time", at: o.at, label: o.label };
      break;
    case "delivery":
      focus = { kind: "delivery", stop: o.stop };
      break;
    case "document":
      s.selection.document = o.id;
      break;
    case "revision":
      if (!s.active.includes("Documents")) s.active.push("Documents");
      focus = { kind: "revision", field: o.field };
      break;
    case "qualification":
      focus = { kind: "qualification", driver: o.driver, qual: o.qual };
      break;
    case "restriction":
    case "segment":
    case "alternative":
      s.selection.restriction = o.id;
      if (!s.active.includes("Restrictions")) s.active.push("Restrictions");
      break;
    case "fact":
      focus = { kind: "vehicle", aspect: "restriction", part: o.part };
      break;
    case "fuel":
      focus = { kind: "vehicle", aspect: "fuel" };
      break;
    case "truck":
      focus = { kind: "vehicle", aspect: "load" };
      break;
  }
  s.focus = focus;
  // A followed object asks its own question; a user-chosen map question is
  // kept only while the map is the working canvas.
  if (!s.mapFull && s.spatial.source === "user")
    s.spatial = { ...s.spatial, source: "automatic" };
  if (o.kind === "segment" || o.kind === "alternative")
    s.spatial = {
      question: "AFFECTED_SEGMENT",
      target: "restriction",
      source: s.mapFull ? "user" : "automatic",
    };
}
