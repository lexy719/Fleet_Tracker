import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFleetData } from "../../context/FleetDataContext";
import { useJobs } from "../../context/JobsContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import { formatWindow } from "../../regulations/evaluate";
import { assessPlannedJob, type PlannedDecisionState } from "../../regulations/reevaluate";
import { paths } from "../../lib/appLinks";

type Row = { jobId: string; s: Exclude<PlannedDecisionState, { state: "NOT_PLANNED" }> };

/** Does this planned job need the dispatcher's attention? */
function needsAttention(s: PlannedDecisionState): boolean {
  if (s.state === "NOT_PLANNED") return false;
  if (s.state !== "CURRENT") return true;
  return s.reevaluation.current.status !== "ROUTE_COMPLIANT" || s.reevaluation.newFindings.length > 0;
}

const STATE_UI: Record<Row["s"]["state"], { label: string; cls: string }> = {
  CURRENT: { label: "Reavaliado", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  STALE_INPUTS: { label: "Desatualizado", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  REQUIRES_REEVALUATION: { label: "Requer reavaliação", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  INSUFFICIENT_SAVED_ROUTE_DATA: { label: "Dados insuficientes", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ROUTE_AFFECTED: { label: "Rota afetada", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  POTENTIALLY_AFFECTED: { label: "Potencialmente afetada", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  EVALUATION_ERROR: { label: "Erro de avaliação", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  // Coverage is partial everywhere today: "no known constraint", not "compliant".
  ROUTE_COMPLIANT: { label: "Sem restrições conhecidas", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
};

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{label}</span>;
}

/**
 * Intelligence → Revisão → Planos: ALREADY PLANNED jobs re-assessed against the current
 * constraints (stale inputs, legacy data, new findings). No provider calls.
 */
export function PlannedRoutesReview() {
  const { jobs } = useJobs();
  const { trucksLive } = useFleetData();
  const { dataset } = useRoadEvents();
  const navigate = useNavigate();
  const onReviewJob = (id: string) => navigate(paths.job(id, "plan"));

  const assessed = useMemo(
    () =>
      jobs
        .map((j) => ({ jobId: j.id, s: assessPlannedJob(j, trucksLive.find((t) => t.id === j.assignedTruckId) ?? null, dataset) }))
        .filter((r): r is Row => r.s.state !== "NOT_PLANNED"),
    [jobs, trucksLive, dataset],
  );
  const flagged = assessed.filter((r) => needsAttention(r.s));
  const numberOf = (id: string) => jobs.find((j) => j.id === id)?.jobNumber ?? id;

  return (
    <div className="text-[12px]" data-testid="planned-review">
      <p className="mb-2 text-[var(--text-2)]">
        {assessed.length} plano{assessed.length === 1 ? "" : "s"} confirmado{assessed.length === 1 ? "" : "s"} reavaliado{assessed.length === 1 ? "" : "s"} · <span style={{ color: flagged.length ? "var(--warn)" : undefined }}>{flagged.length} a rever</span>
      </p>
      {flagged.length === 0 ? <p className="text-[var(--text-3)]">Nenhum plano confirmado requer revisão com as restrições atuais.</p> : null}
      {flagged.length > 0 && (
        <ul className="space-y-1">
          {flagged.map(({ jobId, s }) => (
            <li key={jobId} className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
              <span className="num font-medium">{numberOf(jobId)}</span>
              <Pill {...STATE_UI[s.state]} />
              {(s.state === "CURRENT" || s.state === "REQUIRES_REEVALUATION") && (
                <Pill {...(STATUS_LABEL[s.reevaluation.current.status] ?? STATUS_LABEL.EVALUATION_ERROR!)} />
              )}
              <span className="min-w-0 text-[var(--app-muted)]">
                {s.state === "STALE_INPUTS" && `mudou: ${s.changed.join(", ")} — decisão anterior inválida`}
                {s.state === "INSUFFICIENT_SAVED_ROUTE_DATA" && s.reason}
                {s.state === "REQUIRES_REEVALUATION" && s.reason}
                {s.state === "CURRENT" &&
                  s.reevaluation.current.results
                    .filter((r) => r.outcome !== "DOES_NOT_APPLY")
                    .map((f) => {
                      const reg = dataset.regulations.find((x) => x.id === f.regulationId);
                      const origin = reg?.origin;
                      const isNew = s.reevaluation.newFindings.some((n) => n.regulationId === f.regulationId);
                      return (
                        <span key={f.regulationId} className="mr-2 inline-flex flex-wrap items-center gap-1" data-testid="bar-finding">
                          {origin && isNew && (
                            <Pill
                              label={`Decisão alterada por informação ingerida${origin.synthetic ? " · TESTE SINTÉTICO" : ""}`}
                              cls={origin.synthetic ? "bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}
                            />
                          )}
                          <span>{f.title}</span>
                          {f.exposure ? <span>· passagem estimada {formatWindow(f.exposure)}</span> : null}
                          {f.error ? <span>· erro: {f.error}</span> : null}
                          {origin && (
                            <span>
                              · fonte: {origin.sourceName}
                              {origin.kind === "ingested_reviewed" ? ` · revisto por ${origin.reviewedBy} (${origin.reviewedAt?.slice(0, 16)})` : " · aceite automaticamente pelo trust gate"}
                              {reg?.evidence[0] && (
                                <>
                                  {" · "}
                                  <a href={reg.evidence[0].url} target="_blank" rel="noreferrer" className="underline">
                                    evidência
                                  </a>
                                </>
                              )}
                            </span>
                          )}
                        </span>
                      );
                    })}
                {s.state === "CURRENT" && s.reevaluation.newFindings.length > 0 && (
                  <span className="block text-[10px]" data-testid="bar-decision-change">
                    Decisão guardada: {STATUS_LABEL[s.reevaluation.previousStatus]?.label ?? s.reevaluation.previousStatus} (conjunto{" "}
                    {s.reevaluation.previousDatasetVersion}) → agora: {STATUS_LABEL[s.reevaluation.current.status]?.label} (conjunto {dataset.version}).
                    Reavaliado sobre a rota guardada; a decisão original mantém-se no histórico do trabalho.
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onReviewJob(jobId)}
                className="ml-auto rounded-lg bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white hover:opacity-90"
              >
                Rever conformidade
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
