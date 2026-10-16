# FleetOS — Phase 5.7C: Living Environment

Estado: implementação concluída; pronta para revisão visual. Laboratório: http://localhost:5173/\_\_dev/fleetos-environment.

## Como experimentar

O ambiente inicia com o mapa e a pequena rail. Cada botão Jobs, Drivers, Trucks, Fuel, Restrictions e Documents ativa ou remove uma superfície vazia. A superfície permite expandir/comprimir a sua procura, fechar o contexto e entrar em **Explorar foco**. O seletor do foco permite encadear demonstrações. **Esc** ou a seta de retorno recuperam um único estado anterior real, incluindo a câmara.

O botão DEV abre os instrumentos contínuos existentes, a procura/prioridade de cada contexto, diagnósticos espaciais, combinações aleatórias e ciclos de stress. **Restaurar base** limpa contextos e histórico, mantendo a câmara atual. **Repor câmara** é a ação explícita para voltar ao enquadramento inicial.

## Implementação

Todas as alterações desta fase estão em `src/dev/fleetos-environment`, além deste relatório. As páginas, navegação, dados e serviços operacionais de produção permanecem inalterados.

As seis superfícies são shells vazios: identificação, espaço livre e controlos de demonstração. Não existem registos fictícios, listas, tabelas, relações de negócio, chamadas a repositórios ou persistência.

`livingEnvironment.ts` mantém estado declarativo, pedidos geométricos e histórico. Usa o mesmo `composeWorkspace`/`allocateWorkspace` da fase 5.7B. Cada superfície transmite dimensões mínimas, preferidas e máximas, procura, prioridade, proeminência, afinidade e permissões de movimento, compressão, ocultação e suspensão. Não tem um lado permanente nem slots por domínio.

O mapa recebe prioridade inicial suficiente para usar os seus espaços livres antes de ser comprimido. Em 1440×900 e 1920×1080, os seis shells normais cabem mantendo o mapa na sua geometria base. Se todos os contextos ativos ficariam sem espaço, e não existe pressão/reserva explícita ou dominância do mapa, uma segunda avaliação negocia a prioridade dos contextos. Continua a usar o mesmo alocador. No preview normal de 1199×884, Jobs + Drivers + Fuel ficam visíveis e o mapa comprime para aproximadamente 382×518, sem violar mínimos.

`DomainSurface.tsx` mantém hosts estáveis para entradas, saídas e recomposição. O movimento geométrico retoma a partir da posição renderizada quando interrompido; o conteúdo usa fade e pequenos deslocamentos em profundidade. O canvas usa `overflow: clip`, evitando deslocações internas causadas pelo foco nos instrumentos durante o fecho do explorador. A ocultação usa opacidade, `inert` e controlo explícito dos eventos, sem deixar descendentes invisíveis ou botões inativos após restauração.

O mapa continua numa única instância TomTom/MapLibre. ResizeObserver sincroniza resize e redraw durante a alteração do container. Não é desmontado por mudanças de contexto ou foco. `cameraChoreography.ts` coordena centro, zoom, pitch, bearing e enquadramento; calcula `cameraForBounds` sobre as dimensões correntes em cada frame. Usa a mesma curva de easing selecionada para o layout. Cancelamento invalida callbacks anteriores; movimento reduzido completa o alvo imediatamente, sem voltar a executar um foco antigo.

## Demonstrações sintéticas

| Foco         | Composição e mapa                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Jobs         | Shell de apoio e polilinha sintética Lisboa–Porto enquadrada, com marcador V de veículo                                                    |
| Drivers      | Mapa ocupa todo o workspace utilizável, câmara em localização sintética no Porto, zoom 12.4, pitch 42° e bearing 24°; outros shells recuam |
| Trucks       | Câmara sintética com zoom 10.2, pitch 24° e bearing 12°, shell de apoio                                                                    |
| Fuel         | Polilinha inteira com ponto F destacado, além do marcador V                                                                                |
| Restrictions | Segmento exato da polilinha destacado a âmbar e enquadrado                                                                                 |
| Documents    | Superfície centrada com proporção de documento; mapa fica oculto, mantendo renderer e câmara                                               |

A geometria está explicitamente identificada como DEV/sintética. A polilinha não representa um cálculo de rota rodoviária nem uma restrição ou paragem real. Não existe elevação 3D artificial.

## Histórico e restauração

Cada entrada em foco guarda uma cópia do estado que existia e a câmara efetiva no momento da ação: centro, zoom, pitch, bearing e padding. O histórico inclui intenção, variáveis contínuas, contextos, visibilidade/estado das superfícies, referência e abertura do explorador. Esc não reconstrói a partir de defaults.

Em focos aninhados, cada Esc recupera um frame. Em interrupções, a comparação usa a câmara guardada pelo evento de entrada, que pode ser uma câmara intermédia. Fechar o contexto que está em foco sai do takeover, remove esse contexto e recupera os restantes; não deixa o ambiente sem saída.

Os atributos de diagnóstico espacial e de histórico são exclusivos do laboratório DEV e permitem auditar valores sem acesso a objetos privados do mapa.

## Aceitação no navegador

Foram percorridos 1440×900 e 1920×1080, além do preview normal 1199×884. O ficheiro de provas conserva 105 registos sem falhas de geometria/overflow/erro do mapa e 21 comparações exatas de restauração. Há também testes anteriores à captura incremental descritos abaixo; não foram somados artificialmente ao contador do ficheiro.

| Cenário realmente exercitado                        | Resultado                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Nenhum, um, dois, três e seis contextos ativos      | Rail e shells respondem; o alocador mantém mínimos e regiões protegidas                                         |
| Remoção de cada domínio; ordem direta/inversa       | Recomposição determinística; igualdade da geometria verificada                                                  |
| Expandir/comprimir Jobs com seis contextos          | Alocação altera a procura; contextos comprimem/suspendem e regressam com controlos funcionais                   |
| 24 toggles rápidos por tamanho                      | Estado final preservado; sem contexto ou animação residual                                                      |
| Jobs + Drivers + Fuel → Driver fullscreen → Esc     | Estado, geometria e câmara anteriores recuperados                                                               |
| Seis focos encadeados e seis Esc                    | Recuperação de cada estado real; erro máximo de câmara 0 nas comparações guardadas                              |
| Pan/zoom nativo em vários contextos e focos         | Câmara responde após recomposição, incluindo fullscreen e mapa comprimido                                       |
| Interrupção de Driver → Fuel com duração 800 ms     | Geometria ainda intermédia e comando de câmara ativo comprovados; Esc recupera o snapshot efetivamente guardado |
| Movimento reduzido nos dois tamanhos                | Durações CSS 0; foco/takeover e retorno imediato, sem perda do histórico                                        |
| Pressão máxima nas quatro direções                  | Mapa limitado ao mínimo, shells suspensos e controlos DEV acessíveis; restauração limpa                         |
| Ciclo completo de 24 composições com seis contextos | Sem sobreposição dos alvos, violação do chrome ou perda da instância                                            |
| Cinco combinações aleatórias adicionais             | Limites geométricos respeitados; restauração de base                                                            |
| Console e renderer                                  | Zero avisos/erros no log final; contador de erros do mapa 0; instância mantida nas operações de UI              |

Em fullscreen, o mapa usa x=96, y=0 e 1344×900 / 1824×1080, preservando a proteção da rail. A contabilidade de regiões protegidas, ocupadas e livres permanece no domínio espacial, independente dos elementos de diagnóstico.

Foram corrigidos durante a aceitação: descendentes que permaneciam ocultos após suspensão, eventos de clique não restaurados, desvio interno do canvas por foco nos controlos DEV e ausência de shells no preview mais estreito.

## Capturas e provas

Capturas reais, guardadas fora da árvore do código:

- [Três contextos em 1440×900](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-three-contexts-1440.png)
- [Três contextos em 1920×1080](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-three-contexts-1920.png)
- [Seis contextos em 1920×1080](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-all-contexts-1920.png)
- [Preview normal com negociação do mapa](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-default-preview.png)
- [Driver fullscreen](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-drivers-1920.png)
- [Fuel com rota e paragem sintéticas](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-fuel-1920.png)
- [Document takeover](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-documents-1920.png)
- [Segmento sintético destacado](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-restrictions-1920.png)
- [Interrupção durante movimento](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-interruption-1920.png)
- [Pressão e diagnóstico espacial](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-pressure-1920.png)
- [Provas incrementais e histórico de medições](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7C-browser-evidence.json)

A API disponível não oferece gravação nativa de vídeo. As capturas sequenciais e os snapshots são provas de interação, não um vídeo contínuo das animações. A avaliação do ritmo e sensação visual deve ser feita no laboratório aberto.

## Limites de aceitação

A aceitação verifica alvos, geometria renderizada estabilizada, alguns frames intermédios, controlos, câmaras e estados; não é um benchmark de GPU nem uma análise de colisões em todos os frames de todas as transições.

Num primeiro salto grande de zoom, tiles ainda não carregados podem mostrar o fundo temporariamente enquanto o TomTom responde. Isto foi observado na primeira aproximação ao Porto; a vista depois carregou normalmente, sem erro ou corrupção persistente. As capturas finais de foco foram verificadas com a geometria sintética renderizada. Não se afirma que o carregamento de tiles novos é instantâneo em qualquer rede; este ponto merece revisão visual antes de aprovar o ritmo da câmara.

## Quality gates

- Typecheck e lint: passaram, sem erros ou avisos de lint.
- Testes do laboratório: **50** passaram, incluindo os **29** testes existentes de 5.7A/5.7B e **21** novos casos.
- Novos casos cobrem toggles, 64 conjuntos de contextos em cada tamanho pedido, ordens, estado real de foco, histórico aninhado, câmara intermédia, cancelamento de callbacks, movimento reduzido, fecho do contexto em foco, negociação em viewports estreitos e invariantes sob pressão.
- Suíte completa: **53 ficheiros / 1.331 testes** passaram; duração final 116,48 s.
- Build: passou. Mantém o aviso anterior de tamanho do chunk de mapa; não foi acrescentada uma dependência.
- Bundle de produção: sem marcadores do laboratório, histórico ou shells DEV. Os nomes/hashes dos assets de produção mantêm-se iguais aos anteriores, incluindo `index-C8GbNuQF.js` e `map-vendor-DpIw_WUE.js`.
- Verificação de whitespace do diff: passou.

A fase termina aqui para revisão. Não foram implementados dados operacionais, relações de negócio ou a fase seguinte.
