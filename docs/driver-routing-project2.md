# Driver routing → FleetOS → Projeto 2

The driver app at http://localhost:8082/navigate calls the local FleetOS Vite service on port 8084 (`POST /api/driver/route`). Configure `EXPO_PUBLIC_FLEETOS_ROUTING_URL` to change the service address. Start the service with `npm run dev -- --host 127.0.0.1 --port 8084 --strictPort` in fleet-tracker. This is a local development integration, not a deployed multi-user backend.

Every driver route, fuel-corridor route and reroute uses the FleetOS truck planner, generic compliance evaluator and clean-route solver. TomTom supplies geometry, live traffic and instructions underneath that planner. Guidance and speed/lane sections are retained from the exact final unsimplified route. An unresolved mandatory restriction returns an error; the driver never silently switches to direct routing.

Project 2 selects registered national sources and municipal sources along the real route using the CAOP index. It fetches again for newly crossed municipalities after a detour, respects source cadence, checks publication freshness and applies the existing trust gate. Synthetic fixtures and manually enabled illustrative events are excluded. Data is cached in `.cache/driver-road-intelligence.json`; this is separate from the dispatch browser's IndexedDB. Existing manual reviews in that browser are **not synchronized** into this local service. Shared review persistence remains a backend task.

The driver details show the connection and partial coverage. Verified, current, located Project 2 notices can appear beside live TomTom incidents; unlocated prose never becomes a fabricated map marker or automatic detour. No known applicable restriction does not establish complete road coverage.

Validation: deterministic tests cover closure detours, final guidance consistency, ignored avoidance and malformed requests. A separate opt-in live test in output invokes the actual driver fuel selection and routing client with the current demo coordinates and saves a key-free response.
