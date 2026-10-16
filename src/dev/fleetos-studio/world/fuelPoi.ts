// Where a fuel station really is. The official price feeds (DGEG/MITECO) carry their own
// coordinates, sometimes hundreds of metres off, and TomTom's POIs can be wrong too. Order:
//  1. OpenStreetMap `amenity=fuel` near the official point (Overpass) — usually mapped from
//     imagery, with the forecourt outline; same brand preferred.
//  2. TomTom petrol-station POI (category 7311).
//  3. Otherwise the official coordinate, said to be unconfirmed.
import { getTomTomKey, getTomTomRestBase } from "../../../tomtom/config";
import { tomtomFetchJson } from "../../../tomtom/httpClient";
import { haversineKm } from "../../fleetos-environment/world";
import type { Point } from "./types";

export type StationFix = {
  at: Point;
  source: "osm" | "tomtom" | "official";
  /** Brand/name the confirming source gives. */
  label?: string;
  /** Distance from the official coordinate (m). */
  offM: number;
  /** Forecourt outline (OSM ways only). */
  outline?: Point[];
  /** OpenStreetMap could not be asked (servers busy) — the station is not known to be unmapped. */
  osmUnavailable?: boolean;
};

const RADIUS_M = 350;
const cache = new Map<string, Promise<StationFix>>();
const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const sameBrand = (brand: string | undefined, names: (string | undefined)[]) => {
  const b = norm(brand);
  return b.length > 1 && !/^generico|^outro/.test(b) && names.some((n) => norm(n).includes(b) || (norm(n).length > 1 && b.includes(norm(n))));
};

type OverpassEl = {
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

async function fromOsm(at: Point, brand?: string): Promise<StationFix | null | "unavailable"> {
  const q = `[out:json][timeout:10];nwr["amenity"="fuel"](around:${RADIUS_M},${at[1]},${at[0]});out geom tags;`;
  const els = await overpass(q);
  if (!els) return "unavailable";
  {
    const found = els.map((e) => {
      const ring = e.type === "way" && e.geometry?.length ? e.geometry.map((g) => [g.lon, g.lat] as Point) : undefined;
      const c: Point | null =
        e.lat != null && e.lon != null
          ? [e.lon, e.lat]
          : ring
            ? [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length]
            : e.center
              ? [e.center.lon, e.center.lat]
              : null;
      const label = e.tags?.brand ?? e.tags?.name ?? e.tags?.operator;
      return c && { at: c, outline: ring, label, offM: haversineKm(at, c) * 1000, same: sameBrand(brand, [e.tags?.brand, e.tags?.name, e.tags?.operator]) };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    found.sort((a, b) => Number(b.same) - Number(a.same) || a.offM - b.offM);
    const best = found[0];
    return best ? { at: best.at, source: "osm", label: best.label, offM: best.offM, outline: best.outline } : null;
  }
}

/** Public Overpass servers, tried in turn (they rate-limit and time out now and then). */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

async function overpass(q: string): Promise<OverpassEl[] | null> {
  for (const url of OVERPASS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: ctl.signal });
      if (res.ok) return ((await res.json()) as { elements?: OverpassEl[] }).elements ?? [];
    } catch {
      /* next server */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

type NearbyResponse = { results?: { position: { lat: number; lon: number }; poi?: { name?: string; brands?: { name: string }[] } }[] };

async function fromTomTom(at: Point, brand?: string): Promise<StationFix | null> {
  const key = getTomTomKey();
  if (!key) return null;
  const q = new URLSearchParams({ key, lat: String(at[1]), lon: String(at[0]), radius: String(RADIUS_M), categorySet: "7311", limit: "8", language: "pt-PT" });
  try {
    const r = await tomtomFetchJson<NearbyResponse>(`${getTomTomRestBase()}/search/2/nearbySearch/.json?${q}`, { timeoutMs: 8000 });
    const found = (r.results ?? []).map((x) => {
      const pos: Point = [x.position.lon, x.position.lat];
      const names = [x.poi?.name, ...(x.poi?.brands ?? []).map((y) => y.name)];
      return { at: pos, label: x.poi?.brands?.[0]?.name ?? x.poi?.name, offM: haversineKm(at, pos) * 1000, same: sameBrand(brand, names) };
    });
    found.sort((a, b) => Number(b.same) - Number(a.same) || a.offM - b.offM);
    const best = found[0];
    return best ? { at: best.at, source: "tomtom", label: best.label, offM: best.offM } : null;
  } catch {
    return null;
  }
}

const STORE = "fleetos-studio.stationfix.v1";
const saved: Record<string, StationFix> = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, StationFix>;
  } catch {
    return {};
  }
})();

/** The best known position of a station. Confirmed positions are kept in this browser; an
 *  unconfirmed one is retried next session (the public OSM servers are sometimes overloaded). */
export function locateStation(id: string, at: Point, brand?: string): Promise<StationFix> {
  if (saved[id]) return Promise.resolve(saved[id]);
  const hit = cache.get(id);
  if (hit) return hit;
  const p = (async () => {
    const osm = await fromOsm(at, brand);
    const down = osm === "unavailable";
    const f: StationFix = (!down && osm) || { ...((await fromTomTom(at, brand)) ?? { at, source: "official" as const, offM: 0 }), osmUnavailable: down };
    if (f.source === "osm") {
      saved[id] = f;
      try {
        localStorage.setItem(STORE, JSON.stringify(saved));
      } catch {
        /* cache only */
      }
    }
    return f;
  })();
  cache.set(id, p);
  return p;
}

/** One line for the station card saying where the marker comes from. */
export function fixLine(f: StationFix): string {
  const off = f.offM >= 20 ? ` · a ${Math.round(f.offM)} m da coordenada oficial` : "";
  if (f.source === "osm") return `Posto confirmado no OpenStreetMap${f.label ? `: ${f.label}` : ""}${off}`;
  const why = f.osmUnavailable ? "OpenStreetMap indisponível agora" : `sem posto no OpenStreetMap num raio de ${RADIUS_M} m`;
  if (f.source === "tomtom") return `Posição TomTom${f.label ? ` (${f.label})` : ""}${off} · não confirmada: ${why}`;
  return `Posição oficial (DGEG/MITECO), não confirmada: ${why}`;
}
