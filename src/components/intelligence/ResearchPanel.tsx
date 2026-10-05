import { useEffect, useState } from "react";
import { ALL_RESEARCH_ENTRYPOINTS, useIngestion } from "../../context/IngestionContext";
import type { CandidateConstraint } from "../../ingestion/types";
import { structuredFieldEvidence } from "../../research/candidates";
import type { ResearchRun, ResearchState } from "../../research/agent";
import { diffCandidates, type FieldChange } from "../../research/revision";
import type { ResearchGapKind } from "../../research/types";

/*
 * Road Intelligence → Investigação. Operational state of the research agent (no chat, no
 * hidden reasoning): what was researched and why, what was found, preserved and extracted,
 * what needs review, and what is still unknown.
 */

const STATE_UI: Partial<Record<ResearchState, { label: string; cls: string }>> = {
  RESEARCHING: { label: "A INVESTIGAR", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  SOURCE_FOUND: { label: "FONTE ENCONTRADA", cls: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  NEW_CANDIDATE: { label: "NOVO CANDIDATO", cls: "bg-sky-100 text-sky-900" },
  CANDIDATE_REVISED: { label: "CANDIDATO REVISTO", cls: "bg-sky-100 text-sky-900" },
  UNCHANGED: { label: "SEM ALTERAÇÃO", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  SOURCE_STALE: { label: "FONTE DESATUALIZADA", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  SOURCE_FAILED: { label: "FONTE FALHOU", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  NO_OFFICIAL_SOURCE_FOUND: { label: "SEM FONTE OFICIAL", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  SKIPPED_HEALTHY: { label: "FONTE RECENTE (CACHE)", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  IRRELEVANT: { label: "SEM RESTRIÇÃO", cls: "bg-[var(--neutral-soft)] text-[var(--text-2)]" },
  NO_LONGER_LISTED: { label: "DEIXOU DE CONSTAR", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  BUDGET_EXHAUSTED: { label: "ORÇAMENTO ESGOTADO", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
};

const GAP_LABEL: Partial<Record<ResearchGapKind, string>> = {
  SEARCH_UNAVAILABLE: "Pesquisa web indisponível",
  NO_OFFICIAL_RESULT_FOUND: "Sem resultado oficial",
  SOURCE_UNREACHABLE: "Fonte inacessível",
  SOURCE_STALE: "Fonte desatualizada",
  EXTRACTION_FAILED: "Extração falhou",
  EXTRACTION_UNAVAILABLE: "Extração indisponível",
  GEOMETRY_UNRESOLVED: "Geometria por resolver",
  AUTHORITY_UNRESOLVED: "Autoridade por resolver",
  LICENCE_UNKNOWN: "Licença desconhecida",
  VEHICLE_APPLICABILITY_UNKNOWN: "Veículos por determinar",
  TEMPORAL_AMBIGUOUS: "Horário ambíguo",
  PDF_UNSUPPORTED: "PDF não suportado",
  BUDGET_EXHAUSTED: "Orçamento esgotado",
  SECONDARY_ONLY: "Só fontes secundárias",
  CONFLICT: "Conflito",
};

const Pill = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{children}</span>;
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });

export function ResearchCapabilitiesLine() {
  const { researchCapabilities: c } = useIngestion();
  if (!c.checked) return null;
  return (
    <p className="text-[10px] text-[var(--app-muted)]" data-testid="research-capabilities">
      Obtenção de documentos oficiais: {c.retrieve ? "fronteira local ativa (só domínios verificados; respeita robots.txt)" : "indisponível neste ambiente"} · Extração semântica:{" "}
      {c.extract ? "modelo configurado no servidor + regras PT" : "regras determinísticas PT (sem modelo configurado)"} · Pesquisa web: {c.search ? "configurada" : "não configurada"}.
    </p>
  );
}

function RunCard({ run }: { run: ResearchRun }) {
  const ing = useIngestion();
  const counts = new Map<ResearchState, number>();
  for (const s of run.steps) counts.set(s.state, (counts.get(s.state) ?? 0) + 1);
  const review = run.candidates.filter((c) => ing.candidates.find((x) => x.id === c.id)?.gate.decision === "REVIEW_REQUIRED").length;
  const gapCounts = new Map<string, number>();
  for (const g of run.gaps) gapCounts.set(g.kind, (gapCounts.get(g.kind) ?? 0) + 1);
  const m = run.metrics;
  return (
    <details className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] last:border-b-0">
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
        <span className="font-semibold">{fmt(run.startedAt)}</span>
        <span className="text-[var(--app-muted)]">
          · {run.scope.roads.length} vias · {run.scope.municipalities.length} municípios
        </span>
        {[...counts.entries()].map(([k, n]) => (STATE_UI[k] ? <Pill key={k} cls={STATE_UI[k]!.cls}>{STATE_UI[k]!.label} ×{n}</Pill> : null))}
        {review > 0 && <Pill cls="bg-[var(--warn-soft)] text-[var(--warn)]">REVISÃO NECESSÁRIA ×{review}</Pill>}
        {run.gaps.length > 0 && <Pill cls="bg-[var(--neutral-soft)] text-[var(--text-2)]">{run.gaps.length} lacunas</Pill>}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[10px] text-[var(--app-muted)]">
          Fornecedores: obtenção {run.providers.retrieval} · extração {run.providers.extraction.join(", ")} · pesquisa {run.providers.search}. Páginas obtidas {m.pagesFetched} (falhas {m.retrievalFailures}) · snapshots novos{" "}
          {m.snapshotsCreated} / inalterados {m.snapshotsUnchanged} · extrações {m.semanticExtractionRuns} (reutilizadas {m.extractionReused}) · candidatos {m.candidatesProduced} · campos extraídos {m.fieldsExtracted} / desconhecidos{" "}
          {m.fieldsUnknown} · cobertura de evidência {m.evidenceCoveragePct}% · custo {m.costEur === null ? "não reportado" : `${m.costEur.toFixed(4)} €`} · tokens {m.tokens ? `${m.tokens.input}/${m.tokens.output}` : "—"} · {m.totalLatencyMs} ms.
          {run.budget.exhausted.length > 0 && <> Orçamento esgotado: {run.budget.exhausted.join(", ")}.</>}
        </p>
        <div>
          <p className="font-semibold">Porquê e o quê</p>
          <ul className="space-y-0.5">
            {run.steps.map((s, i) => (
              <li key={i} className="flex flex-wrap gap-1">
                {STATE_UI[s.state] && <Pill cls={STATE_UI[s.state]!.cls}>{STATE_UI[s.state]!.label}</Pill>}
                <span>{s.detail}</span>
                {s.url && (
                  <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                    fonte
                  </a>
                )}
                <span className="text-[var(--app-muted)]">— motivo: {s.why.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        {run.revisions.length > 0 && (
          <div>
            <p className="font-semibold">Revisões da fonte (ANTIGO → NOVO)</p>
            {run.revisions.map((r) => (
              <DiffTable key={r.candidateId} changes={r.changes} title={run.candidates.find((c) => c.id === r.candidateId)?.title ?? r.candidateId} />
            ))}
          </div>
        )}
        {run.conflicts.filter((c) => c.resolution === "REVIEWER_DECIDES").length > 0 && (
          <div>
            <p className="font-semibold">Conflitos (o revisor decide — nenhuma versão é escolhida automaticamente)</p>
            <ul className="list-disc pl-4">
              {run.conflicts
                .filter((c) => c.resolution === "REVIEWER_DECIDES")
                .map((c) => (
                  <li key={c.id}>
                    {c.kind}: {c.a.sourceLabel} ↔ {c.b.sourceLabel} — {c.detail}
                  </li>
                ))}
            </ul>
          </div>
        )}
        {run.proposals.length > 0 && (
          <div>
            <p className="font-semibold">Fontes propostas (não usadas até validação)</p>
            <ul className="list-disc pl-4">
              {run.proposals.map((p) => (
                <li key={p.id}>
                  {p.url} — {p.note}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="font-semibold">Lacunas (não são restrições)</p>
          <ul className="list-disc pl-4">
            {[...gapCounts.entries()].map(([k, n]) => (
              <li key={k}>
                {GAP_LABEL[k as ResearchGapKind] ?? k} ×{n}: {run.gaps.find((g) => g.kind === k)!.detail}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

export function DiffTable({ changes, title }: { changes: FieldChange[]; title?: string }) {
  const shown = changes.filter((c) => c.change !== "UNCHANGED");
  return (
    <div className="mt-1 rounded border border-[var(--app-border)] p-1.5" data-testid="revision-diff">
      {title && <p className="text-[10px] font-semibold">{title}</p>}
      <table className="w-full text-[10px]">
        <tbody>
          {(shown.length ? shown : changes).map((c) => (
            <tr key={c.field} className="align-top">
              <td className="pr-2 font-semibold">{c.label}</td>
              <td className="pr-2 text-[var(--app-muted)]">{c.change === "ADDED" ? "—" : c.old}</td>
              <td className="pr-2">→</td>
              <td className={c.change === "UNCHANGED" ? "text-[var(--app-muted)]" : "font-semibold"}>{c.change === "UNCHANGED" ? "inalterado" : c.new}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="text-[10px] text-[var(--app-muted)]">Sem alterações de campos.</p>}
    </div>
  );
}

/** Field → value → exact quote → snapshot/page/offsets → method/provenance. */
export function EvidenceChain({ c }: { c: CandidateConstraint }) {
  const evidence = c.evidence?.length ? c.evidence : structuredFieldEvidence(c);
  if (!evidence.length) return null;
  const r = c.research;
  return (
    <div className="rounded border border-[var(--app-border)] p-1.5 text-[10px]" data-testid="evidence-chain">
      <p className="font-semibold">
        Evidência por campo{r ? <> · documento <a className="underline" href={r.documentUrl} target="_blank" rel="noreferrer">oficial</a> · snapshot {r.snapshotId.slice(0, 17)}…</> : null}
        {r && <> · {r.provenance}</>}
      </p>
      <table className="w-full">
        <tbody>
          {evidence.map((e, i) => (
            <tr key={i} className="border-t border-[var(--app-border)] align-top">
              <td className="pr-2 font-semibold">{e.field}</td>
              <td className="pr-2">{typeof e.value === "string" ? e.value : JSON.stringify(e.value).slice(0, 120)}</td>
              <td className="pr-2 italic">«{e.evidence.map((s) => s.quote).join(" … ").slice(0, 220)}»</td>
              <td className="text-[var(--app-muted)]">
                {e.evidence.map((s) => (s.location.path ? `campo ${s.location.path}` : `${s.location.page ? `p.${s.location.page} ` : ""}[${s.location.start}–${s.location.end}]`)).join(" ")} · {e.method} · {e.provenance} · {e.certainty}
                {e.note ? ` · ${e.note}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {r && (
        <p className="mt-1 text-[var(--app-muted)]">
          Geometria: {r.geometry.status} — {r.geometry.reason}
          {r.geometry.original.pk.length ? ` · PK original: ${r.geometry.original.pk.map((p) => `${p.road} km ${p.km}`).join(", ")}` : ""}
          {r.temporal.interpretation?.ambiguities.length ? ` · Ambiguidades temporais: ${r.temporal.interpretation.ambiguities.join("; ")}` : ""}
          {r.injectionSignals.length ? ` · Instruções no documento ignoradas: ${r.injectionSignals.length}` : ""}
        </p>
      )}
    </div>
  );
}

/** Previous immutable version of this candidate (if any) → field-level diff. */
export function RevisionDiff({ c }: { c: CandidateConstraint }) {
  const ing = useIngestion();
  const [changes, setChanges] = useState<FieldChange[] | null>(null);
  const [prevAt, setPrevAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void ing.candidateVersions(c.id).then((vs) => {
      if (!alive) return;
      const cur = vs.findIndex((v) => v.contentHash === c.contentHash);
      const prev = cur > 0 ? vs[cur - 1] : null;
      if (prev) {
        setChanges(diffCandidates(prev.candidate as CandidateConstraint, c));
        setPrevAt(prev.createdAt);
      }
    });
    return () => {
      alive = false;
    };
  }, [c, ing]);
  if (!changes) return null;
  return (
    <div className="text-[10px]">
      <p className="font-semibold">Versão anterior ({fmt(prevAt!)}) → atual — o histórico mantém-se</p>
      <DiffTable changes={changes} />
    </div>
  );
}

export function ResearchPanel() {
  const ing = useIngestion();
  return (
    <div className="space-y-2 text-[11px]">
      <p className="text-[var(--app-muted)]">
        O agente de investigação descobre, obtém, preserva e lê documentos oficiais para o âmbito das rotas planeadas e propõe candidatos com evidência por campo. Não ativa restrições nem aprova
        o próprio trabalho: tudo passa pelo trust gate e pela revisão humana. Uma pesquisa sem resultado é uma lacuna, nunca «sem restrições».
      </p>
      <ResearchCapabilitiesLine />
      <details>
        <summary className="cursor-pointer font-semibold">Entradas de investigação ({ALL_RESEARCH_ENTRYPOINTS.length}) e metadados de uso</summary>
        <ul className="mt-1 list-disc pl-4 text-[10px]">
          {ALL_RESEARCH_ENTRYPOINTS.map((e) => (
            <li key={e.id}>
              <b>{e.name}</b> ({e.kind}, {e.documentType}) — licença {e.use.licence}; uso comercial {e.use.commercialUse}; redistribuição {e.use.redistribution}; atribuição {e.use.attributionRequired};
              retenção de snapshots {e.use.snapshotRetention}; exibição de evidência {e.use.evidenceDisplay}. {e.use.basis}.
            </li>
          ))}
        </ul>
      </details>
      {ing.researchRuns.length === 0 && <p className="text-[var(--app-muted)]">Ainda não houve investigações. Use «Investigar fontes oficiais» no planeador de rotas.</p>}
      {ing.researchRuns.map((r) => (
        <RunCard key={r.id} run={r} />
      ))}
    </div>
  );
}
