import type { RoutePlanOption } from "../../tomtom/planRoutes";
import vciFixture from "../../regulations/__fixtures__/tomtomLeixoesEspinho.json";
import { REGULATION_DATASET } from "../../regulations/repository";
import type { FactSet } from "../../regulations/types";
import { haversineM } from "../../regulations/geometry";
import { evaluateCompliance } from "../../regulations/evaluate";
import { routeTimingInput, DEFAULT_TIMING_MODEL } from "../../regulations/timeline";
import { closure, dataset, geometry, ROAD_A, ROAD_B } from "../../regulations/__tests__/helpers";
import { operationalTimeline } from "../../regulations/operationalTimeline";
import { decideRoutes, type DecisionCandidate } from "./routeDecision";

/** Deterministic synthetic provider responses, never live traffic or a production override. */
export function fixturePath(corners: [number, number][]): [number, number][] {
  const points = [corners[0]!];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!, b = corners[i]!;
    const n = Math.ceil(haversineM(a, b) / 100);
    for (let k = 1; k <= n; k++) points.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return points;
}
const A = fixturePath([[41, -8.7], [41, -8.5]]);
const B = fixturePath([[41, -8.7], [41.045, -8.62], [41.045, -8.6], [41, -8.5]]);
const C = fixturePath([[41, -8.7], [41.09, -8.62], [41.09, -8.6], [41, -8.5]]);
export const FIXTURE_DEPART = Date.parse("2026-10-06T06:00:00+01:00");
export function fixtureRoute(id: string, minutes = 42, eur = 12, path = A): RoutePlanOption {
  const distanceM = path.slice(1).reduce((sum, p, i) => sum + haversineM(path[i]!, p), 0);
  return {
    id, title: id, subtitle: "Fixture sintética", polyline: path, distanceM, durationSec: minutes * 60,
    trafficDelaySec: 0, fuelCostEur: eur, tollCostEur: 0, tollPricedEur: 0, tollEstimatedEur: 0,
    tollDataQuality: "none", tollSectionCount: 0, stopArrivals: [], legDurationSec: [minutes * 60],
    legPointCounts: [path.length], roadNumbers: [], departAtIso: new Date(FIXTURE_DEPART).toISOString(),
    colorIndex: 0, routing: { role: "primary", params: {} },
  };
}
export const ACCEPTANCE_CASES = [
  "Uma decisão", "Duas decisões com troca material", "Obras: direto ainda melhor", "Obras: desvio local melhor", "Proibição com desvio válido", "Nenhuma rota executável", "VCI: proibição aplicável",
] as const;
export type AcceptanceCase = typeof ACCEPTANCE_CASES[number];
export function acceptanceFixture(name: AcceptanceCase) {
  const soft = closure("Obras com circulação alternada", "A", {}, { kind: "OPERATIONAL_IMPACT", effect: "advisory" });
  const hardA = closure("Corte obrigatório A", "A", {});
  const hardB = closure("Corte obrigatório B", "B", {});
  const roads = [geometry("A", ROAD_A), geometry("B", ROAD_B)];
  let routes = [fixtureRoute("A")];
  let ds = dataset([], roads);
  if (name === "Duas decisões com troca material") routes = [fixtureRoute("A", 43, 14), fixtureRoute("B", 48, 8, B)];
  if (name.startsWith("Obras:")) {
    ds = dataset([soft], roads);
    routes = [fixtureRoute("A", name === "Obras: direto ainda melhor" ? 42 : 51), fixtureRoute("B", name === "Obras: direto ainda melhor" ? 45 : 44, 12, B), fixtureRoute("C", 49, 12, C)];
  }
  if (name === "Proibição com desvio válido" || name === "Nenhuma rota executável") {
    ds = dataset(name === "Nenhuma rota executável" ? [hardA, hardB] : [hardA], roads);
    routes = [fixtureRoute("A"), fixtureRoute("B", 48, 14, B)];
  }
  let depart = FIXTURE_DEPART;
  let facts: FactSet = {};
  if (name === "VCI: proibição aplicável") {
    ds = REGULATION_DATASET;
    depart = Date.parse("2026-10-07T09:00:00Z");
    facts = Object.fromEntries(Object.entries({ "vehicle.grossWeightKg": 26000, "vehicle.axleCount": 5, "vehicle.firstAxleHeightM": 1.4, "vehicle.isGoodsVehicle": true, "vehicle.ownerCategory": "private", "authorization.pt-vci-habilitacao": false, "authorization.pt-imt-aet": false }).map(([k,value])=>[k,{status:"known" as const,value,source:"Transporte sintético VCI"}]));
    routes = [vciFixture.original, vciFixture.avoidAreas].map((r,i) => {
      const points = r.legs.flatMap(l => l.points.map(p => [p[0]!,p[1]!] as [number,number]));
      return { ...fixtureRoute(i ? "Desvio" : "VCI", r.travelTimeInSeconds / 60, 12, points), distanceM: r.lengthInMeters, departAtIso: new Date(depart).toISOString(), legPointCounts: r.legs.map(l=>l.points.length), legDurationSec: r.legs.map(l=>l.travelTimeInSeconds) };
    });
  }
  const candidates: DecisionCandidate[] = routes.map((option) => ({
    option, report: evaluateCompliance(ds, { route: routeTimingInput(option.polyline, option.legPointCounts, option.legDurationSec, depart, DEFAULT_TIMING_MODEL), facts, stops: [] }),
    elapsedSec: operationalTimeline(option, depart).elapsedSec, window: "no_window", criticalHours: false,
    coverageComplete: false, provenance: ["Resposta determinística sintética; sem pedidos externos"],
  }));
  return { candidates, dataset: ds, result: decideRoutes(candidates) };
}
