import type { GuidedState } from "./guidedWorkspace";

export const WORK_DOMAINS = [
  "Jobs",
  "Drivers",
  "Trucks",
  "Fuel",
  "Restrictions",
  "Documents",
] as const;
export type WorkDomain = (typeof WORK_DOMAINS)[number];
export type WorkVariant =
  | "unit"
  | "capacity"
  | "schedule"
  | "clearance"
  | "credentials"
  | "range"
  | "route-choice"
  | "departure"
  | "execution"
  | "execution-records";
export type SharedWork = {
  kind: "journey" | "matching" | "handover";
  variant: WorkVariant;
  title: string;
  question: string;
  domains: WorkDomain[];
};

/** Resolve the whole participating set before allocating space. The scope
 * selects records; activation order and the former lead do not own the work. */
export function sharedWork(
  state: Pick<GuidedState, "active"> & Pick<Partial<GuidedState>, "workTask">,
): SharedWork | null {
  const domains = WORK_DOMAINS.filter((domain) =>
    state.active.includes(domain),
  );
  if (domains.length < 2) return null;
  const has = (domain: WorkDomain) => domains.includes(domain);
  const kind =
    has("Fuel") || (has("Restrictions") && !has("Documents"))
      ? "journey"
      : has("Documents")
        ? "handover"
        : "matching";
  const task = (
    variant: WorkVariant,
    title: string,
    question: string,
  ): SharedWork => ({ kind, variant, title, question, domains });
  if (state.workTask === "execution")
    return {
      kind: "journey",
      variant: "execution",
      domains,
      title: "Conduzir a próxima etapa",
      question:
        "Ligar a sequência do trabalho às responsabilidades e às condições para avançar.",
    };
  if (state.workTask === "departure" && has("Documents"))
    return {
      kind: "handover",
      variant: "departure",
      domains,
      title: "Preparar a passagem",
      question:
        "Resolver os pré-requisitos do conjunto, do percurso e dos registos antes da próxima etapa.",
    };
  if (state.workTask === "unit" && has("Drivers") && has("Trucks"))
    return {
      kind: "matching",
      variant: "unit",
      domains,
      title: "Prontidão dos conjuntos",
      question:
        "Confrontar quem conduz e o conjunto com as exigências deste trabalho.",
    };
  if (
    has("Drivers") &&
    has("Documents") &&
    !has("Trucks") &&
    !has("Fuel") &&
    !has("Restrictions")
  )
    return task(
      "credentials",
      "Habilitações para o trabalho",
      "Que registos do motorista permitem executar esta carga?",
    );
  if (has("Trucks") && has("Restrictions") && !has("Drivers") && !has("Fuel"))
    return task(
      "clearance",
      "O conjunto pode passar?",
      "Confrontar as medições da viatura com as condições de cada passagem.",
    );
  if (has("Drivers") && !has("Trucks") && !has("Documents"))
    return task(
      "schedule",
      "Conciliar o turno e as etapas",
      "Onde cabem a condução, a pausa e as janelas de entrega?",
    );
  if (
    has("Trucks") &&
    has("Jobs") &&
    !has("Drivers") &&
    !has("Fuel") &&
    !has("Documents")
  )
    return task(
      "capacity",
      "Carga e capacidade",
      "Que carga vai neste conjunto e em que ordem sai?",
    );
  if (
    has("Fuel") &&
    has("Trucks") &&
    !has("Drivers") &&
    !has("Restrictions") &&
    !has("Documents")
  )
    return task(
      "range",
      "Autonomia até à próxima paragem",
      "O que sabemos do depósito e onde podemos abastecer?",
    );
  if (has("Fuel") && has("Restrictions") && !has("Drivers") && !has("Trucks"))
    return task(
      "route-choice",
      "Escolher o percurso",
      "Comparar os corredores e o que falta validar antes de alterar a rota.",
    );
  if (has("Fuel") && has("Documents"))
    return task(
      "execution-records",
      "Etapas e registos de execução",
      "Ligar a sequência do percurso aos registos e às diferenças da guia.",
    );
  if (has("Fuel") || (has("Restrictions") && !has("Documents")))
    return {
      kind: "journey",
      variant: "execution",
      title: "Execução dos percursos",
      question: "O que precisa de acontecer para cumprir a próxima etapa?",
      domains,
    };
  if (has("Documents"))
    return {
      kind: "handover",
      variant: "departure",
      title: "Preparar a passagem",
      question:
        "Que condições e registos faltam para avançar com o transporte?",
      domains,
    };
  return {
    kind: "matching",
    variant: "unit",
    title: "Prontidão dos conjuntos",
    question: "Quem e que conjunto podem executar o trabalho de hoje?",
    domains,
  };
}

/** Working questions, not cosmetic layout choices. Every available question
 * can represent the entire participating set; inspection remains a separate excursion. */
export function sharedWorkQuestions(state: Pick<GuidedState, "active">) {
  const base = sharedWork(state);
  if (!base) return [];
  const questions: {
    value: NonNullable<GuidedState["workTask"]>;
    label: string;
  }[] = [{ value: "auto", label: base.title }];
  if (base.variant !== "execution")
    questions.push({ value: "execution", label: "Conduzir a próxima etapa" });
  if (state.active.includes("Documents") && base.variant !== "departure")
    questions.push({ value: "departure", label: "Preparar a passagem" });
  if (
    state.active.includes("Drivers") &&
    state.active.includes("Trucks") &&
    base.variant !== "unit"
  )
    questions.push({ value: "unit", label: "Prontidão dos conjuntos" });
  return questions;
}

/** Shared working compositions. Detailed inspections
 * retain the existing authored instruments and captured frame history. */
export function usesSharedWork(state: GuidedState): boolean {
  return (
    !!sharedWork(state) &&
    !state.workInspection &&
    !state.takeover &&
    !state.focus &&
    !state.edit &&
    Object.keys(state.facet).length === 0
  );
}
