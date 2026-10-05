import { useState } from "react";
import { ACCEPTANCE_CASES, acceptanceFixture, type AcceptanceCase } from "../domain/routing/acceptanceFixtures";
import { Button, PageHeader } from "../ui/kit";

/** DEV-only, non-persistent acceptance harness for the real decision function. */
export function RoutingAcceptancePage() {
  const [name, setName] = useState<AcceptanceCase>("Uma decisão");
  const { candidates, result } = acceptanceFixture(name);
  return <div className="flex-1 overflow-auto bg-[var(--surface)]">
    <PageHeader title="Aceitação do motor de rotas" meta="TESTE SINTÉTICO · sem dados reais · sem pedidos ao fornecedor" />
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap gap-2">{ACCEPTANCE_CASES.map((c) => <Button key={c} onClick={() => setName(c)} aria-pressed={c === name}>{c}</Button>)}</div>
      <h2>{name}</h2>
      <p data-testid="fixture-summary">{result.evaluatedCandidateCount} candidatos · {result.excludedCandidateCount} excluídos · {result.decisions.length} decisões · recomendação {result.recommendedRouteId ?? "nenhuma"}</p>
      <p>{result.decisionStatus === "NO_EXECUTABLE_ROUTE" ? "Nenhuma rota executável encontrada." : result.analysisSummary}</p>
      <ul>{result.decisions.map((d) => <li key={d.routeId}><strong>{d.reason === "RECOMMENDED" ? "Recomendada" : "Alternativa"}: {d.routeId}</strong> · {Math.round(d.elapsedSec / 60)} min · €{d.option.fuelCostEur + d.option.tollCostEur} · {d.explanation}</li>)}</ul>
      <details><summary>Ver análise dos candidatos</summary><ul>{candidates.map((c) => <li key={c.option.id}>{c.option.id} · {c.report?.status} · {result.excluded.find((e) => e.routeId === c.option.id)?.reasons.join("; ") ?? "sem proibição aplicável"}</li>)}</ul></details>
      <ul>{result.unresolvedIssues.map((i) => <li key={i}>{i}</li>)}</ul>
      <p>Impactos de obras são metadados; as durações são respostas sintéticas do fornecedor e não atrasos inventados pelo motor.</p>
    </div>
  </div>;
}
