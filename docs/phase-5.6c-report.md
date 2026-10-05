# FleetOS — Phase 5.6C: relatório de implementação

Data: 5 de outubro de 2026. Projeto validado: C:/Users/manue/OneDrive/Ambiente de Trabalho/fleet-tracker, checkout atual com as alterações 5.6B já presentes. Preview: http://localhost:5173. Não foram criados commits. As alterações anteriores do utilizador foram preservadas.

## 1. Auditoria e causas

O fluxo original foi documentado antes das alterações em docs/phase-5.6c-flow.md. O planeador reduzia alternativas a posições por função, juntava respostas do fornecedor e do solver sem uma decisão de domínio comum e podia acrescentar novamente a rota escolhida por outro ID. Um segundo efeito de avoidance repetia trabalho já efetuado pelo solver. Cartões, passagem por restrições, janelas e resumo confirmado usavam diferentes versões do tempo de viagem. A contagem para recolha recebia a partida planeada como se fosse a hora atual. A revisão de planos enviava trabalhos em execução para Dispatch, que não permite esse replaneamento.

## 2. Arquitetura

Foi introduzida uma função pura decideRoutes e um RouteDecisionSet. O fluxo é: respostas do fornecedor e tentativas do solver → avaliação completa de cada candidato → exclusões operacionais → famílias geométricas → dominância → recomendação e escolhas materiais → cartões, mapa e confirmação. O resultado guarda IDs de recomendação, mais rápida, melhor valor e menor custo, contagens, razões de exclusão, proveniência, famílias, estado da decisão e questões por resolver. O resumo confirmado conserva esta informação sem exigir uma migração dos registos antigos.

## 3. Correções de consistência

operationalTimeline calcula condução, pausas, descansos, passagem e chegada. As durações dos troços são normalizadas ao total do fornecedor, evitando divergências por arredondamento. O tempo de trânsito já incluído pelo fornecedor não é somado novamente. Cartões, avaliação de janelas, passagem para Road Intelligence e chegada persistida usam a mesma base. A confirmação fica indisponível durante cálculo/solver e quando a seleção não pertence às decisões executáveis. Alterar recursos invalida imediatamente as opções antigas. Seleção no mapa e no planeador permanece sincronizada. “Usar esta rota” seleciona a família existente e fecha a análise; não acrescenta cartões.

## 4. Restrições obrigatórias e impactos informativos

Uma proibição aceite com resultado APPLIES exclui a rota e impede a sua seleção/confirmação. Continua a depender da geometria, direção, veículo, ADR, horário de passagem e exceções do avaliador existente. UNKNOWN permanece potencialmente afetado. OPERATIONAL_IMPACT com efeito advisory permite obras ou outros impactos não bloqueantes: informa sem obrigar a desviar nem inventar minutos de atraso. O solver e a avaliação de alternativas respeitam a mesma distinção. Uma falha de avaliação não produz uma rota executável.

## 5. Geração de candidatos

São conservadas as alternativas reais devolvidas pelo fornecedor, incluindo o pedido sem portagens. FASTEST e NO_TOLLS continuam a usar o solver existente, com avoidAreas cumulativas quando há restrições obrigatórias. Todas as tentativas entram na avaliação de domínio, incluindo as que falharam, para explicar exclusões. Cada desvio é novamente avaliado contra o conjunto atual de restrições: evitar A não permite aceitar silenciosamente B. Ciclos geométricos e o limite de seis desvios por estratégia terminam a procura. Foi removida a geração redundante de avoidance no planeador. Não existe uma quota de cartões nem um percurso especial de produção para VCI, Braga ou Guilhofrei.

## 6. Similaridade e deduplicação

A deduplicação de decisões usa geometria, não distância/duração arredondadas. Famílias requerem extremos na mesma direção a até 30 m, diferença de comprimento até 5% e cobertura geométrica bidirecional de 98% a 30 m. IDs equivalentes mantêm aliases e proveniência. Geometrias diferentes com os mesmos valores continuam distintas como candidatos, podendo resultar numa única decisão quando não oferecem uma escolha operacional útil.

## 7. Dominância

Um candidato é removido se outro não for pior em tempo total, custo estimado, conformidade, janela e risco, e for estritamente melhor em pelo menos uma destas dimensões. Uma vantagem de portagens de pelo menos €5 é preservada para permitir uma escolha consciente, mesmo quando combustível mais portagens é superior. A análise mantém a contagem de candidatos excluídos antes desta redução; candidatos dominados ou equivalentes não são apresentados como rotas proibidas.

## 8. Recomendação

A ordenação considera primeiro conformidade conhecida, janela e incerteza; depois custo estimado mais tempo operacional ponderado a €0,30 por minuto. Esse valor é uma política explícita de comparação, não um custo real medido. Desempates são determinísticos. A recomendação anterior pode manter o corredor perante variações até dois minutos e €1, apenas quando conformidade, janela e risco são iguais. Nunca preserva uma rota com proibição aplicável.

## 9. Alternativas com significado

Uma troca entre tempo e custo requer pelo menos cinco minutos e €5 em sentidos opostos. Redução de portagens de pelo menos €5, ou melhoria operacional num corredor distinto, também pode justificar uma decisão. Diferenças sem significado são reduzidas entre pares. Quando mais rápida e melhor valor coincidem não se cria outro cartão para ocupar esse papel. O resultado pode ter zero, uma, duas ou mais decisões; Amadora → Porto efetivamente apresentou cinco escolhas materiais neste ensaio.

## 10. Prova de ETA, UE 561 e janelas

Vieira do Minho → Faro, partida de 6 de outubro às 06:00: fornecedor cerca de 7h03 de condução; uma pausa de 45 min; duração operacional apresentada 7h48; chegada 13:47 segundo os segundos exatos do fornecedor, com duração arredondada no cartão. A mesma chegada é usada na janela. O caminho sem portagens de 10h48 de condução exige descanso diário e pausa, totalizando 22h33; falha a janela e fica fora das decisões selecionáveis.

Os testes fixam 423 min de condução + 45 min = 468 min, validam a janela com essa chegada, passagem pela meia-noite, normalização dos troços, trânsito sem dupla soma e descanso quando o condutor já consumiu o limite diário. A persistência conserva chegada e duração operacional, além da duração original de condução. Recolha datada amanhã usa a hora real: no ensaio final aparecia cerca de 10h10, e não 30 minutos. Datas ausentes ou sem fuso explícito são tratadas nos testes como desconhecidas, salvo quando existe uma janela datada válida que as esclarece.

## 11. Planos confirmados

“Rever conformidade” abre Plano e decisão do trabalho, incluindo trabalhos em viagem. A revisão avalia a geometria e evidência guardadas sem pedir outra rota ou mudar a operação. Uma nova proibição obrigatória sinaliza revisão; informação advisory não invalida automaticamente o plano. O navegador verificou J-4174 em viagem: mantém a rota e explica que o registo legado não tem decisão de conformidade guardada. A reavaliação de um registo com evidência e uma nova proibição foi verificada por teste. Não foi inventado um histórico de conformidade para os registos antigos.

## 12. Correções da auditoria

- Entradas do Diário da República: identificação inclui URL, título e descrição, preservando observações diferentes; a apresentação também protege contra IDs legados repetidos.
- Conformidade: pesquisa vazia apresenta “Nenhum resultado para esta pesquisa”, sem sugerir ausência de problemas.
- Trabalhos: filtros sem correspondência apresentam “Nenhum trabalho corresponde aos filtros”.
- Fontes e frescura: ligação abre corretamente ?area=sources, verificada no navegador.
- Dispatch: mapa acessível a 1254 × 900 através de drawer; a 1440 × 900 permanece lateral. Zoom foi utilizado nos dois formatos.
- Mapa: removido o ID de estilo TomTom personalizado inválido. Sem VITE_TOMTOM_CUSTOM_STYLE_ID configurado, usa o mapa base OpenStreetMap diretamente, mantendo o routing TomTom. Erros de estilo não imprimem uma URL com credencial.
- Seleção: corrigida a instabilidade de renderização entre o resultado do solver e o mapa; resultados devolvidos pelo hook permanecem estáveis entre renders.

## 13. Testes e compilação

Baseline: 44 ficheiros, 1.148 testes aprovados. Resultado final: 46 ficheiros, 1.189 testes aprovados, incluindo 37 testes do motor/timeline e quatro de cache. Nenhuma asserção existente foi enfraquecida. Cobertura: restrições temporais, de veículo, direção e ADR; obras; múltiplas proibições; famílias; dominância; materialidade; UNKNOWN; estabilidade; ausência de opções; consistência temporal; persistência; revisão e invalidação semântica de paragens.

Comandos finais aprovados: npx vitest run --maxWorkers=1; npm run typecheck; npm run lint; npm run build. A execução simultânea com compilação produziu uma medição de picker de 16,33 ms perante um limite de 16 ms. A repetição da suite completa sem concorrência passou, mantendo esse limite. O build conserva o aviso existente de um chunk de mapa acima de 700 kB. O harness de aceitação não gera um chunk no build de produção.

## 14. Aceitação interativa no navegador

Os sete casos determinísticos foram novamente clicados depois da suite final. Usam o avaliador/motor real com respostas sintéticas declaradas, sem pedidos externos. Os casos reais foram navegados no localhost com TomTom; não equivalem a uma prova de cobertura nacional ou de trânsito integralmente atualizado.

| Caso | Avaliados | Excluídos | Decisões | Recomendação e razão |
|---|---:|---:|---:|---|
| Amadora → Porto, J-4198, partida agora | 9 | 0 | 5 | 331 km, 5h23, cerca de €207; melhor combinação ponderada. Opções mais rápidas custam mais; outra reduz portagens. Janela sem data e cobertura parcial explícitas. |
| Vieira do Minho → Faro, J-DEMO-3C, partida amanhã 06:00 | 9 | 5 | 2 | 638 km, 7h48, cerca de €491; segunda escolha reduz portagens, +28 min e +€2 total. Cinco aliases/candidatos falham a janela. Aplicabilidade VCI ainda incerta junto das 07:00. |
| VCI com proibição conhecida aplicável | 2 | 1 | 1 | Desvio; a rota VCI tem ROUTE_AFFECTED e o desvio ROUTE_COMPLIANT. Cobertura continua parcial. |
| Sem problema de restrição / uma decisão | 1 | 0 | 1 | A, 42 min e €12; nenhuma proibição aplicável. |
| Obras, direto ainda melhor | 3 | 0 | 1 | A, 42 min; obras advisory não retiram a opção mais rápida. |
| Obras, desvio local melhor | 3 | 0 | 1 | B, 44 min contra A de 51 min; ganho vem da duração sintética do fornecedor. |
| Proibição com desvio válido | 2 | 1 | 1 | B; A excluída por corte obrigatório. |
| Nenhuma rota executável | 2 | 2 | 0 | Nenhuma; mensagem explícita, sem alternativa ilegal selecionável. |
| Duas decisões com troca material | 2 | 0 | 2 | B, 48 min/€8; A, 43 min/€14, é a alternativa de tempo e custo. |
| Mapa a 1254 × 900 | 9 | 5 | 2 | Mesmo J-DEMO-3C; botão Mapa, drawer e zoom funcionam. Não gera outras decisões. |
| Revisão de plano confirmado em viagem | não gera candidatos | — | plano guardado | Inteligência → Planos confirmados → Rever conformidade → J-4174/Plano e decisão; sem replaneamento ou alteração do trabalho. |

Além disso, a fixture real de Matosinhos → Espinho mostrou duas decisões com incerteza temporal/factos; não foi tratada como uma proibição conhecida ativa em 5 de outubro à noite. “Usar esta rota”, troca de cartões, detalhes UE 561/restrições, navegação Fontes, pesquisa local/global e revisão legal foram utilizados. Na última validação, não apareceram novos erros/warnings no console. Durante as alterações houve um erro de refresh de hooks e um ciclo de renders; foram corrigidos e o fluxo foi revalidado após recarregar.

Evidências guardadas junto deste relatório: 5.6C-browser-acceptance-final.json, 5.6C-vieira-faro-final.txt/png, 5.6C-amadora-porto-final.txt/png, 5.6C-vci-hard.png, 5.6C-no-executable.png, 5.6C-map-1254.png, 5.6C-confirmed-review-final.txt, 5.6C-fontes.png, filtros de Conformidade/Trabalhos e logs de validação. Nas capturas a duração é arredondada; o cálculo guarda os segundos exatos.

## 15. Desempenho e limites de API

O plano inicial faz normalmente dois pedidos lógicos de routing: alternativas nativas e sem portagens. Pode fazer um terceiro por fallback. Cada uma das duas estratégias permite no máximo seis novos desvios e, se o respetivo baseline estiver ausente, um pedido para o obter. Limite superior conservador por geração estável: 3 + 2 × (1 + 6) = 17 pedidos lógicos; com uma repetição transitória por pedido, até 34 tentativas HTTP. Não inclui consultas de descoberta às fontes de Road Intelligence, que não são pedidos de routing.

Nos casos reais principais ensaiados sem proibição obrigatória conclusiva, o cálculo novo fez dois pedidos de routing e zero pedidos de desvio. Trocar cartões/“Usar esta rota” fez zero pedidos. Reabrir o mesmo planeamento datado dentro da validade fez zero novos pedidos de routing. Fixtures sintéticas fizeram zero pedidos externos. O teste de obras confirmou zero pedidos de avoidance; o teste de múltiplas restrições verificou o limite do solver.

O cache de fornecedor dura cinco minutos, tem 24 entradas e partilha pedidos idênticos em curso. Falhas são removidas; Recalcular força atualização. O solver só reutiliza resultados com inputs, versão do dataset e frescura válidos. Chaves incluem veículo/perfil, reboque, carga/ADR/factos, partida, coordenadas/ordem/tipo/município/janelas das paragens, horas do condutor e métricas/geometria dos baselines. Mudança de Road Intelligence reavalia/resolve; não exige repetir um pedido de fornecedor cuja entrada e frescura continuam válidas. Resultados atrasados são descartados por geração. Rerenders não disparam routing.

A contagem diagnóstica é por ID de candidato, antes de agrupar famílias. Um solve novo inclui aliases das tentativas; reutilização pode ter menos aliases (por exemplo, 9/5/2 tornou-se 7/3/2), conservando as mesmas duas decisões. Não significa que desapareceram corredores reais.

## 16. Limitações restantes

A cobertura de Road Intelligence continua parcial, com fontes desatualizadas, regras municipais não codificadas e autorizações/feriados incertos explicitamente apresentados. O motor não prova ausência de restrições desconhecidas. Obras reais só afetam ETA através de tempos reportados pelo fornecedor; não foi ensaiada uma capacidade adicional de congestionamento ao vivo. Os desvios dependem das capacidades existentes de TomTom/avoidAreas; não há garantia de ótimo global nem procura ilimitada de corredores.

As horas de condução continuam a depender do registo manual, e o modelo assume zero de condução contínua inicial. Não há tacógrafo, localização ao vivo ou contabilização nova de tempos de carga/espera. Combustível e portagens são estimativas. O peso de €0,30/min é uma política central explícita que pode ser revista com dados operacionais. O mapa base passa a OpenStreetMap quando não existe um estilo TomTom válido configurado.

Para preservar os dados do utilizador, não confirmei nem atribuí os trabalhos de demonstração durante a aceitação. A gravação/replay da decisão foi validada automaticamente; o navegador validou seleção e revisão de um plano legado. O estado de prontidão abaixo refere-se ao motor 5.6C e à aceitação descrita, não a cobertura legal completa ou prontidão comercial de toda a plataforma.

## 17. Ficheiros alterados nesta fase

A lista seguinte refere-se ao trabalho 5.6C; o git status também contém numerosas alterações anteriores de 5.6B que não são atribuídas a esta fase.

- docs/phase-5.6c-flow.md
- docs/phase-5.6c-report.md
- src/domain/routing/routeDecision.ts
- src/domain/routing/routeDecision.test.ts
- src/domain/routing/acceptanceFixtures.ts
- src/regulations/operationalTimeline.ts
- src/ops/drivingLimits.ts
- src/ops/drivingStops.ts
- src/ops/euDrivingRules.ts
- src/regulations/timeline.ts
- src/regulations/alternatives.ts
- src/regulations/decisionRecord.ts
- src/regulations/types.ts
- src/regulations/evaluate.ts
- src/solver/solver.ts
- src/solver/types.ts
- src/solver/reuse.ts
- src/components/dispatch/JobRoutePlanner.tsx
- src/components/dispatch/useCleanRoutes.ts
- src/components/dispatch/CleanRoutesPanel.tsx
- src/components/dispatch/RouteCompliancePanel.tsx
- src/data/types.ts
- src/pages/CompliancePage.tsx
- src/pages/WorkPage.tsx
- src/components/intelligence/PlannedRoutesReview.tsx
- src/ui/job/PlanDecision.tsx
- src/pages/RoadIntelligencePage.tsx
- src/ingestion/parsers/drRss.ts
- src/tomtom/config.ts
- src/components/map/MapLibreTomTomLayer.tsx
- src/pages/DispatchPage.tsx
- src/components/routes/RoutePlannerMap.tsx
- src/tomtom/routeCache.ts
- src/tomtom/routeCache.test.ts
- src/pages/RoutingAcceptancePage.tsx
- src/App.tsx
- src/pages/SettingsPage.tsx

FLEETOS OPERATIONAL DECISION ENGINE READY: YES
