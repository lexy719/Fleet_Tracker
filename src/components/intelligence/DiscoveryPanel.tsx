import { useState } from "react";
import { useIngestion } from "../../context/IngestionContext";
import type { DiscoveryRun, SourceProposal } from "../../discovery/types";

/*
 * Discovery audit + source-proposal validation. All discovered text is rendered as plain
 * text (React escapes it); URLs are shown as text, and only official ones are links.
 */

const TRUST_UI: Record<string, string> = {
  OFFICIAL_VERIFIED: "bg-[var(--accent-soft)] text-[var(--accent)]",
  OFFICIAL_SYNTHETIC_TEST: "bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]",
  UNVERIFIED_GOVERNMENT_SUFFIX: "bg-[var(--warn-soft)] text-[var(--warn)]",
  NON_AUTHORITATIVE: "bg-[var(--neutral-soft)] text-[var(--text-2)]",
  INVALID_URL: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

const inputCls = "rounded-md border border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1 text-[11px]";

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>{children}</span>;
}

function ProposalRow({ p }: { p: SourceProposal }) {
  const ing = useIngestion();
  const [by, setBy] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string[] | null>(null);
  const decide = async (d: "APPROVED" | "REJECTED") => {
    const problems = await ing.decideSourceProposal(p.id, d, by, reason);
    setMsg(problems.length ? problems : ["Registado."]);
  };
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] last:border-b-0" data-testid="source-proposal">
      <div className="flex flex-wrap items-center gap-2">
        <Pill cls={p.status === "APPROVED" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : p.status === "REJECTED" ? "bg-[var(--neutral-soft)] text-[var(--text-2)]" : "bg-[var(--warn-soft)] text-[var(--warn)]"}>{p.status}</Pill>
        <Pill cls={TRUST_UI[p.trust.trust] ?? ""}>{p.trust.trust}</Pill>
        {p.synthetic && <Pill cls="bg-[var(--prov-demo-soft)] text-[var(--prov-demo)]">TESTE SINTÉTICO</Pill>}
        <span className="font-semibold">{p.authorityName}</span>
      </div>
      <p className="mt-1 break-all font-mono text-[10px]">{p.url}</p>
      <p className="text-[10px] text-[var(--app-muted)]">
        {p.sourceType} · parser {p.parser ?? "nenhum"} · obtido via {p.fetchPath ?? "—"} · âmbito: {p.geographicScope.roads.join(", ") || "—"} · cadência esperada{" "}
        {p.expectedCadenceMin ? `${p.expectedCadenceMin} min` : "desconhecida"} · licença {p.license ?? "desconhecida"}
      </p>
      <p className="text-[10px] text-[var(--app-muted)]">Domínio: {p.trust.basis}</p>
      <p className="text-[10px] text-[var(--app-muted)]">Descoberta: {p.discoveredVia.map((v) => `${v.method} (${v.at.slice(0, 16)})`).join(", ")}</p>
      {p.ingestBlocker && <p className="text-[10px] text-[var(--danger)]">Não ingerível: {p.ingestBlocker}</p>}
      {p.decision && (
        <p className="text-[10px]">
          Decisão: {p.decision.by} · {p.decision.at.slice(0, 16)} · {p.decision.reason}
        </p>
      )}
      {p.status === "PROPOSED" && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input className={inputCls} placeholder="Validado por" value={by} onChange={(e) => setBy(e.target.value)} name="proposalBy" />
          <input className={`${inputCls} min-w-[16rem]`} placeholder="Motivo (ex.: domínio oficial verificado, formato DATEX)" value={reason} onChange={(e) => setReason(e.target.value)} name="proposalReason" />
          <button type="button" onClick={() => void decide("APPROVED")} className="rounded-md bg-[var(--accent)] px-2 py-1 font-semibold text-white">
            Validar fonte
          </button>
          <button type="button" onClick={() => void decide("REJECTED")} className="rounded-md bg-[var(--danger-soft)] px-2 py-1 font-semibold text-[var(--danger)]">
            Rejeitar
          </button>
        </div>
      )}
      {msg && <p className="text-[10px]" data-testid="proposal-result">{msg.join(" · ")}</p>}
    </div>
  );
}

function RunRow({ r }: { r: DiscoveryRun }) {
  const byKind = r.results.reduce<Record<string, number>>((a, x) => ({ ...a, [x.kind]: (a[x.kind] ?? 0) + 1 }), {});
  return (
    <details className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] last:border-b-0" data-testid="discovery-run">
      <summary className="cursor-pointer">
        <span className="font-semibold">{r.startedAt.slice(0, 19).replace("T", " ")}</span> · {r.scope.strategy} · rota {r.scope.routeHash.slice(0, 8)} ·{" "}
        {r.scope.municipalities.length} municípios · {r.scope.roads.length} vias · cache {r.cache.hit}/{r.cache.miss}/{r.cache.stale}/{r.cache.error} (hit/miss/stale/erro) ·{" "}
        {r.results.length} resultados · {r.gaps.length} lacunas
      </summary>
      <div className="mt-2 space-y-2 text-[10px]">
        <div>
          <p className="font-bold">Âmbito</p>
          <p>Vias: {r.scope.roads.map((x) => `${x.ref} (${x.roadClass})`).join(", ") || "—"}</p>
          <p>Municípios: {r.scope.municipalities.map((m) => `${m.name} ~${m.approxKm} km`).join(", ") || "—"} · amostras incertas {r.scope.uncertainSamples}/{r.scope.totalSamples}</p>
          <p>Distritos: {r.scope.districts.join(", ") || "—"}</p>
          <p>Fontes registadas: {r.scope.registeredSources.map((s) => `${s.name} [${s.freshness}]`).join("; ") || "—"}</p>
          <p>Autoridades sem fonte operacional: {r.scope.uncoveredAuthorityIds.length}</p>
          <p>
            Veículo: {Object.entries(r.scope.vehicle.known).map(([k, v]) => `${k}=${String(v)}`).join(", ") || "—"} · em falta: {r.scope.vehicle.missing.join(", ") || "—"}
          </p>
          <p>Horizonte: {r.scope.horizon ? `${r.scope.horizon.fromIso} → ${r.scope.horizon.toIso}` : "—"}</p>
        </div>
        <div>
          <p className="font-bold">Resultados ({Object.entries(byKind).map(([k, n]) => `${k} ×${n}`).join(", ") || "nenhum"})</p>
          <ul className="list-disc pl-4">
            {r.results.map((x) => (
              <li key={x.id}>
                <Pill cls={TRUST_UI[x.trust.trust] ?? ""}>{x.trust.trust}</Pill> <span className="font-semibold">{x.kind}</span> · {x.title} ·{" "}
                <span className="break-all font-mono">{x.url}</span> · {x.methods.join("+")}
                {x.note ? ` · ${x.note}` : ""}
                {x.snippet ? <span className="block text-[var(--app-muted)]">«{x.snippet}»</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-bold">Lacunas (tarefas para descoberta futura)</p>
          <ul className="list-disc pl-4">
            {r.gaps.map((g) => (
              <li key={g.id}>
                <span className="font-semibold">{g.kind}</span>
                {g.authorityName ? ` · ${g.authorityName}` : ""}
                {g.road ? ` · via ${g.road}` : ""} · falta: {g.need} · {g.reason}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[var(--app-muted)]">
          Tempos: total {r.timings.totalMs.toFixed(0)} ms (externo {r.timings.externalMs.toFixed(0)} ms, cache {r.timings.cacheMs.toFixed(1)} ms, classificação {r.timings.classifyMs.toFixed(1)} ms, âmbito{" "}
          {r.timings.scopeMs.toFixed(1)} ms) · fontes atualizadas: {r.refreshedSourceIds.join(", ") || "nenhuma"}
        </p>
      </div>
    </details>
  );
}

export function DiscoveryPanel() {
  const ing = useIngestion();
  const proposals = [...ing.proposals].sort((a, b) => (a.status === "PROPOSED" ? -1 : 0) - (b.status === "PROPOSED" ? -1 : 0));
  return (
    <div className="space-y-3 text-[11px]">
      <div className="rounded-lg bg-[var(--app-elevated)] px-3 py-2 text-[var(--app-muted)]">
        A descoberta é conduzida pelas rotas calculadas no planeador: para cada estratégia, FleetOS deriva o âmbito (municípios CAOP, vias, autoridades, fontes) e
        consulta os fornecedores de descoberta. Pesquisa web: <strong>não configurada</strong> (requer backend/chave — registada como lacuna).
        {ing.devFixturesEnabled ? " Pesquisa por fixtures de desenvolvimento: ativa (resultados sintéticos rotulados)." : ""} Resultados não oficiais nunca são evidência; fontes
        descobertas só entram no registo depois de validadas.
      </div>
      <div>
        <p className="mb-1 font-bold">Propostas de fonte ({proposals.length})</p>
        {proposals.length === 0 ? <p className="text-[var(--app-muted)]">Nenhuma.</p> : proposals.map((p) => <ProposalRow key={p.id} p={p} />)}
      </div>
      <div>
        <p className="mb-1 font-bold">Execuções de descoberta ({ing.discoveryRuns.length}, mais recentes primeiro)</p>
        {ing.discoveryRuns.length === 0 ? (
          <p className="text-[var(--app-muted)]">Nenhuma — calcule uma rota no planeador.</p>
        ) : (
          ing.discoveryRuns.slice(0, 10).map((r) => <RunRow key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}
