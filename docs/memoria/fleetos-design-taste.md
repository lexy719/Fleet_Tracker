---
name: fleetos-design-taste
description: User's FleetOS design preferences from voting 98 studies (2026-10-08) in the review site
metadata:
  type: feedback
---

Likes: operation overviews and maps (portrait map + list, latitude metro, day board, dense ledgers, even fullscreen map), route strip maps and route comparison, filmstrip of truck per stop, office-familiar layouts (Round 6). Wants screens with actions, easy for non-technical office staff, "nothing static".
Dislikes: abstract diagrams/logic trees (causal AND trees, legal cones, Sankey, relation rings, skewer), tables/registers, circular time, the hand-drawn-looking truck drawings ("not professional").
Restriction "missing fact"/VCI scenarios are unrealistic: FleetOS auto-routes around VCI and unregistered truck facts are mock-only. Don't design around them.

**Why:** stated in vote notes on the review artifact https://claude.ai/artifact/G8NoX9hvEPeLWAFT7iPDpu (collection "votes"; by:"claude" marks my inferred picks).
**How to apply:** start future design work from his "yes" set; read the votes collection again before new rounds. Related: [[visual-exploration-pack]]

Built 2026-10-08: DEV office workspace at /__dev/fleetos-workspace (src/dev/fleetos-workspace/, entry added in src/main.tsx next to the lab). Screens: Hoje, Precisa de mim (inbox), Operação (portrait map + list / norte→sul metro), O dia, Quadro (kanban DnD), Tabela (inline edit + CSV), Planeamento (drag to driver lane), transport detail, assign wizard. Reads lab world.ts only; local state in localStorage "fleetos-workspace-v1". Gotcha: HMR can leave a stale context (blank page) — reload.
