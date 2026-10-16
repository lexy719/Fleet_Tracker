import { planStops, type DriverState } from "../../ops/drivingStops";
import type { CorridorStation } from "../../fuel/corridor";

/*
 * Refuel planning for one route: WHERE to stop and HOW MUCH to buy.
 *
 * Exact dynamic programme over (corridor station, fuel level in 10 L steps). It weighs:
 *  - pump price at each station (Project 2 fuel intelligence);
 *  - the detour to stations off the route (screening estimate, disclosed);
 *  - the stop itself — free of extra time when it falls inside a MANDATORY EU 561 pause
 *    (the driver must stop anyway: refuel during the 45-min break / daily rest);
 *  - tank capacity, a never-crossed reserve and a minimum worthwhile purchase.
 * Compared against a naive policy (fill up at the first station on the route once the tank
 * reaches a trigger level), so the saving is explainable.
 *
 * It never invents stations, prices or detour routes: everything comes from the inputs,
 * and every estimate is listed in `assumptions`.
 */

export const FUEL_STEP_L = 10;
export const ROAD_FACTOR = 1.4;
/** Average speed on a detour to/from an off-route station (urban/secondary roads). */
export const DETOUR_SPEED_MPS = 40 / 3.6;
/** Driving minutes before a mandatory pause within which a station can host that pause. */
export const PAUSE_MERGE_WINDOW_SEC = 45 * 60;

export type RefuelInput = {
  route: { distanceM: number; drivingSec: number };
  /** Corridor stations with price, distance along/off route (see fuel/corridor). */
  stations: CorridorStation[];
  truck: {
    tankL: number;
    /** Fuel on board at departure; undefined ⇒ assumed (disclosed). */
    startFuelL?: number;
    lPer100km: number;
  };
  driver?: DriverState;
  policy?: Partial<RefuelPolicy>;
};

export type RefuelPolicy = {
  /** Never go below this (L). Default: 10 % of the tank. */
  reserveL: number;
  /** Do not stop to buy less than this (L). */
  minPurchaseL: number;
  /** Required fuel on arrival (L). Default: reserve. */
  targetEndL: number;
  /** Time at the pump when the stop is NOT inside a mandatory pause (s). */
  serviceSec: number;
  /** Value of driver + truck time (€/h). 0 = time not priced. */
  eurPerHour: number;
  /** Non-fuel running cost per km (€/km) charged on detour km. */
  nonFuelEurPerKm: number;
  /** Credit per litre left above the target on arrival (e.g. destination price). 0 = none. */
  endCreditEurPerL: number;
  /** Naive baseline: refuel to full when fuel drops to this fraction of the tank. */
  naiveTriggerFrac: number;
  /** Assumed start fuel fraction when unknown. */
  assumedStartFrac: number;
};

const DEFAULT_POLICY: Omit<RefuelPolicy, "reserveL" | "targetEndL"> = {
  minPurchaseL: 100,
  serviceSec: 15 * 60,
  eurPerHour: 0,
  nonFuelEurPerKm: 0,
  endCreditEurPerL: 0,
  naiveTriggerFrac: 0.25,
  assumedStartFrac: 0.5,
};

export type PlannedStop = {
  stationId: string;
  name?: string;
  brand?: string;
  country: string;
  municipality?: string;
  alongKm: number;
  offRouteM: number;
  /** Screening estimate: 2 × straight-line × road factor. */
  detourKm: number;
  litres: number;
  pricePerL: number;
  fuelEur: number;
  detourEur: number;
  /** Mandatory pause this stop is taken in (no extra stop time), if any. */
  pause?: { kind: "break" | "rest"; atDrivingMin: number; advancedByMin: number };
  priceAgeH: number;
};

export type PlanTotals = { litres: number; fuelEur: number; detourEur: number; timeEur: number; extraStopMin: number; stops: number; endFuelL: number; totalEur: number };

export type RefuelPlan = {
  status: "OK" | "NO_REFUEL_NEEDED" | "INFEASIBLE" | "NO_STATIONS";
  stops: PlannedStop[];
  totals?: PlanTotals;
  baseline?: PlanTotals & { feasible: boolean };
  /** baseline.totalEur − totals.totalEur (positive = saving). */
  savingEur?: number;
  assumptions: string[];
  explanations: string[];
};

type Node = { kind: "start" | "station" | "end"; alongM: number; s?: CorridorStation; detourM: number; detourSec: number; pause?: PlannedStop["pause"] };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function planRefuel(input: RefuelInput): RefuelPlan {
  const assumptions: string[] = [];
  const explanations: string[] = [];
  const { tankL, lPer100km } = input.truck;
  if (!(tankL > 0) || !(lPer100km > 0) || !(input.route.distanceM > 0)) {
    return { status: "INFEASIBLE", stops: [], assumptions, explanations: ["Depósito, consumo ou distância inválidos."] };
  }
  const policy: RefuelPolicy = {
    ...DEFAULT_POLICY,
    reserveL: Math.round(tankL * 0.1),
    ...input.policy,
    targetEndL: input.policy?.targetEndL ?? input.policy?.reserveL ?? Math.round(tankL * 0.1),
  };
  let startL = input.truck.startFuelL;
  if (startL === undefined || !Number.isFinite(startL)) {
    startL = Math.round(tankL * policy.assumedStartFrac);
    assumptions.push(`Combustível à partida desconhecido — assumido ${startL} L (${Math.round(policy.assumedStartFrac * 100)} % do depósito).`);
  }
  startL = Math.min(tankL, Math.max(0, startL));
  const perM = lPer100km / 100_000;
  const needL = input.route.distanceM * perM;
  assumptions.push(`Consumo ${lPer100km} L/100 km; desvios estimados em linha reta × ${ROAD_FACTOR} a ${Math.round(DETOUR_SPEED_MPS * 3.6)} km/h (triagem — o desvio real deve ser confirmado pelo routing).`);

  if (startL - needL >= policy.targetEndL) {
    return { status: "NO_REFUEL_NEEDED", stops: [], assumptions, explanations: [`Chega com ~${Math.round(startL - needL)} L sem abastecer.`] };
  }
  if (!input.stations.length) return { status: "NO_STATIONS", stops: [], assumptions, explanations: ["Sem postos com preço no corredor da rota."] };

  // Mandatory pauses along the route (positions by driving time, mapped proportionally to distance).
  const driver = input.driver ?? { drivenTodaySec: 0, continuousSec: 0 };
  if (!input.driver) assumptions.push("Condução anterior do motorista desconhecida — assumido início do dia.");
  const pauses = planStops(input.route.drivingSec, driver).filter((p) => p.atDrivingSec > 0 && p.atDrivingSec < input.route.drivingSec);
  const mps = input.route.distanceM / Math.max(1, input.route.drivingSec);
  const pauseFor = (alongM: number): PlannedStop["pause"] => {
    const t = alongM / mps;
    for (const p of pauses) {
      if (t <= p.atDrivingSec && p.atDrivingSec - t <= PAUSE_MERGE_WINDOW_SEC) {
        return { kind: p.kind, atDrivingMin: Math.round(p.atDrivingSec / 60), advancedByMin: Math.round((p.atDrivingSec - t) / 60) };
      }
    }
    return undefined;
  };

  // Candidate pruning: per 20 km bucket keep the 3 best by price + detour, plus pause-compatible ones.
  const scored = input.stations
    .filter((c) => c.alongRouteM >= 0 && c.alongRouteM <= input.route.distanceM && c.price.unit === "EUR/L")
    .map((c) => {
      const detourM = 2 * c.offRouteM * ROAD_FACTOR;
      return { c, detourM, eff: c.price.price + (detourM * perM * c.price.price + (detourM / 1000) * policy.nonFuelEurPerKm) / 300 };
    });
  const buckets = new Map<number, typeof scored>();
  for (const x of scored) {
    const k = Math.floor(x.c.alongRouteM / 20_000);
    buckets.set(k, [...(buckets.get(k) ?? []), x]);
  }
  const keep = new Set<string>();
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) => a.eff - b.eff);
    sorted.slice(0, 3).forEach((x) => keep.add(x.c.station.id));
    sorted.filter((x) => pauseFor(x.c.alongRouteM)).slice(0, 2).forEach((x) => keep.add(x.c.station.id));
  }
  const nodes: Node[] = [
    { kind: "start", alongM: 0, detourM: 0, detourSec: 0 },
    ...scored
      .filter((x) => keep.has(x.c.station.id))
      .sort((a, b) => a.c.alongRouteM - b.c.alongRouteM)
      .map((x): Node => ({ kind: "station", alongM: x.c.alongRouteM, s: x.c, detourM: x.detourM, detourSec: x.detourM / DETOUR_SPEED_MPS, pause: pauseFor(x.c.alongRouteM) })),
    { kind: "end", alongM: input.route.distanceM, detourM: 0, detourSec: 0 },
  ];

  /*
   * State = "virtual fuel" g = fuel on board + litres the route has consumed so far (fuel at a
   * node is g − along·perM). Passing a station without buying leaves g unchanged, so the 10 L
   * discretisation only rounds at purchases — chaining hundreds of corridor nodes adds no drift.
   */
  const D = input.route.distanceM;
  const G = Math.ceil((tankL + D * perM) / FUEL_STEP_L) + 1;
  const toStep = (l: number) => Math.floor(l / FUEL_STEP_L + 1e-9);
  const minBuy = Math.max(1, Math.ceil(policy.minPurchaseL / FUEL_STEP_L - 1e-9));
  const fuelAt = (g: number, alongM: number) => g * FUEL_STEP_L - alongM * perM;
  const stopCost = (n: Node) => {
    const price = n.s!.price.price;
    const detourEur = n.detourM * perM * price + (n.detourM / 1000) * policy.nonFuelEurPerKm;
    const timeSec = n.detourSec + (n.pause ? 0 : policy.serviceSec);
    return { detourEur, timeSec, timeEur: (timeSec / 3600) * policy.eurPerHour };
  };

  // best[i][g] = min cost arriving at node i (on the route) with virtual fuel g (steps).
  const INF = Number.POSITIVE_INFINITY;
  const best: number[][] = nodes.map(() => new Array(G + 1).fill(INF));
  const prev: ({ g: number; buy: number } | null)[][] = nodes.map(() => new Array(G + 1).fill(null));
  best[0]![toStep(startL)] = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i]!;
    const nextAlong = nodes[i + 1]!.alongM;
    for (let g = 0; g <= G; g++) {
      const base = best[i]![g]!;
      if (base === INF) continue;
      const fuel = fuelAt(g, n.alongM);
      const options: { buy: number; cost: number; g: number }[] = [{ buy: 0, cost: 0, g }];
      if (n.kind === "station") {
        const sc = stopCost(n);
        const detourL = n.detourM * perM;
        const detourSteps = Math.ceil(detourL / FUEL_STEP_L - 1e-9);
        // Reach the pump: half the detour, never below reserve; never overfill the tank.
        if (fuel - detourL / 2 >= policy.reserveL) {
          for (let b = minBuy; fuel - detourL / 2 + b * FUEL_STEP_L <= tankL + 1e-6; b++) {
            options.push({ buy: b, cost: b * FUEL_STEP_L * n.s!.price.price + sc.detourEur + sc.timeEur, g: g + b - detourSteps });
          }
        }
      }
      for (const o of options) {
        if (o.g < 0 || o.g > G || fuelAt(o.g, nextAlong) < policy.reserveL - 1e-6) continue;
        const c = base + o.cost;
        if (c < best[i + 1]![o.g]!) {
          best[i + 1]![o.g] = c;
          prev[i + 1]![o.g] = { g, buy: o.buy };
        }
      }
    }
  }
  const last = nodes.length - 1;
  let bestG = -1;
  let bestCost = INF;
  for (let g = 0; g <= G; g++) {
    const end = fuelAt(g, D);
    if (best[last]![g] === INF || end < policy.targetEndL - FUEL_STEP_L + 1e-9) continue;
    const c = best[last]![g]! - Math.max(0, end - policy.targetEndL) * policy.endCreditEurPerL;
    if (c < bestCost) { bestCost = c; bestG = g; }
  }
  if (bestG < 0) {
    return { status: "INFEASIBLE", stops: [], assumptions, explanations: ["Não há combinação de postos no corredor que mantenha a reserva até ao destino (postos demasiado espaçados para o depósito/consumo)."] };
  }

  // Reconstruct.
  const chosen: { node: Node; buySteps: number }[] = [];
  for (let i = last, g = bestG; i > 0; i--) {
    const p = prev[i]![g]!;
    if (p.buy > 0) chosen.push({ node: nodes[i - 1]!, buySteps: p.buy });
    g = p.g;
  }
  chosen.reverse();
  const stops: PlannedStop[] = chosen.map(({ node, buySteps }) => {
    const sc = stopCost(node);
    const litres = buySteps * FUEL_STEP_L;
    return {
      stationId: node.s!.station.id,
      ...(node.s!.station.name ? { name: node.s!.station.name } : {}),
      ...(node.s!.station.brand ? { brand: node.s!.station.brand } : {}),
      country: node.s!.station.country,
      ...(node.s!.station.municipality ? { municipality: node.s!.station.municipality } : {}),
      alongKm: Math.round(node.alongM / 100) / 10,
      offRouteM: node.s!.offRouteM,
      detourKm: Math.round(node.detourM / 100) / 10,
      litres,
      pricePerL: node.s!.price.price,
      fuelEur: r2(litres * node.s!.price.price),
      detourEur: r2(sc.detourEur),
      ...(node.pause ? { pause: node.pause } : {}),
      priceAgeH: node.s!.ageH,
    };
  });
  const totals = totalsOf(stops, policy, fuelAt(bestG, D));
  const baseline = naiveBaseline(nodes, policy, startL, tankL, perM, input.route.distanceM);
  // Fair comparison: fuel left in the tank on arrival has value. Both plans' leftover above
  // the target is credited at the corridor median price, so filling up is not a fake "cost".
  const prices = input.stations.map((c) => c.price.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)]!;
  const net = (t: PlanTotals) => t.totalEur - Math.max(0, t.endFuelL - policy.targetEndL) * median;
  const savingEur = baseline.feasible ? r2(net(baseline) - net(totals)) : undefined;
  if (savingEur !== undefined) assumptions.push(`Poupança calculada com o combustível que sobra no destino valorizado ao preço mediano do corredor (${median.toFixed(3)} €/L).`);

  for (const s of stops) {
    explanations.push(
      `${s.brand ?? s.name ?? s.stationId} (${s.municipality ?? s.country}) ao km ${s.alongKm}: ${s.litres} L a ${s.pricePerL.toFixed(3)} €/L` +
        (s.offRouteM > 300 ? `, desvio ~${s.detourKm} km` : ", na rota") +
        (s.pause ? ` — feito durante ${s.pause.kind === "rest" ? "o descanso diário" : "a pausa obrigatória de 45 min"}${s.pause.advancedByMin ? ` (antecipada ${s.pause.advancedByMin} min)` : ""}, sem tempo extra.` : "."),
    );
  }
  if (savingEur !== undefined) explanations.push(`Comparado com encher no primeiro posto da rota ao chegar a ${Math.round(policy.naiveTriggerFrac * 100)} %: ${savingEur >= 0 ? "poupa" : "custa mais"} ${Math.abs(savingEur).toFixed(2)} €.`);
  if (policy.eurPerHour === 0) assumptions.push("Tempo não valorizado (€/h = 0): só combustível e desvio contam no custo.");
  else assumptions.push(`Tempo extra valorizado a ${policy.eurPerHour} €/h; km de desvio a ${policy.nonFuelEurPerKm} €/km além do combustível.`);
  return { status: "OK", stops, totals, baseline, ...(savingEur !== undefined ? { savingEur } : {}), assumptions, explanations };
}

function totalsOf(stops: PlannedStop[], policy: RefuelPolicy, endFuelL: number): PlanTotals {
  const litres = stops.reduce((a, s) => a + s.litres, 0);
  const fuelEur = r2(stops.reduce((a, s) => a + s.fuelEur, 0));
  const detourEur = r2(stops.reduce((a, s) => a + s.detourEur, 0));
  const extraSec = stops.reduce((a, s) => a + (s.pause ? 0 : policy.serviceSec) + (s.detourKm * 1000) / DETOUR_SPEED_MPS, 0);
  const timeEur = r2((extraSec / 3600) * policy.eurPerHour);
  const credit = Math.max(0, endFuelL - policy.targetEndL) * policy.endCreditEurPerL;
  return { litres, fuelEur, detourEur, timeEur, extraStopMin: Math.round(extraSec / 60), stops: stops.length, endFuelL: Math.round(endFuelL), totalEur: r2(fuelEur + detourEur + timeEur - credit) };
}

/** Naive policy: fill to full at the first on-route station (≤ 1 km off) once fuel ≤ trigger. */
function naiveBaseline(nodes: Node[], policy: RefuelPolicy, startL: number, tankL: number, perM: number, distanceM: number): PlanTotals & { feasible: boolean } {
  let fuel = startL;
  let at = 0;
  const stops: PlannedStop[] = [];
  const trigger = tankL * policy.naiveTriggerFrac;
  for (const n of nodes) {
    if (n.kind !== "station" || n.s!.offRouteM > 1000) continue;
    fuel -= (n.alongM - at) * perM;
    at = n.alongM;
    if (fuel < policy.reserveL) return { ...totalsOf(stops, policy, 0), feasible: false };
    const remainingNeed = (distanceM - at) * perM + policy.targetEndL;
    if (fuel <= trigger && fuel < remainingNeed) {
      const detourL = n.detourM * perM;
      const litres = Math.floor((tankL - fuel + detourL) / FUEL_STEP_L) * FUEL_STEP_L;
      if (litres <= 0) continue;
      stops.push({
        stationId: n.s!.station.id, country: n.s!.station.country, alongKm: n.alongM / 1000, offRouteM: n.s!.offRouteM, detourKm: n.detourM / 1000,
        litres, pricePerL: n.s!.price.price, fuelEur: r2(litres * n.s!.price.price), detourEur: r2(n.detourM * perM * n.s!.price.price + (n.detourM / 1000) * policy.nonFuelEurPerKm), priceAgeH: n.s!.ageH,
      });
      fuel = fuel + litres - detourL;
    }
  }
  fuel -= (distanceM - at) * perM;
  return { ...totalsOf(stops, policy, Math.max(0, fuel)), feasible: fuel >= policy.reserveL - 1e-6 };
}
