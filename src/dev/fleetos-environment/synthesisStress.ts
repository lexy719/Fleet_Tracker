import {
  initialLivingState,
  DOMAINS,
  type LivingSnapshot,
} from "./livingEnvironment";
import {
  initialTopology,
  applyTopology,
  type Actor,
  type RepresentationComposition,
} from "./representationEngine";
import { dataShape } from "./representationLibrary";
import { createWorkspaceSpace } from "./workspaceGeometry";
import { synthesize } from "./liquidSynthesis";
export function stressState(index: number): LivingSnapshot {
  let seed = ((index + 1) * 2654435761) >>> 0;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  let state: LivingSnapshot = {
    ...initialLivingState(),
    topology: initialTopology(),
  };
  const actors: Actor[] =
    index % 5 === 0
      ? ["Jobs", "Drivers", "Fuel"]
      : DOMAINS.filter(() => next() > 0.3);
  if (!actors.length) actors.push("Jobs");
  state.surfaces = state.surfaces.map((s) => ({
    ...s,
    enabled: actors.includes(s.id as Actor),
    demand: 0.2 + next() * 0.7,
    width: 0.15 + next() * 0.3,
    height: 0.15 + next() * 0.4,
  }));
  const primary =
    index % 7 === 0 ? "map" : actors[Math.floor(next() * actors.length)];
  state = applyTopology(state, { type: "PROMOTE", actor: primary });
  const t = state.topology!;
  t.intent = (
    [
      "overview",
      "dispatch",
      "inspect",
      "compare",
      "relations",
      "monitor",
    ] as const
  )[index % 6];
  t.depth = index % 4;
  t.facts = Object.fromEntries(
    DOMAINS.map((domain) => [
      domain,
      dataShape(domain, {
        count: Math.floor(next() * 48),
        urgency: next(),
        detail: next(),
        selected: next() > 0.45 ? `DEMO-${domain[0]}01` : null,
        mapRelevance: next(),
      }),
    ]),
  );
  Object.assign(state.variables, {
    mapWidth: 0.25 + next() * 0.7,
    mapHeight: 0.2 + next() * 0.77,
    mapX: 0.07 + next() * 0.86,
    mapY: 0.07 + next() * 0.86,
    margin: 10 + next() * 28,
    density: 0.2 + next() * 0.75,
  });
  if (index % 13 === 0) state = applyTopology(state, { type: "STRIP" });
  if (index % 17 === 0 && actors.length > 1)
    state = applyTopology(state, { type: "MERGE", actors: actors.slice(0, 2) });
  if (index % 19 === 0)
    state = applyTopology(state, { type: "MAP_MODE", mode: "HIDDEN" });
  if (index % 23 === 0)
    state = applyTopology(state, { type: "TAKEOVER", actor: primary });
  return state;
}
export type StressReport = {
  samples: number;
  topologies: number;
  geometries: number;
  representations: number;
  repeatedLayoutRate: number;
  candidateCount: number;
  rejectionRate: number;
  invalidWinners: number;
  solverMs: { p50: number; p95: number; max: number };
  sameSetTopologies: number;
  mapRegions: Record<string, number>;
  dominantReasons: Record<string, number>;
};
export function runSynthesisStress(
  count = 1024,
  onProgress?: (done: number) => void,
): StressReport {
  const topologies = new Set<string>(),
    geometries = new Set<string>(),
    representations = new Set<string>(),
    same = new Set<string>(),
    timings: number[] = [],
    mapRegions: Record<string, number> = {},
    reasons: Record<string, number> = {};
  let generated = 0,
    rejected = 0,
    invalid = 0;
  for (let i = 0; i < count; i++) {
    const state = stressState(i),
      size = [
        { width: 1199, height: 884 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
      ][i % 3];
    const space = createWorkspaceSpace(
      size,
      [
        {
          id: "rail",
          kind: "navigation",
          bounds: { x: 0, y: 0, width: 96, height: size.height },
        },
        {
          id: "spine",
          kind: "orientation",
          bounds: { x: 96, y: 0, width: size.width - 96, height: 64 },
        },
      ],
      state.variables.margin,
    );
    const start = performance.now(),
      model: RepresentationComposition = synthesize(state, size, space);
    timings.push(performance.now() - start);
    const s = model.synthesis!;
    topologies.add(s.topologySignature);
    geometries.add(s.geometrySignature);
    representations.add(s.representationSignature);
    if (i % 5 === 0) same.add(s.topologySignature);
    generated += s.generated;
    rejected += s.rejected;
    invalid += s.candidates.find((c) => c.id === s.winner)?.accepted ? 0 : 1;
    const map = model.representations.find((d) => d.actor === "map")?.bounds,
      f = model.frame;
    const location = map
      ? `${Math.min(2, Math.floor(((map.x + map.width / 2 - f.x) / f.width) * 3))},${Math.min(2, Math.floor(((map.y + map.height / 2 - f.y) / f.height) * 3))}`
      : "hidden";
    mapRegions[location] = (mapRegions[location] ?? 0) + 1;
    const candidate = s.candidates.find((c) => c.id === s.winner),
      positive = candidate
        ? Object.entries(candidate.terms)
            .filter(([key]) =>
              [
                "semantic",
                "hierarchy",
                "utilization",
                "relationships",
                "shape",
                "mapRelevance",
              ].includes(key),
            )
            .sort((a, b) => b[1] - a[1])[0]?.[0]
        : "fallback";
    reasons[positive] = (reasons[positive] ?? 0) + 1;
    if (i % 32 === 31) onProgress?.(i + 1);
  }
  timings.sort((a, b) => a - b);
  return {
    samples: count,
    topologies: topologies.size,
    geometries: geometries.size,
    representations: representations.size,
    sameSetTopologies: same.size,
    repeatedLayoutRate: 1 - topologies.size / count,
    candidateCount: generated,
    rejectionRate: rejected / Math.max(1, generated),
    invalidWinners: invalid,
    solverMs: {
      p50: timings[Math.floor(count * 0.5)],
      p95: timings[Math.floor(count * 0.95)],
      max: timings.at(-1)!,
    },
    mapRegions,
    dominantReasons: reasons,
  };
}
