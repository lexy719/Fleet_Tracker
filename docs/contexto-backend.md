# Contexto do backend FleetOS (para sessões novas, incluindo na cloud)

Lê isto antes de mexer no backend. Resume decisões e regras que não estão escritas no código.

## O projeto

- **FleetOS:** software de escritório para transportadoras ibéricas (planeamento da semana, atribuição de cargas, rotas de camião, combustível, regras de circulação).
- **Família de produtos:** FleetOS, app do motorista (navegação, relatos por voz, registo de km), portal para clientes que expedem carga (estilo Prozis: veem o seguimento e as horas de chegada) e, talvez, uma plataforma de cargas. Nenhum produto é gratuito.
- **Primeiro cliente alvo:** uma transportadora de Bragança, com cerca de 100 camiões. A visita é daqui a 1–2 meses, só quando o planeamento, a atribuição, o combustível e as rotas próprias funcionarem de ponta a ponta.

## Regras de trabalho

1. **O frontend (`src/studio`) é de outra sessão.** O backend não mexe em ficheiros do Studio.
2. **O núcleo é determinístico.** Rotas, regras, planeamento, atribuição e combustível não usam IA. A IA só lê texto confuso (avisos da IP, regulamentos municipais, relatos por voz), e o que lê é confirmado antes de afetar uma rota.
3. **Resultados de simulação são prova sintética.** Nunca "poupa X % por ano"; dizer sempre se os dados são gerados ou reais.
4. **Nunca copiar geometria ou dados do TomTom ou do Google para o nosso mapa.** Servem só para comparar.
5. **Não fazer commit sem o fundador pedir.**
6. **Documentos em português.** O código e os comentários do código ficam em inglês, como no resto do repositório.

## Os três motores

Ver `docs/arquitetura-testes-resultados.md` (arquitetura, testes, resultados, falhas corrigidas, o que falta).

- **Routing:** motor próprio GraphHopper 11.1 sobre OSM de Portugal e Espanha. Está **fora do repositório**, no PC do fundador (`C:\Users\manue\fleetos-routing`, perfil `truck3`, `localhost:8989`). A ligação está em `src/routing/graphhopperProvider.ts` e `truckRoute.ts`; as obras da IP em `roadWorks.ts`. Resultados em `docs/backend-map-quality-test.md`.
- **Atribuição v2:** `src/assignment`. Desenho e todos os resultados em `docs/atribuicao-servicos-v2.md`.
- **Road Intelligence:** `src/research`, `src/ingestion`, `src/discovery` e `src/regulations` (avaliador). A pesquisa por IA e na web existe mas nunca foi validada ao vivo.

## Na cloud: o que funciona e o que não

**Funciona:** toda a suite (`npx vitest run`) e os bancos da atribuição, incluindo os tempos reais gravados (`src/assignment/bench/hubMatrix.truck3.json`) e os preços de gasóleo reais gravados (`bench/hubFuelPrices.json`).

**Não funciona:**
- o GraphHopper (não está lá);
- recolhas novas da IP, DGEG, MITECO ou TomTom (a internet pode estar limitada e não há `.env`);
- o browser.

Não tentar estas coisas: deixá-las para o PC.

## Como correr

```bash
npx vitest run src/assignment
```

Medições opcionais (sondas):

```bash
BENCH=1 npx vitest run src/assignment/__tests__/bench.probe.test.ts
```

As outras sondas seguem o mesmo padrão: `GAP=1` (`gap.probe`), `MC=1` (`montecarlo.probe`), `REAL=1` (`realroads.probe`), `FUEL=1` (`fuelslack.probe`) e `REPLAN=1` (`replan.probe`: replanear, contratadas e fixações). Cada uma aceita `*_OUT=ficheiro.json` para gravar os resultados. O fuzz aceita `FUZZ_N=<n>` (mais semanas) e `FUZZ_SEED=<n>` (repetir uma semana).

## Regras de condução e transporte já modeladas

Reg. 561/2006 (pausas, 9/10 h, descanso de 11 h, 56 h por semana, 90 h em duas), Dir. 2002/15 (6 h seguidas, 60 h por semana, 10 h com trabalho noturno), cabotagem (3 operações em 7 dias, só depois de entrega internacional) e regresso a casa até sábado. A atribuição também aceita fixações do despachante, cargas contratadas e replaneamento com a semana em curso (atrasos, avarias, cargas novas e canceladas): ver a secção 8 de `docs/atribuicao-servicos-v2.md`. Ainda não: várias semanas (descansos reduzidos e compensação, regresso a cada 4 semanas), portagens, grupagem, trocas de reboque.
