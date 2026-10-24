# FleetOS — instruções para agentes (AGENTS.md = cópia de CLAUDE.md)

Software para transportadoras ibéricas: planeamento da semana, atribuição de cargas, rotas de camião, combustível e regras de circulação. Ainda virão a app do motorista e um portal para os clientes que expedem carga. O fundador escreve em português; responde em português.

## Lê primeiro

1. `docs/memoria/MEMORY.md`: índice do que se sabe sobre o fundador, o produto e as decisões (cópia da memória de 24 out 2026). Abre os ficheiros relevantes para a tarefa.
2. **Backend:** `docs/contexto-backend.md`, `docs/arquitetura-testes-resultados.md` e `docs/atribuicao-servicos-v2.md`.
3. **Frontend (Studio, `src/studio`):** em `docs/memoria/`, os ficheiros `fleetos-studio.md`, `design-v2-direction.md`, `fleetos-cinema-direction.md`, `fleetos-design-taste.md`, `show-before-build.md`, `studio-keep-design-consult.md`, `check-overlaps.md`, `design-review-loop.md` e `google-maps-decision.md`. Também `.claude/founder-taste.md` (o gosto do fundador, que os revisores de design leem primeiro).
4. **App do motorista:** `docs/app-motorista-brief.md` e `docs/memoria/driver-app-mockups.md`.

## Regras

- **Não fazer commit nem push sem o fundador pedir.**
- **Nunca ler nem enviar o `.env`** (chaves). Nunca imprimir chaves.
- **O backend e o frontend trabalham em sessões separadas.** Uma tarefa de backend não mexe em `src/studio`, e vice-versa.
- **O núcleo é determinístico** (rotas, regras, planeamento, combustível). A IA só lê texto confuso, e o que lê é confirmado antes de afetar uma rota.
- **Resultados de simulação são prova sintética.** Nunca "poupa X % por ano"; dizer sempre se os dados são gerados ou reais.
- **Nunca copiar geometria ou dados do TomTom ou do Google para o nosso mapa** (só comparar).
- **Design:** manter o layout e o estilo existentes; perguntar antes de mudanças estruturais grandes; mostrar (imagem) antes de construir; nunca remover coisas por dúvida.
- **Antes de dizer que está feito:** correr os testes da área, por exemplo `npx vitest run src/assignment` ou `npx vitest run`.

## Limitações fora do PC do fundador (cloud, outra máquina)

O motor de rotas GraphHopper vive fora do repositório (`C:\Users\manue\fleetos-routing`, `localhost:8989`). Não está disponível noutra máquina, e não há `.env` nem browser.

Os testes e os bancos da atribuição funcionam sem ele: os tempos reais e os preços de gasóleo estão gravados em `src/assignment/bench/*.json`.
