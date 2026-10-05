/*
 * Road Intelligence coverage headlines are stable machine-readable strings (frozen domain,
 * persisted in decision records). The UI shows them in Portuguese through this mapper only.
 */

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^NO KNOWN CONSTRAINT FOUND BUT COVERAGE IS PARTIAL$/, () => "Sem restrições conhecidas — cobertura parcial"],
  [/^NO KNOWN CONSTRAINT FOUND$/, () => "Sem restrições conhecidas"],
  [/^COVERAGE COMPLETE FOR KNOWN SOURCES$/, () => "Cobertura completa das fontes conhecidas"],
  [/^COVERAGE IS PARTIAL$/, () => "Cobertura parcial"],
  [/^NO ROUTE GEOMETRY — COVERAGE UNKNOWN$/, () => "Sem geometria da rota — cobertura desconhecida"],
  [/^(\d+) INVALID ROUTE POINT\(S\) — COVERAGE UNKNOWN THERE$/, (m) => `${m[1]} ponto(s) inválido(s) na rota — cobertura desconhecida aí`],
  [/^ROUTE LEAVES SUPPORTED TERRITORY \(~([\d.,]+) km outside (.+) — ROAD INTELLIGENCE UNKNOWN THERE\)$/, (m) => `A rota sai do território suportado (~${m[1]} km fora de ${m[2]} — informação desconhecida aí)`],
  [/^(\d+) UNREVIEWED REPORT\(S\) NEAR ROUTE$/, (m) => `${m[1]} aviso(s) por rever junto à rota`],
  [/^KNOWN RESTRICTION NOT ENCODED$/, () => "Restrição conhecida ainda não codificada"],
];

export function coverageHeadlinePt(headline: string): string {
  return headline
    .split(" · ")
    .map((part) => {
      for (const [re, fn] of RULES) {
        const m = part.match(re);
        if (m) return fn(m);
      }
      return part;
    })
    .join(" · ");
}
