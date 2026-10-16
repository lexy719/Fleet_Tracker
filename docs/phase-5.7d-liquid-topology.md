# Phase 5.7D - Composição contínua com contextos estáveis

6 outubro 2026. Implementação exclusivamente no laboratório DEV: http://localhost:5173/__dev/fleetos-environment.

## Resultado e correção de direção

A última instrução do utilizador prevalece sobre a compactação autónoma da proposta inicial. Abrir outro contexto mantém o tamanho, posição e representação dos contextos já visíveis. O motor procura espaço para o novo contexto e pode recompor o mapa. Se não houver espaço legível, o novo contexto abre num painel flutuante, sem encolher os anteriores.

- Fuel + Drivers → Jobs: Fuel e Drivers conservaram exatamente os quatro valores de geometria e a família de representação.
- Focar: mostra apenas o contexto escolhido e o mapa. Os outros contextos não se transformam em miniaturas.
- Mapa: botão visível em cada superfície. Abre o mapa em todo o workspace, com um único painel de contexto flutuante, branco, arredondado e com sombra, inspirado na interação pedida para Tesla.
- Esc: restaura o contexto, a composição e a câmara anteriores. Confirmado também depois de usar zoom no mapa fullscreen.
- Ao mudar o tamanho da janela, o motor pode reposicionar as superfícies para manter tamanhos legíveis. Esta adaptação é distinta de abrir um novo contexto.
- Na composição normal, famílias compactas e indicadores deixaram de ser escolhas automáticas. A biblioteca DEV mantém variantes explícitas para inspeção; não são usadas para espremer os contextos existentes.

## Motor implementado

O estado semântico expressa intenção, prioridade, seleção, relações, dados sintéticos e profundidade. Os valores contínuos determinam posição, proporções, margens, densidade e movimento. A pesquisa é determinística e explora no máximo oito candidatos por composição; não escolhe screenshots ou um conjunto fechado de retângulos.

Existem 15 famílias por domínio: Jobs, Drivers, Trucks, Fuel, Restrictions e Documents. Os 90 identificadores usam 15 gramáticas de conteúdo, com diferenças próprias de cada domínio: filas, registos, matrizes, timelines, fluxos, workspaces, análises e relações. Nem todas são 90 estruturas DOM inteiramente independentes. A seleção depende da quantidade de itens, urgência, detalhe, entidade selecionada, relevância espacial e intenção.

O mapa tem 15 modos catalogados, incluindo aliases de compatibilidade, com enquadramento local, corredor horizontal/vertical, contexto Fuel, segmento de restrição, mapa secundário, fundo e ocultação. A instância TomTom/MapLibre mantém-se viva; a geometria, camadas, labels e câmara são atualizadas sem recriar o mapa ou trocar o estilo.

A pontuação avalia cobertura semântica, hierarquia, área útil, vazio acidental, relações, forma, continuidade, relevância do mapa, repetição, simetria, alinhamentos de grelha, ruído e regiões finas. Os diagnósticos DEV mostram candidatos, rejeições, motivos e vencedor. Painéis flutuantes são uma camada intencional, não contam como espaço livre nem como colisões acidentais da composição base.

Os contextos existentes são retidos antes da negociação de novos atores. A retenção guarda representação e geometria, incluindo o tamanho do frame. Apenas uma alteração do viewport permite reposicionamento para conservar legibilidade. O histórico guarda snapshots reais e a câmara para restauração exata.

## Verificação visual realmente executada

Aceitação focada nos fluxos pedidos na última correção, em vez de prolongar a matriz visual inicial de 20+ screenshots. Não foram criados testes de componentes.

| Fluxo | Resultado observado |
| --- | --- |
| Fuel + Drivers → Jobs, 1440×900 | Fuel e Drivers: posição, tamanho e família idênticos |
| Focar Jobs → Esc | Apenas Jobs + mapa; composição e câmara restauradas |
| Jobs → Mapa → zoom → Esc | Painel sobre mapa fullscreen; estado, geometria, câmara e instância restaurados |
| Botão Mapa em Fuel e Drivers | Um painel legível; rota Fuel e enquadramento local de Drivers |
| Janela 1440×900 → 1199×884 | Três contextos continuam visíveis; nenhum abaixo de 360×260 |
| Acrescentar Trucks em 1199×884 | Novo painel flutuante; Fuel, Drivers e Jobs mantêm geometria e representação |
| Fullscreen Jobs em 1199×884 e 1920×1080 | Painel dentro do workspace e sem overflow horizontal |
| Seleção sintética no painel Jobs | Entidade selecionada e cabeçalho atualizados; Esc restaura a seleção anterior |
| Movimento reduzido | Geometria final correta; diagnóstico confirma fallback ativo |
| Instância e logs finais | Mesma instância 2 entre ações; zero erros de mapa e zero avisos/erros nos logs da aceitação final |

Foram corrigidos dois problemas encontrados durante a aceitação: o espaço do painel fullscreen era contado duas vezes no enquadramento da rota; a redução do viewport podia suspender um contexto devido à escala proporcional e ao gutter. Ambos foram verificados novamente. Um aviso de enquadramento anterior à correção permanece no histórico do navegador; não reapareceu na aceitação final.

## Amostra sintética do motor

O instrumento DEV executou 1.024 composições num worker, com semente determinística. A amostra mede diversidade e validade geométrica do motor; não representa 1.024 sessões operacionais testadas no navegador.

| Medida | Resultado |
| --- | --- |
| Estados amostrados | 1.024 |
| Candidatos avaliados | 7.863; limite de oito por estado |
| Assinaturas de topologia | 875 |
| Assinaturas de geometria | 978 |
| Combinações de representação | 698 |
| Topologias com o mesmo conjunto Jobs/Drivers/Fuel | 179 |
| Repetição de assinatura de topologia | 14,55% |
| Candidatos rejeitados | 1; 0,0127% |
| Vencedores geometricamente inválidos | 0 |
| Distribuição do mapa | Nove regiões coarse e estado oculto |
| Tempo de solver no worker | p50 2,3 ms; p95 5,4 ms; máximo 35,7 ms |

As assinaturas usam quantização; diversidade numérica não prova que todas as composições sejam boas escolhas de produto. Os tempos dependem desta máquina. Não foi feita uma afirmação de 60 FPS: a medição de uma transição com o navegador e verificações em execução registou um intervalo máximo entre frames de 200 ms. A geometria terminou no alvo, sem correção tardia observada.

## Qualidade e limites

- Typecheck: passou, incluindo configurações da aplicação, testes e servidor.
- Lint: passou sem avisos novos.
- Build: passou. Permanece o aviso existente de chunks maiores que 700 kB.
- Suite: 55 ficheiros, 1.354 testes passaram; 73 testes puros do laboratório. Sem testes novos de componentes.
- Inspeção do bundle: laboratório ausente dos assets de produção; a UI operacional não foi integrada com este trabalho.
- Dados e seleção são inventados. O trajeto Lisboa-Porto é uma referência geométrica de demonstração; não recalcula rotas reais nem acompanha cada job selecionado.
- Tiles novos chegaram com atraso no primeiro enquadramento local de Drivers. Depois de carregarem, o mapa ficou completo e respondeu normalmente. Não se observaram erros de mapa ou corrupção persistente de tiles.
- Os painéis ainda são superfícies de exploração visual; o conteúdo e a tipografia podem ser alterados na revisão seguinte.
- Não houve commit, push, alterações a dados reais ou integração com os fluxos de produção nesta etapa.

## Estrutura principal

`representationLibrary.ts`: famílias e adequação aos dados. `liquidSynthesis.ts`: candidatos, scoring, retenção e camadas flutuantes. `representationEngine.ts`: operações semânticas e negociação de regiões. `DomainGrammar.tsx`: conteúdo por domínio. `RepresentationSurface.tsx`: superfície persistente, foco e botão Mapa. `livingEnvironment.ts`: histórico. `cameraChoreography.ts` e `EnvironmentMap.tsx`: câmara, resize e mapa persistente. `TopologyTools.tsx`, `synthesisStress.ts` e `synthesis.worker.ts`: instrumentos DEV e diversidade.

## Capturas finais

O PDF inclui capturas reais do navegador, em páginas de paisagem, com uma imagem por página: antes/depois de Jobs, foco Jobs, fullscreen Jobs, Fuel e Drivers, fallback a 1199×884 e fullscreen a 1920×1080. As capturas não são mockups gerados.
