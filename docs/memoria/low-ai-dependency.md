---
name: low-ai-dependency
description: "Design principle the founder loves — deterministic core (routing, rules, planning, fuel); AI only at the edges reading messy text/voice"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab400f4d-5bf5-4827-bc7a-00e48cce52d1
  modified: 2026-10-23T22:50:32.251Z
---

FleetOS core stays deterministic: routing engine, rule evaluation (VCI, works, bans), solver, planning/assignment, fuel. AI is used only at the edges to turn messy input into structured facts (IP notice text, municipal regulations, driver voice reports), and its output is validated (rules, second report, or human OK) before it affects routes. If the AI provider is down, the system keeps working; only new text waits to be read.

**Why:** founder said (2026-10-23) "adoro a low dependency on AI" — cost, outages (Claude/API can go down), explainable decisions to sell to carriers.
**How to apply:** never put an LLM in the routing/planning decision path; propose AI only for extraction with a fallback and review step. See [[backend-rebuild-no-tomtom]].
