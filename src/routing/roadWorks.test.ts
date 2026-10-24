import { describe, expect, it } from "vitest";
import { activeAt, classifyWorkText, drivesThrough, expectedDelayMin, extentKmFromText, hoursFromText, innerProbes, stretchAround, type RoadWork } from "./roadWorks";

const work = (over: Partial<RoadWork>): RoadWork => ({ id: "w", source: "IP", road: "EN1", lat: 41, lng: -8, kind: "conditioned", text: "", ...over });

describe("classifyWorkText (IP wording)", () => {
  it.each([
    ["Trabalhos de requalificação IP3 entre o pk 104 e o 111 corte total da via.", "closure"],
    ["Amarante, ambas as vias e ambos os sentidos", "closure"],
    ["A IP irá encerrar ao trânsito a EN 378", "closure"],
    ["Semaforos EN18 km 150+351 (Alpanhão)", "alternating"],
    ["Circulação alternada entre as 08h00 e as 18h00", "alternating"],
    ["Corte de via esquerda entre Amadora e Tercena", "lane_closure"],
    ["Santo Tirso, Agrela", "conditioned"],
  ])("%s → %s", (text, kind) => expect(classifyWorkText(text)).toBe(kind));
});

describe("extentKmFromText", () => {
  it("reads the stated stretch", () => {
    expect(extentKmFromText("entre o pk 104 e o 111")).toBe(7);
    expect(extentKmFromText("do km 27,145 ao km 34,050")).toBeCloseTo(6.905, 3);
    expect(extentKmFromText("Semaforos EN18 km 150+351")).toBeUndefined();
  });
});

describe("expectedDelayMin", () => {
  it("closure is never worth going through; live traffic replaces the default with a floor", () => {
    expect(expectedDelayMin(work({ kind: "closure" }))).toBe(Infinity);
    expect(expectedDelayMin(work({ kind: "alternating" }))).toBe(8);
    expect(expectedDelayMin(work({ kind: "alternating", liveTraffic: true, liveDelayMin: 0 }))).toBe(3);
    expect(expectedDelayMin(work({ kind: "conditioned", liveTraffic: true, liveDelayMin: 12 }))).toBe(12);
  });
});

describe("hours and activity (Lisbon time)", () => {
  it("reads daily hours from IP wording", () => {
    expect(hoursFromText("no período entre as 09h30 e as 18h00")).toEqual({ from: "09:30", to: "18:00" });
    expect(hoursFromText("entre as 22h00 do dia 20 de outubro e as 06h00 do dia 21")).toEqual({ from: "22:00", to: "06:00" });
  });
  it("handles day works and overnight works", () => {
    const day = work({ start: "2026-09-14", end: "2026-09-18", hours: { from: "09:30", to: "18:00" } });
    expect(activeAt(day, new Date("2026-09-15T10:00:00Z"))).toBe(true); // 11:00 Lisbon (summer)
    expect(activeAt(day, new Date("2026-09-15T18:30:00Z"))).toBe(false);
    expect(activeAt(day, new Date("2026-09-20T10:00:00Z"))).toBe(false);
    const night = work({ start: "2026-10-20", end: "2026-10-20", hours: { from: "22:00", to: "06:00" } });
    expect(activeAt(night, new Date("2026-10-20T22:30:00Z"))).toBe(true); // 23:30 Lisbon
    expect(activeAt(night, new Date("2026-10-21T03:00:00Z"))).toBe(true); // 04:00 next morning
    expect(activeAt(night, new Date("2026-10-21T12:00:00Z"))).toBe(false);
  });
});

describe("innerProbes", () => {
  it("drops the ends of a stretch, keeps the middle of a short one", () => {
    const line: [number, number][] = Array.from({ length: 11 }, (_, i) => [41 + i * 0.0009, -8]); // ~1 km, 100 m steps
    const inner = innerProbes(line);
    expect(inner[0]).toEqual(line[1]);
    expect(inner.at(-1)).toEqual(line[9]);
    expect(innerProbes(line.slice(0, 2))).toHaveLength(1);
  });
});

describe("drivesThrough", () => {
  const line: [number, number][] = Array.from({ length: 11 }, (_, i) => [41 + i * 0.0009, -8]); // ~1 km north-south
  it("counts a route along the stretch, not one that only crosses or touches it", () => {
    expect(drivesThrough(line.map(([a, b]) => [a, b + 0.0002]), line)).toBe(true); // parallel ~17 m away = same road
    const crossing: [number, number][] = Array.from({ length: 11 }, (_, i) => [41 + 5 * 0.0009, -8.006 + i * 0.0012]);
    expect(drivesThrough(crossing, line)).toBe(false);
    expect(drivesThrough(line.slice(8), line)).toBe(true); // shares the last ~200 m
    expect(drivesThrough([[41, -8]], [[41.0003, -8]])).toBe(true); // a single point work
  });
});

describe("stretchAround", () => {
  it("takes about halfM on each side of the point", () => {
    const poly: [number, number][] = Array.from({ length: 101 }, (_, i) => [41 + i * 0.0009, -8]); // ~100 m steps
    const s = stretchAround(poly, 50, 250);
    expect(s.length).toBeGreaterThanOrEqual(6);
    expect(s.length).toBeLessThanOrEqual(8);
  });
});
