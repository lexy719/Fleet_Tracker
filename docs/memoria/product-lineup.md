---
name: product-lineup
description: "The user's product family (stated 2026-10-11): FleetOS, shipper portal, driver GPS app, maybe a load-distribution platform; Project 2 is FleetOS backend, not a product"
metadata:
  node_type: memory
  type: project
  originSessionId: c1f45b6e-5999-4d8f-aa29-16a703267b7a
  modified: 2026-10-23T22:48:24.727Z
---

Product lineup as stated by the user on 2026-10-11:
1. **FleetOS** (biggest): carrier planning/routing/operations. Project 2 (Iberian road + fuel intelligence, [[project2-road-intelligence-store]]) is part of FleetOS's backend, NOT a separate product.
2. **Shipper portal** for companies like Prozis: order transport from carriers, see trucks' live location/ETA. Origin: the user worked in the Prozis warehouse and never knew when trucks would arrive (sometimes at dinner, everyone running). "Basic but good".
3. **Driver GPS app**: TomTom base map/navigation but FleetOS routing on top; job info, notifications, where to stop, which pump and how much to fill, etc.
   - 2026-10-23 update: portal works as a network ("like social media"): shipper picks carriers that are on the platform, or brings its contracted carriers into the app; sees their tracking, ETAs and more. Data comes straight from FleetOS + driver app (no extra integration for the carrier). Founder: NOTHING is free — every product is paid (don't propose free tiers; use trials / included-in-carrier-plan instead).
4. **Load-distribution platform** (receives jobs from shippers and hands them to carriers): user thinks they will probably NOT build it.

Context: possible pilot via the user's cousin with a Bragança carrier (~100 trucks). Next infra ideas: EU VPS + Postgres, rFMS OEM telematics (Volvo/Scania…).

**Why:** user corrected me for not knowing the 4 products; plan features across the lineup.
**How to apply:** when designing data/infra (telemetry, server, refuel plan), state how it serves FleetOS, shipper portal and driver app; don't call Project 2 a product.
