# Que estradas o camião deve evitar — pesquisa (PT e ES)

22 de outubro de 2026 · pesquisa antes de construir · base para o perfil de camião do motor de rotas e para os avisos dos motoristas

## A pergunta

O nosso motor (GraphHopper sobre OpenStreetMap) às vezes escolhe estradas mais curtas mas lentas e apertadas (ex.: Vila Real → Favaios pela serra, 31,6 km, quando o Google e o TomTom vão pela A4, 45,7 km). Mas também há estradas apertadas e com curvas que os camiões usam todos os dias porque **não há outra** (ex.: a estrada entre Póvoa de Lanhoso e Cabeceiras de Basto). O motor tem de saber a diferença:

1. **Proibido** → nunca passa.
2. **Difícil** (apertada, curvas, atravessa localidades, inclinação, trânsito) → só passa se a alternativa for muito pior.
3. **Normal** → passa.

E um aviso de motorista ("esta estrada é apertada") tem de virar um troço concreto no mapa.

## Resposta curta

- **Os routers profissionais fazem exatamente isto.** O HERE penaliza as estradas mais pequenas (classe funcional 5) e usa uma rede própria de camiões ([HERE](https://docs.here.com/wego-pro/docs/truck-features)). O PTV deixa escolher "quanto evitar estradas secundárias estreitas e atravessar cidades" e evita zonas residenciais ([PTV TruckNavigator](https://www.cartft.com/support_db/support_files/Truck_Navigator_7_5_Factsheet_EN.pdf)). Não há números públicos — cada empresa afina os seus.
- **O mapa quase nunca diz a largura.** Só ~1,5% dos troços de estrada têm largura no OSM (PT 24 mil de 1,6 milhões; ES 91 mil de 5,9 milhões); faixas ~11%; limite de velocidade ~7–8%. A largura tem de ser **deduzida** de outros sinais.
- **A regra "sem alternativa" resolve-se com penalização limitada**, não com proibição: uma estrada difícil fica "mais cara" num valor fixo, por isso só se troca por um desvio que custe menos do que esse valor.
- **Espanha tem regras que obrigam os camiões a sair de certas nacionais para a autoestrada** — isso é proibição, não preferência.

## 1. O que conta como estrada a evitar

| Situação | Porque é má para camião | Como o motor deteta | Regra |
|---|---|---|---|
| Proibição de pesados (sinal, regulamento, desvio obrigatório) | Multa, risco | Agentes de IA (regulamentos, BOE/DR), inventários de sinais, avisos confirmados, OSM `hgv=no` | **Proibido** |
| Altura / peso / largura / comprimento / eixo abaixo do camião | Não passa | OSM (pouco), inventários, avisos | **Proibido** |
| Atravessar centro de cidade ou vila | Trânsito, semáforos, peões, cargas/descargas, ruas estreitas | `urban_density` do GraphHopper (rural / residencial / cidade), limite 50, densidade de cruzamentos | Penalizar (forte em cidade, médio em vila) |
| Atravessar aldeias numa nacional | Estreitamento, casas encostadas à via, abrandar | `urban_density` + troços curtos com limite 50 | Penalizar (médio) |
| Estrada sinuosa (serra) | Velocidade real muito abaixo do limite, desgaste, segurança | `curvature` (calculada da forma da estrada) | Baixar velocidade + penalizar |
| Inclinação forte | 40 t a subir anda devagar; a descer, travões | `average_slope` / `max_slope` com dados de altitude grátis | Baixar velocidade + penalizar |
| Estrada pequena (municipal, sem classificação, rural) | Provável largura < 5,5 m para dois sentidos | Classe da estrada no OSM | Penalizar; forte se também curva/inclinada |
| Piso mau / terra | Danos, velocidade | `surface` (~30% dos troços têm) | Penalizar forte ou proibir para 40 t |
| Rotundas e curvas apertadas | 16,5 m não cabe | Raio da geometria, avisos | Penalizar / avisar |
| Zonas de baixas emissões (ZBE em ES, ZER em Lisboa) | Acesso condicionado | Conjunto da DGT, regulamentos | Proibido conforme o camião |
| Portagens | Custo | Tabelas de portagens | Custo em € (escolha da empresa) |

Nota: **não evitar** estradas só porque são curtas. Evitar porque são lentas, apertadas ou proibidas — e sempre comparado com a alternativa real.

## 2. Regras legais conhecidas

**Espanha**
- **Desvios obrigatórios para autoestrada**: camiões proibidos em certas nacionais e mandados para a autoestrada, com desconto na portagem.
  - La Rioja: N-232 e N-124 → AP-68 (desconto renovado pelo [Real Decreto 730/2026](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-19039), com efeitos desde 1 out 2025; exige telepeagem).
  - Catalunha: N-340 e N-240 → AP-7 / AP-2 ([Fenadismer](https://www.fenadismerencarretera.com/desvio-obligatorio-camiones-peajes-ap7-ap2-bonificaciones/), [Ebre Digital](https://ebredigital.cat/?p=146047)) — estado em 2026 a confirmar no BOE/SCT.
  - A lista completa tem de ser recolhida pelos agentes (BOE, DGT, SCT, Governo Basco).
- **Calendário anual da DGT** para > 7,5 t (Anexo II) e **rede de itinerários para mercadorias perigosas** (Anexo IV) — [Resolução DGT 2026](https://www.dgt.es/conoce-el-estado-del-trafico/restricciones-a-la-circulacion/). O País Basco e a Catalunha têm calendários próprios ([Euskadi 2026](https://www.euskadi.eus/contenidos/informacion/fechas_restringidas/es_def/adjuntos/2026/7500kg_es_26.pdf)).

**Portugal**
- **VCI do Porto**: proibição para pesados sem destino no Porto/Gaia desde setembro de 2026; a A41 (CREP) é a alternativa ([Sábado](https://www.sabado.pt/portugal/amp/psp-registou-27-infracoes-de-pesados-na-vci-no-porto-nas-primeiras-48-horas)).
- **Centros urbanos municipais**: cada câmara decide (ex.: Cartaxo proibiu pesados no centro, com exceção de cargas/descargas — [notícia](https://echoboomer.pt/?p=300918)). Está nos regulamentos municipais de trânsito → trabalho dos agentes de IA.
- **Pontes e troços com limite de peso** nas nacionais e municipais → sinais; quase nada em dados abertos.

## 3. O que sabemos de cada estrada — e de onde mais pode vir

| Dado | No OSM hoje (PT / ES) | Outras fontes |
|---|---|---|
| Classe da estrada (autoestrada → rua) | Todos os troços | — |
| Referência (A1, EN205, N-232) | 122 mil / 435 mil | — |
| Número de faixas | 176 mil / 652 mil | Rede oficial da IP (PT), Rede de Transporte do IGN (ES) — a confirmar atributos |
| Largura | **24 mil / 91 mil (~1,5%)** | Medir nas fotos aéreas (DGT 25 cm, PNOA) com IA — investigação futura |
| Limite de velocidade | 108 mil / 496 mil | Inventário de sinais (Madrid, Barcelona…) |
| Piso | 501 mil / 1,76 milhões | — |
| Curvas | Calcula-se da geometria (GraphHopper `curvature`) | — |
| Inclinação | Calcula-se com altitude (grátis) | — |
| Atravessa localidade | Calcula-se (GraphHopper `urban_density`) | Limites de povoações (CAOP em PT) |
| **Velocidade real de camião** | Não existe | **GPS da app do motorista** — o dado que resolve quase tudo |

## 4. Modelo proposto: proibido, difícil, normal

**Cada troço recebe um nível de dificuldade** (0 normal, 1 algo difícil, 2 difícil, 3 muito difícil), somando os sinais da tabela da secção 1: localidade, curvas, inclinação, classe pequena, piso, avisos de motoristas.

**A dificuldade custa tempo, mas com teto.** Exemplo de regra (valores a afinar com viagens reais):
- nível 1 → o troço "conta" como +10% do tempo;
- nível 2 → +25%;
- nível 3 → +50%;
- e a velocidade é baixada pelas curvas e pela inclinação (o tempo real fica mais perto da verdade).

**Porque isto resolve o "sem alternativa":** o castigo é proporcional ao próprio troço, não infinito. Exemplo Póvoa de Lanhoso → Cabeceiras de Basto:
- a estrada direta, apertada e com curvas: digamos 30 km em 40 min, nível 2 → conta como 50 min;
- a alternativa: +30 km por estradas maiores, digamos 60 min;
- 50 < 60 → **o motor fica na estrada direta**, como os camionistas fazem. Só manda à volta se o desvio custar menos de ~10 min extra.

E Favaios: a serra fica mais lenta pelas curvas (velocidade real ~40) e com penalização → a A4 passa a ganhar, como no Google.

**A empresa afina** num painel simples: "evitar centros urbanos: pouco / médio / muito", "estradas pequenas só se poupar mais de X min", "portagens: usar / evitar". Proibições não se afinam.

## 5. Avisos dos motoristas: o que é "esta estrada"?

**O problema:** o motorista diz "esta estrada é apertada". Pode ser 200 m numa aldeia ou 30 km de serra.

**Proposta:**
1. **Ponto de partida = onde carregou no botão**, no sentido em que vai (o GPS dá a estrada exata).
2. **A IA lê a extensão no que ele disse**:
   - "aqui", "esta ponte", "esta rotunda" → ponto (~200 m);
   - "até à aldeia", "até ao cruzamento" → até esse sítio;
   - "até Cabeceiras", "esta estrada toda" → até à localidade ou até a estrada mudar de número.
3. **Se não disser**, o troço por defeito vai do ponto até ao **próximo cruzamento importante** (onde a estrada muda de referência ou cruza uma estrada maior), com um máximo de ~5 km.
4. **Confirmação curta por voz**: "Registei: estrada apertada daqui até Cabeceiras de Basto, 28 km. Confirmas?" — e o mapa mostra o troço na próxima paragem, para corrigir se for preciso.
5. **Vários motoristas afinam o troço**: se três dizem "apertada" em pontos diferentes da mesma estrada, o troço junta-se.

**Tipos de aviso, com efeito diferente:**

| Tipo | Exemplos | Efeito no motor |
|---|---|---|
| Proibição | "proibido pesados", "ponte 3,5 t", "altura 3,8" | Proibido (depois de confirmado por 2–3 motoristas ou fonte oficial) |
| Dificuldade | "apertada", "muitas curvas", "difícil cruzar", "rotunda pequena", "subida forte" | Sobe o nível de dificuldade do troço |
| Temporário | "obras", "cortada", "acidente", "feira hoje" | Bloqueia ou penaliza até expirar |
| Positivo | "dá bem para camião", "alternativa boa por aqui" | Baixa a dificuldade |

Os avisos de dificuldade **nunca proíbem**: só tornam o troço mais "caro". Assim, a estrada de Póvoa → Cabeceiras pode ter dez avisos de "apertada" e continuar a ser usada quando não há outra.

## 6. Limites desta pesquisa

- Os valores de penalização (+10/25/50%) são um ponto de partida, não números provados. Têm de ser afinados com viagens reais de uma transportadora (o percurso que os motoristas fazem de facto é a melhor verdade).
- A lista de desvios obrigatórios em Espanha está incompleta e o estado da Catalunha em 2026 por confirmar.
- Não encontrei a norma portuguesa de largura de vias; o valor de ~3 m por via citado no fórum do OSM é de um utilizador, não da norma.
- O TomTom e o HERE têm dados de restrições melhores que o OSM hoje (carrinhas com câmaras), mas também falham, como vimos nos testes.

## 7. Próximos passos

1. Reconstruir o motor com `curvature`, `urban_density` e inclinação; aplicar o modelo de dificuldade com teto.
2. Voltar a comparar com o Google (29 viagens) e o TomTom.
3. Perguntar aos motoristas da transportadora piloto: que estradas evitam, quais usam por não haver outra (lista para validar o modelo).
4. Desenhar com a conversa da app do motorista o fluxo do aviso por voz (secção 5).
5. Agentes de IA: recolher todos os desvios obrigatórios de Espanha e as proibições municipais de Portugal.
