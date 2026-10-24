# Atribuição de serviços v2 — pesquisa, banco de testes e desenho

Outubro 2026. Backend. Substitui a pesquisa do planeador atual (`src/domain/planning/planner.ts`); as verificações que ele já faz (carga, ADR, frio, carta, regras na rota) continuam a ser usadas.

## 1. Que problema é

Cargas completas (um reboque, uma carga), cada uma com janela de carga e de descarga, distribuídas por equipas (camião + motorista + reboque) durante uma semana. Cada equipa sai de casa na segunda e tem de voltar até sábado para o descanso semanal. O objetivo é fazer o máximo de cargas com o mínimo de quilómetros vazios, cumprindo:

- **Reg. 561/2006**: pausa de 45 min a cada 4h30 de condução; 9 h por dia (10 h duas vezes por semana); 11 h de descanso diário dentro de 24 h; 56 h por semana; 90 h em duas semanas.
- **Dir. 2002/15** (DL 237/2007): não mais de 6 h de trabalho seguido; 60 h de trabalho por semana; máximo de 10 h de trabalho num dia com trabalho noturno.
- **Pacote de Mobilidade**: no máximo 3 operações de cabotagem em Espanha em 7 dias, e só depois de uma entrega internacional; descanso semanal regular fora da cabine; motorista em casa pelo menos a cada 4 semanas; camião de volta ao país a cada 8 semanas.

Na literatura chama-se *full truckload pickup and delivery with time windows*. O objetivo clássico é minimizar o movimento em vazio: Gronalt, Hartl e Reimann (2003) usam heurísticas de *savings*. Juntar as regras de condução da UE às rotas é tema estudado (Goel; Kok e outros). Um estudo mostrou que ignorar as regras completas obriga a mais 3,9 % de rotas.

## 2. Opções de solver

| Opção | Licença | Notas |
|---|---|---|
| VROOM | BSD-2 | C++, muito rápido, faz *shipments* (recolha e entrega) e janelas; pode ficar preso em soluções medianas |
| PyVRP | MIT | Melhor qualidade em VRPTW (1.º no DIMACS 2021), mas não faz *shipments* |
| jsprit | Apache-2.0 | Java, da equipa do GraphHopper; faz recolha e entrega; lento acima de ~1000 pontos |
| OR-Tools / Timefold | Apache-2.0 | Genéricos; nenhum trata o 561/2006 completo |

**Decisão:** escrever a pesquisa em TypeScript, como fizemos com as regras de rota. Nenhum destes trata as regras da UE, o regresso a casa e a cabotagem como nós precisamos. Seria preciso traduzir tudo para eles e confirmar depois na mesma, e a dependência deixava de ser baixa. Ficam como referência para comparar a qualidade, se for preciso.

## 3. Banco de testes (`src/assignment/`)

- `model.ts`: modelo simples, com equipa, carga e estimativa de viagem (linha reta × 1,25 a 72 km/h, igual à simulação semanal).
- `crewSchedule.ts`: tempos de uma equipa a fazer cargas por ordem, com as regras acima. É rápido para ser usado dentro da pesquisa.
- `bench/bragancaInstance.ts`: semanas de uma transportadora de Trás-os-Montes.
  - Tamanhos: S = 10 equipas e 45 cargas; M = 30 e 135; L = 100 e 450.
  - Equipas: 60 % em Bragança, 25 % em Mirandela, 15 % em Macedo; 20 % são de frio.
  - Cargas: um terço sai da região, um terço volta a ela e o resto anda entre polos ibéricos (alguns são cabotagem).
  - Os dados são gerados e não são dados de mercado. Os preços são 150 € + 1,30 €/km; o custo é 0,77 €/km.
- `bench/evaluate.ts`: volta a calcular os tempos de cada rota de raiz e audita a semana de cada motorista com o verificador legal independente (`src/legal/driverLegality.ts`).
- `greedy.ts`: linhas de base de despachante. Pega nas cargas por ordem de recolha e dá cada uma à equipa compatível *mais perto* ou à *primeira livre*.
- `bench/legacyPlanner.ts`: o planeador atual com as mesmas estradas sintéticas.
- Como correr: `BENCH=1 npx vitest run src/assignment/__tests__/bench.probe.test.ts`. Com `BENCH_LEGACY=1` também corre o planeador atual (lento, só no S). Com `BENCH_OUT=ficheiro.json` grava os resultados.

### Linha de base (24 out 2026)

| Semana | Método | Atribuídas | Km vazios | Margem | Infrações | Tempo |
|---|---|---|---|---|---|---|
| S | planeador atual | **18/45** | 43,1 % | 2 406 € | 2 rotas inviáveis*, 7 equipas trocadas | **138 s** |
| S | despachante: primeira livre | 31/45 | 47,7 % | 2 984 € | 0 | 0,04 s |
| S | despachante: mais perto | 33/45 | 42,9 % | 4 459 € | 0 | 0,01 s |
| M | despachante: primeira livre | 94/135 | 46,5 % | 9 650 € | 0 | 0,05 s |
| M | despachante: mais perto | 98/135 | 34,6 % | 18 704 € | 0 | 0,04 s |
| L | despachante: primeira livre | 383/450 | 45,8 % | 42 693 € | 0 | 0,3 s |
| L | despachante: mais perto | 399/450 | 28,1 % | 88 894 € | 0 | 0,3 s |

\* O planeador atual não planeia a volta a casa nem mantém as equipas juntas. Faz menos de metade das cargas que uma regra simples de despachante e demora mais de dois minutos.

Os km vazios são altos porque Trás-os-Montes é longe dos polos e o regresso a casa ao sábado conta como vazio. A média da UE em 2023 foi 21,8 % (Eurostat).

A primeira versão do simulador deixou passar trabalho noturno acima de 10 h e uma semana com mais de 60 h de trabalho. A auditoria independente apanhou ambos e as duas regras foram acrescentadas; agora não há infrações.

## 4. Desenho da v2

1. **A unidade é a equipa.** Camião, motorista e reboque andam juntos; trocas só como opção explícita.
2. **Construção por arrependimento (*regret insertion*).** Para cada carga por atribuir, calcula-se a melhor e a segunda melhor inserção em qualquer posição de qualquer equipa, não só no fim. Entra primeiro a carga que mais se perde se ficar para depois.
3. **Melhoria com *ruin & recreate*** (a técnica do jsprit e do VROOM): tirar um grupo de cargas relacionadas (perto no espaço e no tempo, ou de uma equipa) e voltar a inseri-las. Juntam-se movimentos de trocar e mudar entre equipas. Tudo com semente fixa e orçamento de tempo, para dar sempre o mesmo resultado.
4. **Objetivo:** margem (receita − €/km × km), com penalização forte por carga obrigatória não feita e desempate por km vazios. As cargas contratadas podem ser marcadas como obrigatórias.
5. **Verificação final:** a rota de cada equipa passa pelo nosso motor (GraphHopper) e pela avaliação de regras existente, com camião, motorista, reboque e ordem já fixos.
6. **Metas no banco:** L em menos de 30 s; mais cargas atribuídas e menos km vazios que o "despachante: mais perto"; zero infrações na auditoria.

## 5. Primeira versão da v2 (`src/assignment/solver.ts`, 24 out 2026)

Começa da melhor de duas soluções: a inserção por arrependimento ou o despachante "mais perto". Depois faz 1000 iterações de *ruin & recreate*, com quatro formas de tirar cargas: relacionadas, semanas inteiras, as pior colocadas e ao acaso. Aceita pioras pequenas por arrefecimento simulado e tem limite de 30 s.

| Semana | Limite* | Despachante "mais perto" | **v2** | Diferença |
|---|---|---|---|---|
| S (10 equipas) | 39/45 | 33 cargas · 42,9 % vazio · 4 459 € | **34 · 36,6 % · 5 996 €** (0,9 s) | +1 carga, −6,3 pp vazio, +34 % margem |
| M (30 equipas) | 122/135 | 98 · 34,6 % · 18 704 € | **100 · 30,7 % · 21 312 €** (3,9 s) | +2 cargas, −3,9 pp vazio, +14 % margem |
| L (100 equipas) | 421/450 | 399 · 28,1 % · 88 894 € | **410 · 28,0 % · 91 959 €** (24,6 s) | +11 cargas, igual em vazio, +3,4 % margem |

\* Cargas que pelo menos uma equipa conseguiria fazer sozinha na semana. É um limite folgado, porque ignora quantas cargas cabem na semana de cada equipa.

- Zero infrações e zero rotas inviáveis na auditoria independente.
- Dá sempre o mesmo resultado para a mesma semente.
- A inserção por arrependimento sozinha não ganha ao despachante: o ganho vem do *ruin & recreate*.
- Uma poda que só considerava as 25 equipas mais perto piorou o resultado e foi retirada. No início da semana estão todas em casa, à mesma distância.
- Testes: `src/assignment/solver.test.ts`. Na semana S, a v2 tem de fazer pelo menos as cargas do despachante, com mais margem, menos km vazios e de forma determinística.

**O que medimos sobre o regresso a casa:** com o despachante, a maioria das equipas chega a casa na quinta ou na sexta. O regresso é 40–60 % de todos os km vazios. A próxima melhoria grande é dar prioridade a uma carga de retorno para a região na quinta ou na sexta.

## 6. Testes para tentar partir a v2 (24 out 2026)

| Nível | Teste | Resultado |
|---|---|---|
| Ótimo | 60 semanas pequenas (2–4 equipas, 8–10 cargas), ótimo exato por enumeração (`bench/exact.ts`) | **Ótimo em 59/60**; na outra perde 27 € e nenhuma carga. O despachante chega ao ótimo em 16/60, com 413 € a menos em média. A primeira versão da v2 só chegava ao ótimo em 50/60: faltava reconstruir por ordem aleatória, e isso foi corrigido. |
| 1 | Armadilha do "mais perto": a equipa mais perto fica com a carga e outra fica por fazer | O despachante faz 1 carga, a v2 faz as 2 |
| 1 | Carga de retorno à sexta, contra uma mais bem paga que deixa a equipa longe de casa | Escolhe a de retorno |
| 1 | Janelas apertadas que só dão numa ordem | Encontra a ordem certa, que é o ótimo |
| 2 | Cabotagem: antes da entrega internacional, ou mais de 3 | Nunca acontece |
| 2 | Frio escasso | Cargas de frio só na equipa de frio, igual ao ótimo |
| 2 | Motorista já com 54 h na semana | Só recebe a carga curta |
| 2 | Começar a meio do turno, com 4 h seguidas de condução | Pausa nos primeiros 30 min |
| 3 | Nada possível; semana sem equipas ou sem cargas | Não rebenta |
| 3 | Dados partidos: janelas invertidas, coordenadas em falta, entrega antes da recolha, preço negativo | Nunca são planeados. Antes só passava por sorte (custos NaN); agora há uma validação explícita, `isPlannableLoad` |
| 3 | 40 equipas e 40 cargas iguais | Todas feitas, depressa |
| 3 | Semanas com mudança de hora (26 out 2026, 29 mar 2027) | Legal |
| Fuzz | 400 semanas aleatórias: 0–12 equipas, 0–50 cargas, 5 % de dados partidos, motoristas cansados, equipas fora de casa | Todas as invariantes passam. O fuzz encontrou **2 bugs**, já corrigidos: (1) uma equipa parada fora de casa era contada de forma diferente no solver e na pontuação; (2) um crash quando uma equipa nem vazia consegue chegar a casa a tempo |
| Monte Carlo | 30 semanas S e 15 semanas M contra o despachante | S: ganha 28/30, +1,7 cargas, −2,5 pp vazio, +16,8 % de margem. M: ganha 15/15, +3,7 cargas, −2,1 pp vazio, +10,2 % de margem. Nas 2 semanas S em que perde margem, faz mais cargas |
| Escala | 300 equipas e 1 350 cargas | 17,8 s, +17 cargas, +2 % de margem, sem infrações |
| Estradas reais | Matriz de camião do nosso motor (GraphHopper truck3) entre os 23 polos (`bench/hubMatrix.truck3.json`) | Ver abaixo |

**Estradas reais.** O modelo sintético (linha reta × 1,25 a 72 km/h) acerta na média (km × 1,03, tempo × 0,97), mas falha muito em percursos concretos: o tempo vai de ×0,73 a **×1,97**.

- Um plano feito com o modelo sintético e depois cronometrado com tempos reais **parte-se**: 1, 4 e 11 semanas de equipas ficam impossíveis em S, M e L.
- Por isso a atribuição tem de planear sempre com tempos reais do motor (matriz em cache) e deixar folga.
- Planeando com tempos reais, a v2 ganha ao despachante nas três:

| Semana | Despachante | v2 |
|---|---|---|
| S | 33 · 39,5 % · 5 239 € | **35 · 37,4 % · 6 017 €** |
| M | 103 · 36,2 % · 18 857 € | **105 · 32,8 % · 21 456 €** |
| L | 399 · 29,2 % · 87 421 € | **410 · 28,6 % · 91 291 €** (atingiu o limite de 30 s) |

Como correr os testes para partir a v2:
- Sempre que se correm os testes: `traps.test.ts` e `fuzz.test.ts` (com `FUZZ_N=400` corre mais semanas).
- Opcionais, à mão:
  - `GAP=1 … gap.probe.test.ts`
  - `MC=1 … montecarlo.probe.test.ts`
  - `REAL=1 … realroads.probe.test.ts`
  - `BENCH=1 … bench.probe.test.ts`

## 7. Tempos reais com folga, e combustível (24 out 2026)

Novo: `travelMatrix.ts` (tabela de tempos do motor, pedida uma vez por plano, com fallback conservador contado), `costs.ts` (custo da semana com gasóleo comprado onde é mais barato ao longo do caminho), preços reais de hoje da DGEG e do MITECO à volta de cada polo (`bench/hubFuelPrices.json`, gravados com `scripts/build-hub-fuel-prices.mts`). O gasóleo mediano de hoje: Portugal 2,259 €/L, Espanha 1,919 €/L, ou seja 0,34 €/L a menos em Espanha.

**A) Folga contra dias reais.** Planos feitos com tempos reais do motor mais uma folga, depois conduzidos em 10 "dias reais" em que cada percurso varia (±12 % e 1 em 10 com +30 %). Este modelo de variação é inventado, não medido.

| Folga | S: semanas partidas em 10 dias | S: margem | M: semanas partidas em 10 dias | M: margem |
|---|---|---|---|---|
| 0 % | 10 | 6 719 € | 45 | 21 856 € |
| 5 % | 9 | 6 398 € | 40 | 21 573 € |
| 10 % | 3 | 6 238 € | 23 | 21 916 € |
| 15 % | 2 | 6 219 € | 7 | 20 928 € |
| 20 % | 1 | 6 198 € | 14 | 19 808 € |

- Sem folga, quase todas as semanas partem-se. Com 10–15 % ficam poucas. A folga custa 4–7 % de margem.
- A M a 20 % partiu mais que a 15 %: com muita folga o plano enche a semana com viagens mais longas, e é um sinal de que a folga sozinha não resolve.
- Conclusão: usar 10–15 % de folga e **replanear quando um atraso acontece**, em vez de depender só da folga.

**B) Combustível.** Camião de 40 t com depósito de 900 L, reserva de 90 L, 34 L/100 km em carga e 26 L/100 km em vazio. O despachante e as duas versões da v2 foram medidos nos mesmos preços reais.

| Semana | Método | Cargas | Margem | Gasóleo | Gasóleo se abastecesse sem estratégia |
|---|---|---|---|---|---|
| S | despachante | 33 | 5 157 € | 10 274 € | 11 623 € |
| S | v2 sem saber do gasóleo | 34 | 6 037 € | 10 192 € | 11 308 € |
| S | v2 a saber onde abastece | 34 | 6 243 € | 9 979 € | 11 407 € |
| M | despachante | 96 | 18 350 € | 32 485 € | 34 950 € |
| M | v2 sem saber do gasóleo | 102 | 21 582 € | 31 991 € | 34 703 € |
| M | v2 a saber onde abastece | 102 | 21 376 € | 31 681 € | 34 398 € |
| L | despachante | 387 | 86 473 € | 106 767 € | 117 495 € |
| L | v2 sem saber do gasóleo | 397 | 89 553 € | 110 598 € | 121 000 € |
| L | v2 a saber onde abastece | 395 | 89 545 € | 110 043 € | 120 683 € |

- **O ganho vem da estratégia de abastecimento, não da atribuição.** Abastecer onde é mais barato ao longo do caminho poupa 8–13 % do gasóleo contra abastecer sem estratégia: 1 400 € na S, 2 700 € na M e 10 600 € por semana na L (100 camiões).
- **Saber do gasóleo na atribuição quase não acrescenta nada neste teste:** +206 € na S, −206 € na M e −8 € na L, ou seja, ruído. Cada equipa já passa por Espanha nas suas cargas e a estratégia abastece lá de qualquer forma.
- A estimativa que fiz antes, de cerca de 8 500 € por semana, estava certa na ordem de grandeza, mas esse ganho vem do planeador de abastecimento, que já existe (`fuelPlanning/refuelPlanner.ts`), e não da atribuição.
- Limites: só se abastece nos sítios onde a equipa pára (partida, recolhas, entregas, casa), e não nas bombas ao longo do percurso; os preços são medianas por polo e não de bombas concretas; o depósito e os consumos são suposições.

## 8. Para um despachante real: fixações, cargas contratadas e replanear (24 out 2026)

Novo: `constraints.ts` (fixações), `replan.ts` (replanear a partir do plano atual) e, em `crewSchedule.ts`, a razão de cada falha, os atrasos e o camião parado. **Todos os números abaixo são de semanas geradas** (as de Bragança da secção 3 e semanas aleatórias), com o modelo de estradas sintético, salvo onde se diz "estradas reais" (a matriz gravada do nosso motor). Não são dados de clientes.

### 8.1 Fixações do despachante

Três tipos (`Pin` em `model.ts`), passados em `solveWeek(inst, { pins })`:

- `assign`: esta carga é desta equipa;
- `forbid`: esta equipa não faz esta carga;
- `sequence`: estas cargas são desta equipa e ficam por esta ordem (outras cargas podem ficar no meio).

Como funciona: antes da pesquisa, as cargas fixadas de cada equipa formam um **esqueleto** (com a melhor ordem viável que respeita as sequências, procurada por enumeração com poda). A pesquisa nunca tira uma carga do esqueleto e só insere outras à volta. Por isso, as fixações valem por construção e não por penalização.

Quando uma fixação não pode valer, o plano diz porquê (`pinIssues`) e a carga **fica por fazer**: nunca é dada, em silêncio, a outra equipa. Os casos:

- contradições: uma carga fixada a duas equipas, fixada e proibida à mesma equipa, ou ordens que fazem um ciclo;
- fixações a uma equipa ou carga que não existe (são reportadas e não mudam mais nada);
- uma carga que já está a ser feita por outra equipa (ao replanear);
- uma semana impossível, com a regra e as horas. Exemplos de textos produzidos pelos testes: "A não consegue fazer sev: chega tarde à recolha (seg 15:21; a janela fecha seg 09:00)", "passa das 56 h de condução na semana", "A não consegue fazer sexta: não chega a casa a tempo do descanso semanal (dom 01:42; limite sáb 14:00)".

`checkPins` volta a verificar um plano acabado contra as fixações, de forma independente, e todos os testes o usam.

### 8.2 Cargas contratadas (obrigatórias) e *spot* (opcionais)

`Load.mandatory = true` marca uma carga contratada. Ficar por fazer custa-lhe 100 000 € a mais na pesquisa, mais do que qualquer conjunto de cargas *spot* pode valer. No fim há uma **reparação**: para cada contratada por fazer, tenta-se pô-la na semana de uma equipa tirando-lhe uma, ou todas, as cargas *spot* (que voltam para onde couberem), ou mudando uma outra contratada para outra equipa.

Cada carga por fazer, contratada ou não, sai com a razão (`why`): o código e um texto. Quando nenhuma equipa a pode fazer, vem quantas equipas falham por cada regra e um exemplo com as horas (por exemplo, "nenhuma equipa a pode fazer (2 chegam tarde à recolha); por exemplo A: chega tarde à recolha (seg 15:21; a janela fecha seg 09:00)"). Também há: "só cabe na semana de E012 tirando-lhe C007 (obrigatórias)", "fazê-la custa mais do que paga" e "o despachante proibiu-a a todas as equipas".

**O que está garantido, dito com rigor:** o fuzz verifica de forma independente que nenhuma contratada fica por fazer quando cabia na semana de alguma equipa depois de lhe tirar as cargas *spot*. Isto não prova que não exista nenhuma outra forma (trocas em cadeia entre várias contratadas não são procuradas de forma exaustiva).

Há um ponto fraco conhecido: a **cabotagem**. Uma contratada Espanha → Espanha precisa de uma entrega internacional antes, na mesma equipa. Se nenhuma equipa tem essa entrega no plano, a carga fica por fazer com a razão "nenhuma equipa tem, no plano, uma entrega internacional em Espanha antes dela". A pesquisa não vai buscar uma entrega internacional de propósito para a permitir.

Medido nas semanas de Bragança, com 30 % das cargas marcadas como contratadas (as de número acabado em 0, 1 ou 2) e, na segunda linha, também fixações tiradas do plano (cada 10.ª carga fixada à equipa seguinte, cada 20.ª proibida à sua, 3 ordens trocadas; algumas são de propósito impossíveis):

| Semana | Caso | Fixações (impossíveis) | Cargas | Contratadas feitas | Contratadas por fazer, porquê | Margem | Tempo |
|---|---|---|---|---|---|---|---|
| S | sem nada | — | 34/45 | — | — | 6 039 € | 0,5 s |
| S | 30 % contratadas | — | 34/45 | 11/14 | 1 chega tarde à descarga, 1 cabotagem, 1 conflito com outra contratada | 6 033 € | 0,5 s |
| S | + fixações | 7 (4) | 31/45 | 10/14 | as mesmas + 1 chega tarde à recolha | 5 278 € | 0,4 s |
| M | sem nada | — | 102/135 | — | — | 20 663 € | 2,4 s |
| M | 30 % contratadas | — | 98/135 | 33/41 | 3 recolha, 3 cabotagem, 2 conflito | 20 637 € | 2,5 s |
| M | + fixações | 20 (8) | 95/135 | 33/41 | 3 recolha, 3 cabotagem, 2 conflito | 19 773 € | 2,5 s |
| L | sem nada | — | 408/450 | — | — | 90 992 € | 9,7 s |
| L | 30 % contratadas | — | 408/450 | 124/135 | 5 cabotagem, 4 descarga, 2 recolha | 90 788 € | 9,8 s |
| L | + fixações | 62 (15) | 392/450 | 121/135 | 6 cabotagem, 5 descarga, 3 recolha | 86 192 € | 10,2 s |

- As contratadas quase não custam margem (−6 €, −26 € e −204 €). As fixações custam mais, porque são escolhas do despachante contra a pesquisa (nestes testes são arbitrárias, de propósito).
- Zero infrações, zero rotas inviáveis e nenhuma fixação violada em todas as linhas. Os tempos são desta máquina (cloud), com 1 000 iterações.

### 8.3 Replanear a semana em curso

`replan(inst, planoAtual, agora, eventos, { pins })`, com os eventos:

- carga nova;
- carga cancelada;
- atraso de X horas a partir de agora (contado como condução, o lado seguro para os limites, ou como espera, se o despachante sabe que o camião está parado);
- camião parado a partir de um momento (avaria ou oficina; por omissão, agora).

O que fica fixo:

- **O passado não muda.** Ficam congeladas, à frente da semana de cada equipa e pela mesma ordem, as cargas acabadas, a que está a fazer e aquela para onde já vai a caminho (a entrega anterior acabou antes de agora). Nada novo começa antes de agora. Uma equipa que já ia para casa, ou para uma recolha que entretanto perdeu, acaba essa viagem primeiro. É o lado seguro: o desvio a meio da estrada não é modelado. Os testes confirmam, equipa a equipa, que a condução e as cargas/descargas antes de agora são iguais ao minuto.
- **Quando o próprio evento parte o que está em curso, o resultado diz o quê, em vez de esconder:**
  - descarga atrasada: a janela é alargada e a nota diz a que horas chega ("avisar o cliente");
  - equipa que já não chega a casa até sábado: a nota diz a hora;
  - recolha já impossível: a carga volta a ser atribuída;
  - carga no camião avariado: fica fora do plano, marcada para resgate (a troca de reboque não está modelada);
  - cancelar uma carga já carregada: não sai do plano e é reportado.
- **Mudar o mínimo:** a pesquisa parte do plano atual, paga 300 € por cada carga que muda de equipa (ou que sai do plano), só mexe à volta do que mudou e só aceita melhorias. Sem eventos, o plano fica igual.
- As fixações continuam a valer. Uma fixação a uma equipa que avariou é reportada, e a carga não é passada a outra em silêncio.

**Estabilidade e tempo**, medidos nas semanas de Bragança: plano v2 completo (1 000 iterações), replaneado na terça às 12:00, com 10 casos de cada evento (o atraso e a avaria em 10 equipas diferentes; as cargas novas tiradas de outra semana gerada). "Equipas mexidas" são equipas cuja semana mudou (cargas ou ordem). "Mudam" são cargas que passam de uma equipa para outra.

| Semana | Evento | Tempo mediano (máx.) | Equipas mexidas mediana (máx.) | Cargas que mudam de equipa mediana (máx.) | Total que fica por fazer | Δ margem mediana |
|---|---|---|---|---|---|---|
| S | carga nova | 0,10 s (0,13) | 1 (2) | 0 (1) | 0 | +29 € |
| S | cancelamento (9) | 0,09 s (0,11) | 0 (1) | 0 (0) | 0 | −350 € |
| S | atraso 3 h | 0,09 s (0,12) | 0 (3) | 0 (3) | 0 | 0 € |
| S | atraso 6 h | 0,09 s (0,13) | 0 (3) | 0 (3) | 2 | −73 € |
| S | avaria | 0,09 s (0,12) | 2 (3) | 1 (2) | 5 | −300 € |
| M | carga nova | 0,29 s (0,36) | 1 (1) | 0 (0) | 0 | +162 € |
| M | cancelamento | 0,26 s (0,31) | 0 (2) | 0 (1) | 0 | −380 € |
| M | atraso 3 h | 0,25 s (0,31) | 0 (2) | 0 (2) | 1 | 0 € |
| M | atraso 6 h | 0,25 s (0,28) | 0 (2) | 0 (2) | 1 | 0 € |
| M | avaria | 0,26 s (0,31) | 2 (3) | 1 (2) | 4 | −277 € |
| **L** | **carga nova** | **1,04 s (1,23)** | **1 (1)** | **0 (0)** | 0 | +131 € |
| L | cancelamento | 0,98 s (1,11) | 0 (0) | 0 (0) | 0 | −582 € |
| L | atraso 3 h | 0,90 s (1,20) | 0 (2) | 0 (1) | 2 | −1 € |
| L | atraso 6 h | 0,88 s (1,19) | 2 (4) | 1 (3) | 2 | −36 € |
| L | avaria | 0,95 s (1,23) | 2 (4) | 2 (3) | 2 | −189 € |

- Na semana L, as 10 cargas novas foram todas atribuídas e cada uma mexeu numa só equipa (a que a recebeu). O replaneamento mais lento da L levou 1,23 s (meta: menos de 3 s).
- Em todos os 150 casos: zero infrações, zero rotas inviáveis, passado igual e fixações respeitadas.
- O replaneamento numa semana L com 30 % de contratadas e 62 fixações levou 1,1 s e mexeu numa equipa.

### 8.4 Testes novos

- `__tests__/pins.test.ts`: fixações e contratadas como semanas-armadilha (fixação mantida contra a equipa mais perto, ordem viável única, recolha impossível, 56 h, regresso de sábado, proibição, ordem pedida mais cara, outras cargas no meio, ordem que falha uma janela, contradições, ciclos, nomes inexistentes; contratada contra *spot* mais bem paga, contratada impossível com o número de equipas por razão, frio sem equipa de frio, duas contratadas em conflito, contratada que tira *spot* já planeadas, *spot* que não compensa).
- `__tests__/replan.test.ts`: sem eventos, atraso (a carga seguinte passa à outra equipa), descarga atrasada, atraso como espera, avaria com carga a bordo, oficina marcada, carga nova, cancelamentos (também de uma carga já carregada e de uma para onde a equipa já ia), fixações através do replaneamento, e a semana L (carga nova e avaria abaixo de 3 s e no máximo 3 equipas mexidas).
- `crewSchedule.test.ts`: atraso a meio de uma perna, atraso durante uma pausa obrigatória, atraso durante uma espera, camião parado, razões de falha com horas.
- `__tests__/fuzz.test.ts`: além do fuzz de antes, três novos (fixações aleatórias, incluindo contraditórias, com 30 % de contratadas; replaneamentos aleatórios com 1 a 3 eventos; e o polimento de retorno, ver 8.5). Correram com `FUZZ_N=400` e com `FUZZ_N=2000` (8 000 semanas no total dos quatro). `FUZZ_SEED=<n>` repete uma semana só.
- Sonda: `REPLAN=1 npx vitest run src/assignment/__tests__/replan.probe.test.ts` (tabelas acima; `REPLAN_OUT=ficheiro.json`).

**O que os testes apanharam pelo caminho (corrigido):**

1. Um atraso que caía durante uma pausa obrigatória fazia o simulador descontar condução em vez de a somar. A auditoria legal independente apanhou 4,75 h de condução sem pausa.
2. Quatro casos em que o replaneamento reescrevia o passado, apanhados pela comparação ao minuto:
   - uma equipa que já ia para casa;
   - uma equipa que já estava na recolha de uma carga libertada;
   - um camião que avariava a meio de uma viagem;
   - uma carga com tempo de carga zero, que parecia ainda não carregada.
3. Duas falhas nas fixações:
   - uma terceira fixação da mesma carga contraditória ficava sem explicação (apanhado só com 2 000 semanas);
   - uma sequência sem cargas em curso era tratada como se tivesse.

### 8.5 Carga de retorno para casa (opcional, desligada por omissão)

O regresso vazio ao sábado é 40–60 % dos km vazios. O objetivo já paga esses km (0,77 €/km), por isso dar-lhe um bónus distorceria a margem. Tentei duas coisas:

1. **Uma forma nova de tirar cargas no *ruin & recreate***: tirar a última carga de uma equipa com regresso longo e as cargas que a trariam para casa. Resultado misto e dentro do ruído: em 13 semanas, o regresso vazio desceu em 6 e subiu em 7. Na S principal subiu 119 km e a margem caiu 10 €. **Foi retirada.**
2. **Um polimento final** (`solveWeek(…, { backhaul: true })`). Para cada equipa que volta vazia mais de 100 km, tenta-se: (a) trazer de outra equipa uma carga que acabe perto de casa para o fim da semana; (b) trocar as últimas cargas entre as duas; (c) fazer uma carga por fazer que acabe perto de casa, em vez da última (que passa para outra equipa ou fica por fazer, nunca contratada por *spot*). Um movimento só é aceite se a margem subir **e** o regresso vazio das equipas envolvidas descer. Nunca se fazem menos cargas.

Medido em estradas reais (matriz gravada do motor e preços recalculados nos km reais), nas três semanas de Bragança e em mais 5 semanas S e 5 M geradas com outras sementes (`REAL=1 REAL_MC=5 … realroads.probe.test.ts`):

| Semana (estradas reais) | Cargas | Regresso vazio | Km vazios | Margem |
|---|---|---|---|---|
| S | 35 → 35 | 3 027 → **2 607 km (−14 %)** | 6 513 → 6 170 | 6 017 → 6 053 € (+36 €) |
| M | 105 → 105 | 5 068 → 5 068 | igual | igual |
| L | 410 → 410 | 20 929 → 20 926 | 53 409 → 53 406 | 91 806 → 91 808 € (+2 €) |
| S, semente +100 | 36 → 36 | 3 267 → **2 939 (−10 %)** | 7 489 → 7 260 | 6 363 → 6 383 € (+20 €) |
| M, semente +200 | 113 → 113 | 6 270 → 6 111 (−3 %) | 21 708 → 21 441 | 20 158 → 20 214 € (+56 €) |
| M, semente +300 | 117 → 117 | 4 133 → 3 830 (−7 %) | 16 885 → 16 430 | 25 127 → 25 368 € (+241 €) |
| outras 7 semanas | iguais | iguais | iguais | iguais |
| **Total das 13** | iguais | 67 050 → 65 837 km (−1,8 %) | | +355 € |

No v2 sem polimento, o regresso vazio é 46 % dos km vazios na S, 28 % na M e 39 % na L (estradas reais).

- Nunca piora (é garantido por construção e verificado no fuzz). Ganha em 5 de 13 semanas e nas outras não muda nada. Zero infrações.
- **Porque está desligado por omissão:** os ganhos vêm **todos** do movimento (c), ou seja, deixar por fazer uma carga *spot* que paga mais para fazer uma que paga menos mas traz a equipa a casa. A margem sobe, mas o objetivo da pesquisa piora, porque pesa cada carga por fazer pelo que paga (é preferir servir quem paga mais). Com a condição de o objetivo também não piorar, o polimento não encontra quase nada (L: −3 km, +2 €): o *ruin & recreate* já deixa o plano localmente ótimo para as trocas (a) e (b).
- **Decisão para o fundador:** numa troca de cargas *spot*, vale mais a margem da semana ou fazer a carga que paga mais? Se for a margem, liga-se por omissão (ou muda-se o peso das cargas por fazer no objetivo), e os números da secção 5 mudam um pouco.

### Próximos passos

1. Decidir o ponto de 8.5 (margem contra receita nas cargas *spot*) e, conforme a decisão, ligar o polimento de retorno.
2. Cabotagem contratada: procurar de propósito uma entrega internacional que a permita.
3. Velocidade na semana L, para mais iterações nos mesmos 30 s: reutilizar os tempos já calculados entre iterações.
4. Ligar ao modelo da aplicação (Job/Truck/Driver/Trailer → equipas e cargas) e verificar com rotas reais do GraphHopper. Os eventos de replaneamento devem vir da app do motorista (atrasos, avarias).
5. Replanear: modelar a posição a meio de uma viagem (hoje a equipa acaba a viagem em curso) e a troca de reboque para resgatar uma carga de um camião avariado.

### Ainda não modelado

- Várias semanas: regresso a cada 4 semanas, descansos semanais reduzidos e compensação.
- Portagens.
- Preferências dos motoristas (podem ser dadas como fixações `forbid`, à mão).
- Trocas de reboque.
- Grupagem (várias cargas no mesmo reboque, com ordem de carga).
- Velocidades reais por estrada: virão do motor e, mais tarde, da app do motorista.

## Fontes

- [Gronalt, Hartl e Reimann (2003): savings para cargas completas com janelas](https://researchportal.northumbria.ac.uk/en/publications/new-savings-based-algorithms-for-time-constrained-pickup-and-deli/)
- [Janssens e Braekers: revisão FT-PDP](https://documentserver.uhasselt.be/bitstream/1942/21377/1/janssensexal.pdf)
- [Nossack e Pesch (2013)](https://ideas.repec.org/a/eee/ejores/v230y2013i3p666-680.html)
- [Kok e outros: VRPTW com regras de condução](https://www.utwente.nl/en/bms/iebis/staff/ex-colleagues/kok/vrptw_with_driving_regulations.pdf)
- [Goel: transformações para a UE](https://aigaion.telematique.eu/index.php/publications/show/187)
- [PyVRP: comparação de solvers](https://pyvrp.org/setup/why_pyvrp.html)
- [PyVRP: artigo](https://pubsonline.informs.org/doi/epdf/10.1287/ijoc.2023.0055)
- [Parlamento Europeu: Pacote de Mobilidade](https://www.europarl.europa.eu/topics/en/article/20200630STO82385/better-working-conditions-for-truck-drivers-across-the-eu)
- [ECG: regresso do veículo a cada 8 semanas](https://www.ecgassociation.eu/wp-content/uploads/2022/07/ECG-Business-Intelligence-22.07-Mobility-package-driver-shortage.pdf)
- [Fenadismer: esclarecimento da UE sobre tempos de condução](https://www.fenadismer.es/wp-content/uploads/Aclaración-UE-sobre-nuevo-Reglamento-tiempos-conducción.pdf)
- [Reg. 561/2006 art. 8 (texto revisto)](https://www.legislation.gov.uk/eur/2006/561/article/8/data.htm)
- [Eurostat: transporte rodoviário por características da viagem](https://ec.europa.eu/eurostat/statistics-explained/index.php/Road_freight_transport_by_journey_characteristics)
