---
name: palcos-architecture
description: "Studio front-end engine architecture agreed 2026-10-21 — several palcos, each with ONE primary category; category combinations are variations (layers) of a palco; tapping a thing moves to another palco"
metadata:
  node_type: memory
  type: project
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-21T22:17:39.824Z
---

Agreed with the user on 2026-10-21:

**Several palcos, each with one primary category.** Combinations of categories are variations or layers inside a palco. They are not separate palcos, because many near-identical palcos would be bad.

- **Mapa:** the first palco. Shows everything on the map: routes, pings, the stop pings.
- **Viagens:** "O dia" when measured in hours, "A estrada" when measured in km. Primary category: the route/trip. Motoristas, Combustível, Camiões, cargas/entregas are layers on it. The hours↔km switch is a morph. Mockup: docs/engine-mockups/palco-unico-*.
- **Garagem:** primary category Camiões. Its variations are Camiões+Motoristas, Camiões+Combustível and so on.
- **Combustível:** its own palco, primary category fuel. Reached by tapping a stop or refuel.
- **Later:** Cliente, Semana, Pessoa.

**Links between palcos:**
- tap a truck → Garagem;
- tap a stop → Combustível;
- from the map → Viagens.

The whole thing should feel like one living page.

On 2026-10-21 the user liked the storyboard ("estou a curtir… estou a gostar da ideia"). Not final, but the direction is approved. Mockups are in docs/engine-mockups:
- palco-viagens.png, palco-garagem.png, palco-combustivel.png;
- viagens-para-garagem.mp4, storyboard-mapa-viagens-combustivel.mp4.

Shared rules:
- one line per item of the primary category;
- the tapped item is in focus and the others stay around it;
- layers carry over between palcos (chips under the title);
- the tapped element is what flies in the transition;
- Esc walks back with a crumb "Mapa › Viagens › …".

**ONE variation at a time (decided 2026-10-21, supersedes stacked layers inside palcos):** with every layer on, Garagem, Estrada and Perfil showed the same information and the Garagem got cluttered. So each palco now has a question and a segmented switch with three variations about its OWN category. Other categories appear only as ↗ links to their palco. The map keeps additive layers. Built in the Studio:
- Viagens: A tempo / Paragens / Carga (Day.tsx).
- Garagem: Ocupação / Oficina e validades / Uso (Garage.tsx).
- Perfil: Horas / Disponibilidade / Documentos (Person.tsx).
- Combustível: Preço / Depósitos / Gasto (FuelStage.tsx; it can't be named Fuel.tsx because fuel.ts exists and Windows ignores case).
- Cliente: Entregas / Prazos / Volume (Client.tsx).
- Sidebar: Layers.tsx. Shared pieces: palco.tsx.
- Ways in: tap a fuel tag in Viagens Paragens → Combustível; the client link in a Viagens row → Cliente; the sidebar rows → any palco.
- "/" is now the map; Operação moved to /operacao.

**Layer variations must reshape (user, 2026-10-21):** switching a layer must not just append a label. Each layer visibly changes the form of the palco, in small but noticeable animated ways: rows grow, bars change thickness or style, columns appear and push the timeline, the answer text changes.

**Perfil palco** (primary: the driver) is reached by tapping a driver anywhere, on the map or in another palco. It shows the week by day, with EU 561 driving limits on the right. Layers: Rotas, Camiões, Combustível, Documentos (simulated). The other drivers stay in a strip at the bottom. Mockups: docs/engine-mockups/v2/.

**Why:** the user felt the combination-per-palco plan (M+R, R+C, M+C each its own palco) would produce look-alike pages. "O mesmo palco, várias variações, e vários palcos" is what makes it dynamic.

**How to apply:** design each new palco around its primary category. Add the other categories as layers, and define what tapping each thing opens. Stops must reflect the backend merging rest + refuel automatically. Show images or video before building in the Studio ([[show-before-build]], [[palco-full-page]]).
