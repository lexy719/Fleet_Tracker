import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useIngestion } from "../../context/IngestionContext";
import type { ResearchRun } from "../../research/agent";
import type { ComplianceReport, FactSet } from "../../regulations/types";
import type { RoutePlanOption } from "../../tomtom/planRoutes";

/*
 * Planner entry to the research agent: research THIS route's official sources. The agent is
 * infrastructure — the dispatcher sees operational state, not prompts or reasoning.
 */

export function RouteResearchControl({ route, report, facts }: { route: RoutePlanOption | undefined; report: ComplianceReport | undefined; facts: FactSet }) {
  const ing = useIngestion();
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!route) return null;
  const caps = ing.researchCapabilities;
  // Knowledge this route touches: revalidate its legal basis at the source.
  const revalidate = (report?.results ?? []).filter((r) => r.outcome === "APPLIES" || r.outcome === "UNKNOWN").map((r) => r.regulationId);
  const go = async () => {
    setError(null);
    try {
      setRun(await ing.runRouteResearch(route, "FASTEST", facts, { revalidate, force: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const review = run ? run.candidates.filter((c) => ing.candidates.find((x) => x.id === c.id)?.gate.decision === "REVIEW_REQUIRED").length : 0;
  const count = (s: string) => run?.steps.filter((x) => x.state === s).length ?? 0;
  return (
    <div className="mb-2 rounded-[var(--r-md)] border border-[var(--app-border)] px-3 py-2 text-[11px]" data-testid="route-research">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void go()}
          disabled={ing.researching || !caps.retrieve}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--app-elevated)] px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {ing.researching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          {ing.researching ? "A INVESTIGAR fontes oficiais…" : "Investigar fontes oficiais desta rota"}
        </button>
        {caps.checked && !caps.retrieve && <span className="text-[10px] text-[var(--app-muted)]">Fronteira de investigação indisponível neste ambiente (só em desenvolvimento/preview local).</span>}
        {run && (
          <span className="flex flex-wrap gap-1 text-[10px]">
            <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 font-semibold text-[var(--accent)]">FONTES ENCONTRADAS {count("SOURCE_FOUND")}</span>
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900">NOVOS/REVISTOS {count("NEW_CANDIDATE") + count("CANDIDATE_REVISED")}</span>
            {review > 0 && <span className="rounded-full bg-[var(--warn-soft)] px-1.5 py-0.5 font-semibold text-[var(--warn)]">REVISÃO NECESSÁRIA {review}</span>}
            {count("SOURCE_FAILED") > 0 && <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 font-semibold text-[var(--danger)]">FONTES FALHARAM {count("SOURCE_FAILED")}</span>}
            <span className="rounded-full bg-[var(--neutral-soft)] px-1.5 py-0.5 font-semibold text-[var(--text-2)]">LACUNAS {run.gaps.length}</span>
          </span>
        )}
      </div>
      {run && (
        <p className="mt-1 text-[10px] text-[var(--app-muted)]">
          Nada entra na avaliação da rota sem passar pelo trust gate e, para texto lido automaticamente, sem revisão humana.{" "}
          <Link to="/app/intelligence" className="underline">
            Ver evidência e rever em Road Intelligence → Investigação / Candidatos
          </Link>
          .
        </p>
      )}
      {error && <p className="mt-1 text-[var(--danger)]">Investigação falhou: {error} — nada foi alterado.</p>}
    </div>
  );
}
