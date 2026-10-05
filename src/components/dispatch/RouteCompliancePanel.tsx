import { coverageHeadlinePt } from "../../ui/coverageText";
import { AlertTriangle, ArrowRight, ExternalLink, Loader2, Map as MapIcon, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import type { RouteCoverage } from "../../ingestion/coverage";
import { findEvidence } from "../../regulations/repository";
import type { CandidateVerdict } from "../../regulations/alternatives";
import type { WindowStatus } from "../../regulations/deliveryWindow";
import type { PlannedDecisionState } from "../../regulations/reevaluate";
import type { ComplianceReport, ComplianceStatus, ConstraintKind, RegulationDataset, RegulationResult } from "../../regulations/types";

const STATUS_UI: Record<ComplianceStatus, { label: string; chip: string; box: string; Icon: typeof ShieldCheck }> = {
  ROUTE_COMPLIANT: {
    label: "Rota conforme",
    chip: "bg-[var(--accent-soft)] text-[var(--accent)]",
    box: "border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)]",
    Icon: ShieldCheck,
  },
  POTENTIALLY_AFFECTED: {
    label: "Potencialmente afetada",
    chip: "bg-[var(--warn-soft)] text-[var(--warn)]",
    box: "border-[var(--warn)]/25 bg-[var(--warn-soft)] text-[var(--warn)]",
    Icon: ShieldQuestion,
  },
  ROUTE_AFFECTED: {
    label: "Rota afetada",
    chip: "bg-[var(--danger-soft)] text-[var(--danger)]",
    box: "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]",
    Icon: ShieldAlert,
  },
  EVALUATION_ERROR: {
    label: "Erro de avaliação",
    chip: "bg-[var(--neutral-soft)] text-[var(--text-2)]",
    box: "border-slate-300 bg-[var(--neutral-soft)] text-[var(--text-2)]",
    Icon: ShieldX,
  },
};

/**
 * Status chip. ROUTE_COMPLIANT only means "no KNOWN constraint applies"; unless coverage is
 * known to be complete it is shown neutral, never as a green "compliant".
 */
export function ComplianceChip({ status, coverageComplete = false }: { status: ComplianceStatus; coverageComplete?: boolean }) {
  const ui =
    status === "ROUTE_COMPLIANT" && !coverageComplete
      ? { ...STATUS_UI.ROUTE_COMPLIANT, label: "Sem restrições conhecidas", chip: "bg-[var(--neutral-soft)] text-[var(--text-2)]" }
      : STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${ui.chip}`}>
      <ui.Icon className="h-3 w-3" />
      {ui.label}
    </span>
  );
}

function EvidenceLinks({ ids, dataset }: { ids: string[]; dataset: RegulationDataset }) {
  const items = [...new Set(ids)]
    .map((id) => findEvidence(dataset, id))
    .filter((e): e is NonNullable<typeof e> => !!e && e.verification !== "UNVERIFIED" && !!e.locator);
  if (items.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {items.map((e) => (
        <a
          key={e.id}
          href={e.url}
          target="_blank"
          rel="noreferrer"
          title={e.quote ?? e.note}
          className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2 hover:opacity-80"
        >
          {e.locator}
          {e.verification === "INTERPRETED" ? " (interpretação)" : ""}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
    </span>
  );
}

const KIND_LABEL: Record<ConstraintKind, string> = {
  LEGAL_RESTRICTION: "Restrição legal",
  OPERATIONAL_IMPACT: "Impacto operacional não bloqueante",
  ROAD_CLOSURE: "Corte de estrada",
};

function ResultBlock({ r, dataset }: { r: RegulationResult; dataset: RegulationDataset }) {
  const reg = dataset.regulations.find((x) => x.id === r.regulationId);
  return (
    <div className="space-y-1">
      {reg && (
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-80">
          {KIND_LABEL[reg.kind]} · fonte oficial: {reg.authority}
        </p>
      )}
      <p className="font-semibold">{r.title}</p>
      {reg && <p className="text-[10px] opacity-80">{reg.instrument}</p>}
      <ul className="space-y-0.5 text-[10px] leading-snug">
        {r.reasons.map((reason, i) => (
          <li key={i} className="flex gap-1">
            <span aria-hidden>•</span>
            <span className="min-w-0">{reason.text.trim()}</span>
          </li>
        ))}
      </ul>
      <div className="text-[10px]">
        <EvidenceLinks ids={reg ? reg.evidence.map((e) => e.id) : r.evidenceIds} dataset={dataset} />
      </div>
      {r.caveats.length > 0 && (
        <details className="text-[10px] opacity-80">
          <summary className="cursor-pointer select-none">Questões em aberto ({r.caveats.length})</summary>
          <ul className="mt-0.5 space-y-0.5">
            {r.caveats.map((c, i) => (
              <li key={i}>– {c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export type AlternativeView = {
  optionId: string;
  verdict: CandidateVerdict;
  status?: ComplianceStatus;
  distanceM: number;
  durationSec: number;
  deltaDistanceM: number;
  deltaDurationSec: number;
  /** Official corridors the candidate actually follows (computed). */
  via: string[];
  method: string;
  rejectedBecause: string[];
  isSelected: boolean;
  /** ETA at destination reported by the provider for this candidate. */
  arrivalAtIso?: string;
  deliveryWindow: WindowStatus;
};

export type RouteImpactSummary = {
  distanceM: number;
  durationSec: number;
  arrivalAtIso?: string;
  deliveryWindow?: WindowStatus;
};

function fmtEta(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const WINDOW_UI: Record<WindowStatus, { label: string; cls: string }> = {
  achievable: { label: "janelas alcançáveis", cls: "text-[var(--accent)]" },
  at_risk: { label: "janela EM RISCO", cls: "text-[var(--warn)]" },
  missed: { label: "janela FALHADA", cls: "text-[var(--danger)]" },
  unknown: { label: "janela não avaliável (sem data ou sem ETA)", cls: "text-[var(--warn)]" },
  no_window: { label: "sem janelas definidas", cls: "opacity-70" },
};

function WindowNote({ w }: { w?: WindowStatus }) {
  if (!w) return null;
  const ui = WINDOW_UI[w];
  return <span className={`font-semibold ${ui.cls}`}>{ui.label}</span>;
}

function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
}

function fmtDelta(v: number, unit: "km" | "min"): string {
  const n = unit === "km" ? v / 1000 : v / 60;
  const r = unit === "km" ? n.toFixed(1) : String(Math.round(n));
  return `${n >= 0 ? "+" : "−"}${r.replace("-", "")} ${unit}`;
}

const VERDICT_UI: Record<CandidateVerdict, { label: string; cls: string }> = {
  compliant: { label: "Alternativa conforme", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  uncertain: { label: "Conformidade incerta — não verificada", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  rejected: { label: "Também afetada", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  error: { label: "Erro de avaliação", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  not_evaluated: { label: "Não avaliada", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
};

function AlternativesBlock({
  alternatives,
  status,
  message,
  onUse,
}: {
  alternatives: AlternativeView[];
  status?: "idle" | "searching" | "done" | "unavailable" | "error";
  message?: string;
  onUse?: (id: string) => void;
}) {
  // Only compliant or explicitly-uncertain candidates can be used; the rest are listed as rejected.
  const usable = alternatives.filter((a) => a.verdict === "compliant" || a.verdict === "uncertain");
  const rejected = alternatives.filter((a) => a.verdict !== "compliant" && a.verdict !== "uncertain");
  const anyCompliant = usable.some((a) => a.verdict === "compliant");
  return (
    <div className="space-y-1.5 border-t border-[var(--danger)]/30 pt-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]">Alternativas verificadas</p>
      {status === "searching" && (
        <p className="flex items-center gap-1 text-[10px]">
          <Loader2 className="h-3 w-3 animate-spin" /> A pedir rota ao TomTom que evite a geometria restrita…
        </p>
      )}
      {(status === "unavailable" || status === "error") && message && <p className="text-[10px]">{message}</p>}
      {usable.map((a) => {
        const v = VERDICT_UI[a.verdict];
        return (
          <div key={a.optionId} className="rounded-lg border border-black/10 bg-white/70 p-2 text-[var(--app-fg)]">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${v.cls}`}>{v.label}</span>
              <span className="text-[9px] text-[var(--app-muted)]">{a.method}</span>
            </div>
            {a.via.length > 0 && <p className="mt-1 text-[10px] font-semibold">via {a.via.join(", ")}</p>}
            <p className="mt-0.5 text-[11px] font-semibold">
              {fmtKm(a.distanceM)} · {fmtMin(a.durationSec)}
              <span className="ml-1.5 text-[10px] font-normal text-[var(--app-muted)]">
                {fmtDelta(a.deltaDistanceM, "km")} · {fmtDelta(a.deltaDurationSec, "min")}
              </span>
            </p>
            <p className="mt-0.5 text-[10px]">
              Chegada prevista {fmtEta(a.arrivalAtIso)} · <WindowNote w={a.deliveryWindow} />
            </p>
            {a.verdict === "uncertain" && (
              <p className="mt-0.5 text-[10px] text-[var(--warn)]">Não é possível confirmar a conformidade desta rota — ver motivos ao selecionar.</p>
            )}
            {onUse && !a.isSelected && (
              <button
                type="button"
                onClick={() => onUse(a.optionId)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-white hover:opacity-90"
              >
                Usar alternativa <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      {(status === "done" || status === "error" || status === "unavailable") && !anyCompliant && (
        <p className="text-[10px] font-semibold">
          Sem alternativa verificada como conforme — situação por resolver
          {usable.length > 0 ? " (existem apenas alternativas com conformidade incerta)" : ""}.
        </p>
      )}
      {rejected.length > 0 && (
        <details className="text-[10px] opacity-80">
          <summary className="cursor-pointer select-none">Rejeitadas pelo motor de conformidade ({rejected.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {rejected.map((a) => (
              <li key={a.optionId}>
                {fmtKm(a.distanceM)} · {fmtMin(a.durationSec)} ({a.method}) — {a.rejectedBecause[0] ?? "restrição aplicável"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Truthful one-liner about the decision already saved on the job. */
export function SavedDecisionNote({ s }: { s: PlannedDecisionState }) {
  switch (s.state) {
    case "NOT_PLANNED":
      return null;
    case "INSUFFICIENT_SAVED_ROUTE_DATA":
      return <p className="text-[10px] leading-snug">Plano guardado: <strong>dados insuficientes para reavaliar</strong> — {s.reason}.</p>;
    case "STALE_INPUTS":
      return (
        <p className="text-[10px] leading-snug">
          Plano guardado: <strong>DESATUALIZADO</strong> — mudou: {s.changed.join(", ")}. A decisão anterior ({s.decidedStatus}) já não é válida.
        </p>
      );
    case "REQUIRES_REEVALUATION":
      return (
        <p className="text-[10px] leading-snug">
          Plano guardado: <strong>requer reavaliação</strong> — {s.reason}. Reavaliação da rota guardada: {s.reevaluation.current.status}.
        </p>
      );
    case "CURRENT":
      return (
        <p className="text-[10px] leading-snug">
          Plano guardado (entradas inalteradas){s.datasetChanged ? " reavaliado com o conjunto de restrições atual" : ""}:{" "}
          <strong>{s.reevaluation.current.status}</strong>
          {s.reevaluation.newFindings.length > 0 ? ` — novo: ${s.reevaluation.newFindings.map((f) => f.title).join("; ")}` : ""}.
        </p>
      );
  }
}

const FRESH_LABEL: Record<string, string> = {
  FRESH: "atual",
  AGING: "a envelhecer",
  STALE: "desatualizada",
  UNKNOWN: "frescura desconhecida",
  FETCH_ERROR: "erro na consulta",
};

/** What FleetOS actually knows along the route — qualifies (never upgrades) the status. */
export function CoverageBlock({ coverage }: { coverage: RouteCoverage }) {
  return (
    <div className="space-y-1 rounded-lg border border-slate-300/70 bg-white/60 px-2 py-1.5 text-[10px] leading-snug text-[var(--text-2)]">
      <p className="flex items-center gap-1 font-bold">
        <MapIcon className="h-3 w-3 shrink-0" /> Cobertura de informação: {coverageHeadlinePt(coverage.headline)}
      </p>
      {coverage.municipalities.length > 0 && (
        <p>
          Municípios (CAOP2025):{" "}
          {coverage.municipalities.map((m, i) => (
            <span key={m.code}>
              {i > 0 && ", "}
              {m.name} ~{m.approxKm} km —{" "}
              {m.temporaryEvents === "NO_SOURCE"
                ? "sem fonte de eventos"
                : `eventos: ${m.municipalSources.map((s) => FRESH_LABEL[s.freshness] ?? s.freshness).join("/")}`}
              {m.curation.status === "NOT_CURATED" ? "; regras permanentes não revistas" : ""}
            </span>
          ))}
        </p>
      )}
      {coverage.nationalSources.length > 0 && (
        <p>
          Rede IP: {coverage.nationalSources.map((s) => `${s.name.replace(/^IP — Viajar na Estrada: /, "")} (${FRESH_LABEL[s.freshness] ?? s.freshness})`).join(", ")}
        </p>
      )}
      {coverage.knownNotEncoded.map((k) => (
        <p key={k.label} className="font-semibold text-[var(--warn)]">
          Restrição conhecida NÃO codificada ({k.municipality}): {k.label} — {k.source}. Verificar manualmente.
        </p>
      ))}
      {coverage.unresolvedNearby.length > 0 && (
        <div className="font-semibold text-[var(--warn)]">
          {coverage.unresolvedNearby.length} relato(s) por rever junto à rota (não avaliados):
          <ul className="ml-3 list-disc font-normal">
            {coverage.unresolvedNearby.slice(0, 5).map((c) => (
              <li key={c.id}>{c.title}</li>
            ))}
          </ul>
        </div>
      )}
      {coverage.notes.map((n) => (
        <p key={n} className="opacity-80">· {n}</p>
      ))}
      <Link to="/intelligence?area=sources" className="inline-block font-semibold underline">
        Fontes e frescura →
      </Link>
    </div>
  );
}

export function RouteCompliancePanel({
  report,
  dataset,
  coverage,
  route,
  replacesAffected,
  savedDecision,
  alternatives,
  altSearchStatus,
  altSearchMessage,
  onUseAlternative,
}: {
  report: ComplianceReport;
  dataset: RegulationDataset;
  /** Route coverage; a compliant route with partial coverage is NOT shown as green. */
  coverage?: RouteCoverage;
  route?: RouteImpactSummary;
  /** Set when the selected route replaces an affected original. */
  replacesAffected?: RouteImpactSummary;
  /** State of the decision previously saved on this job, if any. */
  savedDecision?: PlannedDecisionState;
  alternatives?: AlternativeView[];
  altSearchStatus?: "idle" | "searching" | "done" | "unavailable" | "error";
  altSearchMessage?: string;
  onUseAlternative?: (id: string) => void;
}) {
  const partial = report.status === "ROUTE_COMPLIANT" && (!coverage || !coverage.complete);
  const ui = partial
    ? { ...STATUS_UI.ROUTE_COMPLIANT, label: "Nenhuma restrição conhecida — cobertura parcial", box: "border-slate-300 bg-slate-50 text-[var(--text-2)]" }
    : STATUS_UI[report.status];
  const flagged = report.results.filter((r) => r.outcome !== "DOES_NOT_APPLY");
  const clear = report.results.filter((r) => r.outcome === "DOES_NOT_APPLY");

  return (
    <div className={`space-y-2 rounded-[var(--r-md)] border px-3 py-2.5 text-[11px] ${ui.box}`}>
      <div className="flex items-center gap-1.5 font-bold">
        <ui.Icon className="h-3.5 w-3.5 shrink-0" />
        {ui.label}
      </div>

      {savedDecision && savedDecision.state !== "NOT_PLANNED" && <SavedDecisionNote s={savedDecision} />}
      {report.status === "ROUTE_AFFECTED" && route && (
        <p className="text-[10px] leading-snug">
          Rota original: <strong>{fmtKm(route.distanceM)} · {fmtMin(route.durationSec)}</strong> · chegada {fmtEta(route.arrivalAtIso)} —
          não pode ser confirmada.
        </p>
      )}
      {replacesAffected && route && (
        <div className="space-y-0.5 text-[10px] leading-snug">
          <p>
            Original afetada: {fmtKm(replacesAffected.distanceM)} · {fmtMin(replacesAffected.durationSec)} · chegada{" "}
            {fmtEta(replacesAffected.arrivalAtIso)}
          </p>
          <p>
            Esta alternativa: <strong>{fmtKm(route.distanceM)} · {fmtMin(route.durationSec)}</strong> ·{" "}
            {fmtDelta(route.distanceM - replacesAffected.distanceM, "km")} · {fmtDelta(route.durationSec - replacesAffected.durationSec, "min")}
          </p>
          <p>
            Chegada revista {fmtEta(route.arrivalAtIso)} · <WindowNote w={route.deliveryWindow} />
          </p>
        </div>
      )}
      {report.status === "ROUTE_COMPLIANT" && (
        <p className="text-[10px] leading-snug">
          Nenhuma restrição verificada aplicável ({report.results.length} regra
          {report.results.length === 1 ? "" : "s"} avaliada{report.results.length === 1 ? "" : "s"}).
        </p>
      )}
      {report.status === "EVALUATION_ERROR" && (
        <p className="flex items-start gap-1 text-[10px] leading-snug">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Não foi possível avaliar todas as restrições. A rota não pode ser considerada conforme nem confirmada.
        </p>
      )}
      {report.status === "POTENTIALLY_AFFECTED" && (
        <p className="flex items-start gap-1 text-[10px] leading-snug">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Existe uma restrição relevante, mas faltam dados para concluir. Isto não é uma infração.
        </p>
      )}

      {flagged.map((r) => (
        <ResultBlock key={r.regulationId} r={r} dataset={dataset} />
      ))}

      {coverage && <CoverageBlock coverage={coverage} />}

      {alternatives && (
        <AlternativesBlock
          alternatives={alternatives}
          status={altSearchStatus}
          message={altSearchMessage}
          onUse={onUseAlternative}
        />
      )}

      {clear.length > 0 && (
        <details className="text-[10px] opacity-80">
          <summary className="cursor-pointer select-none">Não aplicáveis ({clear.length})</summary>
          <ul className="mt-1 space-y-1">
            {clear.map((r) => (
              <li key={r.regulationId}>
                <span className="font-semibold">{r.title}</span>
                {r.reasons[0] && <span> — {r.reasons[0].text}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
