# Os três motores do backend FleetOS: arquitetura, testes e resultados

Estado a 24 de outubro de 2026. Tudo o que está aqui foi medido neste repositório ou nos testes de `docs/backend-map-quality-test.md` e `docs/atribuicao-servicos-v2.md`. Onde um número é uma suposição ou os dados são sintéticos, está dito. A secção 6 lista o que ainda não está ligado ou não está provado.

## 1. Visão geral

```
 Trabalho (carga, janelas, camião, motorista)
        │
        ▼
 ┌──────────────────────────────────────────────┐
 │ 2. ATRIBUIÇÃO   src/assignment               │  quem faz que carga, por que ordem,
 │    equipas (camião+motorista+reboque)        │  com regras de condução e custo real
 └──────────────┬───────────────────────────────┘
                │ custo = km e tempos reais + gasóleo comprado onde é mais barato
                ▼
 ┌──────────────────────────────────────────────┐
 │ 1. ROUTING      src/routing + src/solver     │  rota limpa para o camião e a hora
 │    motor próprio GraphHopper 11.1 (OSM)      │  em que passa, a evitar o que o proíbe
 └──────────────┬───────────────────────────────┘
                │ pergunta: "o que me proíbe aqui, a esta hora, com este camião?"
                ▼
 ┌──────────────────────────────────────────────┐
 │ 3. ROAD INTELLIGENCE                         │  fontes oficiais → candidatos →
 │    src/research · ingestion · discovery      │  filtro de confiança → revisão humana →
 │    src/regulations (avaliador)               │  restrição ativa → avaliador determinístico
 └──────────────────────────────────────────────┘
```

Princípio: o núcleo é determinístico. A IA, quando entra, só lê texto confuso (avisos, regulamentos) e o que produz nunca ativa nada sozinho: passa por um filtro de confiança e por revisão humana.

## 2. Motor 1: Routing

**O que faz.** Dá a rota do camião entre dois pontos, a uma hora de partida, a evitar as restrições que se aplicam a esse camião nessa hora, e decide se compensa passar por obras ou desviar.

**Componentes.**

| Peça | Onde | O que é |
|---|---|---|
| Motor de rotas | `C:\Users\manue\fleetos-routing` (fora do repositório) | GraphHopper 11.1, Java 21, OSM Iberia (Geofabrik PT+ES de 20 out 2026), grafo de 8,3 milhões de nós com curvatura, densidade urbana e inclinação (SRTM). Perfil de camião `truck3`: 40 t, 4 m, 2,55 m, 16,5 m; velocidades por curva, vila e subida |
| Ligação ao solver | `src/routing/graphhopperProvider.ts` | O motor como `RoutingProvider`: áreas a evitar viram polígonos de 15 m (corredores) num modelo de custo por pedido |
| Camião e paragens | `src/routing/truckRoute.ts` | `routeTruck`: camião + hora de partida → o avaliador existente diz que regras se aplicam → o solver pede ao motor para as evitar. Os concelhos das paragens (CAOP 2025) servem para as exceções de zona |
| Obras da IP | `src/routing/roadWorks.ts` | Lê o texto da IP (fecho, semáforos, via cortada), o troço, as horas (inclusive noturnas) e decide: fecho → desvio; parcial → desvio só se custar menos que a espera |
| Solver de rota limpa | `src/solver/solver.ts` | Iterativo: pede rota, avalia, evita a restrição que apanhou, repete. Deteta ciclos e falhas encadeadas, e nunca devolve verde por omissão |
| Provider TomTom | `src/solver/tomtomProvider.ts` | Continua no código, só para comparação e teste. O TomTom fica limitado ao tráfego, se for preciso |

**Dados.** OSM para o grafo. Preços e restrições vêm do motor 3.

## 3. Motor 2: Atribuição de serviços

**O que faz.** Para uma semana, decide que equipa faz que cargas e por que ordem, para fazer o máximo de cargas com o mínimo de quilómetros vazios, cumprindo as regras de condução e o regresso a casa.

**Duas gerações.**

- **Planeador antigo** (`src/domain/planning/planner.ts`, ~1 000 linhas): pesquisa em feixe que experimenta camião × motorista × reboque por carga. As verificações de cada atribuição (carga, ADR, frio, carta, qualificações) são boas e ficam. A pesquisa, não.
- **Atribuição v2** (`src/assignment`, nova): a unidade é a equipa.

| Peça | Ficheiro | O que é |
|---|---|---|
| Modelo | `model.ts` | Equipa, carga, tabela de viagem, validação `isPlannableLoad` |
| Horário de uma equipa | `crewSchedule.ts` | Simula uma semana carga a carga com: pausa de 45 min a cada 4h30, 9 h por dia (10 h duas vezes), descanso de 11 h, 56 h por semana, 90 h em duas, 6 h de trabalho seguido, 60 h de trabalho por semana, 10 h com trabalho noturno, cabotagem (máximo 3 em 7 dias e só depois de entrega internacional) e regresso a casa até sábado |
| Custo | `costs.ts` | Custo da semana: desgaste por km mais o gasóleo comprado onde é mais barato ao longo do caminho |
| Pesquisa | `solver.ts` | Inserção por arrependimento em qualquer posição de qualquer equipa, e depois *ruin & recreate* com arrefecimento simulado. Determinística por semente |
| Tempos reais | `travelMatrix.ts` | Tabela de percursos do motor, pedida uma vez por plano, mais folga configurável, com fallback conservador que é contado |
| Comparações | `greedy.ts`, `bench/*` | Regra de despachante (a mais perto, ou a primeira livre), ótimo exato (`exact.ts`), semanas de uma transportadora de Trás-os-Montes em três tamanhos, pontuação com auditoria legal independente (`src/legal/driverLegality.ts`) |

**Dados reais usados nos testes.** Matriz de camião do nosso motor entre 23 polos ibéricos (`bench/hubMatrix.truck3.json`, 506 percursos) e preços de gasóleo de hoje da DGEG e do MITECO à volta de cada polo (`bench/hubFuelPrices.json`). As cargas são geradas, não são dados de mercado.

## 4. Motor 3: Road Intelligence

**O que faz.** Descobre, lê, guarda e avalia restrições à circulação de camiões (permanentes, de obras, de eventos) a partir de fontes oficiais, com prova de onde veio cada facto.

| Camada | Onde | O que faz |
|---|---|---|
| Fontes e parsers | `src/ingestion` (28 ficheiros: `ipArcgis`, `ipAlertasJsonapi`, `datex2`, `ckan`, `drRss`, `wpNotices`, `lisboaClosures`, `oeirasWfs`) | Leitura determinística das fontes estruturadas |
| Descoberta | `src/discovery` | A partir da rota, deduz que autoridades e concelhos interessam. Confia só em domínios oficiais verificados (comparação por etiqueta DNS: `cm-porto.pt.example.com` não passa) |
| Investigação | `src/research` | Recuperação preservando o original (bytes, SHA-256, metadados), extração semântica em português, resolução de geometria separada, conflitos com as duas cadeias de provas, orçamentos, frescura em cinco dimensões |
| Filtro de confiança | `src/ingestion/trustGate.ts` | Conservador: qualquer dúvida vira `REVIEW_REQUIRED`. Um candidato extraído por IA nunca passa sozinho |
| Revisão humana | `src/ingestion/review.ts` | O revisor tem de resolver geometria, aplicação ao veículo e tempo, citando o texto da fonte. O valor fica `HUMAN_RESOLVED`, nunca `VERIFIED` |
| Avaliador | `src/regulations` (21 ficheiros, `evaluate.ts` com 1 067 linhas) | Avalia a rota contra as restrições ativas, ao minuto de passagem: `APPLIES`, `UNKNOWN`, afetada ou não |
| Cobertura | `src/ingestion/coverage.ts`, `municipalRegistry.ts` | Diz que concelhos estão tratados. Um concelho não tratado é `NOT_CURATED`, nunca "sem restrições" |
| Combustível | `src/fuel` | Recolha diária da DGEG e do MITECO, estações ao longo da rota, preço da viagem |
| Fronteira de servidor | `server/researchProxy.ts` | Só em desenvolvimento: as fontes oficiais raramente enviam CORS e as chaves de pesquisa e de IA não podem existir no navegador |

**Estado honesto.** O pipeline foi provado ao vivo a 1 out 2026 com recuperação real, extração determinística em português (`pt-rules@1`) e reavaliação da rota (J-DEMO-IP3). Os caminhos de pesquisa na web (Brave) e de extração por IA (Anthropic) existem mas **não foram validados com chaves reais**.

## 5. Testes automatizados e resultados

### 5.1 Contagem

Corrida completa a 24 out 2026: **1 513 testes em 78 ficheiros, 1 505 a passar, 1 falha, 7 ignorados**. O `tsc --noEmit` do projeto não dá erros.

- **A falha** é um teste de tempo do frontend (`src/ui/__tests__/architecturePerformance.test.ts`, pesquisa global com 2 000 trabalhos). Passa isolado (4 de 4) e falhou com a máquina ocupada; é do frontend e não dos motores.
- **Os 7 ignorados** são as medições opcionais (as sondas de benchmark, ótimo, Monte Carlo, estradas reais, combustível e as da simulação semanal), que se ativam com variáveis de ambiente.

| Área | Testes |
|---|---|
| Avaliador de regras (`regulations`) | 428 |
| Solver de rota limpa (`solver`) | 346 |
| Ingestão e parsers (`ingestion`) | 160 |
| Investigação (`research`) | 60 |
| Descoberta (`discovery`) | 56 |
| Routing: obras e provider (`routing`) | 18 |
| Rotas de domínio (`domain/routing`) | 37 |
| Atribuição v2 (`assignment`) | 25 (mais 5 opcionais) |
| Planeador antigo e operações (`domain/planning`, `domain/operational`) | 41 + 101 |
| Combustível e abastecimento (`fuel`, `domain/fuelPlanning`) | 20 + 9 |
| Legalidade do motorista, regras de condução, simulação semanal (`legal`, `ops`, `sim`) | 11 + 8 + 7 |
| Servidor (`server`) | 18 |

### 5.2 Tipos de teste

- **Torture** (casos feitos para partir): `solverTorture` (22 casos: cadeias de desvios que podiam parecer verdes, fetch a falhar, coordenadas NaN, restrição repetida), `phase4Torture` (35: injeção de instruções em texto, falhas do modelo, 403/404/500, snapshots imutáveis, semântica de veículos e de tempo), `scopeCacheTorture`, `persistenceTorture`.
- **Invariantes:** `solver/invariants` (20), `routeEquivalence`, `matchEquivalence`.
- **Atribuição:** 13 armadilhas por nível de dificuldade, fuzz de 400 semanas aleatórias (o teste normal corre 40), ótimo exato em 60 semanas pequenas, Monte Carlo, 300 equipas, estradas reais, folga contra dias reais, combustível.
- **Auditoria independente:** `src/legal/driverLegality.ts` valida o minuto a minuto de cada motorista e não partilha código com o planeador.

### 5.3 Bateria representativa

**Routing** (`docs/backend-map-quality-test.md`, Testes 6–12):

| Medida | Resultado |
|---|---|
| 240 viagens contra o camião TomTom 40 t (distância) | mediana −3,6 %; o motor nunca falhou uma rota; 44 ms por rota |
| 29 destinos de empresas contra o Google | 83 % dentro de ±10 %, mediana −0,2 % |
| 24 viagens do interior contra o Google | 92 % dentro de ±10 %, nenhuma mais de 15 % maior |
| Destino alcançado a menos de 50 m (46 pontos) | nós 40, TomTom 40 |
| Tempos contra o camião TomTom | 51 % dentro de ±10 %; montanha +2 %; curtas −2 %; longas +10 % a +11 % |
| VCI, Leixões → Espinho, quarta 10:00 | 26,7 km pelo VCI → 59,2 km, 0 km no VCI, pela A41/IC24. Às 22:00, ao domingo ou com autorização: passa |
| Obras da IP em tempo real | o TomTom conhecia 1 de 5 e o camião entrava no IP3 fechado; o nosso desvia |
| 3 avisos só com texto (ER205, EN14, ponte de Prado) | colocados na estrada a partir do texto; desvia dentro do horário e passa fora |

**Atribuição** (`docs/atribuicao-servicos-v2.md`):

| Teste | Resultado |
|---|---|
| Planeador antigo, 10 equipas e 45 cargas | 18 cargas em 138 s, com 7 equipas trocadas |
| v2 contra o ótimo exato, 60 semanas pequenas | ótimo em 59, e na outra perde 27 € e nenhuma carga. O despachante chega a 16 de 60 |
| 13 armadilhas | todas passam |
| Fuzz, 400 semanas aleatórias com dados partidos | todas as invariantes passam |
| Monte Carlo contra o despachante | S: ganha 28 de 30 semanas, +16,8 % de margem; M: 15 de 15, +10,2 % |
| 100 equipas e 450 cargas | 408 a 410 cargas contra 399, +2 % a +4 % de margem, zero infrações |
| 300 equipas e 1 350 cargas | 17,8 s, +17 cargas |
| Em estradas reais do motor | a v2 ganha nas três semanas |
| Folga contra dias reais (variação inventada) | sem folga quase todas as semanas partem; 10 % a 15 % de folga resolve a maioria |
| Combustível com preços reais de hoje | abastecer com estratégia poupa 8 % a 13 % do gasóleo (10 600 € por semana em 100 camiões); saber do gasóleo na atribuição não acrescenta nada mensurável |

**Road Intelligence:**

| Teste | Resultado |
|---|---|
| Pipeline completo ao vivo (1 out 2026) | recuperação real, extração determinística, prova de campo, fronteira de revisão e reavaliação da rota J-DEMO-IP3 |
| Recolha de combustível de hoje (24 out 2026) | MITECO: 11 391 estações e 42 431 preços; DGEG: 3 150 estações e 12 497 preços; 0 erros |
| Feeds da IP (23 out 2026) | 3 camadas ArcGIS lidas (66 obras de manutenção, 30 obstruções, 26 acidentes) e avisos em JSON:API (só texto) |
| Injeção de instruções em texto, falhas do modelo, 403/404/500 | nenhuma vira verdade da estrada; nenhum caminho de código ativa uma restrição ou se autoaprova |

## 6. Falhas encontradas e corrigidas

**Routing**

| Falha | Como apareceu | Correção |
|---|---|---|
| Os limites de vila e de curva também se aplicavam a autoestradas (viagens longas +20 %) | Teste 8 contra o TomTom | O perfil `truck3` isenta autoestrada e via rápida |
| O motor rejeitava modelos por pedido com `distance_influence` baixa | Pedidos com desvio | Variantes só por prioridade |
| A exceção do VCI por autorização não se aplicava | Teste 10 | `stopAreas`: concelhos das paragens a partir da CAOP |
| `IllegalArgumentException` ao construir o grafo (urban_density com 0 threads) | Reconstrução do grafo | `threads: 4` na configuração |
| Erro de tipos no provider TomTom depois de alargar o tipo de evitar | `tsc` | Estreitamento do tipo antes de usar |
| As horas das obras não eram lidas | Teste 12 | `hoursFromText` e `activeAt` em hora de Lisboa, com horários noturnos |
| Um desvio que entra na estrada onde a obra acaba contava como "passa pela obra" (ER205) | Teste 12 | O troço é bloqueado sem as pontas (`innerProbes`) |
| Uma rampa a 33 m do troço contava como "passa" (EN14) | Teste 12 | `drivesThrough`: só conta partilhar pelo menos 150 m |
| A obra da EN14 estava colocada na estrada errada | Teste 12 | Ancorada no ponto km 49 da IP, na Av. Padre Júlio Fragata |
| O geocodificador devolvia o centro do distrito para 10 origens do interior | Teste 8 | Mantido para comparar e assinalado nos resultados |

**Atribuição**

| Falha | Como apareceu | Correção |
|---|---|---|
| O planeador antigo faz menos de metade das cargas de um despachante e leva 138 s | Linha de base | Atribuição v2 |
| O simulador deixava passar trabalho noturno acima de 10 h e semanas com mais de 60 h de trabalho | A auditoria independente | Duas regras acrescentadas ao simulador |
| A pontuação e o solver contavam de forma diferente uma equipa parada fora de casa | Fuzz | `planObjective` conta todas as equipas |
| Crash quando uma equipa nem vazia chega a casa a tempo | Fuzz | A solução inicial usa as mesmas equipas do solver |
| A v2 só chegava ao ótimo em 50 de 60 semanas | Teste contra o ótimo exato | Reconstrução também em ordem aleatória: 59 de 60 |
| Uma poda às 25 equipas mais perto piorava o resultado | Medição | Retirada |
| Cargas com dados partidos só não eram planeadas por sorte (custos NaN) | Armadilhas | `isPlannableLoad` explícito |
| Planos feitos com tempos estimados partiam-se com tempos reais (até 11 semanas de equipas em 100) | Estradas reais | Tabela de tempos do motor com 10 % a 15 % de folga |
| Testes de sonda a falhar no `tsc` por tipos do Node | `tsc` | Movidos para `__tests__` |

**Road Intelligence.** Nesta conversa não encontrei falhas novas neste motor: não o alterei. Os testes de torture dele registam as falhas das fases anteriores, mas não tenho aqui o registo do que foi encontrado em cada uma.

## 7. O que ainda não está ligado ou provado

1. **A atribuição v2 não está ligada à aplicação.** O planeador da app continua a usar a rota por TomTom, em 37 ficheiros. A v2 usa o seu próprio modelo e ainda não lê Job, Truck, Driver e Trailer.
2. **O motor de rotas não está ligado ao planeador da app** e corre só no PC do fundador, com cerca de 8 GB de memória. O grafo e os perfis estão fora do repositório e fora de controlo de versões.
3. **As obras da IP chegam ao motor por um script de teste.** Os parsers de ingestão e `roadWorks.ts` ainda não estão encadeados no código de produção.
4. **As restrições de camião em OSM não são de confiança:** só 16 % dos 601 sinais oficiais de Madrid estão no OSM. Os inventários oficiais de sinais existem para Madrid, Barcelona, Pamplona, Navarra, Gipuzkoa, Valência (província), Santander e Cáceres; em Portugal só Águeda (2020). Os concelhos não tratados contam como `NOT_CURATED`.
5. **A pesquisa por IA e a pesquisa na web não foram validadas ao vivo** (sem chaves).
6. **Os dados da atribuição são gerados**, e a variação de tempos dos "dias reais" é inventada. Falta um teste com cargas reais de uma transportadora.
7. **Nenhum camião real percorreu estas rotas.** As comparações são contra o Google e o TomTom, não contra a estrada.
8. **O texto de licença da DGEG em `src/fuel/sources.ts` está desatualizado:** ainda diz que o uso comercial é proibido, e a proibição foi retirada entre 10 e 17 de outubro de 2026. Falta atualizar o texto e o campo `commercialUse`.
9. **Tudo isto está por fazer commit.**
