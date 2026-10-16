# FleetOS — Phase 5.7E: Guided Dynamic Workspace

Implementação DEV para revisão visual, 6 de outubro de 2026.

O laboratório em [localhost](http://localhost:5173/__dev/fleetos-environment) passou a usar percursos desenhados: âncora, lentes ativas e uma lente principal opcional. Expandir reorganiza a mesma página e preserva o transporte. A aplicação de produção não foi integrada nesta fase.

O pedido integral está guardado em [phase-5.7e-guided-workspace-request.txt](<C:/Users/manue/OneDrive/Ambiente de Trabalho/fleet-tracker/docs/phase-5.7e-guided-workspace-request.txt>). O SHA-256 da cópia coincide com o anexo original: `3856C4EF84D73EB395183F6BF1C5BFDE883B91C36E1505F56D759DBBFC454AE2`.

## Reset e implementação

- Base com mapa TomTom real e rail pequeno de seis domínios, sem cabeçalho permanente.
- O entry point ativo deixou de importar o gerador de topologias, scoring, bibliotecas de variantes, explorador aleatório, retenção de retângulos e fallback flutuante. Os módulos históricos continuam guardados e desligados do percurso ativo.
- Jobs tem lista estreita, lista com recursos/progresso a larguras médias e duas colunas quando há espaço. Expandir acrescenta overview e próximas chegadas. A altura da coleção considera a quantidade de linhas e de colunas.
- Selecionar J-4217 substitui a coleção pelo contexto do transporte. Fuel, Driver, Truck, Documents e Restrictions contribuem para esse contexto.
- Driver e Truck partilham uma composição; Truck principal inverte a hierarquia. Documents principal substitui tempo de condução e autonomia por identidades/status. Fuel de apoio a Driver mostra a próxima paragem; de apoio a Documents mostra autorização/comprovativo.
- Mapa contextual: rotas da coleção ou do transporte, área local para Driver/Truck, segmento de acesso para Restrictions e mapa oculto para Documents. A instância permanece montada.
- Histórico captura estado, geometria, câmara e scroll. Esc/back percorre estados reais, incluindo seleção de posto e de documento.
- Só conteúdo sintético. Preços, tempos, restrições e documentos servem para julgar a interação; não são cálculos ou decisões operacionais.

O laboratório anterior está preservado em [backup 5.7D](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7D-before-guided-workspace.zip>). As alterações anteriores de outras fases existentes no checkout foram mantidas. Não houve commit, push ou reposição destrutiva do repositório.

## Percursos realmente revistos no browser

| Percurso | Resultado e capturas PNG |
|---|---|
| Flow 1: Base → Jobs → expandir → J-4217 | [Base](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-01-base.png>), [Jobs normal](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-02-jobs-normal.png>), [Jobs expandido](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-03-jobs-expanded.png>), [transporte selecionado](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-04-selected-job.png>) |
| Flow 2: adicionar Fuel → Driver → Truck → Documents | Mesmo J-4217; Driver e Truck combinados; Documents como resumo integrado. [Composição normal](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-07-job-related.png>) |
| Flow 3: Fuel principal | Comparação de postos e paragem; Driver/Truck apoiam a decisão; status de Documents integrado. [Fuel](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-08-fuel-lead.png>) |
| Flow 4: Driver principal | Mesmo Job e posto F-07; turno, condução e próxima paragem. [Driver](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-09-driver-lead.png>) |
| Truck principal | Veículo passa ao topo; motorista permanece relacionado. [Truck](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-10-truck-lead.png>) |
| Flow 5: Documents principal | Documento, identidades e documentação da paragem; mapa oculto sem desmontagem. [Documents](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-11-documents-lead.png>) |
| Restrictions principal | Condições de acesso, segmento no mapa e apoios do mesmo transporte. [Restrictions](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-12-restrictions-lead.png>) |
| Adaptação desktop | 1440×900 e 1920×1080; adicionalmente 1199×900. [Lista estreita](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-18-jobs-narrow.png>), [Jobs largo em duas colunas](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-15-jobs-normal-wide.png>), [Jobs expandido largo](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-16-jobs-expanded-wide.png>), [Fuel largo](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-17-fuel-wide.png>) |

As expansões foram repetidas nos dois tamanhos principais. Foram também usados filtro de Jobs, seleção de outro transporte (J-4218, com veículo/identificadores próprios), seleção de posto, seleção de documento, zoom e pan por teclado.

Os cinco checks finais de Esc compararam os frames efetivamente capturados pelo histórico: Driver → posto selecionado; posto → Fuel; Fuel → Job; documento selecionado → documento anterior; composição → mapa com zoom/pan manual. Estado, geometria, câmara e scroll coincidiram; a comparação numérica da câmara usou tolerância de 0,000001.

A instância identificada como `2` permaneceu a mesma durante os percursos finais, incluindo mapa oculto/visível e mudanças de viewport. Não houve overflow horizontal nem erros do renderer nos checks registados. A consola terminou sem warnings/errors capturados. O URL manteve-se no laboratório durante as expansões.

## Problemas encontrados e corrigidos

| Impacto | Problema | Correção |
|---|---|---|
| Alto | Em algumas transições, o enquadramento era calculado antes de ResizeObserver atualizar as dimensões internas do mapa; extremos das rotas ficavam fora da área visível. | Sincronizar o resize público antes do cálculo da câmara no mesmo frame. Os pontos da coleção voltaram a caber dentro do mapa. |
| Médio | Jobs expandido a largura média parecia sobretudo uma lista esticada. | Overview e próximas chegadas visíveis antes da lista; estrutura em duas colunas com espaço suficiente. |
| Médio | O status de Documents ficava abaixo da área imediatamente visível quando várias lentes estavam abertas. | Reduzir informação duplicada de recursos e notas na forma de Job com altura limitada; integrar o status no contexto principal. |
| Médio | Apoios em Documents principal ainda mostravam tempo de condução/autonomia e lista genérica de postos. | Resumos de identidade/status e documentação da paragem. |
| Médio | Alguns identificadores e dados de apoio continuavam a referir J-4217 depois de selecionar outro transporte. | Fixtures ligadas ao transporte selecionado para recursos, postos, documentos e acesso. |
| Baixo | A altura da coleção filtrada podia comprimir duas linhas apesar de haver espaço disponível. | Estimativa de altura conforme informação das linhas e número de colunas. |

Um primeiro check de scroll comparou a posição antes de a automação focar o botão. O frame real já tinha 16px de scroll. Os checks finais compararam o frame capturado no momento da ação e passaram; o registo conserva esta investigação.

## Verificação e limites

- Typecheck de aplicação, testes e servidor: passou. A compilação final inclui novamente aplicação e servidor.
- Lint completo: passou; os ficheiros alterados nas afinações posteriores foram também verificados.
- Suite existente: 1.356/1.357 passaram na execução conjunta. Um teste antigo de ingestão PDF excedeu 5 segundos; a repetição isolada do seu ficheiro passou os 14 testes. Os três testes novos de contrato do workspace passaram também após a afinação da geometria. Não foram adicionados testes de componentes.
- Build de produção: passou; mantém o aviso existente de chunk grande do mapa. A pesquisa no bundle não encontrou os identificadores do laboratório ativo.
- `diff --check`: passou.
- Reduced motion está implementado por media query e duração zero da câmara. A preferência do sistema não foi alternada manualmente nesta revisão.
- Os tiles de uma área ainda não carregada podem aparecer progressivamente durante a primeira visita. As capturas finais aguardaram o indicador do renderer pronto; não foi observada corrupção persistente. Não foi feito um benchmark de FPS ou teste offline.
- A demonstração aprofundada centra-se em J-4217. As restantes linhas fornecem contexto sintético e fixtures próprias; não equivalem a integração completa de todos os domínios.

O viewport temporário foi removido. O browser ficou no Job J-4217 normal com Fuel, Driver, Truck e Documents ativos, pronto para revisão: [captura final](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-19-review-normal.png>).

Registo de browser e dos checks finais: [evidência JSON](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7E-evidence.json>).

Esta fase termina aqui para avaliação visual do utilizador.
