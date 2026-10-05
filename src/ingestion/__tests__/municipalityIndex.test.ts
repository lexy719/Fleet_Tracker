import { describe, expect, it } from "vitest";
import caopJson from "../../../public/data/caop2025-municipios.json";
import { distanceToBoundaryMReference, MunicipalityIndex } from "../municipalities";
import type { Municipality, MunicipalityDataset } from "../types";

/* The grid-accelerated border test must give exactly the exhaustive answer. */
const DS = caopJson as unknown as MunicipalityDataset;
const INDEX = new MunicipalityIndex(DS);

function inRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inside = (lat: number, lng: number, m: Municipality) => m.polygons.some((p) => inRing(lat, lng, p[0]!) && !p.slice(1).some((h) => inRing(lat, lng, h)));
function reference(lat: number, lng: number) {
  const margin = DS.simplification.borderMarginM;
  const pad = margin / 111_000 + 0.002;
  const near = DS.municipalities.filter((m) => lat >= m.bbox.south - pad && lat <= m.bbox.north + pad && lng >= m.bbox.west - pad && lng <= m.bbox.east + pad);
  const containing = near.filter((m) => inside(lat, lng, m));
  const close = near.filter((m) => distanceToBoundaryMReference(lat, lng, m, margin) < margin);
  if (containing.length === 1 && close.length === 0) return { status: "inside", codes: [containing[0]!.code] };
  const codes = [...new Set([...containing, ...close].map((m) => m.code))].sort();
  return codes.length ? { status: "near_border", codes } : { status: "outside_dataset", codes: [] };
}
// Municipality-level view (enclosed_gap is "no municipality" at this level — tested separately below).
const view = (r: ReturnType<MunicipalityIndex["lookup"]>) =>
  r.status === "inside" ? { status: "inside", codes: [r.municipality.code] } : r.status === "near_border" ? { status: "near_border", codes: r.candidates.map((m) => m.code).sort() } : { status: "outside_dataset", codes: [] };

describe("MunicipalityIndex (grid) ≡ exhaustive lookup", () => {
  it("3000 random points across mainland Portugal", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 3000; k++) {
      const lat = 36.95 + rnd() * 5.2, lng = -9.5 + rnd() * 3.3;
      expect(view(INDEX.lookup(lat, lng))).toEqual(reference(lat, lng));
    }
  });
  it("points placed ON and NEAR municipal boundaries (the hard cases)", () => {
    let n = 0;
    for (const m of DS.municipalities.slice(0, 60)) {
      const ring = m.polygons[0]![0]!;
      for (let i = 0; i < ring.length; i += 7) {
        const [lng, lat] = ring[i]!;
        for (const d of [0, 0.0004, 0.0009, 0.002]) {
          expect(view(INDEX.lookup(lat + d, lng - d))).toEqual(reference(lat + d, lng - d));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });
  it("NaN input ⇒ invalid (unknown — never a municipality, never 'foreign')", () => {
    expect(INDEX.lookup(Number.NaN, -8.6).status).toBe("invalid");
  });
});

describe("grid equivalence — targeted points", () => {
  const centre = (m: Municipality): [number, number] => [(m.bbox.south + m.bbox.north) / 2, (m.bbox.west + m.bbox.east) / 2];
  it("bbox centres of EVERY municipality (incl. narrow and coastal ones)", () => {
    for (const m of DS.municipalities) {
      const [lat, lng] = centre(m);
      expect(view(INDEX.lookup(lat, lng))).toEqual(reference(lat, lng));
    }
  });
  it("narrowest municipalities: points across their short axis", () => {
    const narrow = [...DS.municipalities].sort((a, b) => Math.min(a.bbox.north - a.bbox.south, a.bbox.east - a.bbox.west) - Math.min(b.bbox.north - b.bbox.south, b.bbox.east - b.bbox.west)).slice(0, 15);
    for (const m of narrow) {
      const [lat, lng] = centre(m);
      for (let k = -10; k <= 10; k++) {
        const p: [number, number] = [lat + (k / 10) * (m.bbox.north - m.bbox.south) / 2, lng + (k / 10) * (m.bbox.east - m.bbox.west) / 2];
        expect(view(INDEX.lookup(p[0], p[1]))).toEqual(reference(p[0], p[1]));
      }
    }
  });
  it("coastal edge: walking west from each coastal municipality into the Atlantic", () => {
    const coastal = DS.municipalities.filter((m) => m.bbox.west < -8.7).slice(0, 25);
    for (const m of coastal) {
      const lat = (m.bbox.south + m.bbox.north) / 2;
      for (let lng = m.bbox.west + 0.02; lng > m.bbox.west - 0.05; lng -= 0.0025) expect(view(INDEX.lookup(lat, lng))).toEqual(reference(lat, lng));
    }
  });
});

describe("enclosed gaps vs unsupported territory (derived from the registry, no geography hard-coded)", () => {
  const probes: [string, number, number, string][] = [
    ["Tejo estuary under the Vasco da Gama bridge", 38.765, -9.03, "enclosed_gap"],
    ["Atlantic, 30 km off Peniche", 39.36, -9.75, "outside_dataset"],
    ["Badajoz (Spain)", 38.878, -6.97, "outside_dataset"],
    ["Tui (Spain, across the Minho)", 42.047, -8.645, "outside_dataset"],
    ["Olivenza (Spanish-administered)", 38.685, -7.1, "outside_dataset"],
    ["Lisbon city centre", 38.7223, -9.1393, "inside"],
  ];
  it.each(probes)("%s ⇒ %s", (_n, lat, lng, expected) => {
    const r = INDEX.lookup(lat, lng);
    expect(r.status === "near_border" ? "inside" : r.status).toBe(expected);
    if (r.status === "enclosed_gap") expect(r.territory).toBe("PT-CONT");
  });
});
