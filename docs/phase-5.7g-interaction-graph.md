# FleetOS Phase 5.7G - relatório de implementação e revisão

Implementação concluída exclusivamente no laboratório DEV. [Abrir o workspace](http://localhost:5173/__dev/fleetos-environment).

## Resultado

A arquitetura 5.7F permanece: âncora, lentes ativas, lead, grupos semânticos, contratos de participação, seis famílias adaptativas, mapa persistente, takeover e histórico capturado. A fase acrescenta um grafo de 30 transições dirigidas, políticas de persistência das quatro seleções e perguntas espaciais independentes do domínio.

Clicar uma lente no rail adiciona/remove apoio. Expandir é a ação explícita para mudar de lead. Driver + Documents mostra CMR disponível e identidade conferida. Driver + Fuel mostra paragem selecionada, ETA e pausa; Truck + Fuel enfatiza alcance e contexto de paragem. O Job torna-se acessível através da sua âncora sem abrir uma página separada.

## Perguntas espaciais

O modelo inclui NONE, CURRENT_ENTITY, NEXT_LEG, FULL_ROUTE, ROUTE_AND_STOP, ORIGIN_DESTINATION, AFFECTED_SEGMENT, MULTI_ENTITY, RESOURCE_AND_JOB e USER_REQUESTED. A intenção declara alvo e origem automática/operador. Pedidos explícitos persistem ao adicionar lentes ou mudar de lead. Quando o alvo deixa de estar disponível, resolve-se o contexto restante.

O resolver escolhe pontos, corredor, rota, segmentos e marcadores. Bounds e dimensões reais determinam o enquadramento; não existe Driver = zoom fixo. Pitch/bearing ficam em zero. Driver sem posto selecionado passa a recurso no Job, em vez de aproximação local genérica. Documents automático pode ter NONE; Open map cria USER_REQUESTED e conserva Documents lead.

As perguntas de alcance usam o corredor da próxima etapa com intenção reachability. Os números e a geometria continuam sintéticos: não são um cálculo de horas legais, autonomia real ou rota executável.

## Aceitação real no browser

- Flows A-E executados, incluindo F-07 preservado, Documents como apoio sem mudar Driver, mapa explícito sem mudar Documents e inspeção de restrição com takeover aninhado.
- 30 pares dirigidos de mudança explícita de lead exercitados a 1440×900, com captura e retorno por Esc para cada par.
- 38 verificações de retorno passaram em estado, geometria, câmara, scroll e identidade do mapa, incluindo retornos a 1920×1080 e 1199×900 e zoom manual.
- Os três viewports foram revistos: 1440×900, 1920×1080 e 1199×900. O override foi removido no fim.
- 69 capturas reais: 39 vistas explicadas e 30 destinos de pares. Nenhum overflow horizontal nas medições dessas capturas.
- Instância do mapa 2 preservada durante a sessão de aceitação. Sem erros ou warnings no console final; renderer final declarou zero erros.
- Remover Fuel no browser limpou F-07 e conservou Driver lead; Esc recuperou o frame com F-07.

As capturas adicionais de localização e de geometria foram atualizadas depois de os tiles terminarem de carregar. Algumas capturas par a par registam estados de tiles ainda em carregamento; são evidência da transição semântica, não uma alegação de prontidão de render em cada frame. A galeria principal compara geografia final carregada.

A matriz DEV separa contrato, contadores de exercício de apoio/lead, captura associada e retorno realmente verificado. Não infere browser coverage a partir de testes puros. A cobertura de 30 pares corresponde a mudanças de lead num contexto; não cobre todos os possíveis toggles, âncoras, seleções, tamanhos ou combinações.

## Verificação do projeto

Typecheck completo, lint completo e build passaram. Suite final: **1366 testes / 58 ficheiros passaram**, executada diretamente com dois workers.

A primeira execução teve timeouts e falhas de limites de performance com concorrência e o limite de workers não aplicado pelo wrapper npm. A execução final passou sem modificar limites ou testes de produção. Foram adicionados cinco testes focados da semântica 5.7G; não foi criada uma suite extensa dos componentes temporários. O build conserva o aviso existente sobre o bundle de mapas.

## Limites

Tiles TomTom reais; entidades, documentos HTML, postos, preços, horários, autonomia, segmentos e rotas desenhadas são fixtures sintéticas. Não existe backend, solver, cálculo jurídico, telemetria real ou detour rodoviário calculado nesta fase. Nenhuma alteração desta fase integra dados ou UI de produção; não houve commit/push.

Restauração exata aplica-se ao mesmo viewport. Mobile, desempenho FPS/GPU e uma nova campanha de reduced-motion não foram auditados nesta fase. A infraestrutura de reduced-motion anterior permanece. Políticas de todas as seleções e limpeza de âncora foram testadas em estado puro; a aceitação browser não pretende abranger todos esses casos.

## Artefactos

PDF: `output/pdf/FleetOS-5.7G-Relatorio-Visual-Completo.pdf` (87 páginas). Fotografias: `FleetOS-5.7G-*.jpg`. Evidência estruturada: `FleetOS-5.7G-evidence.json`; cobertura: `FleetOS-5.7G-coverage.json`; retornos: `FleetOS-5.7G-return-*.json`; console: `FleetOS-5.7G-console.json`; execução final: `FleetOS-5.7G-tests-final.log`.

O pedido integral está preservado no repositório em `docs/phase-5.7g-interaction-graph-request.txt`. A implementação para aqui, pronta para revisão visual DEV.


## Fotografias da revisão

- [FleetOS-5.7G-01-driver-documents-support](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-01-driver-documents-support.jpg)
- [FleetOS-5.7G-02-driver-to-documents](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-02-driver-to-documents.jpg)
- [FleetOS-5.7G-03-documents-return-driver](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-03-documents-return-driver.jpg)
- [FleetOS-5.7G-04-driver-current-location](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-04-driver-current-location.jpg)
- [FleetOS-5.7G-05-driver-next-leg](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-05-driver-next-leg.jpg)
- [FleetOS-5.7G-06-driver-full-job](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-06-driver-full-job.jpg)
- [FleetOS-5.7G-07-driver-fuel-stop](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-07-driver-fuel-stop.jpg)
- [FleetOS-5.7G-08-truck-fuel-context](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-08-truck-fuel-context.jpg)
- [FleetOS-5.7G-09-fuel-to-restrictions](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-09-fuel-to-restrictions.jpg)
- [FleetOS-5.7G-10-restrictions-to-driver](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-10-restrictions-to-driver.jpg)
- [FleetOS-5.7G-11-documents-explicit-map](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-11-documents-explicit-map.jpg)
- [FleetOS-5.7G-12-takeover-selected-context](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-12-takeover-selected-context.jpg)
- [FleetOS-5.7G-13-return-selected-context](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-13-return-selected-context.jpg)
- [FleetOS-5.7G-14-same-family-new-question](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-14-same-family-new-question.jpg)
- [FleetOS-5.7G-15-meaningful-no-map-family](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-15-meaningful-no-map-family.jpg)
- [FleetOS-5.7G-16-flow-b-fuel-selection](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-16-flow-b-fuel-selection.jpg)
- [FleetOS-5.7G-17-flow-c-restriction-detail](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-17-flow-c-restriction-detail.jpg)
- [FleetOS-5.7G-18-documents-selected-stop](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-18-documents-selected-stop.jpg)
- [FleetOS-5.7G-19-interaction-matrix](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-19-interaction-matrix.jpg)
- [FleetOS-5.7G-20-restriction-stop](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-20-restriction-stop.jpg)
- [FleetOS-5.7G-21-restrictions-across-route](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-21-restrictions-across-route.jpg)
- [FleetOS-5.7G-22-fuel-local-station](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-22-fuel-local-station.jpg)
- [FleetOS-5.7G-23-fuel-detour](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-23-fuel-detour.jpg)
- [FleetOS-5.7G-24-fuel-driver-corridor](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-24-fuel-driver-corridor.jpg)
- [FleetOS-5.7G-25-truck-current-location](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-25-truck-current-location.jpg)
- [FleetOS-5.7G-26-truck-full-job](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-26-truck-full-job.jpg)
- [FleetOS-5.7G-27-truck-fuel-reach](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-27-truck-fuel-reach.jpg)
- [FleetOS-5.7G-28-truck-restriction](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-28-truck-restriction.jpg)
- [FleetOS-5.7G-29-driver-legal-corridor](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-29-driver-legal-corridor.jpg)
- [FleetOS-5.7G-30-driver-restriction](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-30-driver-restriction.jpg)
- [FleetOS-5.7G-31-driver-no-geography](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-31-driver-no-geography.jpg)
- [FleetOS-5.7G-32-driver-1920](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-32-driver-1920.jpg)
- [FleetOS-5.7G-33-takeover-1920](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-33-takeover-1920.jpg)
- [FleetOS-5.7G-34-documents-1920](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-34-documents-1920.jpg)
- [FleetOS-5.7G-35-documents-1199](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-35-documents-1199.jpg)
- [FleetOS-5.7G-36-fuel-1199](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-36-fuel-1199.jpg)
- [FleetOS-5.7G-37-driver-1199](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-37-driver-1199.jpg)
- [FleetOS-5.7G-38-takeover-1199](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-38-takeover-1199.jpg)
- [FleetOS-5.7G-39-review-native](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7G-39-review-native.jpg)
