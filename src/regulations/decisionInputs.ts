import type { Job, TruckFacts } from "../data/types";
import type { DecisionInputs } from "./types";

/**
 * One place that defines which inputs a Road Intelligence decision depends on.
 * A saved decision is valid only while these inputs are unchanged (fingerprint match);
 * the constraint dataset is handled separately (a newer dataset → re-evaluate).
 */

/** FNV-1a 32-bit, run twice with different seeds → 64-bit hex. Not cryptographic; change detection only. */
export function hashString(s: string): string {
  const run = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return run(0x811c9dc5) + run(0x01000193 ^ 0x5bd1e995);
}

/** JSON with sorted object keys, so equal content always hashes equally. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const geometryHashCache = new WeakMap<[number, number][], string>();

/** Hash of a route geometry (memoised per points array — route arrays are never mutated). */
export function routeGeometryHash(points: [number, number][]): string {
  const hit = geometryHashCache.get(points);
  if (hit !== undefined) return hit;
  const h = hashString(points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";"));
  geometryHashCache.set(points, h);
  return h;
}

export function buildDecisionInputs(args: {
  job: Job;
  truck: TruckFacts | null;
  departAtIso: string;
  routePoints: [number, number][];
  datasetVersion: string;
}): DecisionInputs {
  const { job, truck } = args;
  return {
    truck: {
      id: truck?.id ?? null,
      grossVehicleWeightKg: truck?.grossVehicleWeightKg,
      axleCount: truck?.axleCount,
      firstAxleHeightM: truck?.firstAxleHeightM,
      ownerCategory: truck?.ownerCategory,
    },
    cargo: { totalWeightKg: job.totalWeightKg, cargoType: job.cargoType, adrClass: job.adrClass, adrUnNumber: job.adrUnNumber },
    stops: [...job.stops]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        id: s.id,
        type: s.type,
        lat: s.lat,
        lng: s.lng,
        municipality: s.municipality,
        windowStartAt: s.windowStartAt,
        windowEndAt: s.windowEndAt,
        legacyWindow: `${s.scheduledTime}-${s.windowEnd}`,
      })),
    recordedFacts: Object.fromEntries(Object.entries(job.recordedFacts ?? {}).map(([k, v]) => [k, v.value])),
    departAtIso: new Date(args.departAtIso).toISOString(),
    routeGeometryHash: routeGeometryHash(args.routePoints),
    datasetVersion: args.datasetVersion,
  };
}

/** Fingerprint of everything except the dataset version (dataset changes trigger re-evaluation, not staleness). */
export function inputsFingerprint(inputs: DecisionInputs): string {
  const { datasetVersion: _dataset, ...rest } = inputs;
  void _dataset;
  return hashString(canonicalJson(rest));
}

const LABELS: Record<string, string> = {
  truck: "viatura ou atributos regulatórios da viatura",
  cargo: "carga (peso, tipo ou ADR)",
  stops: "paragens, municípios ou janelas",
  recordedFacts: "factos registados (autorizações)",
  departAtIso: "hora de partida",
  routeGeometryHash: "geometria da rota",
};

/** Human-readable list of what changed between two input snapshots (dataset excluded). */
export function changedInputs(before: DecisionInputs, now: DecisionInputs): string[] {
  const out: string[] = [];
  for (const key of Object.keys(LABELS) as (keyof DecisionInputs)[]) {
    if (canonicalJson(before[key]) !== canonicalJson(now[key])) out.push(LABELS[key]!);
  }
  return out;
}
