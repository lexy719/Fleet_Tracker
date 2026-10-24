# Pedido para a sessão na cloud: replanear e fixar à mão

Copia o texto abaixo para a sessão nova.

---

Trabalha no backend do FleetOS, no módulo `src/assignment` (atribuição de cargas v2). Antes de começar lê `docs/contexto-backend.md` e `docs/atribuicao-servicos-v2.md`. Não mexas em `src/studio` nem em nada que precise do GraphHopper, de internet ou do browser.

**Objetivo:** tornar a atribuição usável por um despachante real.

1. **Fixações do despachante:**
   - "esta carga é desta equipa";
   - "esta equipa não faz esta carga";
   - "estas cargas desta equipa ficam nesta ordem".

   A pesquisa nunca as viola. Se uma fixação for impossível (regras, janelas, regresso a casa), diz porquê em vez de a ignorar.
2. **Cargas obrigatórias** (contratadas) **e opcionais** (*spot*). Uma obrigatória só fica por fazer se não houver nenhuma forma legal de a fazer, e o resultado diz porquê.
3. **Replanear a partir do plano atual** quando:
   - entra uma carga nova;
   - uma carga é cancelada;
   - uma equipa atrasa X horas a partir de agora;
   - um camião avaria (a equipa sai a partir de um momento).

   O que já aconteceu fica fixo. O replaneamento prefere mudar o mínimo: custo extra por cada carga que muda de equipa.

**Pronto quando:**
- Há testes novos (estilo de `src/assignment/__tests__/traps.test.ts`) para cada caso acima, e as fixações nunca são violadas.
- Zero infrações na auditoria legal (`scorePlan`).
- É medida a estabilidade: quantas cargas mudam de equipa em cada caso. Uma carga nova não deve mexer em mais de 2–3 equipas na semana L.
- Replanear a semana L demora menos de 3 s.
- Os testes existentes continuam a passar: `npx vitest run src/assignment` e o fuzz com `FUZZ_N=400`.
- `docs/atribuicao-servicos-v2.md` tem uma secção nova com os resultados.

Não faças commit sem eu pedir.

---

## Se sobrar tempo: carga de retorno para casa à sexta

O regresso a casa vazio é 40–60 % dos km vazios. Faz a pesquisa favorecer acabar a semana com uma carga para a região de casa. Mede no banco com tempos reais gravados:

```bash
REAL=1 npx vitest run src/assignment/__tests__/realroads.probe.test.ts
```

Pronto quando os km de regresso vazio descem, a margem não piora e há zero infrações.
