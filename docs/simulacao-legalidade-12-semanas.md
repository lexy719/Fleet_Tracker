# Simulação: 12 semanas seguidas por motorista, com auditoria legal

Data: 2026-10-11 · **Evidência de simulação sintética** — não é um resultado medido nem uma promessa comercial. Não anualizar até haver histórico real de cargas de um cliente.

## O que foi corrido

- 1 camião / 1 motorista com base no Porto; 12 semanas seguidas (12 out – 28 dez 2026); sai segunda 06:00 e tem de estar em casa sexta 20:00 (hora de Lisboa); o fim de semana é o descanso semanal.
- 24 cargas aleatórias por semana entre polos ibéricos reais (seed 42); tarifas inventadas (150 € + 1,3 €/km com carga); estradas sintéticas (linha reta × 1,25, 72 km/h, 34,5 L/100 km a 1,80 €/L).
- Tempos calculados pelo planeador real do FleetOS (`planFleet`).
- Três políticas: **ordem de chegada**, **mais perto primeiro** (cargas que abrem nas 24 h seguintes) e **FleetOS** (seleção de cargas por margem com regresso a casa — protótipo em `src/sim`, ainda não está no produto).

## Auditoria legal (`src/legal/driverLegality.ts`)

Independente do planeador: lê a linha do tempo do motorista (condução, outro trabalho, disponibilidade, pausa, descanso) e verifica:

| Regra | Base |
|---|---|
| Pausa de 45 min após 4h30 de condução, ou 15 + 30 | Reg. 561/2006 art. 7 |
| Condução diária 9 h; 10 h no máximo 2× por semana | art. 6(1) |
| Descanso diário 11 h, reduzido 9 h (máx. 3 entre descansos semanais), repartido 3 + 9, concluído dentro de 24 h | art. 8(1)(2)(4) |
| Condução semanal 56 h; 90 h em duas semanas seguidas | art. 6(2)(3) |
| Descanso semanal até ao fim de 6 × 24 h; nunca dois reduzidos seguidos; compensação em bloco até ao fim da 3.ª semana seguinte | art. 8(6)(7) |
| Máx. 6 h de trabalho seguido sem pausa; pausas de 30/45 min conforme 6–9 h / > 9 h de trabalho | Dir. 2002/15 art. 5 |
| Tempo de trabalho semanal máx. 60 h; média 48 h (período de referência de 4 meses) | art. 4 |
| Trabalho noturno: máx. 10 h de trabalho no dia | art. 7 |

- **Tempo de trabalho é separado da condução.** Carga e descarga contam como trabalho.
- **Disponibilidade (espera) é separada:** não conta como pausa nem como trabalho. Esperas ≥ 9 h contam como descanso na cabine.
- **Histórico:** cada semana é auditada com as 4 semanas anteriores do mesmo motorista. Isso cobre as 90 h em duas semanas e o prazo de compensação.
- **Teste de consistência:** se aparecer uma infração datada no histórico, a corrida para com erro.
- **Não modelado (dito no relatório):** ferry/comboio, tripulação múltipla, derrogação de 12 dias, dois descansos semanais reduzidos seguidos em transporte internacional (Reg. 2020/1054), art. 12.
- **Período noturno 00h–05h:** é uma suposição conservadora, a confirmar com o DL 237/2007.

## Resultados (média por semana, 12 semanas)

### 1. Tecnicamente possível vs. 2. legal

| Política | Planos técnicos que passam a auditoria | Infrações mais comuns |
|---|---|---|
| Ordem de chegada | 2 / 12 | trabalho noturno > 10 h (7), 6 h sem pausa (3), 4h30 (2), descanso diário (1) |
| Mais perto primeiro | 8 / 12 | descanso diário fora das 24 h (3), trabalho noturno (1) |
| FleetOS (sem filtro legal) | 7 / 12 | trabalho noturno (3), 6 h sem pausa (3), 4h30 (2), descanso diário (2) |

**O planeador base, sozinho, produz planos ilegais com frequência.** Ele cumpre a condução de 9 h e as pausas de 4h30, mas:
- não limita o tempo de trabalho em dias com trabalho noturno;
- não conta a carga e descarga para as 6 h de trabalho seguido;
- não garante que o descanso diário termina dentro das 24 h;
- trata qualquer espera de 45 min como pausa.

### 3. Comercialmente melhor (só planos legais)

| Política | Margem* | Cargas | Km em vazio | Condução (máx.) | Tempo de trabalho (máx.) |
|---|---|---|---|---|---|
| Ordem de chegada | 564 € | 2,6 | 46 % | 35,6 h (43,3) | 39,4 h (46,8) |
| Mais perto primeiro | 943 € | 3,0 | 35 % | 30,3 h (37,3) | 34,8 h (43,3) |
| **FleetOS** | **1 333 €** | 3,2 | **21 %** | 31,0 h (43,3) | 35,7 h (50,8) |

\* Receita − gasóleo − portagens. Outros custos não modelados.

- **FleetOS vs. melhor despachante, margem legal por semana:** +363 € em média, nunca pior (empate numa semana).
- **Custo do filtro legal no FleetOS:** −56 €/semana face ao plano técnico.
- O FleetOS dá **o melhor plano encontrado** pela pesquisa, não um ótimo provado.

### Contadores ao longo das 12 semanas

- Não foi usado nenhum dia de 10 h de condução: o planeador nunca os propõe, o que é uma oportunidade comercial perdida, não uma ilegalidade.
- Houve 1 descanso diário reduzido, nenhum descanso semanal reduzido e nenhuma dívida de compensação.
- Com casa todos os fins de semana, **as 90 h em duas semanas e a compensação não chegaram a apertar** nos planos legais. As 90 h apanharam um plano técnico numa corrida anterior. Estas regras estão testadas em testes unitários, mas este cenário não as exercita a fundo.
- A média de 48 h não é avaliável em 12 semanas (o período de referência é de 17). Fica reportada: FleetOS 35,7 h.

## Antes de passar para o produto

1. Pôr a auditoria dentro do planeador, ou como filtro obrigatório, para o FleetOS nunca propor um plano que a auditoria reprova.
2. Ensinar ao planeador: carga e descarga como trabalho, a regra das 6 h, o limite de trabalho noturno, o descanso concluído dentro de 24 h e esperas classificadas como disponibilidade.
3. Validar com histórico real (tacógrafo e cargas) de um cliente antes de qualquer número comercial.

Reproduzir: `DW_OUT=dw.json npx vitest run src/sim/__tests__/driverWeeks.probe.test.ts` (~2–3 min).
