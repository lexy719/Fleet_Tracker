import { ChevronRight } from "lucide-react";
import type { Job } from "../../data/types";
import { fmtDuration, fmtEur, fmtKm, fmtWhen } from "../format";
import { DataList, Notice, Pill, StatusBadge } from "../kit";
import { PLAN_STATUS, type Tone } from "../status";
import { decisionView, JobResources, useDecisionState } from "./JobParts";

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  APPLIES: { label: "Aplica-se", tone: "danger" },
  DOES_NOT_APPLY: { label: "Não se aplica", tone: "neutral" },
  UNKNOWN: { label: "Desconhecido", tone: "neutral" },
};

const toneOf = (ok: boolean | null | undefined): Tone => (ok === true ? "ok" : ok === false ? "danger" : "neutral");

/**
 * Job dossier → «Plano e decisão»: the decision as it was confirmed (route, departure,
 * resources, metrics, conclusions, assumptions). Evidence is one click away, never in front.
 */
export function PlanDecision({ job }: { job: Job }) {
  const state = useDecisionState(job);
  const dv = decisionView(state);
  const d = job.planDecision;
  const rc = job.routeCompliance;
  if (job.planStatus === "UNPLANNED" && !rc && !d) {
    return <p className="text-[13px] text-[var(--text-3)]">Ainda não existe decisão de planeamento para este trabalho.</p>;
  }
  return (
    <div className="space-y-4">
      <Notice title="Revisão da conformidade atual" tone={dv.tone}>
        <p>{dv.label}{dv.detail ? ` · ${dv.detail}` : ""}</p>
        {state.state === "CURRENT" || state.state === "REQUIRES_REEVALUATION" ? (
          <ul>{state.reevaluation.current.results.filter((r) => r.outcome !== "DOES_NOT_APPLY").map((r) => <li key={r.regulationId}>{r.title} · {r.effect === "advisory" ? "impacto não bloqueante" : r.outcome === "APPLIES" ? "restrição obrigatória aplicável" : "aplicabilidade por resolver"}</li>)}</ul>
        ) : null}
        {["loading", "in_transit"].includes(job.status) ? <p>A rota em execução mantém-se. Esta revisão não altera o transporte nem inicia um replaneamento.</p> : null}
      </Notice>
      <DataList
        rows={[
          { label: "Plano", value: <span className="flex items-center gap-2"><StatusBadge status={PLAN_STATUS[job.planStatus]} />{job.planStatus === "REPLAN_REQUIRED" && job.planInvalidation ? <span className="text-[12px] text-[var(--warn)]">Alterado: {job.planInvalidation.fields.join(", ")}</span> : null}</span> },
          { label: "Rota", value: d?.routeTitle ?? rc?.route.title ?? "—" },
          { label: "Partida", value: d?.departureAt || job.plannedDepartureAt ? fmtWhen(d?.departureAt ?? job.plannedDepartureAt) : "—" },
          ...(d?.arrivalAt || rc?.route.arrivalAtIso ? [{ label: "Chegada prevista", value: fmtWhen(d?.arrivalAt ?? rc?.route.arrivalAtIso) }] : []),
          { label: "Distância · duração", value: job.plannedKm !== undefined ? `${fmtKm(job.plannedKm)} · ${fmtDuration(job.plannedDurationMin)}` : "—" },
          ...(job.plannedCostEur !== undefined ? [{ label: "Custo estimado", value: <span>{fmtEur(job.plannedCostEur)} <span className="text-[var(--text-3)]">combustível + portagens</span></span> }] : []),
          { label: "Janela de entrega", value: d?.windowResult ? <Pill tone={toneOf(d.windowResult.ok)}>{d.windowResult.text}</Pill> : <span className="text-[var(--text-3)]">não registado nesta decisão</span> },
          { label: "Tempos de condução (UE 561)", value: d?.eu561 ? <Pill tone={toneOf(d.eu561.ok)}>{d.eu561.text}</Pill> : <span className="text-[var(--text-3)]">não registado nesta decisão</span> },
          { label: "Road Intelligence", value: <span><StatusBadge status={{ label: dv.label, tone: dv.tone }} />{dv.detail ? <span className="ml-2 text-[12px] text-[var(--text-3)]">{dv.detail}</span> : null}</span> },
          ...(d?.confirmedAt || rc?.confirmedAt ? [{ label: "Confirmado", value: fmtWhen(d?.confirmedAt ?? rc?.confirmedAt) }] : []),
        ]}
      />
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-[var(--text-2)]">Recursos</div>
        <JobResources job={job} />
      </div>
      {d?.assumptions.length ? (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-[var(--text-2)]">Valores assumidos no cálculo ({d.assumptions.length})</div>
          <ul className="list-disc pl-5 text-[12px] text-[var(--text-2)]">{d.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      ) : null}
      {rc ? (
        <details className="group rounded-[var(--r-md)] border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[var(--text-2)]">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />Evidência da decisão · {rc.report.results.length} restrições avaliadas · {rc.evidence.length} fontes
          </summary>
          <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 text-[12px]">
            {rc.acknowledged ? <p className="text-[var(--warn)]">Confirmado pelo expedidor com questões por resolver; não prova ausência de restrições desconhecidas.</p> : null}
            {rc.original ? <p className="text-[var(--text-2)]">Substituiu a rota «{rc.original.route.title}» ({rc.original.rejectedBecause.join("; ")}).</p> : null}
            <table className="ui-table">
              <thead><tr><th>Restrição</th><th>Resultado</th><th>Porquê</th></tr></thead>
              <tbody>
                {rc.report.results.map((r) => (
                  <tr key={r.regulationId}>
                    <td>{r.title}</td>
                    <td><Pill tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Pill></td>
                    <td className="text-[var(--text-2)]">{r.error ?? r.reasons.map((x) => x.text).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rc.evidence.length ? (
              <ul className="space-y-1">
                {rc.evidence.map((e) => (
                  <li key={e.id} className="text-[var(--text-2)]">{e.authority} — {e.instrument}{e.locator ? `, ${e.locator}` : ""} · <a className="underline" href={e.url} target="_blank" rel="noreferrer">fonte</a></li>
                ))}
              </ul>
            ) : null}
            <p className="text-[var(--text-3)]">Conjunto de dados {rc.report.datasetVersion} · avaliado {fmtWhen(rc.report.evaluatedAt)}</p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
