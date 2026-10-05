import type { CandidateConstraint, Freshness, GateResult, SourceRecord } from "./types";

/*
 * Deterministic trust gate. Decides whether a candidate may feed the compliance
 * evaluator. Conservative by construction: every doubt becomes REVIEW_REQUIRED.
 * AI-extracted candidates never pass.
 */

const PROHIBITIONS = new Set(["ROAD_CLOSURE"]);

export function applyTrustGate(
  c: Pick<CandidateConstraint, "fields" | "extraction" | "issues" | "lifecycle" | "research">,
  source: SourceRecord | undefined,
  freshness: Freshness,
  now: Date,
): GateResult {
  if (!source) return { decision: "REJECTED", reasons: ["Fonte não registada."] };
  if (source.trustTier === 4) return { decision: "REJECTED", reasons: ["Fonte não oficial (nível 4) — nunca ativa restrições."] };

  const f = c.fields;
  const cat = f.category.value;
  if (f.category.state === "UNKNOWN" || !cat) return { decision: "REVIEW_REQUIRED", reasons: ["Tipo de evento desconhecido."] };

  // Research (Phase 4): a machine-read prohibition of a vehicle class is never informational.
  if (c.extraction.kind === "semantic" && c.research?.eventKind === "VEHICLE_PROHIBITION") {
    return { decision: "REVIEW_REQUIRED", reasons: ["Proibição de circulação lida automaticamente de texto (MACHINE_EXTRACTED) — requer revisão humana.", ...c.issues] };
  }
  if (!PROHIBITIONS.has(cat)) {
    const closureText = c.issues.some((i) => /corte|interdi/i.test(i));
    return closureText
      ? { decision: "REVIEW_REQUIRED", reasons: [`Tipo «${cat}» não proíbe a passagem, mas o texto sugere um corte.`, ...c.issues] }
      : { decision: "INFORMATIONAL", reasons: [`Tipo «${cat}» não proíbe a passagem — informativo, não avaliado.`] };
  }

  const reasons: string[] = [];
  const blockers: string[] = [];
  if (c.extraction.kind === "ai") blockers.push("Extraído por IA — requer revisão humana; a IA nunca ativa restrições.");
  if (c.extraction.kind === "semantic") blockers.push(`Lido automaticamente de texto (${c.extraction.engine === "LLM" ? "modelo" : "regras"} ${c.extraction.extractorId}@${c.extraction.extractorVersion}; MACHINE_EXTRACTED) — requer revisão humana; o agente nunca ativa restrições.`);
  if (source.trustTier === 3) blockers.push("Fonte oficial indireta (nível 3).");
  if (c.lifecycle === "NO_LONGER_REPORTED") blockers.push("Deixou de constar na fonte — não se presume cancelado nem em vigor.");

  const v = f.validity.value;
  if (f.validity.state === "UNKNOWN" || !v) blockers.push("Validade desconhecida.");
  else if (v.end && Date.parse(v.end) <= now.getTime()) {
    return { decision: "INFORMATIONAL", reasons: [`Validade terminou em ${v.end}.`] };
  }

  const va = f.vehicleApplicability;
  if (va.state === "UNKNOWN" || !va.value || va.value.kind === "none_stated") blockers.push("Aplicabilidade a veículos desconhecida.");
  else if (va.value.kind === "conditions") blockers.push(`Condições de veículos em texto («${va.value.text}») — não codificadas automaticamente.`);
  else if (va.state === "INTERPRETED") reasons.push(`Aplicabilidade «todo o trânsito» interpretada (${va.note ?? va.basis ?? ""}).`);

  for (const i of c.issues) blockers.push(i);

  const g = f.geometry;
  let screeningOnly = false;
  if (g.state === "UNKNOWN" || !g.value) blockers.push("Sem geometria.");
  else if (g.value.kind === "point") blockers.push("Só um ponto — extensão do troço desconhecida.");
  else if (g.value.kind === "polygons") {
    screeningOnly = true;
    reasons.push("Geometria em área (polígono): só permite triagem (pode dar INCERTO, nunca AFETADO).");
  } else if (g.provenance !== "VERIFIED" && g.provenance !== "DERIVED") blockers.push(`Geometria ${g.provenance}.`);

  if (blockers.length) return { decision: "REVIEW_REQUIRED", reasons: [...blockers, ...reasons] };

  if (freshness.state !== "FRESH" && freshness.state !== "AGING") {
    reasons.push(`Fonte ${freshness.state}: ${freshness.reason} — usado só em triagem.`);
    screeningOnly = true;
  }
  return { decision: screeningOnly ? "ACTIVE_SCREENING_ONLY" : "ACTIVE", reasons };
}
