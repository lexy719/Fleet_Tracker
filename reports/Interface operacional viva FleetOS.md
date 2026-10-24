# Ancorar o espaço, deixar viver a atenção

A evidência disponível não apoia um ecrã que muda as coisas de sítio por iniciativa própria, mas apoia fortemente um ambiente "vivo" em que o **espaço fica ancorado** e o que vive é a **forma, o tamanho e a saliência** de cada coisa no seu lugar. Nenhum produto de frota, visibilidade ou sala de controlo documentado entre 2024 e 2026 reorganiza a sua própria disposição em resposta a eventos: todos mantêm uma moldura estável (mapa, quadro, lista) e tornam adaptativo o conteúdo, sob a forma de exceções ordenadas, agentes que resolvem o rotineiro e alarmes que dependem do estado. Os estudos de HCI mostram que interfaces que movem elementos ficam cerca de 8% mais lentas do que as estáticas e são as mais frustrantes. Em contrapartida, adaptações que copiam ("ecoam") ou destacam sem deslocar compensam quando a previsão é fiável: há ganho claro de 50% para 70% de precisão, e a adaptação efémera bate o estático a 79%. Para FleetOS isto traduz-se numa arquitetura concreta com quatro peças. A primeira é um compositor determinístico: grau de interesse, níveis de forma quantizados, histerese, orçamento de atenção e causa obrigatória em cada mudança. A segunda é uma árvore de layout com estado, que só altera tamanhos dentro de uma topologia fixa. A terceira é um mapa MapLibre cuja tela nunca muda de tamanho. A quarta é um diário que explica, permite desfazer e congelar. A regra do dono, "nada se mexe sem causa", coincide com a definição formal de instabilidade usada na investigação sobre treemaps (mudança de layout que não é causada por mudança de dados) e pode tornar-se um invariante testável. O limite honesto é que nenhum estudo testou a recomposição de um espaço de trabalho inteiro com operadores profissionais ao longo de turnos completos. FleetOS estaria a pisar terreno novo, e por isso a avaliação com operadores de tráfego faz parte do produto e não é um extra. Depois de 7 ou 8 redesenhos, o que falta não é outra linguagem visual: é a camada de decisão.

*Nota de leitura: as afirmações com ligação vêm das fontes. Os parágrafos marcados **Inferência para FleetOS** e as secções de proposta, avaliação e recomendações são interpretação nossa. Citações obtidas apenas através do resumo de um motor de pesquisa (página inacessível) vêm assinaladas como tal. As observações sobre o Studio atual vêm da leitura de `src/studio/` e não de investigação externa.*

## Nenhum software de despacho se reorganiza sozinho: a regra é moldura fixa, conteúdo vivo

Os produtos de frota mais próximos de FleetOS seguem todos o mesmo desenho: mapa ao vivo, listas ou quadros e **gestão por exceção**, em que o sistema mostra apenas o que precisa de atenção e o ordena. A Samsara descreve a sua interface de despacho como construída para destacar só o que exige ação, com exemplos como o motorista atrasado ou fora de rota, e com o planeador a poder corrigir à mão um plano otimizado num clique ([Samsara, 2025](https://www.samsara.com/uk/blog/behind-the-build-routing-and-navigation-at-samsara)). A Motive organiza o trabalho num Dispatch Board, com o mapa "Fleet View" como superfície de monitorização, e reclama 21% menos tempo de planeamento; o número é do próprio fornecedor e não tem verificação independente ([Motive, 2024](https://gomotive.com/wp-content/uploads/2024/09/2024Q3_1207994431646182_Product-Brief_Dispatch_Refresh-1.pdf)). A Webfleet aposta em reatribuição por arrastar e largar e em sugestões do melhor motorista com base no trânsito e no estado das ordens ([Webfleet](https://www.webfleet.com/en_gb/webfleet/products/webfleet/features/order-dispatching-optimisation/)). A documentação do Trimble TMW mostra um desenho **quadro primeiro, mapa a pedido**: vistas de quadro configuráveis e o mapa aberto a partir de um ícone ([Trimble TMW](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/c7a5498f6ad3/docs/Current/index.html)). No mercado ibérico, a Frotcom, sediada em Carnaxide e com mais de 500 empresas portuguesas como clientes, trata a monitorização dos **tempos de condução** como funcionalidade central, ao lado do mapa e dos alarmes ([Frotcom](https://www.frotcom.com/sites/default/files/asset/document/flyer_-_route_planning_and_monitoring.pdf); [Frotcom Lusitana, 2025](https://info.frotcom.com/blog/2025/04/frotcom-lusitana-15-years-transforming-fleet-management-portugal)).

Do lado dos carregadores e transitários, as torres de controlo estão a passar da lista de alertas para uma **fila de trabalho curada por agentes**. Num texto de maio de 2026, a project44 descreve:

- gatilhos configuráveis que decidem que sinais "acordam" o agente;
- casos rotineiros resolvidos antes de a equipa lhes chegar;
- casos que pedem julgamento a subir ao topo, já com a análise anexada;
- intervenção humana obrigatória quando há impacto no cliente, sinistro ou questão legal;
- uma **revisão semanal do comportamento do agente**, com cada interação registada e atribuível ([project44, 2026](https://www.project44.com/es/?p=80631)).

A Flexport agrupa mais de 600 tipos de exceção por categoria e ordena-os por prioridade ([Flexport](https://www.flexport.com/products/)). A FourKites lançou o Loft para automatizar o seguimento de disrupções, mas a Nucleus Research sublinha que o produto não promete autonomia total ([Nucleus Research](https://nucleusresearch.com/research/single/fourkites-expands-its-control-tower-strategy-with-loft/)). A Transporeon, a plataforma que um transportador ibérico mais provavelmente encontra do lado do cliente, centra-se na ETA e em avisar as partes quando há atraso ([Transporeon, 2025](https://www.transporeon.com/website/Fact%20Sheet/product%20pages/Visibility%20Hub/Transporeon-Visibility-fact-sheet-2025-EN.pdf)). Nenhuma destas fontes documenta uma disposição de ecrã que se reorganize em resposta a eventos. A adaptação está noutro sítio: **que itens aparecem, por que ordem, e se um agente já tratou deles**. Essa ausência pode refletir apenas o que as páginas comerciais escolhem descrever, e nenhum dos números de desempenho dos agentes tem medição independente.

As disciplinas de sala de controlo chegam à mesma conclusão por outro caminho e com regras mais duras.

- **ISA-101 (High-Performance HMI).** A filosofia associada à norma usa fundo cinzento e cores contidas para que o anormal se destaque. Organiza os ecrãs numa hierarquia de exposição progressiva de detalhe, a partir de uma visão geral de nível 1 que não serve para dar comandos (página obtida por resumo de pesquisa) ([ISA](https://blog.isa.org/the-high-performance-hmi)).
- **O nível 1.** Um guia de estudo descreve-o como o ecrã que responde num relance à pergunta "o âmbito de controlo está saudável?". Tem poucos indicadores analógicos e o estado dos equipamentos em baixo contraste, e só usa a cor de alarme quando há alarme. Marcha e paragem indicam-se por forma e não por vermelho e verde, para não colidirem com o significado de alarme ([open-exam-prep](https://open-exam-prep.com/study-guides/pe-control-systems/control-hmi-logic/hmi-control-room)).
- **Bill Hollifield**, coautor do *High Performance HMI Handbook*, pede que se evitem animação, 3D e cores vivas, que as tendências fiquem embutidas nos gráficos e que a cor de alarme seja exclusiva e redundante com forma e texto ([Control Global, 2011](https://www.controlglobal.com/articles/2011/the-ultimate-hmi)).
- **ASM Consortium (2015).** O livro branco traz dois pontos com consequências diretas para FleetOS. Os comandos de navegação devem ficar em **locais padrão**, coerentes com o modelo mental do operador. E os requisitos devem vir das **necessidades de decisão do operador em cada cenário, e não das suas preferências**, materializadas num documento de filosofia e guia de estilo da HMI ([ASM, 2015](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/March%2031%202015%20-%20Operator%20Situation%20Awareness%20and%20Delivering%20ASM%20compliant%20High%20Performance%20HMIs%20Failure%20Modes%20and%20Success%20Factors.pdf)).

Os benefícios do estudo NOVA/ASM, muito citados, aparecem com números diferentes consoante a fonte: 41% mais rapidez na resolução de problemas numa apresentação da Honeywell, sucesso em situações anormais de 10% para 48% numa tabela da PTQ. O relatório original não foi encontrado ([Honeywell, 2017](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/presentations/September%2014%202017%20ASM%20Ammonia%20Safety%20Conference.pdf); [PTQ, 2025](https://ptqmagazines.digitalrefining.com/PTQ-Q3-2025/87/)).

Onde as salas de controlo **são** adaptativas é no sistema de alarmes, não no ecrã. As referências secundárias à ISA-18.2 e à EEMUA 191 definem um orçamento ([open-exam-prep ISA-18.2](https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/alarm-management-isa182); [Digital Refining](https://digitalrefining.com/article/1000558/alarm-floods-and-plant-incidents)):

- em regime estável, cerca de **1 alarme por operador a cada 10 minutos** (≈6 por hora);
- 10 ou mais em 10 minutos contam como inundação, e as inundações devem ocorrer em menos de 1% dos períodos;
- a mistura de prioridades ronda 80/15/5.

A norma distingue três estados de supressão ([WinCC OA](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/alarmshelving/topics/alarm_shelving_overview.html); [Emerson](https://www.emerson.com/documents/automation/white-paper-advanced-alarming-techniques-deltav-en-6116368.pdf)):

- o *shelving*, iniciado pelo operador, com um temporizador que devolve o alarme automaticamente;
- a supressão por desenho, em que a lógica decide a relevância do alarme conforme o estado da instalação;
- o fora de serviço, controlado pela manutenção.

A Emerson considera o alarme dependente do estado a técnica avançada mais poderosa, e os guias práticos insistem que tem de ser especificado, testado e visível ([Emerson](https://www.emerson.com/documents/automation/white-paper-advanced-alarming-techniques-deltav-en-6116368.pdf)). A orientação de alertas da FAA para cabines de pilotagem vai no mesmo sentido ([FAA](https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_04_Section_01.html)):

- formulação, posição e cor consistentes, sob uma única filosofia;
- condições que não exigem a atenção da tripulação não geram alerta;
- os anúncios só existem enquanto a condição existe;
- a intermitência é limitada.

A teoria da consciência situacional de Mica Endsley explica porque é que juntar dados não chega. As falhas surgem quando cada sistema novo é simplesmente acrescentado e o decisor fica a integrar tudo sozinho. Os princípios dela pedem:

- informação organizada em torno de objetivos;
- compreensão apresentada diretamente;
- apoio à projeção do que vai acontecer;
- consciência global do estado de todos os objetivos.

O mesmo material avisa que "Cool is not necessarily functional" ([Endsley, 2012](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)). Entre os "demónios" da consciência situacional estão a saliência mal colocada, a deriva de complexidade e a síndrome de fora do circuito ([Endsley, 2012](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)).

A literatura de aviação acrescenta a **surpresa de automação**. Mudanças de modo iniciadas pelo sistema, indiretas e pouco observáveis, deixam o operador a perguntar o que está o sistema a fazer, porquê, e o que fará a seguir ([NASA NTRS](https://ntrs.nasa.gov/citations/20040112190)). As "ironias da automação" de Bainbridge (1983) lembram que automatizar o rotineiro deixa ao humano a monitorização e os casos mais difíceis, enquanto as suas competências se degradam por falta de uso ([Bainbridge, 1983](https://gwern.net/doc/sociology/technology/1983-bainbridge.pdf)). No controlo de tráfego aéreo, a SKYbrary nota que mudar o posto de trabalho do controlador é matéria sensível e que a aceitação de uma atualização se ganha ou perde na forma como a mudança é conduzida ([SKYbrary](https://skybrary.aero/articles/controller-position-design)).

As ferramentas profissionais que gerem muitas preocupações em simultâneo são **arrumadas pelo utilizador ou pelo construtor da aplicação, nunca pelo próprio sistema**.

- **Bloomberg.** O Launchpad deixa o subscritor arrumar componentes ligados entre vários monitores. O relançamento de 2017 foi deliberadamente gradual, porque mudanças bruscas perturbam os fluxos de trabalho dos especialistas, e o objetivo era que a atualização parecesse inalterada aos clientes (obtido por resumo de pesquisa) ([Bloomberg UX, 2017](https://www.bloomberg.com/ux/2017/11/10/relaunching-launchpad-disguising-ux-revolution-within-evolution/)).
- **Palantir.** Nas aplicações Workshop, as camadas do mapa ligam-se a variáveis de conjuntos de objetos nos dois sentidos: selecionar no mapa atualiza a variável e vice-versa. Isso faz da **seleção ligada** a cola entre mapa, lista e detalhe ([Palantir](https://palantir.com/docs/foundry/map/workshopConfiguration)).
- **Despacho de emergência (CAD).** Estes sistemas evoluíram para um ecrã único centrado no mapa, com lista de ocorrências e recomendação de meios. O Motorola Guardian, por exemplo, sugere que unidades enviar para reduzir a fadiga de decisão ([Motorola](https://www.motorolasolutions.com/content/dam/msi/docs/en-xu/public-safety/guardian-cad-data-sheet-police.pdf)). O estudo de campo de Whalen mostra o modo de falha: um CAD desenhado a partir da capacidade computacional, em vez da análise do trabalho real, levou Denver e o London Ambulance Service a regressar temporariamente ao despacho manual ([Whalen](https://researchgate.net/profile/Jack-Whalen/publication/263232352_Expert_Systems_versus_Systems_for_Experts/links/0f31753a314f45605e000000/Expert-Systems-versus-Systems-for-Experts.pdf)).

| Domínio | O que se adapta | O que fica fixo | Exemplos |
|---|---|---|---|
| Telemática e TMS de transportadores | exceções destacadas, sugestão de motorista | mapa, quadro de despacho, listas | Samsara, Motive, Webfleet, Trimble TMW |
| Torres de controlo de visibilidade | fila de exceções ordenada; casos resolvidos por agentes | estrutura do painel e da fila | project44, Flexport, FourKites |
| Salas de controlo (ISA-101/18.2) | inclusão e supressão de alarmes conforme o estado | hierarquia de ecrãs, locais de navegação, código de cores | ISA, Emerson, ASM |
| Espaços de trabalho profissionais | conteúdo de componentes ligados à seleção | disposição escolhida pelo utilizador ou construtor | Bloomberg, Palantir |
| Despacho de emergência | recomendação de meios | ecrã único centrado no mapa | Motorola Guardian, CAD com SIG |

**Inferência para FleetOS.** A resposta das salas de controlo ao "ambiente vivo" é *alarmes vivos, ecrãs estáveis*: o contexto decide o que é relevante e quão saliente é, enquanto a geografia, a hierarquia e as posições de navegação ficam fixas. Uma disposição que se recompõe fisicamente seria inédita na categoria. Pode ser um diferenciador, mas não há precedente que prove que funciona nem relatos de falha que mostrem onde se parte.

O escritório de um transportador ibérico fica entre os dois mundos. Planeia camiões e motoristas como os TMS de transportadores (quadro, mapa, arrastar), mas os clientes exigem ETA e atualizações de exceção como nas torres de controlo. FleetOS precisa das duas coisas no mesmo espaço.

Daqui saem quatro consequências práticas:

- **Dois temas são preocupações permanentes do ambiente, não páginas:** os tempos de condução (é isso que a Frotcom mostra que o mercado português espera) e as obrigações de visibilidade para com o cliente.
- **O *shelving* com retorno automático traduz-se diretamente.** Exemplo: "atraso conhecido em Algeciras, voltar a alertar daqui a 60 minutos".
- **A supressão por desenho também.** Exemplo: nenhum alerta de "parado" durante uma pausa de condução planeada.
- **O próximo degrau já é visível no mercado.** Depois de "mostrar o que importa", vem mostrar o que o sistema fez sozinho e o que precisa do humano, com registo auditável. Sem esquecer a advertência de Bainbridge: o humano fica com os casos mais difíceis.

## Mover coisas custa 8% de velocidade; mudar a forma no lugar não custa

O estudo mais citado sobre o tema comparou três tipos de menu: estáticos, adaptativos (o sistema decide) e adaptáveis (o utilizador decide). Teve 27 participantes e reproduziu 20 semanas de registos reais de uso do Word de uma assistente administrativa. Os resultados ([Findlater & McGrenere, 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)):

- **Velocidade.** O menu estático foi significativamente mais rápido do que o adaptativo em todas as ordens de apresentação. No segundo bloco, 306,5 s por 200 seleções contra 331,6 s, ou seja, o adaptativo foi **cerca de 8% mais lento**.
- **Preferência.** 55% preferiram o adaptável, 30% o adaptativo e 15% o estático.
- **Frustração.** O adaptativo foi apontado 15 vezes como o mais frustrante; o adaptável, uma só vez.
- **Perceção contra medição.** Muitos participantes *percecionaram* o adaptável como o mais eficiente, mesmo onde era mensuravelmente mais lento.

Um estudo de campo longitudinal com o Word 2000, citado no mesmo artigo, encontrou 65% de preferência pela versão adaptável ([Findlater & McGrenere, 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)). A indústria chegou à mesma conclusão. Os menus personalizados do Office 2000, cujo modelo o utilizador não podia ver nem alterar, foram desligados por omissão no Office 2007, e o Ribbon foi desenhado sem eles ([Harris, 2006](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus)).

A distinção decisiva não é entre adaptar e não adaptar, mas entre **mover e copiar**. Gajos e colegas compararam três interfaces ([Gajos et al., 2006](https://www.eecs.harvard.edu/~kgajos/papers/2006/kgajos-avi06-slides.pdf)):

- **"Split":** os itens previstos são copiados para uma zona própria. Os utilizadores classificaram-na em primeiro lugar, elogiaram a estabilidade e foram significativamente mais rápidos com ela do que sem adaptação.
- **"Moving":** os itens são deslocados. Gerou queixas de instabilidade.
- **Destaque visual:** gerou queixas de fraca descoberta.

No estudo de 2008, com 23 utilizadores experientes, a precisão e a previsibilidade mostraram efeitos distintos ([Gajos et al., 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf)):

- **Subir a precisão de 50% para 70%** reduziu o tempo de tarefa de 197 s para 177 s e aumentou o uso da zona adaptativa de 70,6% para 86,4%.
- **A previsibilidade** não alterou o desempenho, mas elevou a sensação de controlo de 3,73 para 4,73 numa escala de 7.
- Uma não compensa a falta da outra.
- Onze dos 23 descreveram espontaneamente a condição imprevisível como aleatória ou confusa.
- Dez pediram que os itens adaptativos ficassem mais perto da sua posição original.

A revisão de Findlater e Gajos (2009) arruma o campo em quatro alavancas: precisão, previsibilidade, frequência de mudança e localidade. E regista padrões consistentes ([Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)):

- O menu dividido original de Sears e Shneiderman mudou uma única vez durante o estudo e superou o estático; versões que mudavam após cada seleção pioraram.
- Adaptações eletivas (copiadas, que se podem ignorar) superam as obrigatórias (movidas).
- Uma zona adaptativa longe do foco faz com que adaptações úteis sejam ignoradas em **7–19%** das vezes.
- O destaque por cor não mostrou ganho de desempenho.
- A adaptação ajuda mais os principiantes do que os especialistas, e pode até prejudicar estes últimos.

A técnica com melhor registo é a **adaptação efémera**: os itens previstos aparecem de imediato e os restantes surgem em 500 ms, sem que nada mude de posição. A 79% de precisão foi mais rápida do que o menu estático; a 50% não foi mais lenta. Superou ainda o destaque por cor, que não foi mais rápido do que o estático. A explicação vem da perceção. O aparecimento súbito capta a atenção mais do que a cor, mas o efeito pode ser anulado: se o utilizador sabe onde está o alvo, ou sabe que a pista não é fiável, deixa de se distrair ([Findlater et al., 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)).

O mecanismo de fundo é a **memória espacial**. A monografia de Scarr, Cockburn e Gutwin defende que as interfaces devem ajudar o utilizador a memorizar onde estão os comandos e depois tirar partido disso ([Scarr et al.](https://nowpublishers.com/article/DownloadSummary/HCI-046)). No CommandMaps, uma disposição plana e espacialmente estável não fez diferença para principiantes, mas tornou os especialistas significativamente mais rápidos ([Scarr et al., CHI 2012](https://hci.cs.umanitoba.ca/publications/details/improving-command-selection-with-commandmaps)). O modelo de Cockburn, Gutwin e Greenberg explica porquê: o principiante paga tempo de busca visual, o especialista paga apenas tempo de decisão, e a adaptação espacial impede a passagem de um regime ao outro ([Cockburn et al., 2007](https://www.springerprofessional.de/doi/10.1145/1240624.1240723); [Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)).

Lavie e Meyer acrescentam o resultado mais relevante para o despacho. Em telemática de veículo, a adaptatividade total ajudou em situações rotineiras. Nas situações não rotineiras, para as quais não estava afinada, a carga cognitiva subiu substancialmente ([Lavie & Meyer, 2010](https://cris.bgu.ac.il/en/publications/benefits-and-costs-of-adaptive-user-interfaces/)).

Há um argumento sério a favor da ambição de FleetOS, e convém formulá-lo bem. A adaptação espacial funciona quando **elimina passos de navegação**. Um diretório telefónico adaptativo que encurtava o caminho até aos itens frequentes foi mais rápido do que o estático ([Findlater & McGrenere, 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)). E os menus divididos adaptativos ajudaram mais num ecrã do tamanho de um PDA do que num computador de secretária, porque navegar num ecrã pequeno é caro ([Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)). Um ambiente que proíbe páginas é, por definição, um espaço restrito: tudo o que importa compete pelo mesmo ecrã. É exatamente o regime em que decidir o que ocupa o espaço tem mais valor. A evidência não diz "não adaptes"; diz **"adapta copiando, no lugar, e raramente"**.

| Estudo | Contexto | Resultado | Consequência para o desenho |
|---|---|---|---|
| Findlater & McGrenere 2004 | 27 pessoas, registos reais de 20 semanas | adaptativo ≈8% mais lento do que o estático; 55% preferem controlar | não reordenar posições aprendidas |
| Gajos et al. 2008 | 23 utilizadores experientes | precisão 50→70%: 197→177 s; previsibilidade: controlo 3,73→4,73 | precisão e previsibilidade são ambas necessárias |
| Findlater & Gajos 2009 | revisão | ecos distantes ignorados 7–19%; destaque por cor sem ganho; especialistas podem piorar | ecos junto ao foco |
| Findlater et al. 2009 | 2 estudos × 24 pessoas | efémero mais rápido a 79%, não pior a 50% | mudar a saliência sem mover |
| Scarr et al. 2012 | CommandMaps | a estabilidade só compensa com a prática | o benefício cresce com o uso diário |
| Lavie & Meyer 2010 | telemática de veículo | a adaptação ajuda na rotina e sobrecarrega no imprevisto | incidentes pedem estabilidade |

### O sistema deve fazer menos, mas certo, e esperar pela pausa

Os doze princípios de iniciativa mista de Horvitz continuam a ser a referência. Em resumo ([Horvitz, 1999](https://www.erichorvitz.com/chi99horvitz.pdf)):

- **Automatizar só onde isso acrescenta valor**, tendo em conta a incerteza sobre o objetivo do utilizador.
- **Decidir por limiares de utilidade esperada:** o sistema age acima de um limiar superior, pergunta entre dois limiares e não faz nada abaixo do inferior.
- **Ajustar os limiares ao contexto:** um utilizador mais concentrado eleva o limiar de ação.
- **Tornar trivial invocar e terminar** a ajuda do sistema.
- **Fazer menos, mas corretamente, quando há dúvida.** Quando o LookOut não conseguia identificar uma hora concreta, mostrava a semana relevante em vez de adivinhar.

A literatura de fatores humanos acrescenta três pontos:

- **Confiança calibrada.** Lee e See definem o objetivo como confiança ajustada à capacidade real da automação, e não confiança máxima ([Lee & See, 2004](https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392)).
- **Consciência de modo.** Sarter e Woods mostram que as surpresas de automação nascem da falta de consciência do modo atual e futuro do sistema, mesmo em aviões altamente automatizados ([Sarter & Woods](https://ntrs.nasa.gov/citations/20040112190)).
- **Níveis intermédios.** Kaber e Endsley verificaram que níveis intermédios de automação deram maior consciência situacional ([Kaber & Endsley, 2004](https://bibbase.org/network/publication/kaber-endsley-theeffectsoflevelofautomationandadaptiveautomationonhumanperformancesituationawarenessandworkloadinadynamiccontroltask)).

As queixas mais comuns contra interfaces adaptativas são a falta de controlo sobre a adaptação e a dificuldade em prever a resposta do sistema ([Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)). As 18 diretrizes de interação humano-IA da Microsoft organizam-se por momento: no início, durante a interação, quando o sistema erra e ao longo do tempo. Os títulos individuais não foram verificados nesta pesquisa ([Microsoft Research](https://www.microsoft.com/research/project/guidelines-for-human-ai-interaction/)).

Recompor o ecrã é, na prática, interromper, e a investigação sobre interrupções é clara:

- **Interrupção negociada.** Num estudo com 36 pessoas numa tarefa do tipo resposta a emergências, a interrupção negociada, em que o utilizador decide quando atender, teve o melhor desempenho global ([McFarlane, 2002](https://www.interruptions.net/literature/McFarlane-HCI02_2.pdf)).
- **Pontos de pausa.** Iqbal e Bailey seguiram 16 pessoas durante duas horas a trabalhar nas suas próprias tarefas ([Iqbal & Bailey, 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)):
  - na edição de diagramas, entregar notificações em pontos de pausa intermédios baixou a frustração para 2,6, contra 4,5 na entrega imediata (escala de 7);
  - a reação às notificações relevantes foi mais rápida (3,07 s contra 4,08 s);
  - o adiamento médio custou 88,6 s;
  - os modelos automáticos só detetaram pontos de pausa com 52–59% de recall.

Sobre calma, movimento e mudança:

- **Calma.** A "tecnologia calma" de Weiser e Brown faz a informação circular entre a periferia e o centro da atenção, como o ruído do motor, que só se nota quando muda ([Weiser & Brown](https://calmtech.com/papers/designing-calm-technology)).
- **O movimento é o estímulo periférico mais forte.** Pistas de movimento simples foram detetadas com mais fiabilidade do que a cor ou a forma, sobretudo na visão periférica, o que também as torna as mais distrativas ([Bartram et al., 2003](https://www.interruptions.net/literature/Bartram-IJHCS03.pdf)).
- **Cegueira à mudança.** O utilizador não vê mudanças longe do foco, simultâneas ou sem pista de movimento. Os remédios são uma mudança de cada vez, perto do foco, animada e com as zonas inalteradas atenuadas ([NN/g, 2018](https://www.nngroup.com/articles/change-blindness-definition/)).

Heer e Robertson testaram transições animadas com 24 profissionais que usam gráficos no trabalho, com durações de 1,25 a 2 s ([Heer & Robertson, 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)):

- as transições animadas reduziram significativamente o erro de seguimento de objetos **em todos os tipos de transição** testados;
- uma encenação simples, em etapas, ajudou; a encenação pesada prejudicou;
- reescalar eixos aumentou os erros;
- quando dois estados não partilham dimensões, um corte com dissolução evita sugerir relações falsas.

A heurística corrente da prática de interfaces, 100–500 ms com justificação acima de 300 ms, é de fonte secundária ([Fronteers, 2024](https://www.fronteers.nl/en/blog/2024/12/microanimations)).

Para decidir o que cresce e o que encolhe, o precedente formal é o **grau de interesse (DOI)** de Furnas: o interesse de um item é a sua importância a priori menos a distância ao foco atual ([Furnas, 1986](https://cspages.ucalgary.ca/~saul/581/exer.eps/4furnas86.pdf)). van Ham e Perer estenderam-no a grafos com o lema "procurar, mostrar contexto, expandir a pedido" ([van Ham & Perer, 2009](https://dig.cmu.edu/publications/2009-doigraphs.html)). Hoffswell e colegas analisaram 231 visualizações responsivas e entrevistaram 5 jornalistas. Concluíram que adaptar visualizações a espaços diferentes exige controlo explícito do desenho para cada tamanho, e não reorganização automática genérica ([Hoffswell et al., 2020](https://idl.uw.edu/papers/responsive-vis)).

Ficam lacunas importantes:

- quase todos estes estudos testam menus e barras de ferramentas, não ecrãs inteiros;
- duram uma ou duas horas;
- usam estudantes ou utilizadores de escritório genéricos;
- não há estudo sobre efeitos de equipa nem sobre fadiga ao longo de um turno de 8 a 10 horas.

**Inferência para FleetOS.** Seguem-se cinco consequências quase diretas.

1. **Não reordenar continuamente posições que o operador aprende.** É o padrão com pior registo na literatura: adaptação espacial, obrigatória e frequente.
2. **Separar o estável do adaptativo.** Cada classe de coisa tem uma casa. O que o sistema destaca é **copiado** para uma zona de atenção perto do foco, ou destacado no próprio lugar.
3. **A precisão decide onde automatizar.** Os gatilhos determinísticos do domínio (ETA para lá da janela, limite de condução, documento caducado, restrição violada) têm precisão próxima de 100% e podem promover itens sozinhos. As sugestões especulativas ("talvez queira ver…") ficam abaixo do limiar em que a adaptação compensa e devem apenas ser oferecidas.
4. **FleetOS conhece os seus pontos de pausa.** Confirmar um plano, fechar um painel, enviar um aviso ao cliente: estes momentos são conhecidos de forma determinística, enquanto os modelos genéricos só os detetam com 52–59% de recall. Adiar recomposições não urgentes para esses momentos é barato e fiável.
5. **O risco mais sério não aparece numa demonstração.** Os operadores tornam-se especialistas depressa, e uma disposição que ajuda no primeiro dia pode atrasá-los na terceira semana. Mudar o tamanho no lugar fica entre destacar e mover, porque altera ligeiramente a posição dos vizinhos, e o seu efeito na memória espacial não está testado. É a primeira hipótese que a avaliação tem de verificar.

## Os sistemas generativos que funcionam escolhem de um catálogo e decidem por regras

O campo da interface generativa estabilizou num espetro de três abordagens ([CopilotKit](https://copilotkit.ai/generative-ui)):

- **Estática ou controlada:** o modelo apenas escolhe e preenche componentes que o programador construiu.
- **Declarativa:** o modelo emite uma árvore JSON restrita a um catálogo validado.
- **Aberta:** o modelo escreve HTML ou JavaScript completo. Esta abordagem é assinalada por questões de segurança e desempenho.

O Generative UI da Google, que gera HTML/CSS/JS com o Gemini 3 Pro, admite que a geração pode demorar um minuto ou mais. As preferências dos avaliadores foram medidas ignorando a velocidade ([Google Research, 2025](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)). O artigo associado conclui que as interfaces geradas ficam abaixo das feitas por especialistas, sendo pelo menos comparáveis em metade dos casos ([arXiv 2604.09577](https://arxiv.org/abs/2604.09577)).

O protocolo A2UI segue o caminho oposto ([A2UI](https://a2ui.org/); [A2UI, mensagens](https://a2ui.org/reference/messages/)):

- a interface do agente é um formato de dados declarativo, não código executável;
- só usa componentes pré-aprovados de um catálogo;
- os componentes formam uma lista plana em que os pais referenciam os filhos por identificador;
- os dados vivem num modelo separado, ligado por ponteiros JSON;
- há mensagens distintas para atualizar componentes e para atualizar dados.

O json-render da Vercel restringe a saída do modelo a um catálogo definido com Zod: uma saída malformada falha a validação em vez de ser desenhada ([InfoQ, 2026](https://infoq.com/news/2026/03/vercel-json-render)). O Vercel AI SDK desenha componentes tipados a partir de chamadas a ferramentas ([AI SDK](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)).

A OpenAI também impõe limites. As apps no ChatGPT aparecem sempre primeiro em linha, os cartões têm no máximo duas ações principais e não têm deslocamento interno, e o ecrã inteiro fica reservado a mapas e telas ([OpenAI Apps SDK](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)). No lançamento do canvas, a OpenAI treinou o modelo para decidir quando abrir essa superfície (83% de acertos em escrita, 94% em código) e enviesou-o deliberadamente contra a abertura em programação, para não perturbar utilizadores avançados. Estes números vêm de cópias do anúncio, porque a página original devolveu 403 ([OpenAI, canvas](https://openai.com/index/introducing-canvas/)). A NN/g propõe que os designers definam o que tem de aparecer, o que deve aparecer e o que nunca aparece, e avisa que interfaces em mudança constante causam problemas de usabilidade ([NN/g, 2024](https://www.nngroup.com/articles/generative-ui/)). Um balanço prático de 2026 conclui que a interface gerada falha em fluxos de memória muscular, operações críticas e fluxos auditáveis, e que o padrão vencedor é uma estrutura estática com geração apenas em widgets delimitados ([jacar.es, 2026](https://jacar.es/en/runtime-generated-ui-the-first-serious-year/)).

As superfícies de contexto maduras resolvem "o quê, quão grande e quando" sem qualquer modelo generativo.

**Apple Live Activities** ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)):

- A app fornece quatro apresentações (compacta, mínima, expandida, ecrã bloqueado) e o **sistema escolhe** qual usar.
- A escolha depende da **competição pelo espaço**: compacta quando há uma só atividade, mínima para até três quando há várias, expandida a pedido.
- A versão expandida é uma ampliação da compacta. Os elementos existentes devem ser animados para as novas posições, em vez de removidos e reintroduzidos.
- As animações duram no máximo 2 segundos.
- Só se atualiza quando há conteúdo novo, e só se alerta para o essencial.

**Smart Stack (Apple)** ([Apple, TimelineEntryRelevance](https://developer.apple.com/documentation/widgetkit/timelineentryrelevance); [Apple, Smart Stacks](https://developer.apple.com/documentation/widgetkit/widget-suggestions-in-smart-stacks)):

- Cada widget declara uma pontuação de relevância com uma duração.
- Uma pontuação de zero ou menos significa "nunca promover".
- A escala deve ser consistente.
- O sistema limita o número de rotações.
- O utilizador pode fixar widgets.

**At a Glance (Google).** Explica a sua origem através de um "Acerca deste conteúdo" ([9to5Google, 2023](https://9to5google.com/2023/08/21/about-at-a-glance/)).

**Android Automotive.** Quando o estado de condução o exige, impõe orçamentos numéricos: comprimento máximo de texto, número máximo de itens e profundidade máxima de navegação ([Android, CarUxRestrictions](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictions)).

**Grafana 12.** Esconde painéis e linhas sem dados ou irrelevantes para a variável atual, e oferece um índice estrutural do painel ([Grafana](https://grafana.com/blog/dynamic-dashboards-grafana-12/)).

**Superhuman e Raycast.** Na paleta de comandos do Superhuman, a regra é dar mais peso ao relevante e esconder apenas o verdadeiramente irrelevante ([Superhuman](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)). O Raycast ordena por frequência e recência, com decaimento, e oferece um botão de "repor ordenação" ([Raycast](https://www.raycast.com/changelog/macos-v1/1-40-0); [Raycast, manual](https://manual.raycast.com/search-bar.md)).

As ferramentas profissionais que tentaram ser mais fluidas recuaram:

- **Figma.** No UI3, os painéis flutuantes apertavam a tela, deixavam o desenho espreitar por trás e, sobretudo, abrandavam quem passa muitas horas por dia no Figma. Para o lançamento final, a empresa voltou a painéis fixos e redimensionáveis e registou que redesenhos assustam os utilizadores ([Figma, 2024](https://www.figma.com/blog/our-approach-to-designing-ui3/)).
- **Linear.** O redesenho de 2024 recusou uma revisão total e adiou as alterações de navegação por serem mais arriscadas ([Linear, 2024](https://linear.app/now/how-we-redesigned-the-linear-ui)).
- **Bloomberg.** Descreve a sua estratégia como esconder complexidade, com o cuidado de que até mudar uma fonte ou deslocar um botão perturba (obtido por extração de pesquisa) ([Bloomberg](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity)).

Os fracassos documentados completam o quadro:

- **Windows 8.** Os Live Tiles tentavam ser ícone, widget e notificação ao mesmo tempo, e cada revisão seguinte foi desfazendo a ideia ([PCWorld, 2015](https://www.pcworld.com/article/428571/a-tribute-to-windows-8-if-it-hadnt-been-so-bad-windows-10-wouldnt-be-so-good.html)).
- **Google Now.** Os cartões proativos deram lugar a um feed genérico ([Wikipedia, Google Now](https://en.wikipedia.org/wiki/Google_Now)).
- **watchOS 10.** A Apple teve de devolver um gesto estabelecido depois de o Smart Stack o substituir ([TidBITS, 2023](https://tidbits.com/2023/12/15/why-did-apple-change-the-watchos-10-interface)).
- **Arc.** Só 5,52% dos utilizadores diários usavam regularmente mais do que um Space, 4,17% usavam Live Folders e 0,4% a pré-visualização de calendário. A empresa chamou-lhe "imposto de novidade" ([Browser Company, 2025](https://browsercompany.substack.com/p/letter-to-arc-members-2025)).

A linhagem conceptual que separa as coisas das suas apresentações é antiga e bem documentada. No Notion, cada bloco tem um tipo e propriedades. Mudar o tipo preserva as propriedades, mesmo as que o novo tipo ignora ([Notion, 2021](https://www.notion.com/blog/data-model-behind-notion)). O ensaio da Ink & Switch sobre software maleável defende dados partilhados sobre os quais várias ferramentas atuam, e uma "rampa suave" em que cada aumento de poder de adaptação custa apenas um pequeno aumento de aprendizagem ([Ink & Switch, 2025](https://www.inkandswitch.com/essay/malleable-software/)).

| Mecanismo em produção | Fonte | Equivalente em FleetOS |
|---|---|---|
| Escada de apresentações escolhida pela competição pelo espaço | Apple Live Activities | cada coisa tem 4–5 formas; o compositor escolhe consoante o espaço disponível |
| Pontuação + duração de validade; ≤0 nunca promove | Apple WidgetKit | importância a priori + janela de validade do domínio |
| Limite de rotações + fixar | Apple Smart Stack | orçamento de promoções + fixar bloco |
| Orçamentos de itens e profundidade por estado | Android Automotive | orçamento de atenção por modo (rotina, foco, incidente) |
| Esconder o que não tem dados + índice estrutural | Grafana 12 | regiões vazias recolhem; índice do "onde estou" |
| Dar peso ao relevante, não esconder | Superhuman | barra de perguntas e comandos com tudo acessível |
| Frecência com decaimento + repor | Raycast | aprendizagem de hábitos só na ordenação da barra |
| Catálogo declarativo; dados separados dos componentes | A2UI, json-render | plano de composição separado do fluxo de dados vivos |

**Inferência para FleetOS.** Na taxonomia atual, "coisas × formas × composições" é um sistema declarativo restrito a catálogo: as coisas são o modelo de dados, as formas são o catálogo de componentes e as composições são as superfícies.

- **Separar dados de composição.** A peça útil do A2UI é a separação entre mensagens de componentes e mensagens de dados. ETA, posições e estados devem atualizar-se no lugar sem recompor. Só uma mudança de pergunta, de foco, de modo ou de limiar deve produzir um novo plano.
- **Decisões determinísticas.** Todas as fontes que medem qualidade ignoram ou assinalam a latência, e um escritório de tráfego não pode esperar segundos por um ecrã. As decisões de composição devem por isso ser **determinísticas, rápidas, testáveis e auditáveis**. Um LLM, se entrar, só traduz uma pergunta em texto livre para uma receita conhecida, com parâmetros validados.
- **"Quão grande" resolve-se pela competição.** Na escada das Live Activities, o tamanho é escolhido pela competição pelo espaço e não pela importância isolada.
- **Duas regras dos produtos maduros chocam com a visão do dono e devem ceder à calma.** A rotação automática de eventos numa superfície única (Apple) seria movimento sem causa, por isso a região de atenção empilha e conta em vez de rodar. E a aprendizagem de hábitos deve ficar na ordenação de comandos e perguntas, com opção de repor, e nunca na disposição.
- **Evitar o imposto de novidade.** O aviso do Arc vale à letra: a recomposição deve ser a parte invisível. O que o operador vê tem de ser mapa, quadro, lista e linha do tempo, artefactos que já conhece.

## A engenharia da calma: topologia com estado, commits com causa, tela do mapa imóvel

A investigação sobre treemaps é o análogo académico mais próximo de "blocos que crescem e encolhem conforme a atenção", e quantifica um compromisso que FleetOS vai enfrentar. Os treemaps ordenados de Shneiderman e Wattenberg nasceram precisamente para evitar mudanças descontínuas e dramáticas quando os dados mudam. Os treemaps "quantum" forçam os retângulos a múltiplos inteiros de uma unidade ([Bederson et al., 2002](https://umiacs.umd.edu/node/17312)). A comparação de Vernier e colegas, com 14 algoritmos e mais de 2000 conjuntos de dados, mostra três comportamentos ([Vernier et al., 2020](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf)):

- **Sem ordem** (squarified): dão as melhores proporções, mas trocam de posição quando os pesos ficam próximos.
- **Ordenados:** são estáveis, mas perdem qualidade visual quando os pesos variam muito.
- **Com estado** (Local Moves, Git): reutilizam a disposição anterior e mantêm a estabilidade mesmo com mudanças frequentes, à custa de uma qualidade que se degrada com o tempo. A variante LM4, que limita os movimentos por passo, gere explicitamente esse compromisso.

O ponto mais útil do trabalho é a definição: **instabilidade é uma grande mudança de layout que não é causada por uma grande mudança nos dados**, medida contra uma disposição de referência que reajusta a anterior aos novos tamanhos ([Vernier et al., 2020](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf)). O `d3.treemapResquarify` oferece uma variante prática: preserva as adjacências da disposição anterior e só muda tamanhos, sendo indicado para animar sem baralhar ([d3](https://d3js.org/d3-hierarchy/treemap)). Os resolvedores de restrições do tipo Cassowary (o `@lume/kiwi` em TypeScript) só se justificam para relações declaradas pelos designers ([lume/kiwi](https://github.com/lume/kiwi)). A documentação do Auto Layout da Apple deixa uma lição geral: é melhor uma vista ficar com o tamanho errado do que criar um conflito ([Apple Auto Layout](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/AutolayoutPG/AnatomyofaConstraint.html)). A interpolação de `grid-template-columns`/`-rows` já funciona em Chrome 107+, Firefox 66+ e Safari 16+ ([web.dev](https://web.dev/articles/css-animated-grid-layouts)), mas mudar propriedades geométricas desencadeia layout em praticamente todo o documento ([web.dev](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)).

Contra a tremulação, a cartografia dinâmica fixa critérios de monotonia: as etiquetas não devem "saltar", nem desaparecer ao aproximar ou aparecer ao afastar ([Been et al., 2006](https://cs.nyu.edu/visual/home/pub/infovis06.pdf)). O próprio código dos marcadores MapLibre aplica quantização à chegada: não arredonda píxeis durante o movimento, porque isso faz o zoom engasgar, e arredonda só quando a câmara para ([MapLibre, marker.ts](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/marker.ts)).

No React, três peças são relevantes:

- **`useDeferredValue` não é um debounce.** Não tem atraso fixo, adapta-se à velocidade do dispositivo e a renderização em segundo plano é abandonada quando chega um valor mais recente ([React](https://react.dev/reference/react/useDeferredValue)).
- **`<ViewTransition>` estável no React 19.3** (setembro de 2026). Só anima atualizações marcadas como Transition. O `addTransitionType` permite dizer ao React *o que causou* a transição, para que a mesma mudança de estado anime de forma diferente consoante a causa ([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)).
- **A janela de 100 ms do FLIP.** Depois de uma interação há cerca de 100 ms para fazer trabalho sem que o utilizador note ([Aerotwist, FLIP](https://aerotwist.com/blog/flip-your-animations/)).

Na animação, o Motion (`layout`, `layoutId`) anima mudanças de layout por `transform`, é interrompível e corrige a distorção dos filhos durante escalas. A configuração `reducedMotion="user"` desativa animações de transformação e mantém as de opacidade ([Motion](https://motion.dev/docs/react-layout-animations); [Motion, acessibilidade](https://motion.dev/docs/react-accessibility)). As View Transitions guardam o estado antigo como imagem estática ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)). As transições limitadas a um elemento, disponíveis no Chrome 147, mantêm o resto da página interativo, o que desatualiza em parte a crítica do Motion de que as View Transitions bloqueiam a interação ([Chrome, 2026](https://developer.chrome.com/blog/element-scoped-view-transitions)). Uma mola com `bounce: 0` é criticamente amortecida, e as molas físicas preservam a velocidade quando uma animação é interrompida a meio ([Motion, transições](https://motion.dev/docs/react-transitions)). Pelas nossas contas, o predefinido do react-spring (tensão 170, fricção 26) corresponde a uma razão de amortecimento ≈1,0 ([react-spring](https://raw.githubusercontent.com/pmndrs/react-spring/main/packages/core/src/constants.ts)).

O mapa é a peça mais cara e a mais fácil de estragar.

- **Redimensionar a tela custa caro.** Cada mudança de tamanho limpa o buffer WebGL, e desde o PR #4632 (setembro de 2024) o MapLibre redesenha um fotograma completo de forma síncrona a cada redimensionamento, para evitar o clarão branco ([MapLibre PR #4632](https://github.com/maplibre/maplibre-gl-js/pull/4632); [issue #4158](https://github.com/maplibre/maplibre-gl-js/issues/4158)).
- **O exemplo oficial nunca redimensiona o contentor.** No exemplo de deslocar o ponto de fuga, os painéis laterais deslizam por `transform` e a câmara chama `easeTo({ padding })` com a mesma duração da transição CSS ([MapLibre, exemplo](https://maplibre.org/maplibre-gl-js/docs/examples/offset-the-vanishing-point-using-padding/)).
- **Atenção às corridas.** A migração do site do OpenStreetMap encontrou uma corrida entre a transição da barra lateral e o redimensionamento do mapa ([OSM rails-dev, 2026](https://lists.openstreetmap.org/pipermail/rails-dev/2026-January/047165.html)).
- **Marcadores DOM custam O(n) por fotograma.** Cada `Marker` reescreve o seu `transform` em cada evento de movimento da câmara ([MapLibre, marker.ts](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/marker.ts)). Um guia secundário situa o limite prático dos marcadores HTML em cerca de 100 ([guia Mapbox, secundário](https://mcpservers.org/de/agent-skills/mapbox/mapbox-web-performance-patterns)).
- **Camadas e fontes.** O custo de desenho cresce com o número de fontes, camadas e vértices. Convém separar dados estáticos de dinâmicos e usar `setFeatureState` para destaques, em vez de reprocessar geometria ([Mapbox](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/); [MapLibre, grandes volumes](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)).
- **Contextos WebGL.** Os navegadores limitam-nos a cerca de 16 em simultâneo ([WebKit](https://webkit.googlesource.com/WebKit/+/70e10861eb2fbd9d0862fd8702874c25ae5d8bfd%5E%21)).

Os orçamentos de desempenho são conhecidos:

- só `transform` e `opacity` são processados apenas pelo compositor ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count));
- há 16 ms por fotograma a 60 fps ([web.dev](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing));
- a API Long Animation Frames mede o bloqueio acima de 50 ms ([Chrome, LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames));
- o INP é bom até 200 ms ([web.dev, INP](https://web.dev/articles/inp));
- com `useSyncExternalStore`, uma mudança no store durante uma Transition obriga a uma re-renderização bloqueante ([React](https://react.dev/reference/react/useSyncExternalStore)), pelo que dados ao vivo a alta frequência podem reiniciar recomposições sem fim.

**Observação do código atual (`src/studio`).** O Studio já acerta em várias destas escolhas:

- O palco do mapa ocupa o ecrã inteiro (`.stage { position:absolute; inset:0 }`), por isso a tela não muda de tamanho quando os painéis abrem.
- O enquadramento usa `fitBounds`/`easeTo` com `padding` calculado a partir da largura do painel (`pad()` em `StageMap.tsx`), com durações de 700 a 1800 ms.
- O `flip.ts` implementa FLIP via WAAPI com chaves partilhadas (`data-flip`) e duração de 380 ms, o que respeita a regra de continuidade de identidade.

Três pontos divergem da evidência:

- **Painéis sobre o mapa.** O deck (388 px) e o painel (452 px) são camadas absolutas sobre o mapa (`z-index` 3–4). Tecnicamente, são painéis flutuantes por cima do mapa: a configuração que o Figma abandonou e que o dono quer evitar.
- **Marcadores DOM.** Os pinos de transportes, paragens, posto e candidato são `maplibregl.Marker` DOM. É aceitável com dezenas, mas o custo cresce com o número de pinos em cada fotograma de câmara.
- **Versões.** As versões instaladas (`react ^19.2.5`, `maplibre-gl ^5.23`) ficam aquém do `<ViewTransition>` estável do React 19.3 e das correções de redimensionamento da linha 6.x do MapLibre. O Motion não está instalado.

Nenhum destes pontos exige reescrever a camada de animação: o que falta é a camada que decide.

**Inferência para FleetOS.** Com 3 a 12 blocos cujos pesos mudam continuamente, FleetOS está no regime em que algoritmos sem estado (squarified, ou uma grelha CSS recalculada a partir de pontuações) são mensuravelmente instáveis. A recomendação técnica tem cinco partes:

1. **Uma árvore de cortes com estado.** Cada nó interno é uma divisão horizontal ou vertical com pesos e traduz-se diretamente em faixas de CSS Grid. A topologia (quem está à esquerda ou acima de quem) persiste entre commits e só os tamanhos se reajustam. Apenas se a qualidade cair abaixo de um mínimo se admite no máximo um movimento local por commit. Os tamanhos encaixam numa grelha de unidades, como nos treemaps "quantum", o que transforma pequenas variações de pontuação em zero mudanças.
2. **Um pipeline de "mover só com causa".**
   - As pontuações são suavizadas e quantizadas em níveis de forma, com histerese de entrada e saída e um tempo mínimo de permanência em cada nível.
   - Cada commit leva uma etiqueta de causa, que escolhe a animação via `addTransitionType`.
   - Os commits ambientes ficam em fila enquanto o ponteiro está premido ou há um arrastamento ou deslocação do mapa em curso.
3. **Valores de partida para afinar em teste.** Histerese de ≈0,08–0,10 numa escala de 0 a 1, permanência de 3–8 s e no máximo um commit estrutural por segundo. Nenhum destes valores tem base empírica.
4. **Uma estratégia de mapa sem redimensionamento.**
   - Uma tela de tamanho fixo cobre a maior área que o mapa pode ocupar.
   - Um recorte (`overflow: hidden` ou `clip-path`) representa o bloco atual.
   - `easeTo({ padding })` usa a mesma duração da mola do layout.
   - Só há um `resize()` quando a janela muda de tamanho.
   - As viaturas ficam em camadas GeoJSON, com `feature-state` para seleção e atenção. Os marcadores DOM ficam reservados a um a dez sinais ricos.
   - Há uma única instância de mapa, nunca desmontada.
5. **Dados ao vivo fora do React.** Os dados vivem num store externo com notificações agrupadas a 2–4 Hz.

## A proposta para FleetOS: doze regras, um compositor determinístico e âncoras declaradas

Tudo o que se segue é proposta nossa, construída sobre a evidência acima. A coluna de base indica a força do apoio.

### Doze princípios com a respetiva base

| # | Princípio | Regra operacional em FleetOS | Base e força |
|---|---|---|---|
| 1 | Âncoras fixas, forma viva | A topologia das regiões e as posições do mapa e das lentes nunca mudam por iniciativa do sistema. A relevância altera a forma, o tamanho quantizado e a saliência no lugar | Forte em menus e barras ([Gajos 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf); [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)); a transferência para o ecrã inteiro é inferência |
| 2 | Ecoar, não mover | O que o sistema destaca é copiado para a região de atenção, junto ao foco; o original fica na sua lista | Forte ([Gajos 2006](https://www.eecs.harvard.edu/~kgajos/papers/2006/kgajos-avi06-slides.pdf)); ecos distantes ignorados 7–19% |
| 3 | Toda a mudança tem causa | Cada alteração de layout ou de câmara regista a sua causa: ação do utilizador, evento, limiar de tempo cruzado ou mudança de modo. Sem causa, nada se mexe | Definição de instabilidade de [Vernier 2020](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis20/paper2.pdf); [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities); [Been 2006](https://cs.nyu.edu/visual/home/pub/infovis06.pdf) |
| 4 | Precisão antes de autonomia | Só gatilhos determinísticos promovem itens sozinhos. As previsões oferecem-se; abaixo do limiar, nada acontece | Forte ([Gajos 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf); [Findlater 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf); [Horvitz 1999](https://www.erichorvitz.com/chi99horvitz.pdf)) |
| 5 | Orçamento de atenção | Até cerca de 6 promoções do sistema por hora e por operador em regime estável. Mais de 10 em 10 minutos é uma inundação: agrupar por causa raiz. Limites de itens e de profundidade por modo | Heurística da indústria de processo ([ISA-18.2, secundária](https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/alarm-management-isa182); [CarUxRestrictions](https://developer.android.com/reference/android/car/drivingstate/CarUxRestrictions)); não validada em transportes |
| 6 | Cinzento normal, cor só para a exceção | Estado normal em tons neutros; cor reservada a exceções, com codificação redundante (forma e texto). A cor de foco não pode partilhar o tom do alarme: hoje `--focus #e0502a` e `--bad #d2401f` são quase o mesmo vermelhão | Prática consolidada ([Hollifield 2011](https://www.controlglobal.com/articles/2011/the-ultimate-hmi); [open-exam-prep](https://open-exam-prep.com/study-guides/pe-control-systems/control-hmi-logic/hmi-control-room)); a colisão é observação do código |
| 7 | Movimento só para transições e exceções verdadeiras | Nada em repouso se mexe. Uma transformação causada pelo utilizador dura 300–450 ms, sem ressalto. Uma recomposição de modo dura cerca de 1 s e deixa um rasto visível. As exceções surgem de repente, sem intermitência | Moderada ([Heer & Robertson 2007](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf); [Bartram 2003](https://www.interruptions.net/literature/Bartram-IJHCS03.pdf); [FAA](https://hfcc.dot.gov/publications/docs/GeneralGuidance/zz_FAA_GeneralGuidanceDoc_Chapter_04_Section_01.html)) |
| 8 | Esperar pela pausa ou negociar | O que não é urgente fica em fila até à próxima pausa explícita (confirmar, fechar, enviar), ou surge como "3 alterações prontas". Questões legais e de segurança interrompem de imediato | Moderada a forte ([Iqbal & Bailey 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf); [McFarlane 2002](https://www.interruptions.net/literature/McFarlane-HCI02_2.pdf)) |
| 9 | Explicar, fixar, desfazer, congelar | Cada promoção tem uma linha "porquê". Qualquer bloco pode ser fixado. É possível desfazer a última recomposição e congelar o ambiente. O *shelving* devolve os itens automaticamente | Moderada ([Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf); [WinCC OA](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/alarmshelving/topics/alarm_shelving_overview.html); [9to5Google](https://9to5google.com/2023/08/21/about-at-a-glance/)) |
| 10 | Mostrar o modo | Anunciador permanente na barra superior: "Rotina", "Foco: transporte 4201", "Incidente: fronteira de Caia", "A seguir: 45-AB-12" | Forte em aviação ([Sarter & Woods](https://ntrs.nasa.gov/citations/20040112190); [Endsley 2012](https://ndia.dtic.mil/wp-content/uploads/2012/armaments/WednesdayEndsley.pdf)) |
| 11 | Proteger a consciência do que não foi destacado | Uma visão de nível 1, compacta e estável, de todos os camiões e transportes está sempre presente | Moderada (compromisso entre eficiência e consciência em [Findlater & Gajos 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)) |
| 12 | Mais estabilidade quando a situação piora | Num incidente, a adaptação ambiente congela e entra uma composição de incidente desenhada à mão e anunciada | Moderada ([Lavie & Meyer 2010](https://cris.bgu.ac.il/en/publications/benefits-and-costs-of-adaptive-user-interfaces/); [Kaber & Endsley 2004](https://bibbase.org/network/publication/kaber-endsley-theeffectsoflevelofautomationandadaptiveautomationonhumanperformancesituationawarenessandworkloadinadynamiccontroltask)) + inferência |

Duas regras transversais completam a tabela.

- **Nada de conceitos novos para aprender.** O operador vê mapa, quadro, lista e linha do tempo, nunca "espaços" ou "modos" que tenha de estudar. Esta regra vem dos casos do Arc, do Windows 8 e do watchOS 10.
- **As âncoras são as mesmas para toda a equipa.** Num escritório onde se diz "olha o terceiro cartão" ou onde o chefe de tráfego ajuda à distância, disposições aprendidas por pessoa quebram a referência partilhada. Esta regra é inferência a partir de um relato anedótico sobre o Office ([Harris, 2006](https://learn.microsoft.com/en-us/archive/blogs/jensenh/the-end-of-personalized-menus)).

### Arquitetura: a camada que falta é a de decisão

A nossa leitura das 7 a 8 iterações é esta: a política de composição nunca foi escrita. Cada redesenho mudou a superfície, e a decisão sobre o que aparece, com que tamanho e quando ficou implícita dentro dos componentes. A recomendação é tornar essa política um módulo próprio, em TypeScript puro e sem React, testado como `model.ts` já é. O compositor recebe:

- o mundo;
- o foco do utilizador (seleção, lente ativa, pergunta feita);
- as preocupações geradas por regras de domínio;
- a hora;
- o plano anterior.

E devolve três coisas:

- um novo plano de composição, ou o mesmo plano se nenhuma causa o justificar;
- a lista de mudanças adiadas para a próxima pausa;
- uma entrada de diário com a causa e a razão de cada alteração.

A regra que decide "o quê" é um grau de interesse ao estilo de Furnas:

> **interesse = importância a priori − distância ao foco**

- **Importância a priori.** Vem das regras do domínio: risco legal nos tempos de condução, janela do cliente, valor, carga ADR, documento em falta.
- **Distância ao foco.** É medida no grafo de relações. O transporte aberto está à distância 0. O seu motorista, camião, reboque, paragens, postos no corredor e documentos estão à distância 1. O mesmo corredor ou o mesmo cliente estão à distância 2. O resto está à distância 3.
- **Frecência com decaimento.** Pode acrescentar-se mais tarde, e apenas para ordenar perguntas e comandos.

A regra que decide "quão grande" é a escada de formas com competição pelo espaço. O interesse quantizado escolhe o nível (ponto, linha, compacto, cartão, folha), com histerese, e o espaço disponível na região limita-o. Com um transporte em foco, a forma é a folha completa. Com três itens a disputar a região de atenção, a forma é compacta. Com mais de três, a forma é mínima, com um "+N".

A regra que decide "quando" é a classe da causa:

| Classe de causa | Exemplo | Quando entra | Como se vê |
|---|---|---|---|
| Utilizador | clicar num transporte, escolher uma lente, fazer uma pergunta | imediatamente | transformação de 300–450 ms com a câmara sincronizada |
| Evento crítico (legal/segurança) | motorista a 20 min do limite de condução; acidente | imediatamente, como eco | aparecimento súbito na região de atenção e destaque no mapa; nada se desloca |
| Evento normal | ETA passa a janela de descarga em 15 min | na próxima pausa, ou como "N alterações prontas" | eco e mudança de forma no lugar |
| Limiar de tempo | janela de carga a 30 min | como um evento normal | idem |
| Modo | entrar em "Incidente: fronteira de Caia" | por ação do utilizador, ou proposta aceite | recomposição de cerca de 1 s com rasto, e anunciador atualizado |
| Ambiente | ETA oscila 2 minutos | nunca altera o layout | só os números mudam no lugar |

As camadas organizam-se assim, aproveitando o que já existe:

| Camada | Responsabilidade | No código |
|---|---|---|
| Mundo | registos únicos de transporte, camião, motorista, reboque, paragem, posto, documento, alerta | `src/studio/world/` (existe) |
| Preocupações | regras determinísticas que produzem {coisa, importância, janela de validade, causa, certeza, razão} | novo módulo, por exemplo `src/studio/compose/concerns.ts` |
| Foco | seleção, lente, pergunta; distância no grafo de relações | novo, alimentado pelo `Studio.tsx` |
| Compositor | grau de interesse, níveis de forma, histerese, permanência, orçamento, adiamento, modo | novo, TypeScript puro, com testes de propriedades |
| Layout | árvore de cortes com estado; unidades de grelha; no máximo um movimento local por commit | novo |
| Catálogo de formas | componentes por (coisa, forma), desenhados à mão para cada tamanho | `cards.tsx`, `JobPanel.tsx`, `parts.tsx` (existem) |
| Movimento | FLIP com chaves partilhadas; duração escolhida pela causa; movimento reduzido | `flip.ts` (existe; acrescentar a causa) |
| Adaptador do mapa | instância única, tela fixa, padding, camadas com `feature-state`, histerese de câmara | `StageMap.tsx` (existe) |
| Dados vivos | store externo agrupado a 2–4 Hz; seletores estreitos; nunca altera o layout | parcial |
| Diário | registo de cada commit (causa, razão, antes/depois); desfazer; revisão semanal | novo |

```ts
// Esboço do contrato do compositor (TypeScript puro, sem React)
type Cause = "utilizador" | "evento-critico" | "evento" | "limiar" | "modo" | "ambiente";
type Form = "ponto" | "linha" | "compacto" | "cartao" | "folha";
type Mode = { kind: "rotina" } | { kind: "foco"; thing: ThingRef } | { kind: "incidente"; rootCause: string };

interface Concern { thing: ThingRef; apriori: number; validUntil?: number; cause: Cause; certainty: "deterministica" | "prevista"; reason: string }
interface Placement { thing: ThingRef; region: RegionId; form: Form; reason: string; pinned?: boolean; enteredAt: number }
interface LayoutPlan { mode: Mode; tree: SliceTree; placements: Placement[]; cause: Cause; at: number }

// Invariante testável: se nenhuma causa ≠ "ambiente" ocorreu, compose(prev, …).plan === prev
declare function compose(prev: LayoutPlan, world: StudioWorld, focus: Focus, concerns: Concern[], now: number, atBreakpoint: boolean):
  { plan: LayoutPlan; deferred: Concern[]; journal: JournalEntry[] };
```

O invariante no comentário é a forma operacional da regra do dono. Junto com a métrica de Vernier (deslocação de cantos face à disposição de referência), dá um teste automático: **zero deslocação sem causa registada**.

### Âncoras: o que nunca se mexe e o que pode viver

| Âncora | Fica fixo | Pode viver |
|---|---|---|
| Mapa | lugar na composição; instância nunca desmontada; câmara só se move por causa do utilizador ou quando o foco sai da área visível | destaque por `feature-state`, rotas, sinais ancorados às viaturas |
| Topologia das regiões | ordem esquerda→direita (deck, mapa, atenção) e barra superior | largura em unidades de grelha, em 3–4 níveis discretos |
| Separadores de lentes | posição e ordem (Transportes, Trabalhos, Paragens, Combustível, Motoristas, Frota) | conteúdo do deck, lente ativa |
| Ordem nas listas "casa" | ordenação estável (hora de carga, matrícula, nome) | forma de cada linha; cor só para exceções |
| Região de atenção | localização fixa; a ordenação por prioridade é a sua função | ecos, contagem, agrupamento por causa raiz, itens em espera |
| Identidade das coisas | glifo, tom, chave de flip (`bg-`, `drv-`, `plate-`), posição relativa dos campos-chave | forma (ponto → linha → cartão → folha) |
| Barra superior | anunciador de modo e barra de perguntas sempre no mesmo sítio | texto do modo e sugestões |

O pedido do dono de que o ambiente "nunca seja o mesmo ecrã" é compatível com esta tabela. O ecrã muda constantemente de **conteúdo, forma e foco**: abrir um transporte transforma o cartão numa folha e puxa para perto o motorista, o camião, os postos e os documentos. Uma pergunta como "o que vem a seguir?" troca a forma das coisas para uma projeção das próximas horas, e um dia calmo é esparso enquanto um dia carregado é denso. O que não muda é **onde** cada coisa mora.

A única exceção ao espaço fixo são as mudanças de modo. São raras, anunciadas e desenhadas à mão, como os menus que mudavam uma única vez. O "temperamento" do ambiente deve funcionar ao contrário do que a intuição sugere: quanto pior a situação, **menos** coisas se mexem por iniciativa própria e mais o ambiente agrupa por causa raiz. Quanto à regra de não pôr painéis sobre o mapa, a estratégia de tela fixa com recorte responde-lhe tecnicamente: as regiões vizinhas recortam o mapa em vez de o tapar. Como isso altera o aspeto atual (deck em vidro sobre o mapa), é uma decisão visual que cabe ao dono e deve ser testada antes de ser adotada.

## Avaliar com operadores de tráfego antes de treinar qualquer modelo

A literatura de interfaces adaptativas exige que qualquer estudo controle, ou pelo menos reporte, a precisão, a previsibilidade e a frequência de mudança, porque estas variáveis confundem as comparações ([Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)). Há quatro métodos estabelecidos que se transpõem diretamente:

- **Registos reais reproduzidos e mascarados.** As tarefas experimentais podem ser construídas a partir de registos reais, com os dados mascarados e blocos contrabalançados ([Findlater & McGrenere, 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)).
- **Precisão fixada artificialmente.** Para fixar a precisão sem mudar a sequência de tarefas, corre-se um algoritmo base e invertem-se aleatoriamente previsões até atingir o nível pretendido ([Findlater et al., 2009](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf)).
- **Medir a consciência do que não foi destacado.** As medidas habituais não captam este custo, que se mede com um teste de reconhecimento. As adaptações muito precisas reduziram essa consciência e pioraram o desempenho em tarefas novas ([Findlater & Gajos, 2009](https://kgajos.seas.harvard.edu/papers/AIMag09-AUIs.pdf)).
- **Wizard-of-Oz antes de construir.** O precedente para testar uma ideia antes de existir o sistema é o de Hudson e colegas ([Iqbal & Bailey, 2008](https://www.interruptions.net/literature/Iqbal-CHI08.pdf)).

Para a consciência situacional e a carga de trabalho, a combinação usada em sistemas críticos é SAGAT (sondas objetivas com o ecrã congelado), SART (subjetiva) e NASA-TLX ([UTS, 2016](https://opus.lib.uts.edu.au/handle/10453/43338); [FAA, 1999](https://www.faa.gov/data_research/research/med_humanfacs/oamtechreports/1990s/1999/9903)). Mas num simulador de sala de controlo petroquímica o NASA-TLX não distinguiu níveis de carga, ao contrário do SWAT. Convém por isso juntar-lhe um segundo instrumento ([LSU, 2014](https://repository.lsu.edu/mechanical_engineering_pubs/1087)).

Uma ressalva é essencial: não foi encontrado nenhum estudo publicado de interfaces adaptativas com operadores de transporte de mercadorias. FleetOS estaria a medir algo que ninguém mediu.

### Cinco fases, do escritório real ao turno alternado

| Fase | Quem e quando | Método | Medidas | Critério para avançar |
|---|---|---|---|---|
| 0. Observação | 2–3 escritórios portugueses, meio dia cada | inquérito no local; registo das pausas naturais, do ritmo de exceções e das perguntas que os operadores fazem | exceções por hora; perguntas recorrentes; para onde olham | catálogo de 8–12 cenários, de rotina e de incidente (avaria, porto, limite de condução, documento, fronteira) |
| 1. Wizard-of-Oz | 5–8 operadores, cerca de 2 h cada | dia real reproduzido com dados mascarados; uma pessoa conduz a recomposição às escondidas; cada operador passa pelas três condições: estático, adaptação no lugar, recomposição completa | sondas SAGAT ("que transportes estão atrasados?", "onde está o 14?"); NASA-TLX + segundo instrumento; tempo até detetar e agir; erros; teste de reconhecimento; escalas de "senti-me em controlo" e "sabia quando ia aparecer" | adaptação no lugar ≥ estático em consciência situacional e tempo, sem perda no reconhecimento |
| 2. Laboratório com o motor | os mesmos operadores e outros novos | compositor real, com precisão manipulada (a real, "perfeita" e cerca de 50%) | as anteriores, mais a taxa de uso dos ecos | o benefício mantém-se com a precisão real |
| 3. Campo | 2–4 semanas, 2–5 operadores | instrumentação pelo diário; micro-inquérito nas pausas ("ajudou? 1–7"); revisão de vídeo com o próprio operador | commits por causa e por hora; promoções por hora; inundações; fixar, desfazer e congelar; tempo até à primeira ação; sinais de abrandamento dos especialistas | taxas de desfazer e congelar a descer semana a semana; zero mudanças sem causa |
| 4. Turnos alternados | por turno, em produção | alternância entre ambiente adaptativo e estático | KPIs operacionais: pontualidade, exceções tratadas, tempo de resolução | só evidência interna; nunca anualizar nem apresentar como argumento comercial |

As amostras desta área andam entre 16 e 27 pessoas nos estudos de laboratório citados. Com operadores de tráfego, é realista contar com 5 a 8 por fase. Por isso as fases 1 e 2 são formativas: o desenho em que cada pessoa passa por todas as condições compensa o N pequeno, os tamanhos de efeito reportam-se de forma descritiva e não se reclama significância estatística.

Em paralelo à avaliação com pessoas, o próprio produto deve medir a sua calma. Os indicadores a seguir são:

- mudanças de layout ou câmara sem causa registada, com meta de zero;
- promoções do sistema por hora, com meta inicial de até cerca de 6 a calibrar;
- INP durante recomposições, até 200 ms;
- fotogramas de animação longos acima de 50 ms durante um commit, com meta de zero.

O diário de commits que alimenta o "porquê" e o "desfazer" é a mesma fonte de dados da avaliação de campo e da revisão semanal à moda da project44, que mostra o que o ambiente destacou, suprimiu ou resolveu sozinho.

### Recomendações por ordem de execução

| # | Ação | Porquê | Quando |
|---|---|---|---|
| 1 | Suspender redesenhos visuais e escrever uma "Filosofia de composição FleetOS" de 2–3 páginas: âncoras, escada de formas por coisa, classes de causa, orçamentos, regras de movimento | o ASM identifica este documento como a peça que distingue as HMI bem-sucedidas e manda derivar os requisitos de cenários, não de preferências ([ASM, 2015](https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/March%2031%202015%20-%20Operator%20Situation%20Awareness%20and%20Delivering%20ASM%20compliant%20High%20Performance%20HMIs%20Failure%20Modes%20and%20Success%20Factors.pdf)) | semana 1 |
| 2 | Instrumentar o Studio atual: registar cada mudança de layout e de câmara com a sua causa; recolher LoAF e INP em desenvolvimento | dá uma linha de base e torna testável o "nada sem causa" ([Chrome, LoAF](https://developer.chrome.com/docs/web-platform/long-animation-frames)) | semanas 1–2 |
| 3 | Construir o compositor em TypeScript puro, com testes de propriedades (invariante sem causa, histerese, orçamento, adiamento para as pausas) | é a camada em falta; tem de ser determinística e auditável ([jacar.es](https://jacar.es/en/runtime-generated-ui-the-first-serious-year/)) | semanas 2–4 |
| 4 | Definir a escada de 4–5 formas para cada coisa, reaproveitando cartões, folha, linhas e pinos existentes, desenhada à mão para cada tamanho | competição pelo espaço e continuidade de identidade ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities); [Hoffswell 2020](https://idl.uw.edu/papers/responsive-vis)) | semanas 3–5 |
| 5 | Transformar a pilha de atenção na região "split": ecos, agrupamento por causa raiz, itens em espera com retorno automático, orçamento por hora | ecoar em vez de mover; disciplina de alarmes ([Gajos 2008](https://kgajos.seas.harvard.edu/papers/kgajos-chi08-predictability.pdf); [WinCC OA](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/alarmshelving/topics/alarm_shelving_overview.html)) | semanas 4–6 |
| 6 | Acrescentar o anunciador de modo, a linha "porquê", fixar, desfazer a última recomposição e congelar (não como alternância de vista, mas como travão de segurança) | evita surpresas de automação e dá o controlo que os utilizadores preferem ([Sarter & Woods](https://ntrs.nasa.gov/citations/20040112190); [Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)) | semanas 5–6 |
| 7 | Mapa: manter a tela fixa; dar à câmara histerese (reenquadrar só quando o foco sai da área visível); passar os pinos para camadas com `feature-state` quando passarem de ~50–100; prototipar o recorte em vez do vidro flutuante e levá-lo à decisão do dono | custo de redimensionamento, marcadores DOM e painéis flutuantes ([MapLibre PR #4632](https://github.com/maplibre/maplibre-gl-js/pull/4632); [Figma, 2024](https://www.figma.com/blog/our-approach-to-designing-ui3/)) | semanas 5–7 |
| 8 | Separar a cor de foco da cor de alarme, ou garantir codificação redundante, e testar na fase 1 se os operadores confundem seleção com problema | a cor de alarme tem de ser exclusiva ([Hollifield, 2011](https://www.controlglobal.com/articles/2011/the-ultimate-hmi)) | com a fase 1 |
| 9 | Correr a fase 0 e a fase 1 (Wizard-of-Oz) com operadores reais antes de qualquer modelo de previsão ou LLM | a ideia testa-se independentemente da precisão do modelo; as preferências enganam ([Findlater & McGrenere 2004](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf)) | semanas 4–8 |
| 10 | Atualizações técnicas opcionais: React 19.3 (`<ViewTransition>` com tipos de causa, fora do mapa) e MapLibre 6.x; manter o `flip.ts`; adotar o Motion só se a distorção de texto ou a interrupção o exigirem | ganho incremental; não é aqui que está o problema ([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)) | depois da fase 1 |
| 11 | Se entrar um LLM, limitá-lo a traduzir perguntas em texto livre para receitas do catálogo, com esquema validado; nunca gerar layout | latência, imprevisibilidade e risco de injeção ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/); [json-render](https://infoq.com/news/2026/03/vercel-json-render)) | depois da fase 2 |
| 12 | Campo de 2–4 semanas com revisão semanal do diário, junto com o operador | o abrandamento dos especialistas e a fadiga só aparecem com o tempo ([Scarr et al., 2012](https://hci.cs.umanitoba.ca/publications/details/improving-command-selection-with-commandmaps)) | a partir da semana 8 |

## Conclusão

A investigação muda a pergunta. "Vivo" não é uma propriedade visual que um nono redesenho possa finalmente acertar. É uma **política**: um conjunto explícito de razões pelas quais o ecrã muda, e de garantias de que nada muda sem uma dessas razões. Visto assim, o paradoxo desfaz-se. Para um especialista, a experiência mais viva é a que tem as âncoras mais firmes, porque só num espaço que não se mexe sozinho é que uma mudança significa alguma coisa. Uma tela onde tudo se move é tão muda como uma onde nada se move. A regra intuitiva do dono, "sem causa nada se mexe", é afinal a definição de estabilidade da literatura, e por isso pode passar de gosto pessoal a métrica de qualidade do produto, verificada em cada commit como uma sala de controlo verifica o seu orçamento de alarmes.

A segunda implicação é estratégica. Como nenhum concorrente documenta uma composição que se reorganiza, FleetOS tem aqui um diferenciador real, mas apenas se conseguir mostrar que ele não custa consciência situacional nos dias maus. O mesmo diário que dá ao operador o "porquê" e o "desfazer" produz, sem custo extra, a evidência contínua de que o ambiente ajuda. É também o que permitirá, no futuro, entregar o rotineiro a agentes sem cair nas ironias da automação: o humano verá sempre o que o sistema fez, porque o fez, e o que ficou para ele decidir.
