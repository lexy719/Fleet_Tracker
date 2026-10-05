import type { ResearchEntrypoint } from "../research/entrypoints";
import type { ResearchRun } from "../research/agent";
import { assessFreshness } from "./freshness";
import type { IngestionStore } from "./store";
import { applyTrustGate } from "./trustGate";
import type { CandidateConstraint, ChangeEntry, SourceRecord, SourceState } from "./types";

/*
 * FleetOS side of the research boundary: research output → the EXISTING candidate store,
 * through the EXISTING deterministic trust gate. Nothing here can activate a constraint;
 * research candidates become operational only through human review (review.ts).
 *
 * A research run covers only its route scope, so a candidate it did not see is left
 * untouched — never inferred "no longer reported". Only documents that disappeared from a
 * COMPLETELY retrieved listing become NO_LONGER_REPORTED (which is not "cancelled").
 */

export const researchSourceId = (ep: Pick<ResearchEntrypoint, "id">) => `research:${ep.id}`;

export function researchSourceRecord(ep: ResearchEntrypoint, authorityName: string): SourceRecord {
  return {
    id: researchSourceId(ep),
    name: `Investigação: ${ep.name}`,
    authority: authorityName,
    type: ep.documentType,
    access: { kind: "RESEARCH", entrypointId: ep.id },
    landingUrl: ep.urls[0]!,
    license: ep.use.licence === "UNKNOWN" ? `desconhecida — ${ep.use.basis}` : ep.use.licence,
    // Official prose publication of the responsible authority: tier 2 (never auto-activates prose).
    trustTier: 2,
    parser: "research-agent",
    cadence: { checkEveryMin: ep.cadence.expectedEveryMin, agingAfterMin: ep.cadence.agingAfterMin, staleAfterMin: ep.cadence.staleAfterMin },
    coverage: {
      jurisdiction: ep.jurisdiction,
      network: ep.name,
      provides: ep.topics.includes("legal_acts") ? ["legal_acts", "permanent_restrictions"] : ["temporary_events", "closures", "roadworks"],
      gaps: ["Lida pelo agente de investigação apenas para o âmbito das rotas planeadas — não é uma cobertura completa.", ...ep.notes],
    },
    enabled: true,
    notes: [`Entrada de investigação verificada em ${ep.verifiedAt}.`, `Uso: ${ep.use.basis}`],
  };
}

export async function applyResearchRun(
  store: IngestionStore,
  run: ResearchRun,
  sources: SourceRecord[],
  now: Date,
): Promise<{ changes: ChangeEntry[]; perSource: Record<string, number> }> {
  const at = now.toISOString();
  const changes: ChangeEntry[] = [];
  const perSource: Record<string, number> = {};
  const bySource = new Map<string, ResearchRun["candidates"]>();
  for (const c of run.candidates) {
    const sid = run.sourceOf[c.id] ?? c.sourceId;
    bySource.set(sid, [...(bySource.get(sid) ?? []), c]);
  }
  const touched = new Set([...bySource.keys(), ...run.noLongerListed.map((id) => id.split(":").slice(0, 2).join(":"))]);
  const states = await store.getSourceStates();
  for (const sid of touched) {
    const source = sources.find((s) => s.id === sid);
    const prevState: SourceState = states.find((s) => s.sourceId === sid) ?? { sourceId: sid, unchangedFetches: 0 };
    const failed = run.gaps.some((g) => g.kind === "SOURCE_UNREACHABLE" && run.steps.some((st) => st.url === g.url && st.entrypointId && `research:${st.entrypointId}` === sid));
    const state: SourceState = {
      ...prevState,
      lastAttemptAt: at,
      ...(failed ? { lastError: "parte da obtenção falhou (ver lacunas da investigação)" } : { lastSuccessAt: at }),
      recordCount: (bySource.get(sid) ?? []).length,
      unchangedFetches: 0,
    };
    if (!failed) delete state.lastError;
    await store.putSourceState(state);
    const freshness = assessFreshness(source!, state, now);
    const gate = (c: Omit<CandidateConstraint, "gate">) => applyTrustGate(c, source, freshness, now);
    const previous = await store.getCandidates(sid);
    const prev = new Map(previous.map((c) => [c.id, c]));
    const out = new Map(previous.map((c) => [c.id, c]));
    for (const p of bySource.get(sid) ?? []) {
      const before = prev.get(p.id);
      const lifecycle: CandidateConstraint["lifecycle"] = !before ? "NEW" : before.contentHash === p.contentHash && before.lifecycle !== "NO_LONGER_REPORTED" ? "UNCHANGED" : "UPDATED";
      const base = { ...p, lifecycle, firstSeenAt: before?.firstSeenAt ?? at, lastSeenAt: at };
      out.set(p.id, { ...base, gate: gate(base) });
      if (lifecycle !== "UNCHANGED") changes.push({ at, sourceId: sid, candidateId: p.id, change: lifecycle });
    }
    for (const id of run.noLongerListed) {
      const c = out.get(id);
      if (!c || c.lifecycle === "NO_LONGER_REPORTED") continue;
      const base = { ...c, lifecycle: "NO_LONGER_REPORTED" as const, missingSinceAt: at };
      out.set(id, { ...base, gate: gate(base) });
      changes.push({ at, sourceId: sid, candidateId: id, change: "NO_LONGER_REPORTED" });
    }
    // Re-gate everything of this source (time and freshness move).
    const all = [...out.values()].map((c) => ({ ...c, gate: gate(c) }));
    await store.putCandidates(sid, all);
    perSource[sid] = all.length;
  }
  if (changes.length) await store.appendChanges(changes);
  return { changes, perSource };
}
