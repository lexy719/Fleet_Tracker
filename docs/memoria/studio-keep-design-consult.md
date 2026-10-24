---
name: studio-keep-design-consult
description: FleetOS studio — keep current layout/visual design; consult the user before any major change
metadata:
  node_type: memory
  type: feedback
  originSessionId: ad5491a4-dffa-44db-83c9-02877e7fb9f6
  modified: 2026-10-15T10:50:12.820Z
---

User (2026-10-15): "i like the layout and visual design we are using, don't change it all too much, start consult me at any major change".

**Why:** the paper map + left deck/panel + morphing cards direction is approved; previous rounds drifted (bottom bar added then removed).
**How to apply:** build new features inside the existing composition (deck, panel, map, attention stack, lenses). Before adding new structural UI (e.g. a left menu rail, new screen regions, full-screen workspaces) or changing navigation/visual language, ask first with a concrete proposal. Small additions inside existing regions are fine. Related: [[fleetos-studio]], [[fleetos-design-taste]]

2026-10-17: user HATED the left menu rail and the "Clássico" button ("looks like shit") — both removed; navigation = the deck-head lens tabs (Transportes, Trabalhos, Paragens, Combustível, Motoristas, Frota). Rebuild every app area by extending the Studio's own pieces (deck tabs, cards, morphing panel, map stage), never with patterns from the old environment lab (rails, toggles, extra chrome). No visible links to /classic.
