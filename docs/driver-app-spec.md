# App do Motorista — especificação v0

Data: 2026-10-11 · Estado: proposta, nada construído
Família de produtos: **FleetOS** (escritório) · **App do Motorista** (este documento) · **Portal de Expedidor** (estilo Prozis: encomendar e ver chegadas). O Projeto 2 (estradas + combustível ibérico) é backend do FleetOS e alimenta as três.

---

## 1. Para que serve

O motorista deixa de andar com papéis e deixa de adivinhar. Tudo o que o escritório decidiu (rota, paragens, bomba, litros, documentos) chega ao telemóvel; tudo o que acontece na estrada (posição, entregas, talões, ocorrências) volta ao escritório e ao cliente.

**Sem a app, a poupança de combustível e as restrições ficam no papel.** É a app que as torna reais.

## 2. Princípios

1. **Nada de escrever a conduzir.** Com o camião em movimento: só voz, avisos e botões grandes. Formulários só parado (velocidade < 5 km/h).
2. **Funciona sem rede.** O trabalho do dia, documentos e rota ficam no telemóvel; o que o motorista faz é guardado e enviado quando houver rede.
3. **Dar antes de pedir.** O motorista tem de ganhar algo (menos papel, menos chamadas do escritório, avisos de obras) — não só receber ordens.
4. **Mapa e navegação TomTom, decisões FleetOS.** O TomTom desenha e guia; a rota, as restrições, as paragens e a bomba vêm do nosso servidor.
5. **Dados do motorista são dados pessoais (RGPD).** Posição só durante o serviço; o motorista vê o que é partilhado e com quem.

## 3. Ecrãs

### 3.1 Hoje (ecrã inicial)
- Próximo trabalho em destaque: cliente, cidade, janela horária, hora prevista de chegada.
- Lista do dia/semana (trabalhos atribuídos ao motorista, por ordem).
- Faixa de horas: condução restante até à pausa de 45 min e até ao descanso diário.
- Avisos não lidos.

### 3.2 Trabalho
- Referência, cliente, contacto (ligar com um toque), carga (linhas, peso, paletes), ADR (classe, nº ONU), temperatura alvo (frio).
- Paragens por ordem: morada, janela, notas da doca ("portão 3, ligar 15 min antes"), estado.
- Botões por paragem: **Cheguei** · **Carregado/Descarregado** · **Problema**.
- Documentos do trabalho (3.5).

### 3.3 Navegação
- Mapa TomTom 3D com a rota confirmada no FleetOS (não uma rota recalculada à sorte — ver §6).
- Próxima manobra, km e hora de chegada.
- Marcadores: paragens do trabalho, **bombas planeadas**, pausas planeadas, restrições/obras conhecidas no caminho.
- **Encadeamento automático:** ao marcar «Entregue» na última paragem, a app carrega sozinha o próximo trabalho e a navegação passa para a rota dele (já com bombas e pausas). Se o escritório mudar a ordem ou acrescentar um trabalho, a rota atualiza-se sem o motorista fazer nada.
- Aviso por voz antes de cada paragem planeada: «Daqui a 20 km: pausa de 45 min e abastecimento na Petroprix de Tudela — 360 litros».

### 3.4 Abastecimento
- Para cada paragem do plano: posto, marca, localização, litros, preço esperado, se é na pausa, desvio.
- Depois de abastecer: **fotografar o talão** → litros, preço pago, posto, hora (lido do talão; o motorista confirma).
- Se o motorista abastecer noutro sítio: regista na mesma (o plano é recalculado no servidor).

### 3.5 Documentos
- **Guia CMR** emitida no FleetOS (já existe: `src/domain/documents/documents.ts`), ficha ADR, instruções do cliente, anexos.
- Disponíveis sem rede.
- Fase 2: **e-CMR** (Portugal e Espanha aderiram ao protocolo e-CMR) e preparação para o regulamento europeu eFTI (autoridades aceitarem informação de transporte digital). Confirmar datas e requisitos antes de construir.

### 3.6 Entrega (prova de entrega)
- Fotos da carga, assinatura do recetor no ecrã, nome, hora e local (automáticos), reservas ("2 paletes danificadas").
- Enviado de imediato ao FleetOS e ao Portal de Expedidor.

### 3.7 Ocorrências
- Atraso, avaria, acidente, carga danificada, estrada cortada, doca fechada — com foto e nota de voz.
- Atraso → nova hora de chegada recalculada e enviada ao cliente.

### 3.8 Despesas
- Talões de combustível, portagens, estacionamento, lavagem — foto + categoria.

### 3.9 Horas
- Estado atual (condução / outro trabalho / disponível / descanso), tempo até à próxima pausa, condução do dia e da semana (Reg. CE 561/2006).
- Fonte, por ordem de preferência: tacógrafo via telemática rFMS → registo manual do motorista. A fonte é sempre mostrada.

### 3.10 Avisos
- Trabalho novo ou alterado, mudança de doca/janela, obra ou corte na rota, mensagem do escritório.
- Funcionam com a app fechada (notificações push).

## 4. Dados que vêm do servidor

Tudo já existe (ou está a ser feito) no FleetOS; o servidor só os expõe ao motorista.

| Dado | Origem no FleetOS hoje |
|---|---|
| Trabalhos do motorista | `Job` (`src/data/types.ts`): `stops[]`, `cargo[]`, `adrClass`, `adrUnNumber`, `tempTargetC`, `notes`, `plannedDepartureAt` |
| Rota confirmada | `RoutePlanOption.polyline` + `operationalPlan` do trabalho |
| Plano de abastecimento | `RoutePlanOption.refuelPlan` (`src/domain/fuelPlanning/refuelPlanner.ts`) |
| Restrições na rota | `routeCompliance` (avaliação de restrições do trabalho) |
| Documentos | `src/domain/documents/` (CMR emitida) |
| Horas do motorista | `driverHoursForPlanning` (`src/domain/drivers/drivers.ts`) |

## 5. Dados que a app envia

| Evento | Quem usa |
|---|---|
| Posição (cada 30–60 s em serviço) | FleetOS (juntar trabalhos perto do camião), Portal (hora de chegada) |
| Cheguei / carregado / entregue + prova de entrega | FleetOS (estado do trabalho, faturação), Portal |
| Talão de combustível (litros, **preço real pago**, posto) | Plano de abastecimento: passa de estimado a medido; aprende o desconto do cartão de frota de cada cliente |
| Ocorrências | FleetOS (replanear), Portal (aviso ao cliente) |
| Estado de horas (manual) | Planeamento das pausas, quando não há telemática |

O **preço real pago** é o dado que hoje mais falta: é ele que transforma a poupança de combustível de estimativa em número medido.

## 6. Navegação TomTom — a confirmar antes de construir

- Kit de navegação TomTom para Android/iOS: mapa 3D, curva a curva, perfil de camião.
- A rota do FleetOS é enviada com os pontos por onde tem de passar, para o TomTom guiar por esse caminho.
- **Por confirmar:**
  1. **Licença** — o kit de navegação costuma exigir contrato comercial próprio, separado da chave de cálculo de rotas que já usamos.
  2. **Desvios do motorista** — quando o TomTom recalcula sozinho, a nova rota tem de voltar a respeitar as restrições do FleetOS (recalcular no nosso servidor, ou limitar o recálculo).
  3. **Termos de uso dos dados TomTom** — não guardar conteúdo TomTom além do permitido (cl. 11.4).

## 7. Fases

| Fase | Conteúdo | Pré-requisito |
|---|---|---|
| 0 | Servidor (VPS na UE, PostgreSQL, login) com trabalhos partilhados | — |
| 1 | Hoje, Trabalho, Documentos (CMR), Navegação, Abastecimento, Entrega, posição do telemóvel | Fase 0, licença TomTom |
| 2 | Talões (leitura automática), Ocorrências, Despesas, Avisos push, Horas manuais | Fase 1 |
| 3 | Horas e depósito via rFMS (Volvo, Scania, …), e-CMR | contrato do cliente com o fabricante |

A posição do telemóvel (Fase 1) já chega para o Portal de Expedidor mostrar a hora de chegada — dá para um piloto antes da telemática.

## 8. Decisões (2026-10-11)

1. **Android e iPhone.** Uma base de código (React Native, mesma linguagem TypeScript do FleetOS); o mapa/navegação TomTom é nativo de cada plataforma e entra por um módulo nativo — confirmar o que o TomTom oferece para React Native.
2. **Com autenticação: cada motorista tem a sua conta.** O acesso é da pessoa, não do aparelho — por isso tanto faz ser o telemóvel do motorista ou da empresa. Sessões revogáveis pelo escritório (telemóvel perdido, motorista sai). A posição só é recolhida com o motorista «em serviço».
4. **Línguas: português, espanhol e inglês.**

## 9. Perguntas em aberto

1. Licença e preço do kit de navegação TomTom (pedir proposta comercial).
2. Que software/telemática usa a transportadora do piloto (Bragança, ~100 camiões)?
