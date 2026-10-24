import { describe, expect, it } from "vitest";
import { avoidCustomModel, corridorPolygon, graphhopperAvoidRequest } from "./graphhopperProvider";
import { stopAreas, truckFacts } from "./truckRoute";
import type { RegulationDataset } from "../regulations/types";

const line: [number, number][] = [
  [41.14, -8.60],
  [41.141, -8.601],
  [41.142, -8.603],
];

describe("corridorPolygon", () => {
  it("is a closed ring around the line, about bufferM to each side", () => {
    const ring = corridorPolygon(line, 15);
    expect(ring).toHaveLength(line.length * 2 + 1);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const [lng, lat] = ring[0]!;
    const offM = Math.hypot((lat - line[0]![0]) * 111_320, (lng - line[0]![1]) * 111_320 * Math.cos((41.14 * Math.PI) / 180));
    expect(offM).toBeGreaterThan(14);
    expect(offM).toBeLessThan(16);
  });
});

describe("avoidCustomModel", () => {
  it("blocks every corridor and nothing when there is nothing to avoid", () => {
    expect(avoidCustomModel([])).toBeUndefined();
    const long: [number, number][] = Array.from({ length: 130 }, (_, i) => [41 + i * 0.001, -8.6]);
    const cm = avoidCustomModel([{ id: "a", kind: "avoid_path", lines: [long], constraintIds: ["x"] }])!;
    expect(cm.areas.features.length).toBe(3); // 130 points → pieces of ≤ 60 points
    expect(cm.priority[0]).toEqual({ if: "in_avoid0 || in_avoid1 || in_avoid2", multiply_by: "0" });
    expect(graphhopperAvoidRequest([{ id: "a", kind: "avoid_path", lines: [long], constraintIds: ["x"] }]).request).toMatchObject({ kind: "avoid_corridors", corridors: 3 });
  });
});

describe("truck facts and stop areas", () => {
  it("states every fact the VCI rule needs", () => {
    const f = truckFacts({ grossWeightKg: 40000, axleCount: 5, firstAxleHeightM: 1.4, heightM: 4, widthM: 2.55, lengthM: 16.5, authorizations: { "pt-vci-habilitacao": true } });
    expect(f["vehicle.axleCount"]).toMatchObject({ status: "known", value: 5 });
    expect(f["authorization.pt-vci-habilitacao"]).toMatchObject({ status: "known", value: true });
  });

  it("leaves municipality areas UNKNOWN without an index", () => {
    const dataset = { areas: [{ id: "pt-municipio-porto", label: "Porto", status: "UNRESOLVED", match: { attribute: "municipality", equals: "Porto" }, evidence: [] }] } as unknown as RegulationDataset;
    expect(stopAreas(dataset, 41.15, -8.61)).toEqual({ "pt-municipio-porto": { status: "unknown", reason: "concelho da paragem não determinado" } });
  });
});
