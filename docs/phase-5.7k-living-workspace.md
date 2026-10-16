# FleetOS — Phase 5.7K · Espaço de trabalho vivo

Laboratório DEV (`src/dev/fleetos-environment`). Dados sintéticos, geometria TomTom/OSM gravada. Sem integração de produção, sem lente Planear, sem motor de rota/tempo, sem commit/push.

## O que mudou no modelo

| Peça | Ficheiro | Papel |
|---|---|---|
| Facetas | `guidedWorkspace.ts` (`FACETS`, `state.facet`), `fx/Facets.tsx` | A mesma lente responde a perguntas diferentes, cada uma com composição própria e pergunta espacial própria (ou nenhuma). |
| Relações | `relations.ts` (`FleetObject`, `RELATIONS`, `applyFollow`) | Seguir um objeto (motorista, viatura, reboque, paragem, pausa, entrega, documento, revisão, habilitação, restrição, troço, alternativa, facto físico, combustível, autonomia, oficina) decide lead, faceta, foco e pergunta do mapa. A lead anterior fica ativa como contexto. 18 relações genéricas, sem contratos por par. |
| Edição | `edits.ts` (`EditKind`, `Proposal`, `EDIT_HOME`, `fact`), `fx/Editors.tsx` | Dez edições DEV: reboque, viatura, motorista, altura ao 1.º eixo, leitura de combustível, oficina, CQM, habilitação VCI, base de horas, emissão de CMR. Cada uma abre dentro do instrumento que é dono do facto. |
| Propostas | `state.pending`, `labWorld(state, preview)` | Uma proposta é pré-visualizada em todos os instrumentos (`labWorld` aplica-a por defeito); o mundo confirmado é `labWorld(state, false)`. Só Confirmar escreve em `state.overrides`. |
| Consequências | `fx/impact.ts`, `PendingBar` | O que muda (✓ ? ! ⌂), porquê, o que se mantém, domínios afetados (seguíveis), incerteza que exige aceitação explícita e evento. Nada é inventado: onde o laboratório não calcula, diz «exige recálculo». |
| Modo espacial | `state.mapFull`, `compositionGrammar.ts`, `fx/Spatial.tsx` | O mapa passa a tela. A lead torna-se um inspetor com forma própria (Motorista: coluna direita; Viatura: cartão técnico em baixo à esquerda; Percurso: faixa inferior ligada ao mapa; Restrições: lógica compacta à direita; Transporte: narrativa à esquerda). As outras lentes viram cartões de contexto. Mudar de lente não fecha o mapa; a câmara enquadra no espaço livre (`map.inset`). |
| Gramática de interação | `data-ix`, `fx/living.css` | informativo · inspect (sublinhado pontilhado) · follow (sublinhado + seta) · edit (✎, rebordo tracejado) · propose (âmbar) · commit (tinta, só na barra) · spatial (◎). |
| Histórico | `GuidedEnvironment.tsx` | Uma edição é uma excursão: Cancelar devolve o frame exato anterior ao editor; Confirmar colapsa a excursão e propaga o facto confirmado aos frames anteriores (Esc nunca desfaz um facto confirmado). |

## Regras de honestidade mantidas

- VCI tri-estado: 1.º eixo < 1,10 m → «não se aplica»; ≥ 1,10 m com habilitação por confirmar → continua «desconhecido» (nunca «permitido»); só «não detém» registado → «aplica-se».
- Guia emitida nunca é reescrita: mudar reboque/motorista depois da emissão aparece como diferença; reemitir cria nova versão e anula a anterior.
- Motorista reatribuído não herda horas: «sem base registada hoje».
- Reboques e motoristas livres explícitos (PT-1021, PT-8481, PT-3390, PT-9281, D-40, D-41); candidatos ocupados aparecem «com J-xxxx».

## Verificação

- Typecheck e lint sem erros; 116 testes do laboratório a passar (15 novos em `livingWorkspace.test.ts`); build sem código do laboratório no `dist`.
- Suite completa: 4 falhas fora do laboratório (solver e desempenho), em ficheiros de produção editados em paralelo; nenhum importa o laboratório.
- 66 cenas navegadas no browser headless a partir da base (fluxos A–H, 33 estados exigidos, variantes por faceta, 1199 e 1920), com estado e classes de interação por cena: `docs/phase-5.7k-review/` (PNG + `meta.json`).
- Relatório: `Downloads/FleetOS-5.7K-Espaco-de-Trabalho-Vivo.pdf` (78 páginas).

## Limites

- Tempos continuam sintéticos (sem motor de rota/tempo, como pedido): onde a consequência exige cálculo, a proposta diz «exige recálculo».
- Percurso em modo espacial numa rota norte–sul fica com enquadramento afastado (a faixa inferior tira altura).
- Edições só vivem na sessão DEV.

## Auditoria de cliques mortos (pedido pós-entrega)

Cada clicável visível foi clicado a partir de 27 estados-base reais (operação, cada lente, transporte, modo espacial, edições, propostas) e comparado antes/depois: estado, composição, texto visível e câmara.

| Ronda | Cliques | Sem efeito visível |
|---|---|---|
| Antes | 379 | 60 (rail num transporte, faceta ativa, marcadores do mapa, entregas, documento selecionado) |
| Depois das correções | 579 | 0 (o único caso só-câmara restante é «Enquadrar», agora desativado até o operador mexer no mapa) |

Regra nova do rail (`{ type: "lens" }`): clicar numa lente traz essa perspetiva para a frente e as anteriores ficam como contexto; clicar na lente da frente retira-a e volta à anterior; «Transportes» à frente devolve todos os transportes com as lentes como contexto. `lensMatrix.test.ts` verifica 163 estados × 6 lentes = 978 cliques: todos mudam perspetiva e composição. A faceta atual, a proposta já escolhida e o domínio já à frente são afirmações (não botões).
