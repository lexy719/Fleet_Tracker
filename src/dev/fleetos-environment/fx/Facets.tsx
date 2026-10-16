import type {
  FacetDomain,
  FacetState,
  GuidedAction,
  GuidedState,
} from "../guidedWorkspace";
import { sharedWork } from "../sharedComposition";

export const FACET_LABEL: {
  [D in FacetDomain]: Record<NonNullable<FacetState[D]>, string>;
} = {
  Drivers: {
    execution: "Hoje",
    legality: "Tempos e limites",
    qualifications: "Habilitações",
    corridor: "Turno completo",
    assignment: "Atribuição",
  },
  Trucks: {
    load: "Carga",
    restriction: "Restrições",
    fuel: "Combustível",
    assignment: "Conjunto",
    maintenance: "Oficina",
  },
  Fuel: {
    management: "Gestão da rota",
    comparison: "Percursos",
    journey: "Viagem",
    stops: "Paragens",
    window: "Janelas",
    segment: "Troços",
  },
  Documents: {
    dossier: "Dossier",
    diff: "Diferenças",
    history: "Histórico",
    issue: "Emitir",
    qualification: "Habilitação",
  },
  Restrictions: {
    logic: "Aplicabilidade",
    missing: "Factos em falta",
    physical: "Viatura",
    alternative: "Alternativa",
    evidence: "Evidência",
  },
};

/** The question the lead answers. Defaults keep the 5.7J behaviour. */
export function facetOf<D extends FacetDomain>(
  state: GuidedState,
  domain: D,
): NonNullable<FacetState[D]> {
  const set = state.facet[domain];
  if (set) return set as NonNullable<FacetState[D]>;
  if (
    domain === "Fuel" &&
    state.active.includes("Fuel") &&
    (state.anchor.kind === "truck" || state.anchor.kind === "driver") &&
    state.anchor.job
  )
    return "management" as NonNullable<FacetState[D]>;
  if (domain === "Trucks")
    return (
      state.focus?.kind === "vehicle"
        ? state.focus.aspect
        : state.active.includes("Restrictions")
          ? "restriction"
          : "load"
    ) as NonNullable<FacetState[D]>;
  const first = {
    Drivers: "execution",
    Fuel: "journey",
    Documents: "dossier",
    Restrictions: "logic",
  } as const;
  return first[domain as Exclude<FacetDomain, "Trucks">] as NonNullable<
    FacetState[D]
  >;
}

/**
 * Same domain, different question. Switching a facet recomposes the instrument
 * (and, through its spatial question, the map) — it is an inspect interaction,
 * never navigation to another page.
 */
export function FacetBar<D extends FacetDomain>({
  state,
  act,
  domain,
  only,
}: {
  state: GuidedState;
  act: (a: GuidedAction) => void;
  domain: D;
  only?: string[];
}) {
  const current = facetOf(state, domain);
  const entries = Object.entries(FACET_LABEL[domain]) as [string, string][];
  const work = sharedWork(state);
  return (
    <>
      {work && !state.edit && (
        <div className="sw-inspection-return">
          <small>Inspeção dentro de {work.title.toLowerCase()}</small>
          <button
            className="fx-link"
            data-ix="inspect"
            onClick={() => act({ type: "work-return" })}
          >
            ← Voltar ao trabalho conjunto
          </button>
        </div>
      )}
      <nav className="fx-aspects fx-facets" aria-label="Pergunta desta lente">
        {entries
          .filter(([id]) => !only || only.includes(id) || id === current)
          .map(([id, label]) => (
            <button
              key={id}
              data-ix={current === id ? undefined : "inspect"}
              aria-pressed={current === id}
              aria-current={current === id ? "true" : undefined}
              disabled={current === id}
              onClick={() => act({ type: "facet", domain, facet: id })}
            >
              {label}
            </button>
          ))}
      </nav>
    </>
  );
}
