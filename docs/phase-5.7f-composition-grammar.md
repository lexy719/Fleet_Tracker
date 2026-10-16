# FleetOS Phase 5.7F - Relatório visual

Implementação DEV concluída: contratos de participação, grupos semânticos, seis famílias adaptativas, intenção explícita de mapa, takeover reversível e stress de oito lentes.

[Abrir laboratório](http://localhost:5173/__dev/fleetos-environment)

## O que mudou

Anchor, active lenses e lead mantêm o modelo 5.7E. Drivers/Trucks partilham Resources; Fuel/Restrictions enriquecem Journey; Documents/Compliance contribuem em Assurance. A família é escolhida por intenção, grupos, relevância do mapa e viewport; a geometria deriva da procura de conteúdo. Pricing DEV e Compliance DEV são placeholders sem lógica operacional.

## Verificação e limites

Os três Fuel obrigatórios, Driver/Documents/Restrictions lead, oito lentes, promoção de exceção, mapa/detail takeover e retornos foram revistos. Desktop: 1440×900, 1920×1080, 1199×900. Dez verificações de retorno passaram em estado, geometria, câmara, scroll e instância. Typecheck, lint, build e suite final (1361 testes / 57 ficheiros, dois workers) passaram.

A primeira suite encontrou um mock antigo de câmara e um teste de performance acima do limite sob concorrência. O mock foi atualizado; a performance passou isoladamente e a suite completa passou com dois workers sem alteração de thresholds. Build conserva aviso do bundle de mapa. O arranque limpo não teve warn/error; um aviso de hot reload durante edição não é contado como falha da aceitação limpa.

Não houve validação visual exaustiva de combinações, FPS/GPU, mobile abaixo de 900px ou reduced-motion no browser nesta fase. As 765 combinações de geometria pertencem a teste puro. Todas as rotas, entidades, restrições e valores são sintéticos; nenhuma produção foi integrada.

## Fotografias - todas as vistas capturadas

### 01 - Base

Restaurar base: mapa amplo e oito entradas pequenas no rail. Nenhuma lente está ativa. A âncora ainda é a coleção de transportes.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-01-base.jpg>)

![Base](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-01-base.jpg)

### 02 - Jobs normal

Adicionar Jobs abre a coleção com seis transportes sintéticos. A geografia mantém maior área; abrir uma lente não equivale a criar um cartão fixo.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-02-jobs-normal.jpg>)

![Jobs normal](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-02-jobs-normal.jpg)

### 03 - Job selecionado

Selecionar J-4217 muda a âncora para Porto - Madrid. O mapa ocupa a faixa superior; a identidade, ETA, janela e progresso ficam na faixa operacional inferior.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-03-selected-job.jpg>)

![Job selecionado](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-03-selected-job.jpg)

### 04 - Fuel A - apoios mínimos

Jobs + Fuel. A decisão e a geografia partilham a área útil. Comparação de postos e proposta de abastecimento pertencem à mesma superfície Fuel.

Família: `SPLIT_DECISION`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-04-fuel-minimal.jpg>)

![Fuel A - apoios mínimos](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-04-fuel-minimal.jpg)

### 05 - Fuel B - Resources

Adicionar Drivers e Trucks conserva Fuel como lead. Driver + Truck passam a uma região Resources coerente, abaixo do mapa, sem duas caixas independentes.

Família: `PRIMARY_SUPPORT_STACK`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-05-fuel-resources.jpg>)

![Fuel B - Resources](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-05-fuel-resources.jpg)

### 06 - Fuel C - Journey + Assurance

Adicionar Documents e Restrictions escolhe uma família horizontal. Resources ficam à direita; documentação e acesso entram na área Fuel; o mapa torna-se uma faixa larga.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-06-fuel-resources-assurance-journey.jpg>)

![Fuel C - Journey + Assurance](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-06-fuel-resources-assurance-journey.jpg)

### 07 - Driver lead

Expandir Drivers muda a pergunta: turno, tempo restante, pausa e próxima etapa. Fuel contribui como próxima paragem útil; Truck pertence aos recursos do transporte.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-07-driver-lead.jpg>)

![Driver lead](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-07-driver-lead.jpg)

### 08 - Documents lead

A área documental passa a principal. Resources respondem com identidades/status; Fuel responde com autorização/comprovativo. O mapa fica oculto por falta de necessidade espacial.

Família: `NO_MAP_ASSURANCE`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-08-documents-lead.jpg>)

![Documents lead](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-08-documents-lead.jpg)

### 09 - Restrictions lead

Acesso e condições de execução passam a organizar o trabalho. O mapa aproxima-se do segmento sintético; Resources e Assurance contribuem sem caixas individuais por lente.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-09-restrictions-lead.jpg>)

![Restrictions lead](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-09-restrictions-lead.jpg)

### 10 - Mapa ampliado a partir de Fuel

Expandir mapa ocupa quase toda a área útil. J-4217, lead Fuel e posto F-07 continuam em estado. O topo oferece retorno; a geografia mantém rota, posto e segmento relevantes.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-10-map-takeover-fuel.jpg>)

![Mapa ampliado a partir de Fuel](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-10-map-takeover-fuel.jpg)

### 11 - Mapa ampliado a partir de Driver

A mesma primitiva temporária funciona com Drivers lead. A câmara passa do contexto local para a geografia do transporte, sem navegar nem recriar o mapa.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-11-map-takeover-driver.jpg>)

![Mapa ampliado a partir de Driver](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-11-map-takeover-driver.jpg)

### 12 - Regresso do mapa a Fuel

O regresso recupera o frame capturado: Fuel, F-07, seis lentes, geometria, câmara e scroll. A identidade do mapa continua igual.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-12-return-map-fuel.jpg>)

![Regresso do mapa a Fuel](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-12-return-map-fuel.jpg)

### 13 - Oito lentes - estado normal

Jobs, Fuel, Drivers, Trucks, Documents, Restrictions, Pricing DEV e Compliance DEV estão ativos. Duas regiões de informação e um mapa substituem oito superfícies isoladas.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-13-eight-lenses-normal.jpg>)

![Oito lentes - estado normal](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-13-eight-lenses-normal.jpg)

### 14 - Oito lentes - Fuel lead

As oito lentes mantêm-se ativas. A comparação Fuel recebe status documental, acesso e dois resumos DEV; Driver + Truck continuam agrupados na região Resources.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-14-eight-lenses-fuel.jpg>)

![Oito lentes - Fuel lead](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-14-eight-lenses-fuel.jpg)

### 15 - Exceção - condução crítica

O controlo DEV muda o tempo restante de demonstração para 22 min. O aviso ganha destaque e Resources recebem mais espaço; Fuel continua lead e o posto mantém-se selecionado.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-15-exception-promotion.jpg>)

![Exceção - condução crítica](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-15-exception-promotion.jpg)

### 16 - Desktop largo - 1920 x 1080

Oito lentes e Fuel lead no desktop largo. A comparação e a proposta ficam em colunas funcionais; Resources têm espaço de leitura e a geografia ocupa uma faixa horizontal ampla.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-16-wide-desktop.jpg>)

![Desktop largo - 1920 x 1080](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-16-wide-desktop.jpg)

### 17 - Desktop menor - 1199 x 900

O grupo Resources passa a resumos inline dentro da área principal. O mapa mantém uma altura útil. O conteúdo usa scroll interno; não surge overflow horizontal do canvas.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-17-compact-desktop.jpg>)

![Desktop menor - 1199 x 900](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-17-compact-desktop.jpg)

### 18 - Jobs expandido

Jobs torna-se lead da coleção: overview e próximas chegadas acrescentam profundidade à lista. A família de decisão reparte espaço com a geografia.

Família: `SPLIT_DECISION`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-18-jobs-expanded.jpg>)

![Jobs expandido](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-18-jobs-expanded.jpg)

### 19 - Inspeção temporária de documento

A seleção CMR-4217 ganha uma área ampla central. A âncora e o lead documental permanecem guardados; terminar a inspeção restaura a seleção e o trabalho anterior.

Família: `CENTERED_WORK`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-19-document-takeover.jpg>)

![Inspeção temporária de documento](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-19-document-takeover.jpg)

### 20 - Abrir mapa em Documents

O operador pede explicitamente geografia mesmo quando Documents a ocultava. A composição passa a incluir mapa e apoios sem trocar de lead; Esc recupera a ausência anterior do mapa.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-20-documents-map-open.jpg>)

![Abrir mapa em Documents](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-20-documents-map-open.jpg)

### 21 - Inspeção de segmento

A primitiva espacial aproxima a geografia ao acesso junto de Mirandela. O segmento laranja é uma referência sintética de composição, não uma decisão jurídica de circulação.

Família: `SPATIAL_DOMINANT`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-21-segment-takeover.jpg>)

![Inspeção de segmento](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-21-segment-takeover.jpg)

### 22 - Resources inline após scroll

No desktop de 1199 px, scroll revela identidade, tempo de condução, matrícula, combustível, autonomia e consumo como resumos integrados. Permanecem acessíveis sem região própria.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-22-compact-inline-resources.jpg>)

![Resources inline após scroll](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-22-compact-inline-resources.jpg)

### 23 - Promoção de Resources a 1199 px

O aviso de 22 min transforma o apoio inline numa região Resources visível. A família continua horizontal; a prioridade muda de forma guiada sem substituir Fuel.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-23-compact-resource-promotion.jpg>)

![Promoção de Resources a 1199 px](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-23-compact-resource-promotion.jpg)

### 24 - Inspeção temporária de posto

O detalhe de F-07 reúne preço sintético, desvio, ETA, pausa e continuidade do Job. Pode abrir geografia; terminar a inspeção recupera o scroll real do workspace anterior.

Família: `CENTERED_WORK`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-24-station-takeover.jpg>)

![Inspeção temporária de posto](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-24-station-takeover.jpg)

### 25 - Pricing DEV como participante

Expandir o placeholder mostra apenas participação de demonstração. Serve para validar prioridade, agrupamento e lead; não contém cálculo comercial ou preço operacional.

Família: `NO_MAP_ASSURANCE`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-25-pricing-participation-only.jpg>)

![Pricing DEV como participante](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-25-pricing-participation-only.jpg)

### 26 - Compliance DEV como participante

O segundo placeholder valida a participação Assurance. A área principal declara a ausência de lógica real de compliance e conserva a identidade do transporte.

Família: `NO_MAP_ASSURANCE`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-26-compliance-participation-only.jpg>)

![Compliance DEV como participante](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-26-compliance-participation-only.jpg)

### 27 - Trabalho de Resources com mapa lateral

Sem a contribuição de Restrictions, Drivers lead escolhe trabalho central/lateral: mapa local à esquerda, recurso principal à direita e apoios integrados. Não depende de uma página nova.

Família: `CENTERED_WORK`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-27-centered-resource-work.jpg>)

![Trabalho de Resources com mapa lateral](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-27-centered-resource-work.jpg)

### 28 - Inspeção temporária de recurso

Inspecionar o motorista usa a mesma primitiva de detalhe, com uma região ampla e mapa oculto. O turno e o conjunto atribuído continuam ligados a J-4217.

Família: `CENTERED_WORK`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-28-resource-takeover.jpg>)

![Inspeção temporária de recurso](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-28-resource-takeover.jpg)

### 29 - Workspace deixado para revisão

Fuel e oito lentes permanecem ativos no tamanho natural do browser do utilizador, após remover os tamanhos temporários de teste. O posto F-07 continua selecionado.

Família: `HORIZONTAL_JOURNEY`.

[Abrir fotografia](<C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-29-final-review.jpg>)

![Workspace deixado para revisão](C:/Users/manue/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/FleetOS-5.7F-29-final-review.jpg)
