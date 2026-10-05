import { fold } from "./text";
import type { LegalRelevance } from "./types";

/*
 * Deterministic triage of Diário da República items (title + summary). This is an INDEX
 * for human review: it never creates a constraint. Recall over precision — when in doubt
 * an item is UNCERTAIN, not discarded.
 */

/** Strong signals: the act is about road traffic / circulation rules. */
const STRONG: [string, RegExp][] = [
  ["código da estrada", /codigo da estrada/],
  ["regulamento de trânsito", /regulamento (municipal )?de (transito|circulacao)/],
  ["postura de trânsito", /postura(s)? (municipa(l|is) )?de transito/],
  ["condicionamento de trânsito", /condicionamento(s)? (de|do|ao) (transito|circulacao)/],
  ["circulação rodoviária", /circulacao rodoviaria/],
  ["restrição à circulação", /(restric|proibic|interdic)(ao|oes) (a|de|da) circulacao/],
  ["veículos pesados (circulação)", /(circulacao|transito|acesso|restric\w*|proibic\w*)[^.]{0,60}(veiculos )?pesados/],
  ["cargas e descargas", /cargas e descargas/],
  ["transporte de mercadorias perigosas", /mercadorias perigosas/],
  ["zona de acesso restrito/automóvel condicionado", /zona(s)? de (acesso (restrito|automovel condicionado)|emissoes reduzidas)/],
  ["estacionamento (regulamento)", /regulamento[^.]{0,40}estacionamento/],
  ["sinalização de trânsito", /sinalizacao (de transito|rodoviaria)/],
];

/** Weak signals: road-related but often not about circulation rules. */
const WEAK: [string, RegExp][] = [
  ["estrada nacional / via", /\b(estrada(s)? (nacional|municipal)|variante|itinerario (principal|complementar))\b/],
  ["rodovia", /\brodovi(a|aria|ario)\b/],
  ["trânsito", /\btransito\b/],
  ["estacionamento", /\bestacionamento\b/],
  ["portagem", /\bportage(m|ns)\b/],
  ["infraestruturas de portugal", /infraestruturas de portugal/],
  ["via pública (ocupação)", /ocupacao (da|de) via publica/],
];

/** Signals that the match is incidental (recruitment of drivers, etc.). */
const NEGATIVE: [string, RegExp][] = [
  ["procedimento concursal", /procedimento concursal|recrutamento|mobilidade (interna|intercarreiras)/],
  ["carreira / posto de trabalho", /posto(s)? de trabalho|carreira|categoria de assistente/],
  ["motorista (emprego)", /motorista|condutor de (maquinas|veiculos)/],
  ["taxa/tarifário genérico", /tabela de taxas/],
];

export function classifyLegalItem(title: string, description: string): { relevance: LegalRelevance; matched: string[]; label: string } {
  const t = fold(`${title} ${description}`);
  const strong = STRONG.filter(([, r]) => r.test(t)).map(([n]) => n);
  const weak = WEAK.filter(([, r]) => r.test(t)).map(([n]) => n);
  const negative = NEGATIVE.filter(([, r]) => r.test(t)).map(([n]) => `−${n}`);
  const matched = [...strong, ...weak, ...negative];
  let relevance: LegalRelevance;
  if (strong.length > 0 && negative.length === 0) relevance = "POTENTIALLY_RELEVANT";
  else if (strong.length > 0 || weak.length > 0) relevance = negative.length > 0 && strong.length === 0 ? "NOT_RELEVANT" : "UNCERTAIN";
  else relevance = "NOT_RELEVANT";
  const label =
    relevance === "POTENTIALLY_RELEVANT"
      ? "POTENTIALLY RELEVANT — REVIEW/EXTRACT"
      : relevance === "UNCERTAIN"
        ? "UNCERTAIN — REVIEW"
        : "NOT RELEVANT";
  return { relevance, matched, label };
}
