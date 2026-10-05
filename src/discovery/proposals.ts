import { DEV_FIXTURE_PREFIX } from "../ingestion/sources";
import type { SourceRecord } from "../ingestion/types";
import { DEV_TEST_AUTHORITY } from "./authorities";
import type { Authority, SourceProposal } from "./types";

/*
 * Source proposals: a reusable source found by discovery enters the registry only after
 * explicit validation. Approval is refused when trust or access do not allow it.
 */

export type ProposalDecision = { ok: true; proposal: SourceProposal } | { ok: false; problems: string[] };

export function decideProposal(
  p: SourceProposal,
  decision: "APPROVED" | "REJECTED",
  by: string,
  reason: string,
  now: Date,
  allowSynthetic: boolean,
): ProposalDecision {
  const problems: string[] = [];
  if (!by.trim()) problems.push("indique quem valida");
  if (reason.trim().length < 5) problems.push("indique o motivo");
  if (p.status !== "PROPOSED") problems.push(`proposta já ${p.status}`);
  if (decision === "APPROVED") {
    if (p.trust.trust === "OFFICIAL_SYNTHETIC_TEST" && !allowSynthetic) problems.push("fonte sintética só pode ser aprovada em desenvolvimento");
    else if (p.trust.trust !== "OFFICIAL_VERIFIED" && p.trust.trust !== "OFFICIAL_SYNTHETIC_TEST") problems.push(`domínio não oficial verificado (${p.trust.trust})`);
    if (!p.parser) problems.push("sem parser determinístico conhecido para este formato");
    if (p.ingestBlocker) problems.push(p.ingestBlocker);
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, proposal: { ...p, status: decision, decision: { by: by.trim(), at: now.toISOString(), reason: reason.trim() } } };
}

/** Approved proposal → SourceRecord for the 3B pipeline (null when not ingestible). */
export function proposalToSource(p: SourceProposal): SourceRecord | null {
  if (p.status !== "APPROVED" || !p.parser || !p.fetchPath || p.ingestBlocker) return null;
  const devFixture = p.fetchPath.startsWith(DEV_FIXTURE_PREFIX);
  if (p.synthetic !== devFixture) return null; // synthetic ⇔ dev fixture, always
  const cadence = p.expectedCadenceMin ?? 60;
  return {
    id: `discovered-${p.id}`,
    name: `${p.synthetic && !p.authorityName.includes("TESTE SINTÉTICO") ? "[TESTE SINTÉTICO] " : ""}Descoberta: ${p.authorityName}`,
    authority: p.authorityName,
    type: p.sourceType,
    access: devFixture ? { kind: "DEV_FIXTURE", path: p.fetchPath } : { kind: "SAME_ORIGIN_PROXY", path: p.fetchPath, upstreamUrl: p.url },
    landingUrl: p.url,
    license: p.license ?? "desconhecida — verificar antes de uso comercial",
    trustTier: 1,
    parser: p.parser,
    cadence: { checkEveryMin: Math.max(1, Math.min(cadence, 60)), agingAfterMin: cadence * 4, staleAfterMin: cadence * 24 },
    coverage: {
      jurisdiction: p.geographicScope.municipalityCodes.length ? { kind: "municipal", municipalityCodes: p.geographicScope.municipalityCodes } : { kind: "national" },
      network: p.geographicScope.roads.join(", ") || p.authorityName,
      provides: ["temporary_events", "closures"],
      gaps: [`Fonte descoberta automaticamente e validada por ${p.decision?.by} em ${p.decision?.at.slice(0, 10)}.`],
    },
    enabled: true,
    notes: [`Descoberta via ${p.discoveredVia.map((v) => v.method).join(", ")}; domínio: ${p.trust.basis}`],
    ...(p.synthetic ? { synthetic: true } : {}),
  };
}

/** Authorities that publish approved discovered sources (so the scope links them). */
export function proposalAuthorities(proposals: SourceProposal[], base: Authority[]): Authority[] {
  const out: Authority[] = [];
  for (const p of proposals) {
    const src = proposalToSource(p);
    if (!src) continue;
    const a = p.synthetic ? DEV_TEST_AUTHORITY : base.find((x) => x.id === p.authorityId);
    if (!a) continue;
    const ex = out.find((x) => x.id === a.id);
    if (ex) ex.sourceIds.push(src.id);
    else out.push({ ...a, sourceIds: [...a.sourceIds, src.id] });
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseProposal(raw: unknown): SourceProposal | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.url !== "string") return null;
  if (!["PROPOSED", "APPROVED", "REJECTED"].includes(String(raw.status))) return null;
  if (!isObj(raw.trust) || typeof raw.authorityId !== "string" || !Array.isArray(raw.discoveredVia)) return null;
  if (typeof raw.synthetic !== "boolean") return null;
  return raw as unknown as SourceProposal;
}
