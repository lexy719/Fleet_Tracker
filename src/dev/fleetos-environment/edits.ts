import type { Focus, GuidedLens, GuidedState } from "./guidedWorkspace";

/** Edits the lab can stage. Each one opens inside the instrument that owns the fact. */
export type EditKind =
  | "trailer"
  | "truck"
  | "driver"
  | "axle"
  | "fuel-reading"
  | "maintenance"
  | "qualification"
  | "authorization"
  | "baseline"
  | "issue";
export type ProposalKind = EditKind | "stop" | "reissue";
/**
 * A reversible operational change. `id` names the entity whose fact changes
 * (job for assignments, truck for physical facts, driver:qual for qualifications);
 * `from`/`to` are the committed and proposed values. Stop proposals keep their
 * original shape: `id` is the proposed stop, `from` the current one.
 */
export type Proposal = { kind: ProposalKind; id: string; from: string; to?: string };

export const EDIT_HOME: Record<
  EditKind,
  { domain: Exclude<GuidedLens, "Jobs" | "Pricing DEV" | "Compliance DEV">; facet: string; label: string; focus?: Focus }
> = {
  trailer: { domain: "Trucks", facet: "assignment", label: "Mudar reboque" },
  truck: { domain: "Trucks", facet: "assignment", label: "Mudar viatura" },
  driver: { domain: "Drivers", facet: "assignment", label: "Mudar motorista" },
  axle: {
    domain: "Trucks",
    facet: "restriction",
    label: "Registar altura ao 1.º eixo",
    focus: { kind: "vehicle", aspect: "restriction", part: "firstAxle" },
  },
  "fuel-reading": { domain: "Trucks", facet: "fuel", label: "Atualizar leitura de combustível", focus: { kind: "vehicle", aspect: "fuel" } },
  maintenance: { domain: "Trucks", facet: "maintenance", label: "Resolver manutenção" },
  qualification: { domain: "Documents", facet: "qualification", label: "Registar renovação" },
  authorization: { domain: "Restrictions", facet: "missing", label: "Registar habilitação VCI" },
  baseline: { domain: "Drivers", facet: "legality", label: "Corrigir base de horas" },
  issue: { domain: "Documents", facet: "issue", label: "Emitir guia CMR" },
};

/** The value the workspace shows: a staged proposal previews over committed DEV facts. */
export function fact(state: GuidedState, kind: ProposalKind, id: string, preview = true): string | undefined {
  const p = state.pending;
  if (preview && p && p.kind === kind && p.id === id && p.to !== undefined) return p.to;
  return state.overrides[`${kind}:${id}`];
}
export const isProposed = (state: GuidedState, kind: ProposalKind, id: string) =>
  !!state.pending && state.pending.kind === kind && state.pending.id === id;
export const committed = (state: GuidedState): GuidedState => ({ ...state, pending: null });
