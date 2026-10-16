import { LENS_CONTRACTS } from "./compositionGrammar";
import { DOMAINS, type Domain } from "./mapTypes";
import { demoContext, jobById } from "./guidedContent";
import { defaultSpatial } from "./spatialQuestions";
import { anchorJob, type GuidedLens, type GuidedState } from "./guidedWorkspace";

export type TransitionContract = {
  from: Domain;
  to: Domain;
  classification: "generic" | "inherited" | "overridden";
  derivedFrom: string;
  rules: string[];
  group: string;
  relevant: string;
  suppress: string;
  supportMap: "preserve";
  leadMap: "preserve-user-or-resolve-question";
  family: "recompose-by-demand";
};
export const GROUP_RULES = {
  operation: {
    operation: "Identidade, progresso e janela do transporte",
    resources: "Recursos atribuídos e capacidade de executar a etapa",
    journey: "Paragem, acesso e continuidade do transporte",
    assurance: "Documentos do transporte e intervenientes",
  },
  resources: {
    operation: "Job atual, próxima tarefa e janela",
    resources: "Conjunto atribuído, pessoa e capacidade",
    journey: "Próxima etapa, pausa e alcance",
    assurance: "Identidade e documentos dos recursos no transporte",
  },
  journey: {
    operation: "Impacto da próxima etapa no plano",
    resources: "Tempo de execução, autonomia e próxima etapa",
    journey: "Paragem, desvio e condições de acesso",
    assurance: "Autorização e comprovativo da etapa",
  },
  assurance: {
    operation: "Transporte e intervenientes documentados",
    resources: "Identidade e status dos recursos no documento",
    journey: "Autorização e prova da paragem",
    assurance: "Obrigatoriedade, presença e estado documental",
  },
} as const;
/** Only genuinely lens-specific wording specializes a reusable group relationship. */
export const PAIR_OVERRIDES: Partial<Record<string, string>> = {
  "Drivers>Documents": "CMR disponível · identidade conferida",
  "Trucks>Documents": "Identidade do conjunto no CMR",
  "Drivers>Fuel": "Paragem selecionada e compatibilidade da pausa",
  "Trucks>Fuel": "Posto alcançável face à autonomia sintética",
};
export function resolveRelationship(from: GuidedLens | null, to: GuidedLens) {
  const source = from ? LENS_CONTRACTS[from].group : "operation";
  const target = LENS_CONTRACTS[to].group;
  const override = PAIR_OVERRIDES[`${from ?? "Jobs"}>${to}`];
  return {
    relevant: override ?? GROUP_RULES[source][target],
    classification: override
      ? ("overridden" as const)
      : source === target
        ? ("inherited" as const)
        : ("generic" as const),
    derivedFrom: override
      ? "pair override"
      : source === target
        ? "target lens + anchor"
        : `${source} → ${target}`,
    rules: [
      "anchor relation",
      "target lens participation",
      `${source} → ${target}`,
    ],
  };
}
function meaning(from: GuidedLens | null, to: GuidedLens) {
  return resolveRelationship(from, to).relevant;
}
export const INTERACTION_GRAPH: TransitionContract[] = DOMAINS.flatMap((from) =>
  DOMAINS.filter((to) => to !== from).map((to) => ({
    from,
    to,
    group: LENS_CONTRACTS[to].group,
    ...resolveRelationship(from, to),
    suppress:
      to === "Fuel"
        ? "Comparação completa de postos quando Fuel não é lead"
        : to === "Documents"
          ? "Documento completo quando Documents não é lead"
          : "Profundidade de lead fora da pergunta principal",
    supportMap: "preserve" as const,
    leadMap: "preserve-user-or-resolve-question" as const,
    family: "recompose-by-demand" as const,
  })),
);
export const transitionKey = (from: GuidedLens | null, to: GuidedLens) =>
  `${from ?? "Jobs"}>${to}`;
export const relevantContribution = meaning;
export type SelectionPolicy = {
  lens: GuidedLens;
  clearsWhenAnchorChanges: true;
  clearsWhenLensRemoved: true;
  invalidIfEntityNoLongerRelated: true;
  invalidIfNewSelectionConflicts: true;
  persistsIfRelevant: (state: GuidedState, id: string) => boolean;
};
const context = (state: GuidedState) =>
  demoContext(
    jobById(anchorJob(state.anchor) ?? "J-4217"),
    state.assignment,
  );
export const SELECTION_POLICIES: Record<
  keyof GuidedState["selection"],
  SelectionPolicy
> = {
  fuel: {
    lens: "Fuel",
    clearsWhenAnchorChanges: true,
    clearsWhenLensRemoved: true,
    invalidIfEntityNoLongerRelated: true,
    invalidIfNewSelectionConflicts: true,
    persistsIfRelevant: (s, id) => context(s).stops.some((x) => x.id === id),
  },
  document: {
    lens: "Documents",
    clearsWhenAnchorChanges: true,
    clearsWhenLensRemoved: true,
    invalidIfEntityNoLongerRelated: true,
    invalidIfNewSelectionConflicts: true,
    persistsIfRelevant: (s, id) =>
      context(s).documents.some((x) => x.id === id),
  },
  restriction: {
    lens: "Restrictions",
    clearsWhenAnchorChanges: true,
    clearsWhenLensRemoved: true,
    invalidIfEntityNoLongerRelated: true,
    invalidIfNewSelectionConflicts: true,
    persistsIfRelevant: (s, id) =>
      context(s).restrictions.some((x) => x.id === id),
  },
  resource: {
    lens: "Drivers",
    clearsWhenAnchorChanges: true,
    clearsWhenLensRemoved: true,
    invalidIfEntityNoLongerRelated: true,
    invalidIfNewSelectionConflicts: true,
    persistsIfRelevant: (s, id) =>
      [context(s).driverId, context(s).truckId].includes(id),
  },
};
export function normalizeSelections(
  state: GuidedState,
  anchorChanged = false,
  removed?: GuidedLens,
) {
  for (const key of Object.keys(
    SELECTION_POLICIES,
  ) as (keyof GuidedState["selection"])[]) {
    const value = state.selection[key],
      p = SELECTION_POLICIES[key];
    const owner =
      key === "resource" && value === context(state).truckId
        ? "Trucks"
        : p.lens;
    if (value) {
      const reason = anchorChanged
        ? "Âncora mudou: entidade pertence ao Job anterior"
        : removed === owner
          ? `Lente ${owner} removida`
          : !state.active.includes(owner)
            ? `Lente ${owner} não está ativa`
            : !p.persistsIfRelevant(state, value)
              ? key === "fuel" && state.assignment.truck
                ? "Novo veículo: posto incompatível com o conjunto selecionado"
                : "Entidade não relacionada ou seleção incompatível com o contexto"
              : "Entidade relacionada com a âncora e lente proprietária ativa";
      const cleared =
        anchorChanged ||
        removed === owner ||
        !state.active.includes(owner) ||
        !p.persistsIfRelevant(state, value);
      if (cleared) state.selection[key] = null;
      const entry = {
        key,
        id: value,
        outcome: cleared ? ("cleared" as const) : ("kept" as const),
        reason,
      };
      if (JSON.stringify(state.selectionLog.at(-1)) !== JSON.stringify(entry))
        state.selectionLog.push(entry);
      state.selectionLog = state.selectionLog.slice(-16);
    }
  }
}
/** Three lifecycle contracts shared by every graph edge, without pairwise layouts. */
export const TRANSITION_CONTRACTS = {
  onEnterAsSupport(state: GuidedState, lens: GuidedLens) {
    if (!state.active.includes(lens)) state.active.push(lens);
    return {
      information: meaning(state.lead, lens),
      map: "preserve",
      group: LENS_CONTRACTS[lens].group,
    };
  },
  onBecomeLead(state: GuidedState, lens: GuidedLens) {
    this.onEnterAsSupport(state, lens);
    const previous = state.lead;
    state.lead = previous === lens ? null : lens;
    normalizeSelections(state);
    if (state.spatial.source !== "user") state.spatial = defaultSpatial(state);
    return {
      information: LENS_CONTRACTS[lens].lead,
      map: "resolve-if-automatic",
      group: LENS_CONTRACTS[lens].group,
    };
  },
  onLeave(state: GuidedState, lens: GuidedLens) {
    state.active = state.active.filter((x) => x !== lens);
    normalizeSelections(state, false, lens);
    if (state.lead === lens) {
      state.lead = null;
      if (state.spatial.source !== "user")
        state.spatial = defaultSpatial(state);
    }
    const lostStop =
      lens === "Fuel" && ["stop", "candidates"].includes(state.spatial.target);
    const lostRestriction =
      lens === "Restrictions" && state.spatial.target === "restriction";
    if (lostStop || lostRestriction) state.spatial = defaultSpatial(state);
    return {
      information: "Contribuição removida; âncora conservada",
      map:
        lostStop || lostRestriction ? "resolve-unavailable-target" : "preserve",
      group: LENS_CONTRACTS[lens].group,
    };
  },
};
