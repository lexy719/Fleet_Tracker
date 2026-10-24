# FleetOS — visão geral da plataforma

19 outubro 2026 · uma plataforma, três produtos, um backend

**Objetivo:** uma transportadora ibérica (PT + ES) planeia a semana inteira com menos quilómetros vazios, cada rota é legal para aquele camião naquela data, e quem espera a carga sabe quando o camião chega.

**O que nos distingue:** conhecimento de camião. Google e TomTom sabem onde estão as coisas; o FleetOS sabe por onde um pesado de 40 t pode passar numa data, onde fica o portão de camiões de cada armazém, em que bomba pode abastecer e a que preço, e quanto tempo demora de facto cada percurso.

---

## 1. FleetOS — escritório da transportadora (produto principal)

**Para quem:** planeadores e expedição de transportadoras. Piloto possível: transportadora de Bragança com cerca de 100 camiões.

- **Operação:** trabalhos (cargas), camiões, reboques, motoristas, clientes, locais e documentos (guia CMR). Cada trabalho segue um ciclo de vida controlado: planeamento → atribuído → carga → em trânsito → entregue.
- **Planeamento automático:** atribui camião, motorista e reboque e minimiza km vazios e custo. Respeita janelas horárias, qualificações (ADR, frio, equipamento) e restrições de estrada. Confirma em lotes, e o escritório pode bloquear ou comparar planos.
- **Legalidade:** auditoria das horas de condução (Reg. CE 561/2006: pausa de 45 min, descanso diário e semanal, 56 h por semana, 90 h por quinzena). Nenhum plano é mostrado sem passar por ela.
- **Combustível:** o motor de abastecimento escolhe o posto e os litros ao longo da rota, dentro das pausas obrigatórias, com preços por posto de PT e ES. Regra do escritório: chegar com ≥ 25 % no depósito.
- **Interface (Studio):** o mapa está sempre presente e os cartões transformam-se em painéis. O layout segue a tarefa, sem botões de vista.

**Estado:** funciona no browser, com dados guardados localmente (IndexedDB). O Studio é a app em `/`; a interface antiga está em `/classic` e vai sendo migrada.

## 2. App do Motorista

**Para quem:** motoristas, em Android e iPhone (React Native / Expo, TypeScript como o FleetOS).

- **Recebe:** a rota confirmada no escritório, as paragens com notas da doca, a bomba e os litros planeados, as pausas, avisos de obras e cortes, e os documentos (CMR) disponíveis sem rede.
- **Envia:** posição (só em serviço), chegada, carga e entrega, prova de entrega (fotos e assinatura), talões com o **preço real pago**, ocorrências (atraso, avaria, estrada cortada) e despesas.
- **Princípios:** nada de escrever a conduzir, funciona sem rede, conta pessoal por motorista, cumpre o RGPD.
- **Navegação:** o TomTom desenha e guia; a rota, as restrições e as paragens são decididas pelo FleetOS. Se o motorista se desviar, a nova rota é recalculada no nosso planeador, sem cair para uma rota direta.

**Estado:** o protótipo de navegação está ligado ao serviço local do FleetOS (`POST /api/driver/route`); o resto está especificado em `docs/driver-app-spec.md`. Falta confirmar a licença do kit de navegação TomTom.

## 3. Portal do Expedidor (Prozis, JBS, …)

**Para quem:** empresas que despacham ou recebem mercadoria, como a Prozis (e-commerce/armazém) ou a JBS (carne, cargas de frio).

- Encomendar transporte à transportadora (o pedido entra no FleetOS como trabalho).
- Ver os camiões ao vivo, com a **hora prevista de chegada** atualizada pela posição real.
- Receber alertas de atraso com a nova hora e a prova de entrega (fotos, assinatura, reservas).
- Cargas de frio: temperatura-alvo visível. Mais tarde, temperatura real via telemática.

**Origem:** no armazém da Prozis nunca se sabia quando chegava o camião (às vezes ao jantar, toda a gente a correr). A ideia é ser simples, mas bom.

**Estado:** ainda não construído. Depende do servidor e da posição enviada pela app do motorista; a posição do telemóvel chega para um piloto, mesmo sem telemática.

## 4. Projeto 2 — inteligência de estrada e combustível (parte do backend)

Não é um produto. É a camada que diz o que é verdade sobre a rede ibérica, com origem, data e grau de confiança. Alimenta os três produtos.

- **Regras para pesados:** proibição na VCI (DL 155-A/2026), calendário anual da DGT para > 7,5 t em Espanha, regras ADR.
- **Cortes e obras datados:** Lisboa, Porto, Oeiras, alertas da IP, cerca de 60 municípios com avisos publicados em WordPress, e incidentes DGT (DATEX II). O TomTom ignora cortes futuros e falha cerca de 40 % deles.
- **Preços por posto:** DGEG (PT, ~2,9 mil postos de gasóleo) e MITECO (ES, ~11,5 mil postos, AdBlue incluído), com histórico de preços.
- **Barreira de confiança:** um dado só altera uma rota se for recente, tiver localização e vier de fonte verificada. Texto sem localização nunca vira marcador inventado.
- **Bloqueio legal (não técnico):** os termos da DGEG (preços) e da IP (alertas) proíbem uso comercial. Ficam só para investigação até haver licença (NAP Portugal, cartões de frota, feeds licenciados).

## 5. Backend comum — “o backend de tudo”

**Hoje:**
- **Domínio puro** (`src/domain`, `src/legal`, `src/fuel`, `src/regulations`): trabalhos, planeamento, legalidade, combustível, restrições e documentos.
- **OperationsService:** o único caminho de escrita, com resultados validados e eventos.
- **Repositórios:** IndexedDB no browser, mais um serviço local para a app do motorista.

**Alvo:**
- Servidor na UE (VPS + PostgreSQL), várias empresas, contas e papéis, backups e monitorização. Um único servidor serve FleetOS, app e portal.
- **Mapa próprio** a partir do OpenStreetMap (PMTiles) e **routing próprio** com GraphHopper e perfis de camião (altura, peso, eixos, túneis ADR).
- O Projeto 2 passa a ser entrada do routing: estradas bloqueadas ou penalizadas por data e por veículo, em vez de verificação a posteriori.
- Tabelas de portagens próprias, velocidades aprendidas do GPS dos motoristas e telemática rFMS (Volvo, Scania…) para horas e depósito.
- **Registo de postos** (lista oficial + posição OSM, com confiança indicada) e **locais com portão de camiões**, fixados uma vez e reutilizados.
- O TomTom é transitório: só uso ao vivo, sem guardar conteúdo (ToS 11.4). Fica como segunda opinião até os nossos números o igualarem.

## Como tudo se liga

```
Expedidor (Portal) ── encomenda ──▶ FleetOS (escritório)
                                     │ planeia: routing próprio + Projeto 2
                                     │          + legalidade + combustível
                                     ▼
                              App do Motorista ── executa
                                     │ posição, entregas, talões, cortes
                                     ▼
              FleetOS (estado, replaneamento)  +  Portal (hora de chegada, prova)
                                     │
                                     ▼
         Projeto 2 aprende: preço real pago, portões, acessos às bombas, estradas cortadas
```

## Fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Uma só app, com a linguagem visual do Studio | em curso |
| 1 | Mapa próprio, registo de postos, locais com portão | — |
| 2 | Routing próprio para camiões, com o Projeto 2 dentro | — |
| 3 | Planeamento semanal automático (backhauls, lei da semana) | — |
| 4 | App do Motorista + Portal do Expedidor em produção | protótipo / spec |
| 5 | Comercial: servidor multiempresa, licenças de dados | — |

**Nota:** as poupanças do simulador semanal são evidência sintética. Não se anualizam nem se apresentam como promessa até serem validadas com o histórico real de uma transportadora.
