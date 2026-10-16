# FleetOS — o ambiente completo: páginas, ligações, mapa e o que vem a seguir

Laboratório DEV `/__dev/fleetos-environment`, estado a 7 out 2026 (5.7J + correções de uma só lente e ligações na operação).
Fontes: o código do laboratório, o motor de rotas de produção e o **Álbum de navegação** (`Downloads/FleetOS-Album-de-Navegacao-2026-10-07.pdf`, 182 fotografias, feito sobre a versão 5.7I/J antes das últimas correções).

---

## 1. O modelo que governa tudo

Um único ecrã. Nada navega para outra página: o estado muda e a composição reorganiza-se.

| Conceito | O que é | Onde vive |
|---|---|---|
| **Âncora** | `operação` (nenhum transporte) ou um transporte `J-42xx` | `GuidedState.anchor` |
| **Lentes ativas** | Transportes, Motorista, Viatura, Percurso e paragens, Restrições, Documentos (+ Economia/Conformidade DEV) | `active[]` |
| **Lead** | A lente que faz a pergunta principal | `lead` |
| **Seleções** | paragem, documento, restrição, recurso; limpas quando deixam de ser relevantes | `selection` + `selectionLog` |
| **Pergunta espacial** | o que o mapa responde (10 perguntas) | `spatial` |
| **Takeover temporário** | mapa, segmento, documento, posto, recurso | `takeover` |
| **Foco** | aspeto da viatura (carga/restrições/combustível) e peça | `focus` |
| **Alteração pendente** | troca de paragem ou reemissão de CMR à espera de Confirmar | `pending` |
| **Histórico** | cada ação guarda o frame (estado, composição, câmara, scroll); Esc volta exatamente | `history[]` |

Regras de ligação atuais:
- **Com transporte:** clicar uma lente *acrescenta contexto*; Expandir *muda a pergunta*. Uma lente sozinha passa a lead.
- **Sem transporte (operação):** a última lente clicada é a perspetiva; as outras anotam cada linha. Clicar numa linha entra nesse transporte com a lente atual como lead.

---

## 2. Inventário de todas as páginas (superfícies)

### 2.1 Moldura permanente
| Elemento | Conteúdo | Controlos → efeito |
|---|---|---|
| **Faixa de âncora** | Operação: contagens de bloqueio/ação/risco, perspetiva e lentes de contexto. Transporte: ID, rota, cliente, estado, SLA, plano, prioridade, lead + lentes, relógio | Em takeover: «Voltar · Esc» |
| **Rail** | 4 grupos: Operação (Transportes, *Planear reservado*), Recursos (Motorista, Viatura, *Reboque reservado*), Percurso (Percurso e paragens, Restrições), Garantia (Documentos, *Conformidade reservado*). Ponto = ativa, preenchido = lead | Clicar = ativar/desativar lente · Mapa = pedir geografia · Seta = Esc |
| **Legenda do mapa** | Pergunta espacial atual + detalhe | Mudar (menu de perguntas) · Auto · Enquadrar · Expandir |
| **Gaveta DEV** | Matriz de transições, sistema de honestidade, 8 lentes, exceção de condução, base desatualizada, Economia/Conformidade, trocar T-08/T-18, restaurar base | Só laboratório |
| **Barra pendente** | O que muda, consequências, eventos, aceitar incerteza | Cancelar / Confirmar |

### 2.2 Sem transporte (operação)
| Página | Quando aparece | O que mostra | Ligações |
|---|---|---|---|
| **Base de atenção** | Nenhuma lente | Bloqueios, ação necessária, risco (o quê, porquê, se ninguém agir, próximo passo) + em curso + mapa da frota | Linha de atenção → transporte com lente e lead certos · Em curso → Visão do transporte · hover realça a rota |
| **Todos os transportes** | Transportes (perspetiva) | Tabela: paragens/janelas, estado, plano, prazo, carga, ADR/frio, bloqueios + coluna Contexto das outras lentes | Linha → Visão do transporte |
| **Todos os motoristas** | Motorista | 6 dias no mesmo eixo, agora, limites 4h30, habilitações | Linha → dia do motorista no seu transporte |
| **Toda a frota** | Viatura | Alçados com carga, estado, combustível manual, factos em falta | Cartão → viatura no transporte |
| **Viagens em curso** | Percurso | 3 viagens com posição, janela de pausa, paragens | Linha → Percurso desse transporte |
| **Restrições por transporte** | Restrições | 8 linhas: transporte, regra, veredito, razão | Linha → lógica da restrição *(ver bug B7)* |
| **Registo documental** | Documentos | CMR e fatura por transporte | Linha → dossier *(ver bug B5)* |

### 2.3 Com transporte
| Página (lead) | Instrumento | Ligações que saem |
|---|---|---|
| **Visão do transporte** (sem lead) | Ciclo de vida, faixa de paragens, Começou/Agora/A seguir/Ameaças/Decidir | Ameaças → Restrições/Documentos(leitura)/Motorista · Decidir → Percurso · paragem → Percurso |
| **Motorista** | Dia contínuo (passado, agora, futuro, incerto), regra 4h30, momentos com apoios, contadores UE 561, habilitações, conjunto | Momentos → Percurso/Viatura/Documentos/Restrições · Comparar paragens · Conjunto → Viatura |
| **Viatura** | Alçado técnico, plano de carga, separadores Carga/Restrições/Combustível, condições presas a peças, leituras, especificação | Peça/condição → foco · Ver lógica → Restrições · 1.º eixo em falta → foco |
| **Percurso e paragens** | Camadas (Motorista, Viatura, Rota, Estrada, Entrega) num eixo de km + tabela de candidatos | Paragem → seleção · Usar → alteração pendente · Restrição → seleção · Ver restrição |
| **Restrições** | Cadeia causal factos → condições → exceção → veredito → consequência, factos em falta, evidência, outras condições | Condição com peça → foco na viatura · Outra condição → seleção · Mapa do troço |
| **Documentos** | Requisitos, snapshot vs atual (diff + histórico ligado), CMR com caixas numeradas, intervenientes | Documento → pré-visualização · Abrir → leitura · Preparar reemissão → pendente · Motorista/Viatura |
| **Apoios** (qualquer lead) | Coluna de factos por lente (sem cabeçalho), linhas de consequência | Expandir/Remover ao passar o rato · factos clicáveis |

### 2.4 Takeovers (os «modais» atuais)
| Takeover | Abre de | Conteúdo | Saída |
|---|---|---|---|
| Mapa ampliado | Expandir no mapa | Só o mapa no canvas inteiro | Voltar / Esc |
| Segmento | Mapa de restrição | Troço + alternativa CREP | Voltar / Esc |
| Leitura de documento | Abrir documento | Papel em grande + diff + histórico | Voltar / Esc |
| Posto | (superfície 5.7H antiga `StationDetail`) | detalhe do posto | Voltar / Esc |
| Recurso | (antigo) | Motorista/Viatura | Voltar / Esc |
| Foco na viatura | condição/peça | mesma viatura, peça destacada | Esc |

---

## 3. O que o álbum encontrou — estado atual

| # | Problema (fotos) | Causa no código | Estado |
|---|---|---|---|
| B1 | Ações prometem formulários que não existem: atribuir reboque, replanear, reatribuir, agendar renovação (002–012) | Não há modelo de edição; as entradas só abrem análise | **Aberto** — falta o modelo de edição |
| B2 | «null km desde a leitura» (002, 120) | `TruckInstrument` usa `job.positionKm` que é `null` em transportes sem posição | **Corrigido** — «sem estimativa» sem posição; sem marcador «simulada» no mapa |
| B3 | J-4222: reboque PT-3302 em falta mas mostra PT-3821 (002) | `TRAILERS[id] ?? TRAILERS["PT-3821"]` faz *fallback* silencioso | **Corrigido** — `trailerWorld()` devolve null; vista de bloqueio |
| B4 | Viatura em manutenção aparece «disponível» (009) | Texto fixo «disponibilidade manual: disponível» | **Corrigido** — disponibilidade e leituras por viatura |
| B5 | Dossier de outros transportes repete Iberia/Miguel/22→24 e diz «em ordem» (013, 138–142) | `ledger()`, `SNAPSHOT_DIFF`, `DOC_EVENTS` e o papel são do J-4217 | **Corrigido** — registo, diff, eventos e papel por transporte |
| B6 | Ligação diz «VCI» mas abre o gabarito; «Combustível da viatura» abre Restrições (071, 072, 085) | Ligações fazem `expand` sem passar a entidade/aspeto; herdam a seleção anterior | **Corrigido** — ação `open` com entidade exata |
| B7 | Linha «Obras A1»/«Gabarito» na coleção abre a VCI (129, 130) | `enter` não leva `restriction id` | **Corrigido** — `enter` leva a restrição |
| B8 | Agenda dos motoristas misturava viagens (007, 109–115) | `driverWorld` era um molde do J-4217 | **Corrigido** (dia por transporte) |
| B9 | Percurso de J-4219/J-4221 mostra Faro-Coimbra e pausa 10:50 (125, 126) | `RouteInstrument` tem lugares, bandas e texto fixos do J-4217 | **Corrigido** — eixo, bandas e textos por transporte |
| B10 | Troca para Aveiras: cabeçalho fica «Planeado» e a agenda mantém horários de Santarém (026, 069) | `commit` não muda `job.plan` nem recalcula tempos; tempos são constantes | **Corrigido no laboratório** — re-tempo a partir da paragem; motor real fica para a fase seguinte |
| B11 | Clique em Aveiras na faixa estreita seleciona Santarém (022) | Alvos sobrepostos a 1199 px | **Corrigido** — legendas curtas, linhas sem colisão, rótulos ancorados nas margens |
| B12 | A1 «aplica-se» a 6 out com validade a partir de 8 out (061) | Facto fixo `outcome: "yes"` | **Corrigido** — «não se aplica hoje» |
| B13 | SLA ok com 5 h 40 de atraso (005); CMR «em falta» aparece emitida (013) | Fixtures incoerentes | **Corrigido** — SLA em risco; CMR em falta/rascunho coerentes |
| B14 | Factos e condições só recebem foco (035–048, 062–065) | Não há detalhe de facto nem distinção consulta/edição | **Corrigido** (consulta) — cada facto abre a sua origem; edição fica com B1 |
| B15 | Mapa da frota expandido + seta não devolve a lista (149) | A verificar com o histórico da base | **Corrigido** — «ajustar» já não entra no histórico |
| B16 | 8 lentes mostram só o overview (150) | Na âncora com Transportes, os apoios ficam inline | **Corrigido** — lente única passa a principal |
| B17 | Mapa vazio em várias fotos (091, 099, 119, 131) | Tiles ainda a carregar durante a câmara | **Corrigido** — estado «A carregar mapa…» |
| B18 | Clicar só numa lente mostrava 2 linhas; 2.ª lente não mudava nada | — | **Corrigido** (vistas da operação + ligações) |
| B19 | Mapa a preto e branco | dessaturação excessiva | **Corrigido** |

---

## 4. Mapa, rotas e tempos — a verdade sobre o que existe

### 4.1 O que o laboratório faz hoje (é básico)
- **Geometria:** 6 rotas TomTom **gravadas** (fixtures de 30 set). Bom: as linhas seguem a estrada. Mas são estáticas — nunca são pedidas, recalculadas nem comparadas.
- **Posição:** um km fixo por transporte (`positionKm`), interpolado sobre a linha. Sem movimento, sem velocidade.
- **Tempos:** **escritos à mão.** ETA de Coimbra 12:57, Porto 15:12, pausa 10:32, limite 10:50 são constantes. Trocar de paragem não muda nenhum tempo a jusante (B10).
- **Paragens candidatas:** pontos sintéticos sobre a rota num km fixo; o «desvio» é uma espora de 3 pontos em linha reta («referência, não calculado»).
- **Restrições:** VCI, CREP e IP3 são geometria OSM real; A1 e Campanhã usam **um troço da própria rota** apresentado como «geometria registada» — tem de ser marcado como ilustrativo.
- **Camadas do mapa:** rota, troço feito, segmento, alternativa tracejada, círculos de candidatos, marcador da viatura «simulada», pontos da frota. **Não há:** etiquetas de paragens/ETA no mapa, setas de sentido, marcas de km, zonas de pausa, trânsito, alternativas de rota, cartões ao passar o rato, clusters.
- **Câmara:** enquadra pontos da pergunta espacial; coreografia sincronizada com a composição. Problema: tiles vazios durante movimentos longos.
- **Takeover de mapa:** só mapa; perde a informação que motivou a pergunta (álbum 088).

### 4.2 O que a produção já tem e o laboratório não usa
| Peça de produção | O que dá | Onde |
|---|---|---|
| `planRouteOptions` / `planStrategyRoute` | Routing TomTom de camião com **alternativas**, trânsito, portagens (pagas/estimadas), combustível, pernas, chegada, estradas | `tomtom/planRoutes.ts` (1028 linhas) |
| `estimatePointTimes` | **Tempo em cada ponto** da linha a partir das durações por perna | `regulations/geometry.ts` |
| `buildRouteTiming` + `getPassageWindow` | Linha temporal com **pausas/repousos UE 561**, margens crescentes, janela de passagem num troço | `regulations/timeline.ts` |
| `planStops`, `simulateDrivingSchedule`, `evaluateEuDrivingRules` | Onde a pausa cai, infrações | `ops/` |
| `matchRouteAlongLines`, `routeIndexOf` | Saber se a rota **passa** numa geometria de restrição e entre que posições | `regulations/geometry.ts` |
| `evaluate`, `reviewAlternatives`, `avoidancePlan` | Veredito por rota, revisão de alternativas, retângulos a evitar | `regulations/` |
| `solveStrategy`, `tomtomRoutingProvider` | Re-routing iterativo a evitar restrições (≤10 retângulos) | `solver/` |
| `TRUCK_PRESETS` | Perfis de camião para o routing | `tomtom/truckPresets.ts` |
| Fixtures `fastest` **e** `no_tolls` | **Duas rotas por par** (18 pares) já gravadas — alternativas offline | `regulations/__fixtures__/routeMatrix` |
| `TOMTOM.trafficFlow` | URL de tiles de fluxo de trânsito | `tomtom/config.ts` |

**Conclusão:** o laboratório desenha bem, mas o tempo e a rota são fixos. A produção já sabe calcular tempo por ponto, pausas legais, alternativas e aplicabilidade sobre geometria. Ligar isto ao laboratório (via adaptador DEV, com fixtures por defeito) resolve B9, B10 e B12 de raiz e torna o mapa vivo.

---

## 5. Proposta para a próxima fase — «Motor de percurso no laboratório»

Ordem pensada para cada passo desbloquear o seguinte.

### P1. Coerência de dados (curto, obrigatório)
B2, B3, B4, B5, B6, B7, B9, B12, B13: cada instrumento lê **apenas** o transporte âncora; sem *fallbacks* silenciosos (reboque inexistente aparece como bloqueio); ligações passam a entidade e o aspeto (VCI → RI-042, Combustível → `focus fuel`); dossier, diff e papel gerados por transporte.

### P2. Motor de tempo (o coração)
- Por transporte: `buildRouteTiming(fixture.points, legs, depart, driverState)` → tempo em cada ponto.
- Tudo derivado daí: posição agora, ETA de cada paragem, onde cai a pausa 4h30, folga de janela, «sem combustível ~km».
- Trocar de paragem **recalcula** tudo e muda o plano para «A replanear» (B10).
- Restrições temporais via `getPassageWindow` (resolve B12: A1 só a partir de 8 out).

### P3. Engenharia de rota
- **Alternativas reais:** `fastest` vs `no_tolls` dos fixtures (e, opcional, TomTom ao vivo atrás de uma chave DEV com cache) — distância, tempo, portagens, combustível, veredito de restrições por rota.
- **Desvios calculados:** rota até ao posto e regresso, em vez da espora reta.
- **Aplicabilidade geométrica:** `matchRouteAlongLines` diz se e onde a rota passa na VCI/IP3; troços sem geometria oficial ficam marcados «ilustrativo».
- **Evitar restrição:** mostrar a rota CREP como alternativa calculada, não só tracejado decorativo.
- Isto prepara o lead **Planear** (comparar rotas A/B/C em eixos comuns).

### P4. Mapa como instrumento
- Camadas com hierarquia por pergunta: etiquetas de paragens com ETA, marcas de km, sentido, troço feito vs futuro com hora, zona de pausa legal sobre a estrada, alternativas coloridas, trânsito opcional.
- Interação: passar o rato na estrada mostra km/hora/estado; clicar num posto/troço abre o seu detalhe; sincronização total mapa ↔ faixa ↔ tabela.
- Estado de carregamento honesto (B17) e frota com etiquetas/clusters.

### P5. Modais com intenção (takeovers)
- **Mapa ampliado com painel lateral** que mantém a pergunta (paragens, troço, alternativas) — não só mapa (álbum 088).
- **Comparar rotas** (takeover de decisão), **detalhe de posto/troço**, **detalhe de facto** (origem, data, quem registou).
- **Modelo de edição** (B1, B14): consultar vs editar distinguidos; registar um facto em falta (altura ao 1.º eixo, habilitação VCI) a partir da própria condição; atribuir reboque/viatura/motorista a partir da atenção; tudo pela barra pendente com consequências e eventos.

### P6. Composição
- 8 lentes com transporte (B16), retorno após mapa da base (B15), alvos a 1199 (B11).

---

## 6. Decisões que precisas de tomar

1. **TomTom ao vivo no laboratório?** Fixtures por defeito (determinístico, offline) + chamadas reais opcionais com cache, ou só fixtures.
2. **Editar já ou só mais tarde?** O álbum mostra que as ações de entrada criam expectativa de resolução; sem edição, a base de atenção promete demais.
3. **Planear como lead** depois de P3 — já haverá alternativas e tempos reais para comparar.
4. **Ordem:** recomendação P1 → P2 → P3 → P4 → P5, com P1+P2 juntos numa fase (é o que torna tudo coerente).
