# Founder taste log: read this first, it overrides the reviewer briefs

This is the founder's own verdicts on work they have seen, newest first. Updated after every piece of founder feedback.
When something below contradicts a reviewer brief, this file wins.
Score how close the work is to THIS person, not to a generic "good design".

# THE FOUNDER IN ONE PAGE (read before the log)

**Who:** a Portuguese founder building FleetOS for a road-transport office.
- Writes fast, mixed Portuguese and English, and judges at a glance, from the gut.
- Verdicts come as one word: "adorei", "fixe", "curti", "não gosto", "horrível", "fica mal", "muito simples", "genérico".
- Your job is to predict that word before they see the work.

**They LOVED (keep, build on):**
- **The map as the whole screen.** Nothing fixed around it except a small floating category dock at the bottom.
- **The camera as storyteller:**
  - a top-down overview;
  - flights;
  - the 3D chase with OSM buildings and outlines ("bem aí");
  - a route seen whole from a little above.
- **Cinema:** each combination of categories is a different "shot". Huge film-title typography, reels, scenes that exit and enter. ("/combinar", 2026-10-19.)
- **"O dia":** a full-page palco where each trip is a line (hairline past, thick present, dotted pause, a node at arrival).
- **State-shaped cards:**
  - Carlos paused: a capsule wrapped around a big countdown ring;
  - Tomás driving: a small speed HUD, with the next stop pinned on the road.
- **Route content:** stops placed by km, the pause, the relief profile, the truck on the line.
- **Dark like Tesla, light like refined paper.**

**They REJECT, every time:**
- **Anything generic:**
  - the same card skeleton for different things;
  - a grid of stat tiles with two buttons;
  - template SaaS;
  - boxes with headers.
- **Too simple** ("muito simples"): a piece that only lists a few facts with no form, no hierarchy and no life.
- **Info sitting ON the map content it describes:** cards over the route line, chips on the road, tickets touching the line ("estava em cima da rota, fica mal"). Info belongs beside things, never on them.
- **Overlaps of any kind** ("componentes em cima uns dos outros").
- **Fixed panels and sidebars.** Big rectangles docked to an edge, including a full-width bottom bar.
- **Tilted overviews** ("like reading a book page").
- **Reports, tables, charts with axes, too much text.**
- **Abstract diagrams and truck drawings.**

**Driver app (fleetos-driver):** the validated rules live in `fleetos-driver/docs/design-language.md`: one map with scenes, one gesture at the top and one at the bottom, the road tells the story, and the same day everywhere.

**What "alive" means to them:**
- the scene changes visibly with each mode;
- things are born where they happen;
- the camera moves with a cause;
- each thing has its own form that changes with its state.
- **Not alive:** decorative idle motion.

**How to score:**
- **Ask:** would this founder say "adorei", "fixe", or "não gosto / muito simples / fica mal"?
- **Score at most 6:** "muito simples", "genérico" or "fica mal".
- **Score at most 4:** it repeats something they rejected.
- **Approval (8+):** only when you would bet they say at least "fixe".

## 2026-10-24: Driver app, new real route Lamaçães → Brunhais with turn by turn

**Verdict:** "adorei tudo, fantástico por agora".
- **Route:** our own truck router (GraphHopper truck3), with real roundabout exits, keep left/right and street names.
- **On screen:** the turn painted on the asphalt, a camera that comes closer at each roundabout, and 2D/3D.
- **In the lab:** a route selector.

This is the current reference for the driving experience. Build on it and don't regress it.

## 2026-10-24: Driver app, turn-by-turn camera mockups → build

**Verdict:** "não tá mal, na vdd, mete" (approved). Plus: "na app tem corrido bem os componentes e páginas, certas regras de design e coerência visual podem ser levadas mais para a frente".

**Approved:**
- two camera modes (3D default, 2D);
- speed-based zoom;
- before a turn, the camera comes closer and lower with the junction mid-screen;
- the turn painted white on the asphalt;
- "Rotunda · sai à esquerda" with the road number and name;
- the next step in the "depois" line.

**Rules now written** in `fleetos-driver/docs/design-language.md`; reviewers must read it for driver-app work. Keep extending it with each verdict.

## 2026-10-24: Driver app in the /lab, nav (dark) + ask-on-pass (light) side by side

**Verdict:** "beautiful thanks".
- The live dial, the lit route with the bend warning beside it, and the ask card on a light map with the works marked on the road all landed.
- The two-phone lab is the way the founder wants to review.

## 2026-10-24: Driver app, first live build (nav screen in the browser)

**Verdict on the navigation page:** "gostei, tá bacano, pode ser melhorado".

**Weakest piece: the round speed signal.** It was a thin static ring with a fixed number. It was replaced with a live dial:
- a 270° arc that fills with speed;
- ticks every 10 km/h;
- a glowing tip;
- the legal-limit roundel on the rim;
- it turns accent when over the limit;
- the speed itself changes with the bends.

**Wants a much easier way to test and control.** The answer: a /lab page with two phones side by side and controls in the empty space:
- scenes, play/pause, ×speed, position slider;
- the voice buttons;
- theme, language and device.

The founder likes seeing several states at once.

## 2026-10-23: Driver app, Abastecer redone (same pause as Horas) + full board

**Verdict:** "gostei das imagens todas".

**Abastecer:**
- the same film title as Horas ("na pausa das 13:10 · 360 L · cabe nos 45'");
- a 3D close-up where the lit route reaches the pause sonar and an orange dotted detour runs to the real OSM station;
- the pump ping is wrapped in a tank ring (grey = in the tank now, orange = what goes in);
- a price card beside it;
- two big floating buttons and no card.

Coherence across screens is working.

## 2026-10-23: Driver app, Horas redone as hours drawn on the road

**Verdict:** "sim força". Approved direction.

**What was shown** (one big film-title number "3:05 · e paras perto de Salamanca", then the real route seen top-down, rotated so it runs up the screen):
- the part you can still drive is lit, with hour ticks on the road;
- the pause is a real place with a green sonar and a card beside it;
- a dimmer line runs to a flag at "Fim do dia · 16:10";
- the rest of the trip is dotted as "amanhã";
- one slim pill at the bottom: hoje · semana · quinzena.

**Rule (founder):** "tem que ser tudo coerente na app".
- Every screen speaks the same language: a film title on top, the road drawn as the story, cards beside things, one slim pill or the decision buttons at the bottom.
- All screens tell the same driver's same day: the same trip, the same times, the same places.

## 2026-10-23: Driver app, first mockup board (8 phones, real OSM map)

**Verdict on the whole board:** "fixe".
- **LOVED ("adorei"):** Navegação (dark chase cam). It has:
  - the instruction island with the road number and name ("EN 205 · Póvoa de Lanhoso");
  - the speed HUD;
  - the curvy stretch painted amber, with its warning card BESIDE the road (tied by a hairline);
  - the ETA island showing the gate destination;
  - the big orange "Avisar" voice button.
- **Liked:** "A ouvir": the big glowing orange orb button with the waveform, the dimmed map, the GPS pin with sonar, and the transcript in large type.
- **Liked:** voice confirm, ask-on-pass and review-at-stop.
- **NOT liked:**
  - Chegada/portão: a dark, empty map with few buildings, a stop-vs-address dotted line, and a generic question card;
  - Abastecer: a station pin, plus a card with a tank ring, a fact list and a pause bar;
  - Horas: big concentric rings, a 3-column stats card and the day line.

**Reading:** the founder loves screens where the map and road carry the story and the UI is one strong gesture (orb, instruction, HUD). The rejected ones are "card with facts on an empty map": the stats-tile pattern again.

## 2026-10-23: Camiões scene with pings

**Verdict:** "Tá fixe."
- Pressing the category: a camera move to frame the fleet, the map dims, and pings land one by one.
- Tapping a ping: the zoom-in with the panel.

**Correction:** the view when the category opens (before tapping a truck) must be from ABOVE (top-down), NOT tilted.

**Rule:** every overview or category shot is top-down. Tilt only in the close-ups.

## 2026-10-23: Camiões overview, none of the marker options

**Verdict:** "Nenhum." They rejected all three: A parking capsules, B 3D fuel columns, C segmented yard rings.

**Wants:**
- **On the map, a truck is just a PING.** Simple: no capsules, no columns, no rings, no labels.
- **Pressing Camiões is a SCENE:** the camera moves ("um zoom in, uma merda assim"). "Vamos desenhar essa cena para ser um bocado top."
- **Tapping a truck:** the real zoom-in that shows what it has. The truck panel is OK.

**Lesson:** the richness goes into the camera and the moment, not into the marker.

## 2026-10-23: tour of every page and click; work one thing at a time

**Process:** the founder reviews the current state, then gives instructions category by category, "pouca coisa de cada vez". Do only the asked piece.

**Rejected:** the truck markers in the Camiões overview (images 8 and 9):
- glass chips with text for the yards ("Porto · 4 camiões");
- the open-yard list of bays;
- the on-road pucks with tags.

"A única coisa que desgosto mais."

**Fine for now:**
- **The zoomed-in view** (3D truck plus panel). It can improve later, not now.
- **Everything else** in the tour, with no complaint: Motoristas, Rotas with its band, Palcos, light theme.

**Now:** work only on the OUTSIDE (overview) truck markers.

## 2026-10-23: never simplify; rich, beautiful AND alive

**Context:** I argued, as "a top frontend dev", for stable lenses, ranked lists and less motion. The founder disagreed hard.
- "Um front-end dev a trabalhar neste projeto para o fazer sentir vivo não ia querer simplificar. Ia querer torná-lo AINDA mais vivo."
- "Things can be complex, beautiful, and alive."

**The only part they like right now:** Motoristas. Tap a driver → it expands into a little model (the state-shaped card riding on the truck). "The rest is ridiculously simple."

**Reviewer rules:**
- Never propose simplification, or "less motion" as the answer.
- **Raise the bar of each thing:** every element should expand into its own rich, live, state-shaped model, as the driver does. Density and complexity are welcome when they are beautiful.
- **Fail:** a category or object that stays a chip, pin or label after you tap it, or that has no living form of its own, is "ridiculously simple".

## 2026-10-23: Camiões mode, angry rejection

**Verdict:** "Opa, categoria está ligada ou não está ligada, vai dar uma merda. Não tem absolutamente nada, não são uns pings e de merda."

**What failed:** turning a category on only adds or removes pins and chips on the same map.
- On or off barely differs.
- There is "nothing" in it: no scene, no story, no substance.

**Lesson, for EVERY category:** a mode is a SHOT, like /combinar, which they loved.
- **The whole screen changes:** the camera moves, the map tone shifts, a big film title enters, and a reel or cast of the things appears.
- **The things themselves get a rich form**, not a pin.
- "A few pings on the map" for a mode is an instant fail: score at most 3.

## 2026-10-22: Camiões decided

**Decision:** "Sim, modo máquina".
- Camiões shows ALL trucks, parked ones included, coloured by the machine's state.
- Tapping a truck opens the truck's panel: fuel arc with range, plate, km, service, deadlines.

**First view:** "um pouco de todos". No single focus (not only free trucks, not only fleet health).

**Built:**
- square pucks for parked trucks (people stay round);
- yards gathered by screen proximity ("Porto · 4 camiões · 1 na oficina");
- an inspection-due chip;
- the panel card.

Not yet judged by the founder.

## 2026-10-22: route info final (title + O dia + state in the bottom band + stop pings)

**Verdict:** "Ok. Tá fixe."

**Next:** may want variations later ("não sei se vai ser o único… podíamos variar"), but it's good for now.

**Open question from the founder:** Camiões is very close to Motoristas. Do we make a truck category at all, and if so, how is it different?

## 2026-10-22: route info, "film title" vs "state + O dia"

**Liked:** image 2 (film title + reel, light) and image 3 (state capsule + "O dia" line, dark). "Gostei de tudo… está fixe."

**Rejected:**
- The state capsule in the top-left corner ("62% Rui Costa"): "está a tapar um bocadinho". It covers the map. Move the state down into the bottom band, or show it another way.

**Wants:**
- A small ping ON the route at each stop or pause. A tiny marker on the line is welcome; panels on the line are not.

**Direction kept:**
- the title in the empty lower part of the frame;
- the "O dia" time line;
- the state shown in the bottom band;
- stop pings on the route.

## 2026-10-22: route info when a route is opened, still not loved

**Verdict:** "Não adoro… muito simples… estava em cima da rota, fica mal. Não sei."

**The rejected build:**
- small Partida and Chegada stubs at the route's ends;
- a slim live strip beside the truck.

It reads as too simple and sits on the route.

**Everything else on the page:** "gosto tudo".
- the dock;
- the map;
- the zooms;
- the driver cards;
- the modes;
- the light and dark themes.

**Instruction:** "adiciona tudo no revisor", because the reviewer did not seem like them. The profile above is the answer.

## 2026-10-22: first build of the dock and the route ends (live)

**Rejected:**
- **Overlaps:** "muitos componentes estão em cima uns dos outros". The live strip sat on the Faro stub. Any piece touching another piece is a top problem.
- **"Rotas não vi nenhum modo":** the Rotas mode looked the same as the default map, because the lines were always on. A mode must visibly change the scene.

## 2026-10-22: route modal variants after Dribbble research

**Picked: V3, "tickets at the ends"** (images 3 and 6, dark and light): "definitivamente melhores".
- A small "Partida" stub pinned at the start (Maia · agora).
- A small "Chegada" stub pinned at the end (Madrid · descarga · 02:23).
- In between, a slim live strip: avatar, km done, mini relief and the pause.

**Rejected:**
- V1, a live pill plus a relief drawer.
- V2, a boarding-pass ticket card.

**Lesson:** for routes, the info splits to WHERE it belongs (the ends of the route). Small pieces, no single container.

## 2026-10-22: the route without a box

**Rejected again:** "não está bom". The route info drawn straight on the map is also not good:
- a big floating title;
- km dots on the line;
- a pause chip;
- a free relief silhouette with guide lines.

Neither the generic box (round 1) nor this "everything on the map" version works.

**Instruction:** research Dribbble for route modal patterns before the next attempt. Bring references, then propose.

**Map:** switch the base to OSM (OpenFreeMap), no TomTom.

## 2026-10-22: after the "cartões vivos" video

**Loves:**
- **The OSM 3D building outlines** that appear when you zoom in. "Bem aí."
- The page in general.

**Map:** stays free OSM. Not Google.

**Rejects:**
- **The route card as a box.** Even floating, it "ocupa muito espaço e é uma coisa muito genérica" (takes too much space and is very generic).
- **Wants instead:** the CONTENT is good (stops by km, the pause, the relief, the truck); the BOX is generic. The route's information should live on the route itself, not in a panel.
- **Reviewer rule:** a large rectangular container for route info is a top problem.

## 2026-10-22: living cards, round 1

**Liked:**
- **B, Carlos paused:** a capsule wrapped around a big pause countdown ring, tied to the truck by a short stem.
- **C, Tomás driving:** a small HUD beside the truck (a speed ring and the limit roundel), with the next stop pinned on the map.
- **D, the route ribbon:** its CONTENT and graphs are great (stops placed by km, the pause, the relief profile, the truck on the ribbon).

**Rejected:**
- **D's layout and position:** a full-width panel docked at the bottom, above the dock. It reads as a fixed bottom bar. Same content, different form and place.

**Not picked:**
- **A, Rui loading:** a portrait card with a day ring around the face.
- **E, the arrival arch pinned to the destination.**

**Wants:**
- **A video with the variations**, so the cards are judged in motion.

## 2026-10-22: mockups without a sidebar

**Loves:**
- **The bottom floating dock of categories** (Motoristas · Rotas · Camiões · Alertas · Palcos). Keep it.
- The whole look of the page.
- Every zoom: the top-down overview, the 3D chase with buildings, the whole route seen a little from above.

**Rejects:**
- **The info card being the same model everywhere.** The same square, the same grid of stat tiles, the same two buttons for a driver and for a route.
- **What it wants instead:** the card must be alive and belong to its category.
  - **A driver's card** must feel like a PERSON: their state, their day, their hours.
  - **A route's card** must feel like a ROUTE: linear, from start to end, with stops along it.
  - The layout, shape and position change with the category AND with the state (stopped, driving, loading, late). Not always square, not always tiles, not always the same graphs or buttons.
- **Reviewer rule:** if two different categories (or states) show the same card skeleton, that is a top problem.

## 2026-10-22: after seeing /v2 (live prototype and video)

**Rejects:**
- **A tilted overview.** "Horrível, like reading a book page." The overview is TOP-DOWN (pitch 0, north up). Only close shots tilt.

**Wants:**
- The medium zoom (an alert visit) a bit more from above: about 40°, not 60°+.
- **No fixed sidebar of any kind.** "Nada fixo, só o mapa e os zooms." Things float and come and go.

**Loves:**
- The close follow with 3D buildings.

**Fine:**
- The dark and light themes as they are.

**Doesn't care about:**
- Issues caused by the real or backend data (stale events, demo scenarios, timestamps that are all "agora"). The work is the front-end design. Don't spend points on data.

## 2026-10-21/22: the direction

**Wants:**
- **Cinematic and constantly alive.** Things happen on the map, at the place, and come to the user. The camera flies there.
- **One click from everything.** No closing pages, no searching tables.
- **Tapping a driver or a route:** the camera flies there, then follows ("voo e depois segue").

**Instant reject:**
- Anything that looks like a report or table, a generic SaaS dashboard, or has too much text.

**References:**
- Linear, Arc and Raycast.
- Tesla's car screen.
- Strategy and simulation games.
