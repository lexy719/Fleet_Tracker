---
name: braganca-pilot
description: First real customer target = carrier in Bragança; visit ~Dec 2026–Jan 2027 only once the full flow runs
metadata:
  node_type: memory
  type: project
  originSessionId: ab400f4d-5bf5-4827-bc7a-00e48cce52d1
  modified: 2026-10-23T22:39:01.915Z
---

First pilot target is a carrier in Bragança (founder knows them). Founder will only visit in person when the system "runs kinda alright": planning + automatic job assignment + fuel stops (PT/ES prices) + routes on our own engine + rules, tested on Bragança lanes (Porto/Leixões, Zamora, Valladolid, Madrid via A4/IP4/A-52). Said on 2026-10-23: "in a month or two". AI part (agents reading municipal rules, IP texts) not developed yet; founder will build it.

**Why:** in-person visit is costly; first impression must be a working product, not slides.
**How to apply:** prioritise wiring planner/assignment/fuel onto the GraphHopper engine (app still calls TomTom in ~37 files) and a Bragança test week before new features. Driver app seen as a future data asset (passive traces + voice reports). See [[backend-rebuild-no-tomtom]], [[product-lineup]].
