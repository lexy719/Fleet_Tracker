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

### Próximos passos

1. Carga de retorno para casa: favorecer a última carga da semana que acabe perto de casa. Hoje isso só entra pelo custo do regresso.
2. Velocidade na semana L, para mais iterações nos mesmos 30 s: reutilizar os tempos já calculados entre iterações.
3. Ligar ao modelo da aplicação (Job/Truck/Driver/Trailer → equipas e cargas) e verificar com rotas reais do GraphHopper.
4. Cargas obrigatórias (contratadas) contra cargas opcionais (*spot*).

### Ainda não modelado

- Várias semanas: regresso a cada 4 semanas, descansos semanais reduzidos e compensação.
- Portagens.
- Preferências dos motoristas.
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
