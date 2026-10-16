# FleetOS Phase 5.7D

Representation Engine, Topology Shifts & Living Workspace

6 outubro 2026. Implementação isolada no laboratório DEV, pronta para revisão visual.

## Resultado

O workspace escolhe uma representação em conjunto com o espaço disponível. Jobs pode dominar como grelha; Fuel pode ser uma análise, um fluxo horizontal ou um contexto fundido com o mapa; Documents pode ocupar o workspace. O mapa passa entre papel dominante, apoio e suspensão, mantendo a mesma instância TomTom/MapLibre.

O conteúdo é inteiramente sintético: seis Jobs, cinco Drivers, cinco Trucks, quatro estações Fuel, três sinais Restrictions e cinco Documents. Não há atribuição de recursos, decisão operacional, gravação em repositórios ou integração com dados reais nesta fase.

## Como rever

Abrir http://localhost:5173/__dev/fleetos-environment. A barra lateral abre os contextos demo. As ações de cada superfície permitem promover, reduzir, focar e fechar. A orientação no topo mostra o contexto atual e permite voltar com Esc.

No botão DEV, o explorador permite escolher uma das 16 famílias, promover atores, trocar papéis e áreas, fundir ou separar contextos, experimentar representações e alterar as variáveis contínuas já existentes. As famílias são instrumentos para explorar o motor; não substituem os controlos contínuos nem constituem layouts finais de produção.

Para uma passagem curta: Jobs dominante, foco Fuel, Documents, Esc, Esc. Depois experimentar Job + Fuel fundidos, Separar e Esc. A troca Jobs/mapa permite verificar que a hierarquia altera a composição inteira.

## Motor de composição

Os papéis são PRIMARY, SUPPORTING, PERIPHERAL, INDICATOR, SUSPENDED e TAKEOVER. Cada representação define tamanho mínimo, afinidade de forma e densidade. O motor avalia região, conteúdo, papel, proximidade de relações e retenção de área antes de negociar a alocação sem sobreposição.

As formas incluem indicador, faixa horizontal, faixa vertical, contexto compacto, lista, fluxo horizontal, grelha, análise, workspace e takeover. Cada uma usa uma estrutura interna diferente. O detalhe secundário responde também à dimensão real durante a transição; o texto não é reduzido como uma imagem para caber.

PROMOTE, DEMOTE, MORPH, SWAP, MERGE, SPLIT, STACK, STRIP, CLUSTER, TAKEOVER e SUSPEND são operações sobre estado. SWAP pode receber regiões normalizadas da composição atual e trocar a área pretendida dos atores. Quando o mapa estava suspenso por falta de espaço, utiliza a geometria retida da sua instância. As restrições de tamanho e espaço continuam a prevalecer sobre a intenção.

Os grupos permitem relações genéricas como Job/Fuel, Job/Documents, Driver/Truck e Map/Restrictions. Um grupo produz uma superfície conjunta com os seus membros; não é apenas um conjunto de tabs. A gravidade usa relações sintéticas explícitas para favorecer proximidade sem obrigar cada contexto a uma borda.

## Mapa e movimento

O renderer mantém um mapa vivo. FULL_OPERATIONAL, ROUTE_FOCUS, DRIVER_LOCAL, ROUTE_CORRIDOR, FUEL_CORRIDOR, RESTRICTION_SEGMENT, CONTEXTUAL_MINIMAP, SUPPORTING_MAP e HIDDEN alteram perfil, controlos, referências, espessura da rota, densidade de etiquetas e objetivo de câmara.

As alterações de geometria e câmara partilham duração e easing. A câmara adapta o enquadramento à dimensão real durante o resize, e o pedido anterior é cancelado quando chega outro. Existe fallback de movimento reduzido. O mapa oculto mantém uma região positiva e a instância viva.

O histórico guarda o estado real e a câmara antes de cada foco/operação. Esc repõe papéis, formas, grupos, geometria, visibilidade e câmara. Seis comparações no navegador confirmaram igualdade do snapshot e da geometria, erro numérico de câmara zero e a mesma instância. Restaurar Base é uma composição inicial; não equivale a restaurar uma câmara manual anterior.

## Famílias visuais documentadas

| Família DEV | Intenção explorada |
| --- | --- |
| 01 Map + apoios | Mapa e contextos compactos |
| 02 Jobs dominante | Grelha rica com mapa de apoio |
| 03 Documents takeover | Documento e workspace |
| 04 Bandas horizontais | Faixas e mapa horizontal |
| 05 Fluxo vertical | Listas/faixas empilhadas |
| 06 Assimétrico | Formas e regiões diferentes |
| 07 Mapa à esquerda | Viés forte à esquerda |
| 08 Mapa à direita | Viés forte à direita |
| 09 Centro estreito | Mapa alto e estreito |
| 10 Map fullscreen | Mapa dominante no espaço utilizável |
| 11 Conteúdo + strips | Conteúdo dominante e apoios em faixas |
| 12 Job + Fuel fundidos | Contextos numa superfície conjunta |
| 13 Cluster relacionado | Proximidade e formas complementares |
| 14 Seis contextos | Pressão simultânea de seis domínios |
| 15 Fuel dominante | Análise e comparação sintética |
| 16 Inversão para mapa | Troca de hierarquia e geometria |

As capturas representam composições reais do laboratório. A forma final pode variar com dimensão, valores contínuos e mínimos disponíveis. Um ator pode ser suspenso quando nenhuma representação útil cabe.

## Validação realizada

A passagem principal percorreu as 16 famílias a 1440 x 900. A revisão a 1920 x 1080 e 1199 x 884 foi deliberadamente curta: seis contextos, Jobs dominante, Documents e restauração. Fuel foi também verificado no tamanho menor.

Foram exercitados promoção, fusão/separação Job/Fuel, troca Jobs/mapa, foco Fuel com rota e estação, takeover Documents, interrupção Drivers/Restrictions, zoom nativo, mapa oculto, minimapa, corredor de rota com movimento reduzido, pressão lateral e reposição Base. Não se fez uma matriz exaustiva de todas as formas, pares de atores e modos em todos os tamanhos.

Os 51 registos de aceitação recolhem composição, geometria efetiva, câmara e identidade do mapa. Nos estados estabilizados registados não houve overflow horizontal da página nem dos corpos de conteúdo, nem incremento de erros do mapa. O identificador da instância permaneceu 2 durante as interações; a montagem inicial de desenvolvimento usa StrictMode. A leitura final do console não apresentou warnings ou erros.

## Correções e limites encontrados

- O conteúdo promovido ocupava espaço excessivo e eliminava o mapa de apoio. A negociação foi corrigida para limitar a área dominante e permitir representações úteis dos apoios nos tamanhos revistos.
- A troca feita com o explorador aberto podia usar apenas as proporções de configuração porque o mapa estava temporariamente suspenso. Passou a usar a geometria retida e a fechar o explorador, produzindo uma troca visível de domínio. Esc também repõe o explorador anterior.
- Fuel em foco precisava de um contexto legível junto à rota. A superfície foi fundida com o mapa, com ações de promoção e separação.
- O grupo Job/Fuel repetia detalhe extenso de Jobs antes do membro Fuel. A representação conjunta passou a apresentar os dois conteúdos de forma mais direta.
- Tiles novos podem apresentar áreas ainda por carregar imediatamente após mudanças grandes de câmara. Foi observado carregamento transitório; as capturas não constituem prova de ausência de latência de rede. Não se observou corrupção persistente nas vistas revistas.
- As capturas e snapshots não medem FPS nem substituem vídeo contínuo da animação. A qualidade de movimento continua a precisar da revisão visual do utilizador.
- Fullscreen ocupa o espaço utilizável, mantendo a orientação superior e a barra lateral. Listas e documentos podem ter scroll vertical interno.

## Verificações do projeto

Typecheck, lint e build finais passaram. A suite completa passou uma vez com 54 ficheiros e 1.347 testes. Após os últimos ajustes, os cinco ficheiros do laboratório passaram novamente com 66 testes: 50 anteriores e 16 novos testes puros do motor. Não foram acrescentados testes de componentes.

O build mantém o aviso existente do bundle do mapa acima de 700 kB. A procura de identificadores do laboratório nos assets de produção não encontrou correspondências, e a verificação de whitespace do diff passou. As alterações desta fase permanecem no laboratório e neste relatório; não houve commit ou push.

## Capturas e provas

O PDF incorpora as 16 famílias e capturas adicionais da troca, de Fuel e dos tamanhos 1920 x 1080 e 1199 x 884. Pode ser anexado noutro chat sem depender dos caminhos locais das imagens.

## Ponto de paragem

Esta fase termina na representação, topologia e comportamento do mapa para revisão. Não foi iniciada integração operacional nem uma fase seguinte. Os componentes visuais permanecem experimentais e podem ser substituídos sem converter os seus exemplos sintéticos em lógica de produção.
