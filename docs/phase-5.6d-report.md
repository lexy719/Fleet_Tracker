# FleetOS — Phase 5.6D: Restriction Applicability & Exception Semantics Hardening

Implementação concluída no projeto C:/Users/manue/OneDrive/Ambiente de Trabalho/fleet-tracker, em 05/10/2026. Baseline: 1e1470eda2565cb91ee73a85db9e4515744111cb. Esse commit da versão anterior foi enviado e confirmado em origin/main; as alterações 5.6D deste relatório estão locais, ainda sem novo commit/push.

## A. ROOT CAUSE

O defeito semântico estava em evaluateRegulation, na combinação final: target AND whereWhen AND NOT(OR(exceptions)). Uma exceção UNKNOWN tornava a negação UNKNOWN, mesmo com todos os requisitos da proibição estabelecidos. summarizeStatus classificava então a rota como POTENTIALLY_AFFECTED e decideRoutes não a excluía por proibição obrigatória. O motor de decisão consumia corretamente o resultado recebido; não era aí que se perdia a distinção.

Há duas causas diferentes no J-4198 real, e apenas uma é o defeito corrigido. Na Volvo 23-AB-45 faltam número de eixos e altura medida no primeiro eixo, requisitos BASE da definição guardada da VCI. Também faltam dados de possíveis isenções. Corrigir a segunda categoria não estabelece os primeiros factos. A rota real diurna deve continuar UNKNOWN enquanto esses requisitos necessários não forem registados.

A auditoria anterior à implementação está em docs/phase-5.6d-audit.md. O fluxo foi seguido desde o registo curado, passando por construção de factos, paragens, timeline, avaliação, agregação, exclusão, confirmação e revisão de planos.

## B. OLD SEMANTICS

Condition já conservava lógica tri-valuada adequada: factos ausentes eram UNKNOWN, e as conjunções/disjunções respeitavam predicados conhecidos. appliesTo e exceptions já estavam separados no registo, mas a combinação tratava a incerteza numa isenção como incerteza da proibição.

Exemplo reproduzido por teste: APPLIES AND APPLIES AND NOT(OR(UNKNOWN, UNKNOWN, UNKNOWN)) = UNKNOWN. O painel UNKNOWN também perdia a explicação dos predicados base conhecidos, mostrando sobretudo dados em falta.

Foi corrigida uma expectativa anterior de teste: retirar apenas authorization.pt-imt-aet de uma base completamente estabelecida já não deve produzir UNKNOWN. O teste continua a existir, agora exige APPLIES. Os testes de base incerta permanecem.

## C. NEW SEMANTICS

| Base | Estatuto/classificação legal | Isenção | Resultado |
| --- | --- | --- | --- |
| DOES_NOT_APPLY | qualquer | qualquer | DOES_NOT_APPLY |
| UNKNOWN | qualquer | qualquer | UNKNOWN |
| APPLIES | regra não VERIFIED | qualquer | UNKNOWN |
| APPLIES | estrutura verificada | positivamente confirmada | DOES_NOT_APPLY |
| APPLIES | estrutura verificada | factos apenas da isenção ausentes, UNKNOWN ou negativos | APPLIES |
| APPLIES | classificação de exceção indeterminate e ainda possível | não estabelecida | UNKNOWN |

Uma isenção confirmada exige: classificação afirmativa, referências legais verificadas, condição avaliada APPLIES e suporte factual decisivo. Uma condição vazia não constitui prova de isenção. AND exige todos os seus requisitos; OR admite uma isenção efetivamente estabelecida. Uma negação não transforma um facto desconhecido em prova.

Nenhum facto de transporte ausente é convertido em false ou true. Os resultados brutos dos predicados de exceção continuam UNKNOWN, mesmo quando o resultado agregado é APPLIES. A distinção aparece nos dados estruturados e nas razões.

## D. DOMAIN CHANGES

- src/regulations/types.ts: ExceptionProof, códigos de razão, PredicateEvaluation e ApplicabilityEvaluation; cada resultado pode preservar base, condições individuais e exceções. O campo é opcional para manter compatibilidade com decisões históricas.
- src/regulations/applicability.ts: combinador puro e genérico, independente de UI, cidade, trabalho, rota ou fornecedor.
- src/regulations/evaluate.ts: calcula a base separadamente; avalia e conserva as exceções; verifica as referências de prova; usa o combinador; conserva razões conhecidas e em falta, passagem e fontes, inclusive quando uma isenção derrota uma base correspondente.
- src/regulations/portugal/seededRestrictions.ts: versão 3 da VCI; as três exceções existentes passam a declarar explicitamente proof=affirmative. Não foram transferidos eixos ou altura da base para exceções, nem alteradas geometria, vigência ou regras horárias.
- src/regulations/repository.ts: conjunto 2026-10-05.3, substituindo 2026-09-30.2, para o mecanismo existente invalidar cache e reavaliar conhecimento atualizado.
- src/regulations/__tests__/applicabilitySemantics.test.ts: 46 testes novos.
- src/domain/routing/acceptanceFixtures.ts: dois cenários DEV isolados adicionados ao harness existente; não persistem dados e não fazem pedidos ao fornecedor. O build de produção não contém o harness.

Os registos de exceções previamente aceites que não têm proof explícito usam o padrão afirmativo apenas com referências legais VERIFIED. A ambiguidade de classificação é expressa por indeterminate; referências ausentes ou não verificadas também impedem estabelecer a isenção com certeza. A ingestão de candidatos continua sujeita ao trust gate e à revisão existentes.

## E. VCI RESULT

Foi usada a única regra VCI já armazenada em REGULATION_DATASET e a geometria TomTom registada no fixture anterior. Não foi criada outra implementação da VCI.

O modelo aceite cita o Decreto-Lei 155-A/2026 e a retificação 33/2026/1. O art. 2.º n.º 3 suporta, no registo existente, peso bruto >3500 kg, pelo menos 3 eixos, altura do primeiro eixo >=1,1 m e veículo de mercadorias. As exceções citam art. 2.º n.ºs 4/5 e art. 3.º: movimento Porto/Gaia habilitado, autorização IMT, ou propriedade pública. A correspondência de geometria continua identificada como INTERPRETED. Esta fase trabalha sobre o conhecimento aceite existente; não constitui nova validação externa dos diplomas nem expansão de cobertura legal.

Aceitação equivalente com base completa, quarta-feira 07/10 às 10:00 de Lisboa, sem registos de autorizações/propriedade: VCI APPLIES; ROUTE_AFFECTED; 2 candidatos, 1 excluído, 1 decisão — Desvio. O mesmo caso com prova positiva de autorização IMT passa a DOES_NOT_APPLY, preservando BASE_RULE_APPLIES e a evidência da isenção.

J-4198 real, em localhost durante a validação: 31 t, Volvo 23-AB-45, Carla Mendes, partida aproximadamente 23:26. Foram inspecionadas as quatro decisões materiais, sem confirmar ou modificar o transporte:

| Opção | Duração/distância/custo | Resultado observado |
| --- | --- | --- |
| Recomendada | 3h35 / 329 km / €254 | Sem restrições conhecidas, cobertura parcial; VCI não aplicável na passagem noturna |
| Menos portagens | aproximadamente 3h53 / 353 km / €256 | Sem restrições conhecidas, cobertura parcial; passagem noturna |
| Alternativa de tempo/custo | 15h37 / 331 km / €207 | UNKNOWN; VCI 06/10 14:57–15:01, janela 14:38–15:20; faltam eixos e altura do primeiro eixo |
| Alternativa de tempo/custo | 16h40 / 374 km / €213 | UNKNOWN; VCI 06/10 15:58–16:03, janela 15:37–16:25; mesmos requisitos base em falta |

A app apresentou 9 candidatos, 0 excluídos e 4 decisões úteis neste caso real. As durações longas incorporam descanso diário de 11 h, com 4h30 já conduzidas nesse dia. As janelas do trabalho não têm data e continuam por confirmar. Não se inventou APPLIES nem se promoveu o perfil genérico TomTom de 5 eixos a evidência legal. O equivalente com base completa prova a exclusão pretendida; J-4198 ainda depende de dados reais da viatura.

## F. GENERIC PROOF

Os novos testes cobrem mais de 20 categorias, usando o mesmo avaliador:

1. Regressão da negação antiga de exceções UNKNOWN.
2. HGV conhecido, não correspondente e desconhecido.
3. Peso e limiares.
4. Altura e limiares.
5. Largura e limiares.
6. Comprimento e limiares.
7. Intervalos numéricos suficientes ou que atravessam o limiar.
8. ADR positivo, negativo e desconhecido.
9. Direção mapeada correta e oposta.
10. Geometria por resolver.
11. Horas fora da proibição.
12. Domingo fora dos dias úteis.
13. Feriado e margem ETA junto à fronteira horária.
14. Chave de isenção ausente, facto UNKNOWN explícito e negativo conhecido.
15. Autorização positiva.
16. Acesso de residente.
17. Acesso local.
18. Serviço.
19. Entrega.
20. Exceção de classe de veículo.
21. Entrega municipal que exige pertença à área E autorização.
22. AND, OR e NOT com subcondições desconhecidas.
23. Condição de exceção vazia, sem prova afirmativa.
24. Estatuto legal INTERPRETED/UNVERIFIED e classificação indeterminate.
25. Referência de exceção ausente ou não verificada.
26. Restrição A isenta, incerta ou advisory coexistindo com proibição B.
27. Advisory executável sem atraso inventado.
28. Exclusão de todas as proibições obrigatórias aplicáveis e conservação do diagnóstico.
29. Revisão histórica imutável sem fetch ao fornecedor.
30. Recusa de confirmar uma rota obrigatoriamente afetada.
31. Ausência de identificadores específicos no avaliador, combinador e motor de decisão.

A isenção A nunca isenta B. Uma proibição B estabelecida prevalece sobre A isenta, incerta ou meramente informativa. A incerteza de base continua POTENTIALLY_AFFECTED e não é indevidamente convertida em infração.

## G. CONFIRMED PLAN REVIEW

assessPlannedJob continua a usar evaluateCompliance/evaluateRegulation sobre a rota guardada. Não foram alterados algoritmos de revisão ou persistência.

O teste cria uma decisão histórica POTENTIALLY_AFFECTED, altera apenas a semântica aceite do conjunto e obtém ROUTE_AFFECTED na reavaliação. previousStatus, JSON do trabalho e relatório histórico permanecem inalterados. Um spy de fetch verifica zero chamadas ao fornecedor.

No navegador: Intelligence → Revisão → Planos confirmados apresentou 4 planos. Três não possuem decisão de conformidade guardada e são corretamente classificados como dados insuficientes. J-DEMO-3C foi reavaliado como potencialmente afetado, com passagem 06:55–07:02 e margem 06:47–07:11, cruzando as 07:00. No detalhe Plano e decisão, a revisão atual permanece separada da decisão guardada; a evidência histórica conserva conjunto 2026-09-30.2 e hora 20:28. Não houve atribuição, reconfirmação ou replaneamento durante a aceitação.

## H. PROVENANCE

Cada resultado novo conserva regulationId, versão, efeito, outcome, razões, evidenceIds e exposição temporal. applicability acrescenta: resultado base, resultado de alvo, geometria/tempo agregados, folhas de predicados com identificador, valor tri-valuado e razões, e cada exceção com id, classificação de prova, resultado bruto e confirmed.

Códigos: BASE_RULE_APPLIES, BASE_RULE_NOT_APPLICABLE, BASE_APPLICABILITY_UNKNOWN, EXEMPTION_CONFIRMED, EXEMPTION_NOT_ESTABLISHED, EXEMPTION_FACT_UNKNOWN e LEGAL_SEMANTICS_UNKNOWN. A lógica não depende da tradução das mensagens.

A confirmação existente guarda o relatório reproduzido, os factos, as fontes, a geometria e a partida. As razões da base continuam acessíveis mesmo com isenção confirmada. As citações das exceções não ficam reduzidas a um aviso sem origem. O teste de integridade confirma que todas as referências do conjunto curado resolvem.

## I. PHASE 5.6C NON-REGRESSION

Não há alterações em decideRoutes, geração/ranking de famílias, dominância, materialidade, seleção, solver, integração TomTom, timeline, UE561, janelas, fingerprint/cache, mapa, Dispatch operacional ou revisão confirmada. As alterações em acceptanceFixtures são exclusivamente de testes DEV.

Os 37 testes existentes de routeDecision passaram sem alterações. A suite completa também manteve testes de regulamentos, calendário, exposição, timeline, solver, matrizes, invariantes, reavaliação e persistência. A versão do conjunto usa os mecanismos existentes de cache/revisão.

Os sete cenários 5.6C foram repetidos no navegador: uma decisão; duas escolhas materiais; obras com direto preferível; obras com desvio local preferível; proibição com desvio; nenhuma rota executável; VCI com proibição conhecida. Mantêm recomendações e contagens coerentes, incluindo zero decisões quando as duas rotas estão proibidas. Não existe quantidade fixa de cartões nem duração artificial de obras.

## J. TESTS

| Verificação | Resultado |
| --- | --- |
| Baseline antes de alterações funcionais | 46 ficheiros / 1189 testes aprovados; 99,39 s |
| Direcionados: novos casos + evaluate + routeDecision | 3 ficheiros / 111 testes aprovados |
| Suite completa após implementação | 47 ficheiros / 1235 testes aprovados; 114,66 s |
| Novos casos após ajuste dos tipos de fixture e formatação | 46 testes aprovados |
| npm run typecheck | Aprovado: aplicação, testes e servidor |
| npm run lint | Aprovado |
| npm run build | Aprovado; 1955 módulos; build Vite 11,68 s |
| git diff --check | Sem erros de whitespace |
| Pesquisa nos assets de produção pelo harness DEV | Sem correspondências |

Não foram removidos testes. Uma expectativa anterior mudou pela razão indicada em B. Erros iniciais de sintaxe/tipagem dos novos fixtures foram corrigidos antes da validação final. O build ainda avisa sobre um chunk de mapas acima de 700 kB e tempos de plugins; não são falhas de compilação nem novos bloqueios semânticos.

Logs medidos: 5.6D-baseline.log e 5.6D-final-tests.log, no diretório de artefactos desta conversa.

## K. BROWSER ACCEPTANCE

localhost:5173, projeto atual, desktop com viewport normal. Navegação e observações via navegador real; não se leram estados internos para fabricar resultados.

- J-4198: seleção e análise das quatro opções materiais; horários, descanso diário, estado de restrições e fontes vistos no painel.
- Harness DEV: os sete cenários anteriores e dois novos cenários. Base completa/isenções ausentes exclui VCI; base sem altura do primeiro eixo conserva POTENTIALLY_AFFECTED e zero exclusões obrigatórias. A classificação/pruning pode ainda apresentar apenas o desvio recomendado; isto não converte a base incerta em APPLIES.
- Intelligence/planos confirmados: lista, revisão de J-DEMO-3C, Plano e decisão e expansão de evidência histórica.
- Recarregamento completo: detalhe confirmado e harness carregam sem novos erros ou avisos de consola.

Evidência guardada junto a este relatório: quatro ficheiros 5.6D-after-j4198-*.txt; 5.6D-vci-affirmative-exclusion.txt/.png; 5.6D-vci-base-unknown.txt; 5.6D-browser-regression.json; 5.6D-confirmed-review.txt. A imagem de exclusão foi visualmente inspecionada e mostra VCI ROUTE_AFFECTED, Desvio ROUTE_COMPLIANT e apenas o desvio como decisão.

Incidente observado: durante atualização automática de módulos às 23:19:43 surgiu useIngestion must be used within IngestionProvider. Não reapareceu após um recarregamento completo e não foi reproduzido no arranque limpo nem na navegação subsequente. Registado como incidente transitório de desenvolvimento, sem alteração de providers nesta fase. Não se apresenta a consola histórica inteira como livre de erros.

Esta aceitação valida a mudança 5.6D. Não se afirma ter repetido agora a auditoria completa de todos os botões de Fleet, Drivers, Documents ou Settings, nem novos testes de todos os tamanhos desktop: isso pertencia ao pedido anterior de auditoria e não foi necessário à correção de domínio atual.

## L. REMAINING UNCERTAINTY

- J-4198: registar número real de eixos e altura real no primeiro eixo da viatura é necessário para estabelecer a definição base VCI. As propriedades legais dos perfis genéricos não substituem esses registos.
- Autorizações, categoria do proprietário e municípios das paragens continuam desconhecidos onde não foram registados. Só prova afirmativa válida concede a respetiva isenção.
- Margens ETA, fronteiras 07:00/21:00, feriados e direção/geometria insuficiente continuam a poder causar UNKNOWN da base.
- Mapeamento VCI é uma interpretação documentada, não uma linha legal levantada por autoridade; mantém caveats existentes.
- A cobertura real continua parcial, com fontes desatualizadas, municípios sem fontes e ZAR do Porto conhecida mas não codificada. Uma rota sem conflitos com regras aceites não é garantia de cobertura nacional.
- Não foi alargada cobertura PT/ES nem resolvida ambiguidade legal por inferência. Candidatos não aceites continuam por rever.

Recomendação operacional: completar os dados legais da viatura e registar documentos que efetivamente sustentem isenções. A prioridade desta fase é distinguir honestamente a ausência desses dados. Questões futuras de ingestão/UX e otimização do chunk de mapas ficam fora desta alteração.

## M. NO-HACK CONFIRMATION

Não existe nova ramificação de produção específica da VCI, Porto, J-4198 ou Amadora–Porto. O teste pesquisa explicitamente esses identificadores em evaluate.ts, applicability.ts e routeDecision.ts. A única identificação da VCI em código alterado está no registo curado de conhecimento e nos fixtures DEV de regressão. O combinador depende exclusivamente da base, estatuto legal e resultados estruturados de exceção.

A proibição obrigatória estabelecida com isenção por demonstrar é excluída; base genuinamente incerta permanece UNKNOWN; isenção positiva funciona; o comportamento é genérico; a regressão 5.6C e as verificações passaram.

FLEETOS RESTRICTION APPLICABILITY HARDENED: YES
