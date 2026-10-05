import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { paths } from "../lib/appLinks";
import { Button, PageHeader, Segmented, Tabs } from "../ui/kit";
import { CandidateReviewPanel } from "../components/intelligence/CandidateReviewPanel";
import { DiscoveryPanel } from "../components/intelligence/DiscoveryPanel";
import { PlannedRoutesReview } from "../components/intelligence/PlannedRoutesReview";
import { EvidenceChain, ResearchPanel, RevisionDiff } from "../components/intelligence/ResearchPanel";
import { RouteMetricsPanel } from "../components/intelligence/RouteMetricsPanel";
import { useIngestion } from "../context/IngestionContext";
import { reviewState } from "../ingestion/review";
import { MUNICIPAL_CURATION } from "../ingestion/municipalRegistry";
import type { SnapshotMeta } from "../ingestion/store";
import type { CandidateConstraint, Field, FieldState, FreshnessState, GateDecision, LegalRelevance } from "../ingestion/types";

type Tab = "sources" | "candidates" | "plans" | "discovery" | "research" | "metrics" | "legal" | "changes" | "coverage" | "diagnostics";

const TAB_LABEL: Record<Tab, string> = {
  sources: "Fontes",
  candidates: "Restrições",
  plans: "Planos confirmados",
  discovery: "Descoberta",
  research: "Investigação",
  metrics: "Métricas",
  legal: "Diário da República",
  changes: "Alterações",
  coverage: "Cobertura",
  diagnostics: "Ingestão",
};

/** Four areas over the nine underlying views (no functionality removed). */
type Area = "active" | "review" | "sources" | "diagnostics";
const AREAS: { id: Area; label: string; tabs: Tab[] }[] = [
  { id: "active", label: "Restrições ativas", tabs: ["candidates", "changes"] },
  { id: "review", label: "Revisão", tabs: ["candidates", "plans", "legal"] },
  { id: "sources", label: "Fontes e cobertura", tabs: ["sources", "coverage"] },
  { id: "diagnostics", label: "Diagnóstico", tabs: ["diagnostics", "discovery", "research", "metrics"] },
];
const AREA_FILTER: Partial<Record<Area, "operational" | "REVIEW_REQUIRED">> = { active: "operational", review: "REVIEW_REQUIRED" };

const FRESH_UI: Record<FreshnessState, string> = {
  FRESH: "bg-[var(--accent-soft)] text-[var(--accent)]",
  AGING: "bg-[var(--warn-soft)] text-[var(--warn)]",
  STALE: "bg-[var(--danger-soft)] text-[var(--danger)]",
  UNKNOWN: "bg-[var(--neutral-soft)] text-[var(--text-2)]",
  FETCH_ERROR: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

const GATE_UI: Record<GateDecision, string> = {
  ACTIVE: "bg-[var(--danger-soft)] text-[var(--danger)]",
  ACTIVE_SCREENING_ONLY: "bg-[var(--warn-soft)] text-[var(--warn)]",
  REVIEW_REQUIRED: "bg-[var(--warn-soft)] text-[var(--warn)]",
  INFORMATIONAL: "bg-[var(--neutral-soft)] text-[var(--text-2)]",
  REJECTED: "bg-[var(--neutral-soft)] text-[var(--text-2)]",
};

const GATE_ORDER: Record<GateDecision, number> = {
  ACTIVE: 1,
  ACTIVE_SCREENING_ONLY: 2,
  REVIEW_REQUIRED: 3,
  REJECTED: 4,
  INFORMATIONAL: 5,
};

const FIELD_UI: Record<FieldState, string> = {
  VERIFIED: "text-[var(--accent)]",
  DERIVED: "text-[var(--accent)]",
  INTERPRETED: "text-[var(--warn)]",
  UNKNOWN: "text-[var(--text-3)]",
};

const FIELD_LABEL: Record<string, string> = {
  category: "Tipo",
  roads: "Estradas",
  locationText: "Local",
  geometry: "Geometria",
  validity: "Validade (UTC)",
  periods: "Períodos (hora local)",
  vehicleApplicability: "Veículos",
  direction: "Sentido",
  diversion: "Desvio",
  description: "Texto",
};

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex h-[18px] items-center whitespace-nowrap rounded-[var(--r-sm)] px-1.5 text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }) : "—");

function fieldValue(f: Field<unknown>): string {
  const v = f.value;
  if (v === undefined) return "desconhecido";
  if (typeof v === "string") return v.length > 220 ? `${v.slice(0, 220)}…` : v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? `${(x as { start: string }).start} → ${(x as { end: string }).end}` : String(x))).join("; ");
  const o = v as Record<string, unknown>;
  if (o.kind === "point") return `ponto ${(o.point as number[]).map((n) => n.toFixed(5)).join(", ")}`;
  if (o.kind === "polygons") return `${(o.rings as unknown[]).length} polígono(s)`;
  if (o.kind === "lines") return `${(o.lines as unknown[]).length} linha(s)`;
  if (o.kind === "all_traffic") return "todo o trânsito";
  if (o.kind === "conditions") return `condições: ${String(o.text)}`;
  if ("start" in o) return `${String(o.start)} → ${o.end ? String(o.end) : "sem fim indicado"}`;
  return JSON.stringify(v);
}

function CandidateRow({ c }: { c: CandidateConstraint }) {
  const ing = useIngestion();
  const source = ing.sources.find((s) => s.id === c.sourceId);
  const review = ing.reviews.find((r) => r.candidateId === c.id);
  return (
    <details className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] last:border-b-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <Pill cls={GATE_UI[c.gate.decision]}>{c.gate.decision}</Pill>
        <Pill cls="bg-[var(--neutral-soft)] text-[var(--text-2)]">{c.lifecycle}</Pill>
        {c.extraction.kind === "ai" && <Pill cls="bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]">IA{c.extraction.recorded ? " (gravada)" : ""}</Pill>}
        {c.extraction.kind === "semantic" && <Pill cls="bg-sky-100 text-sky-900">LIDO DE TEXTO · {c.extraction.engine === "LLM" ? "MODELO" : "REGRAS"} · MACHINE_EXTRACTED</Pill>}
        {(c.research?.conflicts?.length ?? 0) > 0 && <Pill cls="bg-[var(--danger-soft)] text-[var(--danger)]">CONFLITO</Pill>}
        {source?.synthetic && <Pill cls="bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]">TESTE SINTÉTICO</Pill>}
        {review && (
          <Pill cls={reviewState(review) === "APPROVED" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--neutral-soft)] text-[var(--text-2)]"}>
            REVISÃO: {reviewState(review)}
            {ing.ingested.reviewStatus[c.id] && ing.ingested.reviewStatus[c.id] !== "ativo" ? " (inativo)" : ""}
          </Pill>
        )}
        <span className="font-semibold text-[var(--app-fg)]">{c.title}</span>
        <span className="text-[var(--app-muted)]">· {source?.name ?? c.sourceId}</span>
      </summary>
      <div className="mt-2 space-y-2">
        {c.gate.reasons.length > 0 && (
          <ul className="list-disc pl-4 text-[var(--app-muted)]">
            {c.gate.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <table className="w-full text-left text-[10px]">
          <thead className="text-[var(--app-muted)]">
            <tr>
              <th className="py-0.5 pr-2">Campo</th>
              <th className="pr-2">Estado</th>
              <th className="pr-2">Valor</th>
              <th>Base / nota</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(c.fields).map(([k, f]) => (
              <tr key={k} className="border-t border-[var(--app-border)] align-top">
                <td className="py-0.5 pr-2 font-semibold">{FIELD_LABEL[k] ?? k}</td>
                <td className={`pr-2 font-semibold ${FIELD_UI[(f as Field<unknown>).state]}`}>
                  {(f as Field<unknown>).state}
                  {k === "geometry" ? ` · ${(f as { provenance: string }).provenance}` : ""}
                </td>
                <td className="pr-2">{fieldValue(f as Field<unknown>)}</td>
                <td className="text-[var(--app-muted)]">
                  {(f as Field<unknown>).basis && <span className="italic">{(f as Field<unknown>).basis}</span>}
                  {(f as Field<unknown>).note && <span> {(f as Field<unknown>).note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.issues.length > 0 && (
          <div className="text-[var(--warn)]">
            Problemas: <ul className="list-disc pl-4">{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
        <EvidenceChain c={c} />
        <RevisionDiff c={c} />
        {(c.gate.decision === "REVIEW_REQUIRED" || review) && <CandidateReviewPanel c={c} />}
        <p className="text-[10px] text-[var(--app-muted)]">
          Visto pela 1.ª vez {fmt(c.firstSeenAt)} · última {fmt(c.lastSeenAt)}
          {c.missingSinceAt ? ` · ausente desde ${fmt(c.missingSinceAt)}` : ""} · snapshot {c.snapshotId} · hash {c.contentHash}
        </p>
      </div>
    </details>
  );
}

function SnapshotList({ sourceId }: { sourceId: string }) {
  const { snapshots } = useIngestion();
  const [list, setList] = useState<SnapshotMeta[] | null>(null);
  return (
    <details
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) void snapshots(sourceId).then(setList);
      }}
    >
      <summary className="cursor-pointer text-[var(--app-muted)]">Snapshots</summary>
      {list === null ? (
        <p>…</p>
      ) : list.length === 0 ? (
        <p className="text-[var(--app-muted)]">Nenhum snapshot guardado neste dispositivo.</p>
      ) : (
        <ul className="font-mono text-[9px]">
          {list.map((s) => (
            <li key={s.id}>
              {fmt(s.fetchedAt)} · HTTP {s.httpStatus} · {(s.byteLength / 1024).toFixed(0)} KB · sha256 {s.sha256.slice(0, 16)}…{s.bodyPruned ? " · corpo removido (retenção)" : ""}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function RoadIntelligencePage() {
  const ing = useIngestion();
  const [params, setParams] = useSearchParams();
  const area: Area = AREAS.some((a) => a.id === params.get("area")) ? (params.get("area") as Area) : "active";
  const areaDef = AREAS.find((a) => a.id === area)!;
  const tab: Tab = areaDef.tabs.includes(params.get("view") as Tab) ? (params.get("view") as Tab) : areaDef.tabs[0]!;
  const go = (a: Area, v?: Tab) => {
    setParams(() => { const n = new URLSearchParams(); if (a !== "active") n.set("area", a); if (v && v !== AREAS.find((x) => x.id === a)!.tabs[0]) n.set("view", v); return n; }, { replace: true });
    if (AREA_FILTER[a]) setGateFilter(AREA_FILTER[a]!);
  };
  const [gateFilter, setGateFilter] = useState<"attention" | "operational" | GateDecision | "all">(() => AREA_FILTER[(params.get("area") as Area) ?? "active"] ?? "operational");
  const [relFilter, setRelFilter] = useState<"review" | LegalRelevance | "all">("review");

  const counts = useMemo(() => {
    const by = (d: GateDecision) => ing.candidates.filter((c) => c.gate.decision === d).length;
    // "Em avaliação" = constraints actually fed to the evaluator (automatic + human-reviewed).
    return { active: ing.ingested.constraints.length, review: ing.pendingReviewCount, info: by("INFORMATIONAL") };
  }, [ing.candidates, ing.ingested.constraints.length, ing.pendingReviewCount]);

  const shownCandidates = useMemo(() => {
    const list = ing.candidates.filter((c) =>
      gateFilter === "all" ? true : gateFilter === "attention" ? c.gate.decision !== "INFORMATIONAL" : gateFilter === "operational" ? c.gate.decision === "ACTIVE" || c.gate.decision === "ACTIVE_SCREENING_ONLY" : c.gate.decision === gateFilter,
    );
    // Most operationally relevant first, so the 300-row cap never hides them.
    const reviewed = new Set(ing.reviews.map((r) => r.candidateId));
    const rank = (c: CandidateConstraint) => (reviewed.has(c.id) ? 0 : GATE_ORDER[c.gate.decision]);
    return [...list].sort((a, b) => rank(a) - rank(b)).slice(0, 300);
  }, [ing.candidates, ing.reviews, gateFilter]);

  const shownLegal = [...new Map(ing.legalItems.map((i) => [i.id, i])).values()].filter((i) =>
    relFilter === "all" ? true : relFilter === "review" ? i.relevance !== "NOT_RELEVANT" : i.relevance === relFilter,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Inteligência rodoviária"
        meta={`${ing.sources.filter((s) => s.access.kind !== "STATIC").length} fontes · ${counts.active} restrições em avaliação · ${counts.review} por rever · ${counts.info} informativas`}
        actions={
          <Button variant="primary" onClick={() => void ing.refresh()} disabled={ing.running.length > 0} icon={<RefreshCw className={`h-3.5 w-3.5 ${ing.running.length ? "animate-spin" : ""}`} />}>
            {ing.running.length ? `A consultar ${ing.running.length}…` : "Consultar fontes agora"}
          </Button>
        }
      >
        <Tabs value={area} onChange={(a) => go(a)} items={AREAS.map((a) => ({ value: a.id, label: a.label, count: a.id === "review" && counts.review ? counts.review : undefined }))} />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 scroll-thin">
        <p className="mb-3 text-[12px] text-[var(--text-3)]">
          Fontes oficiais consultadas enquanto a app está aberta e guardadas neste navegador ({ing.storage === "indexeddb" ? "IndexedDB" : "memória — perde-se ao recarregar"}). A IA nunca decide conformidade: só candidatos aprovados pelo trust gate entram na avaliação. A cobertura nacional não é garantida — ver «Cobertura».
        </p>
        {ing.devFixturesEnabled ? (
          <p className="mb-3 rounded-[var(--r-md)] bg-[var(--prov-demo-soft)] px-3 py-1.5 text-[12px] text-[var(--prov-demo)]">
            Fontes de teste sintético ativas — tudo o que delas deriva está rotulado. <Link className="underline" to={paths.settings("demo")}>Gerir em Definições</Link>
          </p>
        ) : null}
        {areaDef.tabs.length > 1 ? (
          <div className="mb-3">
            <Segmented label="Vista" value={tab} onChange={(v) => go(area, v)} items={areaDef.tabs.map((t) => ({ value: t, label: TAB_LABEL[t] }))} />
          </div>
        ) : null}

        {tab === "sources" && (
          <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
            {ing.sources.map((s) => {
              const f = ing.freshness[s.id]!;
              const st = ing.states.find((x) => x.sourceId === s.id);
              const run = ing.lastRun[s.id];
              return (
                <div key={s.id} className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill cls={FRESH_UI[f.state]}>{f.state}</Pill>
                    {s.synthetic && <Pill cls="bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]">TESTE SINTÉTICO — NÃO OFICIAL</Pill>}
                    <Pill cls="bg-[var(--neutral-soft)] text-[var(--text-2)]">{s.type}</Pill>
                    <Pill cls="bg-[var(--neutral-soft)] text-[var(--text-2)]">nível {s.trustTier}</Pill>
                    <span className="font-semibold text-[var(--app-fg)]">{s.name}</span>
                    <a href={s.landingUrl} target="_blank" rel="noreferrer" className="hover:opacity-70" title="Página oficial">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {s.access.kind !== "STATIC" && s.access.kind !== "RESEARCH" && (
                      <button
                        type="button"
                        onClick={() => void ing.refresh(s.id)}
                        disabled={ing.running.includes(s.id)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--app-elevated)] px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${ing.running.includes(s.id) ? "animate-spin" : ""}`} /> Consultar
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[var(--app-muted)]">{f.reason}</p>
                  <p className="text-[10px] text-[var(--app-muted)]">
                    {s.authority} · {s.license} · acesso {s.access.kind === "SAME_ORIGIN_PROXY" ? "via proxy da origem (sem CORS)" : s.access.kind === "DIRECT_CORS" ? "direto (CORS)" : s.access.kind === "DEV_FIXTURE" ? "fixture de desenvolvimento" : s.access.kind === "RESEARCH" ? "agente de investigação (por rota)" : "curado"} ·
                    última consulta {fmt(st?.lastAttemptAt)} · último sucesso {fmt(st?.lastSuccessAt)}
                    {st?.recordCount !== undefined ? ` · ${st.recordCount} registos` : ""}
                    {st?.unchangedFetches ? ` · sem alterações há ${st.unchangedFetches} consulta(s)` : ""}
                    {run ? ` · resultado: ${run.outcome}${run.message ? ` (${run.message})` : ""}` : ""}
                  </p>
                  <details className="mt-1 text-[10px]">
                    <summary className="cursor-pointer text-[var(--app-muted)]">Cobertura e lacunas</summary>
                    <p>Rede: {s.coverage.network}</p>
                    <ul className="list-disc pl-4">
                      {s.coverage.gaps.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </details>
                  {s.access.kind !== "STATIC" && s.access.kind !== "RESEARCH" && <SnapshotList sourceId={s.id} />}
                </div>
              );
            })}
          </div>
        )}

        {tab === "candidates" && (
          <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <label>
                Mostrar{" "}
                <select value={gateFilter} onChange={(e) => setGateFilter(e.target.value as typeof gateFilter)} className="rounded-md border px-1 py-0.5">
                  <option value="operational">Em avaliação (ACTIVE)</option>
                  <option value="attention">Não informativos</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="ACTIVE_SCREENING_ONLY">ACTIVE_SCREENING_ONLY</option>
                  <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
                  <option value="INFORMATIONAL">INFORMATIONAL</option>
                  <option value="all">Todos</option>
                </select>
              </label>
              <span className="text-[var(--app-muted)]">
                {shownCandidates.length} mostrados{shownCandidates.length === 300 ? " (primeiros 300)" : ""} · {ing.candidates.length} no total
              </span>
            </div>
            {shownCandidates.length === 0 && <p className="text-[11px] text-[var(--app-muted)]">Nenhum candidato neste filtro.</p>}
            {shownCandidates.map((c) => (
              <CandidateRow key={c.id} c={c} />
            ))}
          </div>
        )}

        {tab === "plans" && <PlannedRoutesReview />}
        {tab === "discovery" && <DiscoveryPanel />}
        {tab === "research" && <ResearchPanel />}
        {tab === "metrics" && <RouteMetricsPanel />}

        {tab === "legal" && (
          <div className="space-y-2 text-[11px]">
            <label>
              Mostrar{" "}
              <select value={relFilter} onChange={(e) => setRelFilter(e.target.value as typeof relFilter)} className="rounded-md border px-1 py-0.5">
                <option value="review">Relevantes + incertos</option>
                <option value="POTENTIALLY_RELEVANT">Potencialmente relevantes</option>
                <option value="UNCERTAIN">Incertos</option>
                <option value="NOT_RELEVANT">Não relevantes</option>
                <option value="all">Todos</option>
              </select>
            </label>
            <p className="text-[var(--app-muted)]">
              Triagem determinística de título/sumário. Nenhum ato gera restrições: os relevantes têm de ser lidos e extraídos.
            </p>
            {shownLegal.length === 0 && <p className="text-[var(--app-muted)]">Nenhum item neste filtro ({ing.legalItems.length} no índice).</p>}
            {shownLegal.map((i) => (
              <div key={i.id} className="border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill cls={i.relevance === "POTENTIALLY_RELEVANT" ? "bg-[var(--warn-soft)] text-[var(--warn)]" : i.relevance === "UNCERTAIN" ? "bg-[var(--neutral-soft)] text-[var(--text-2)]" : "bg-[var(--neutral-soft)] text-[var(--text-3)]"}>{i.label}</Pill>
                  <a href={i.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--app-fg)] hover:underline">
                    {i.title}
                  </a>
                </div>
                <p className="mt-1 text-[var(--app-muted)]">{i.description}</p>
                {i.matched.length > 0 && <p className="text-[10px] text-[var(--app-muted)]">Termos: {i.matched.join(", ")}</p>}
              </div>
            ))}
          </div>
        )}

        {tab === "changes" && (
          <div className="text-[11px]">
            {ing.changes.length === 0 ? (
              <p className="text-[var(--app-muted)]">Sem alterações registadas neste dispositivo.</p>
            ) : (
              <table className="w-full text-left">
                <thead className="text-[var(--app-muted)]">
                  <tr><th>Quando</th><th>Fonte</th><th>Alteração</th><th>Candidato</th><th>Campos</th></tr>
                </thead>
                <tbody>
                  {ing.changes.map((c, i) => (
                    <tr key={`${c.candidateId}-${c.at}-${i}`} className="border-t border-[var(--app-border)]">
                      <td className="pr-2">{fmt(c.at)}</td>
                      <td className="pr-2">{c.sourceId}</td>
                      <td className="pr-2 font-semibold">{c.change}</td>
                      <td className="pr-2 font-mono text-[9px]">{c.candidateId.split(":").slice(1).join(":")}</td>
                      <td>{c.fields?.join(", ") ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "coverage" && (
          <div className="space-y-3 text-[11px]">
            <div className="border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0 px-3 py-2">
              <p className="font-semibold">Registo municipal — CAOP2025 (DGT)</p>
              {ing.municipalities ? (
                <p className="text-[var(--app-muted)]">
                  {ing.municipalities.dataset.count} municípios · território suportado: {ing.municipalities.territories.map((t) => t.name).join(", ")} · {ing.municipalities.dataset.license} · obtido{" "}
                  {fmt(ing.municipalities.dataset.retrievedAt)} · simplificado a {ing.municipalities.dataset.simplification.toleranceM} m (pontos a menos de{" "}
                  {ing.municipalities.dataset.simplification.borderMarginM} m de um limite ficam com município incerto). Regiões autónomas não incluídas.
                </p>
              ) : (
                <p className="text-[var(--danger)]">Não carregado{ing.municipalitiesError ? `: ${ing.municipalitiesError}` : "…"}</p>
              )}
            </div>
            <div className="border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0 px-3 py-2">
              <p className="font-semibold">Restrições permanentes municipais</p>
              <p className="text-[var(--app-muted)]">
                {Object.keys(MUNICIPAL_CURATION).length} de {ing.municipalities?.dataset.count ?? 278} municípios com alguma curadoria. Os restantes estão{" "}
                <strong>NOT_CURATED</strong>: FleetOS não reviu os seus regulamentos — não significa «sem restrições».
              </p>
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(MUNICIPAL_CURATION).map(([code, m]) => (
                  <li key={code}>
                    {ing.municipalities?.byCode.get(code)?.name ?? code} — {m.status}
                    {m.knownNotEncoded.map((k) => ` · conhecido, não codificado: ${k.label} (${k.source})`).join("")}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0 px-3 py-2">
              <p className="font-semibold">Eventos temporários</p>
              <ul className="list-disc pl-4 text-[var(--app-muted)]">
                <li>Rede IP: camadas «Viajar na Estrada» (pontos, sem aplicabilidade a veículos) — frescura acima.</li>
                <li>Autoestradas concessionadas: sem fonte pública licenciada (endpoint interno Brisa/Via Verde não usado).</li>
                <li>Municípios: só o Porto tem um feed ativo (DATEX II, desatualizado); os outros 277 sem fonte.</li>
                <li>Avisos em prosa da IP: só os registados manualmente são vigiados; extração por IA desligada (sem chave).</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "diagnostics" && (
          <div className="space-y-2 text-[11px]">
            <p>
              Constraints ingeridas em avaliação: <strong>{ing.ingested.constraints.length}</strong>
              {ing.ingested.fingerprint ? ` (impressão ${ing.ingested.fingerprint})` : ""}.
            </p>
            <p className="font-semibold">Revisões guardadas: {ing.reviews.length} válidas · {ing.corruptReviews.length} corrompidas (ignoradas, nunca ativadas)</p>
            {ing.corruptReviews.map((r) => (
              <p key={r.id} className="text-[var(--danger)]">Revisão corrompida {r.id}: {r.reason}</p>
            ))}
            <p className="font-semibold">Erros de parse / extração ({ing.errors.length})</p>
            {ing.errors.length === 0 ? (
              <p className="text-[var(--app-muted)]">Nenhum.</p>
            ) : (
              <ul className="list-disc pl-4">
                {ing.errors.slice(0, 200).map((e, i) => (
                  <li key={`${e.snapshotId}-${i}`}>
                    <span className="font-semibold">{e.kind}</span> · {e.sourceId} · {e.message}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Apagar snapshots, candidatos e histórico de ingestão guardados neste navegador? (As revisões humanas são mantidas para auditoria.)")) void ing.clearAll();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--danger-soft)] px-2 py-1 font-semibold text-[var(--danger)]"
            >
              <Trash2 className="h-3 w-3" /> Limpar dados de ingestão locais
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
