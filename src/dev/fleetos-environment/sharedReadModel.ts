import type { GuidedAction, GuidedState } from "./guidedWorkspace";
import { labWorld } from "./fx/model";
import { providerFor } from "./engine/synthetic";
import { WORLD_JOBS } from "./world";
import type { EntityNode } from "./engine/contracts";
import type { SharedWork } from "./sharedComposition";

export function sharedScope(state: GuidedState): {
  status: "DAY" | "SELECTED" | "MISSING" | "UNASSIGNED";
  node: EntityNode | null;
  jobIds: string[];
} {
  const anchor = state.anchor;
  if (anchor.kind === "jobs")
    return {
      status: "DAY" as const,
      node: null,
      jobIds: WORLD_JOBS.map((job) => job.id),
    };
  if (anchor.kind === "job")
    return {
      status: WORLD_JOBS.some((job) => job.id === anchor.id)
        ? ("SELECTED" as const)
        : ("MISSING" as const),
      node: null,
      jobIds: WORLD_JOBS.some((job) => job.id === anchor.id) ? [anchor.id] : [],
    };
  const provider = providerFor(state);
  const node = provider.entity({ kind: anchor.kind, id: anchor.id });
  if (!node || (anchor.job && !WORLD_JOBS.some((job) => job.id === anchor.job)))
    return { status: "MISSING" as const, node, jobIds: [] };
  const related = provider.related({ kind: anchor.kind, id: anchor.id }, "job");
  const jobIds =
    anchor.job && related.some((job) => job.ref.id === anchor.job)
      ? [anchor.job]
      : [];
  return {
    status: jobIds.length ? ("SELECTED" as const) : ("UNASSIGNED" as const),
    node,
    jobIds,
  };
}

/** Read each transport in its own scope. In particular, a previous resource
 * selection must never be applied to the whole day's assignments. */
export function sharedWorkRows(state: GuidedState) {
  const scope = sharedScope(state);
  return WORLD_JOBS.filter(
    (job) =>
      scope.jobIds.includes(job.id) &&
      (state.anchor.kind !== "jobs" ||
        state.filter !== "moving" ||
        ["loading", "in_transit"].includes(job.status)),
  ).map((job) => {
    const scoped = {
      ...state,
      anchor: { kind: "job" as const, id: job.id },
      assignment: { truck: null },
    };
    const world = labWorld(scoped);
    const provider = providerFor(scoped);
    const assignment = provider.getResourceAssignment(job.id);
    const timeline = provider.getOperationalTimeline(job.id);
    const decisions: { label: string; action: GuidedAction }[] = [];
    const inspect = (
      kind: "truck" | "driver" | "document" | "restriction",
      id: string,
      label: string,
    ) =>
      decisions.push({
        label,
        action: { type: "entity", kind, id, job: job.id },
      });
    if (world.trailerMissing)
      decisions.push({
        label: "Escolher um reboque existente",
        action: { type: "job", id: job.id },
      });
    if (world.truck.availability !== "AVAILABLE")
      inspect("truck", world.truck.id, "Viatura indisponível · rever conjunto");
    if (
      world.driver.qualifications.some(
        (qualification) =>
          ["EXPIRED", "MISSING", "NOT_HELD"].includes(qualification.state) &&
          (qualification.kind !== "adr" ||
            world.job.cargo.some((cargo) => cargo.adr)),
      )
    )
      inspect(
        "driver",
        world.driver.id,
        "Qualificação exigida requer revisão · rever motorista",
      );
    if (world.job.plan === "REPLAN_REQUIRED")
      decisions.push({
        label: "Rever o plano com a nova janela",
        action: { type: "job", id: job.id },
      });
    const cmr = world.ledger.find(
      (document) => document.type === "CMR" && document.state !== "VOID",
    );
    if (cmr && (cmr.diverges || cmr.state !== "ISSUED"))
      inspect(
        "document",
        cmr.id,
        cmr.diverges
          ? "Rever diferenças na guia emitida"
          : "Preparar a guia antes da partida",
      );
    const passages = world.restrictions.map((restriction) => ({
      restriction,
      impact: provider.getRestrictionImpact(job.id, restriction.id),
    }));
    const unresolved = passages.find(({ impact }) => impact.status !== "PASS");
    if (unresolved)
      inspect(
        "restriction",
        unresolved.restriction.id,
        unresolved.impact.status === "UNKNOWN"
          ? "Confirmar condições de passagem"
          : "Resolver passagem condicionada",
      );
    return {
      anchor: state.anchor,
      world,
      assignment,
      timeline,
      decisions,
      passages,
      unloads: world.job.cargo
        .map((cargo) => ({
          cargo,
          stop:
            world.job.stops.find(
              (stop) => stop.type !== "pickup" && stop.city === cargo.dropAt,
            ) ?? null,
          sequence: world.job.stops.findIndex(
            (stop) => stop.type !== "pickup" && stop.city === cargo.dropAt,
          ),
        }))
        .sort(
          (a, b) =>
            (a.sequence < 0 ? Infinity : a.sequence) -
            (b.sequence < 0 ? Infinity : b.sequence),
        ),
      next: world.job.stops.find((stop) => !stop.completedAt) ?? null,
    };
  });
}
export type SharedWorkRow = ReturnType<typeof sharedWorkRows>[number];

/** The relationship supplies the working form; the actual record supplies the
 * situation that needs attention inside it. Never infer a different job. */
export function sharedWorkSituation(row: SharedWorkRow, work: SharedWork) {
  const w = row.world;
  const has = (domain: SharedWork["domains"][number]) =>
    work.domains.includes(domain);
  if (has("Trucks") && w.trailerMissing)
    return {
      mode: "missing-trailer",
      title: "Encontrar um conjunto para esta carga",
      question: `${w.job.trailerId} não existe no registo. Confrontar a carga e os recursos antes de atribuir outro reboque.`,
    };
  if (has("Trucks") && w.truck.availability !== "AVAILABLE")
    return {
      mode: "unavailable-truck",
      title: "Recompor o trabalho com outra viatura",
      question: `${w.truck.plate} está indisponível. Rever o conjunto e as condições deste transporte.`,
    };
  const expired =
    has("Drivers") &&
    w.driver.qualifications.find(
      (q) =>
        ["EXPIRED", "MISSING", "NOT_HELD"].includes(q.state) &&
        (q.kind !== "adr" || w.job.cargo.some((c) => c.adr)),
    );
  if (expired)
    return {
      mode:
        expired.state === "EXPIRED"
          ? "expired-qualification"
          : "missing-qualification",
      title: "Resolver a habilitação para este trabalho",
      question: `${w.driver.name} tem ${expired.label} ${expired.state === "EXPIRED" ? "caducado" : "em falta"}. Rever o registo e uma possível alteração da atribuição.`,
    };
  if (
    (has("Jobs") || work.variant === "schedule") &&
    w.job.plan === "REPLAN_REQUIRED"
  )
    return {
      mode: "changed-window",
      title: "Conciliar a nova janela com o trabalho",
      question:
        w.job.planNote ??
        "A janela mudou. Confrontar o turno, as etapas e o que ainda precisa de ser calculado.",
    };
  if (has("Drivers") && w.driver.baseline.stale)
    return {
      mode: "unconfirmed-hours",
      title: "Confirmar as horas antes de planear",
      question:
        "A base manual está desatualizada. O tempo disponível precisa de confirmação para este trabalho.",
    };
  if (work.variant === "range" && !w.positionKnown)
    return {
      mode: "unconfirmed-position",
      title: "Preparar a próxima leitura de autonomia",
      question:
        "A última leitura do depósito é conhecida; falta execução confirmada para estimar o consumo desde então.",
    };
  if (work.variant === "clearance" && w.truck.firstAxleHeightM == null)
    return {
      mode: "missing-measurement",
      title: "Completar a medição para verificar a passagem",
      question:
        "Confrontar o conjunto com a regra e registar a altura ao primeiro eixo que falta.",
    };
  return {
    mode:
      w.job.status === "in_transit"
        ? "in-transit"
        : w.job.status === "loading"
          ? "loading"
          : "preparation",
    title: work.title,
    question: work.question,
  };
}
