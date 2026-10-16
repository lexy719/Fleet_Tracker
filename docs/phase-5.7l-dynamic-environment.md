# FleetOS — Phase 5.7L · Ambiente dinâmico (motor + compositor de entidades)

Laboratório DEV. Dados sintéticos, geometria TomTom/OSM gravada. Sem produção, sem Planear, sem motor de rota/tempo, sem commit.

## Três correções do pedido, como foram cumpridas

1. **O mapa não é o chão.** É uma região da composição: `hidden`, `inset`, `corridor`, `half` ou `dominant`. Documentos, legalidade e várias receitas expulsam-no; só aparece quando a composição tem uma pergunta espacial (`spatial.question !== NONE`).
2. **Caixas não são o sistema.** O compositor produz famílias diferentes a partir da pergunta: linha temporal de página inteira, objeto técnico grande, eixo da viagem, lógica causal, documento, comparação, coleção sobre troço, modo espacial. Regiões com o mesmo id mantêm identidade entre receitas (continuidade).
3. **Backend = adaptador do mundo DEV.** `engine/contracts.ts` expõe os mesmos nomes e envelopes de `src/application/operationalQueries.ts` (`getResourceAssignment`, `getOperationalTimeline`, `getRouteAlternatives`, `getRestrictionImpact`, `getResourceFutureState`) com `OperationalValue` (KNOWN/ASSUMED/UNKNOWN), mais grafo de entidades e eventos. `engine/synthetic.ts` implementa-o sobre o mundo sintético; um provider real substitui-o sem reescrever o frontend. Só tipos são partilhados com produção.

## Modelo

| Peça | Ficheiro |
|---|---|
| Âncoras de entidade (`driver`, `truck`, `trailer`, `document`, `restriction`, `stop`) com o transporte de hoje | `guidedWorkspace.ts` (`Anchor`, `anchorJob`, ação `entity`) |
| Base + camadas por ordem; lente base volta à coleção | `entityRecipes.ts`, reducer `lens` |
| 22 receitas autoradas e a pergunta de cada uma | `entityRecipes.ts` |
| Compositor de regiões (frações → píxeis, empilhamento estreito, mapa como região) | `entityComposition.ts` |
| Representações (dia, dia compacto, passagens, objeto técnico, cartão, lógica, impactos, eixo da viagem, factos, reboque, guia, transportes no troço, paragem) | `fx/EntityRegions.tsx` |
| Tradução de ligações dos instrumentos para entidades | `guidedWorkspace.ts` `entityTranslate` |
| Caminho (migalhas com regresso exato) | `GuidedEnvironment.tsx` `backTo`, `fx/Chrome.tsx` |

## Verificação

- 132 testes do laboratório (`entityComposition.test.ts`, `entityPages.test.ts` novos): o fluxo Motoristas → Miguel → +Viatura → +Restrições → −Viatura → camião → mapa muda receita, representação principal e papel do mapa em cada passo; cada entidade abre composição própria; cada camada de cada entidade muda a página; contratos do adaptador.
- Auditoria de cliques nas páginas de entidade: 447 cliques em 17 estados, 0 sem efeito visível (79 na primeira ronda).
- Capturas: `docs/phase-5.7l-review/`.
