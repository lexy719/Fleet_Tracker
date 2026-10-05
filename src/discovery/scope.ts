import { COVERAGE_SAMPLE_M, routeMunicipalities, sampleRoute } from "../ingestion/coverage";
import type { MunicipalityIndex } from "../ingestion/municipalities";
import type { Freshness, SourceRecord } from "../ingestion/types";
import { hashString } from "../regulations/decisionInputs";
import { routeGeometryHash } from "../regulations/decisionInputs";
import type { FactSet } from "../regulations/types";
import { allAuthorities, DEV_TEST_AUTHORITY, municipalAuthorityId, NATIONAL_AUTHORITIES } from "./authorities";
import type { Authority, DiscoveryScope, DiscoveryTopic, RoadClass, ScopeRoad, ScopeVehicle } from "./types";

/*
 * DiscoveryScope — what to investigate for ONE route: derived from its geometry (CAOP
 * municipalities), the road numbers the provider reported, the registered sources and
 * their freshness, and the vehicle facts. No nationwide crawling.
 */

export function classifyRoad(ref: string): RoadClass {
  const r = ref.toUpperCase().replace(/\s+/g, "");
  if (/^A\d/.test(r)) return "motorway";
  if (/^(IP|IC|N|EN)\d/.test(r)) return "national";
  if (/^(R|ER)\d/.test(r)) return "regional";
  if (/^(EM|CM|M)\d/.test(r)) return "municipal";
  if (/^E\d/.test(r)) return "european";
  return "unknown";
}

function scopeRoad(ref: string): ScopeRoad {
  const roadClass = classifyRoad(ref);
  if (roadClass === "municipal") return { ref, roadClass, manager: { status: "municipal", note: "via municipal — gestão do município atravessado" } };
  return {
    ref,
    roadClass,
    manager: {
      status: "undetermined",
      note:
        roadClass === "motorway"
          ? "autoestrada — IP ou concessionária; não determinável só pelo número"
          : roadClass === "european"
            ? "designação europeia (sobreposta a uma via nacional) — não identifica o gestor"
            : "rede nacional/regional — IP, concessão ou subconcessão; não determinável só pelo número",
    },
  };
}

/** Vehicle facts restrictions commonly depend on (ids as used by the evaluator where modelled). */
const RELEVANT_VEHICLE_FACTS: { id: string; label: string }[] = [
  { id: "vehicle.grossWeightKg", label: "peso bruto" },
  { id: "vehicle.axleCount", label: "número de eixos" },
  { id: "vehicle.firstAxleHeightM", label: "altura ao 1.º eixo" },
  { id: "vehicle.isGoodsVehicle", label: "veículo de mercadorias" },
  { id: "vehicle.heightM", label: "altura total (não modelada)" },
  { id: "vehicle.widthM", label: "largura (não modelada)" },
  { id: "vehicle.lengthM", label: "comprimento (não modelado)" },
  { id: "cargo.adrClass", label: "classe ADR (não modelada)" },
];

export function scopeVehicle(facts: FactSet): ScopeVehicle {
  const known: ScopeVehicle["known"] = {};
  const missing: string[] = [];
  for (const f of RELEVANT_VEHICLE_FACTS) {
    const v = facts[f.id];
    if (v?.status === "known") known[f.id] = v.value;
    else if (v?.status === "range") known[f.id] = `${v.min ?? "?"}–${v.max ?? "?"}`;
    else missing.push(f.label);
  }
  return { known, missing };
}

/** Vehicle class used to partition the discovery cache (answers differ for HGVs). */
export function vehicleClassOf(v: ScopeVehicle): string {
  const w = v.known["vehicle.grossWeightKg"];
  if (typeof w === "number") return w > 3500 ? "hgv" : "light";
  return typeof w === "string" ? "hgv-range" : "unknown";
}

const MUNICIPAL_TOPICS: DiscoveryTopic[] = ["temporary_closures", "roadworks", "permanent_hgv_restrictions", "access_zones"];
const NATIONAL_TOPICS: DiscoveryTopic[] = ["temporary_closures", "temporary_restrictions", "roadworks", "dimension_weight_limits"];

export function buildDiscoveryScope(args: {
  route: { id: string; polyline: [number, number][]; roadNumbers: string[]; departAtIso?: string; durationSec: number };
  strategy: string;
  index: MunicipalityIndex | null;
  sources: SourceRecord[];
  freshness: Record<string, Freshness>;
  facts: FactSet;
  includeDev: boolean;
  /** Extra authorities (e.g. from approved source proposals). */
  extraAuthorities?: Authority[];
  now: Date;
}): DiscoveryScope {
  const { route, index, sources, freshness, now } = args;
  const rm = index ? routeMunicipalities(route.polyline, index) : null;
  const samples = rm ? rm.samples : sampleRoute(route.polyline);
  const counts = new Map<string, { name: string; district: string; n: number }>();
  let uncertain = 0;
  let outside = 0;
  if (index && rm) {
    for (const r of rm.lookups) {
      if (r.status !== "inside") {
        uncertain++;
        if (r.status === "outside_dataset") outside++;
        continue;
      }
      const e = counts.get(r.municipality.code) ?? { name: r.municipality.name, district: r.municipality.district, n: 0 };
      e.n++;
      counts.set(r.municipality.code, e);
    }
  } else uncertain = samples.length;

  const municipalities = [...counts.entries()].map(([code, v]) => ({ code, name: v.name, district: v.district, approxKm: Math.round((v.n * COVERAGE_SAMPLE_M) / 100) / 10 }));
  const roads = [...new Set(route.roadNumbers.map((r) => r.trim()).filter(Boolean))].map(scopeRoad);

  const authorities = allAuthorities(municipalities, args.includeDev).concat(args.extraAuthorities ?? []);
  const scopeAuthorities: DiscoveryScope["authorities"] = [];
  const add = (a: Authority, reason: string) => {
    const ex = scopeAuthorities.find((x) => x.authorityId === a.id);
    if (ex) ex.reasons.push(reason);
    else scopeAuthorities.push({ authorityId: a.id, name: a.name, kind: a.kind, reasons: [reason] });
  };
  const ip = NATIONAL_AUTHORITIES.find((a) => a.id === "ip")!;
  const nationalRoads = roads.filter((r) => r.roadClass === "motorway" || r.roadClass === "national" || r.roadClass === "regional");
  add(ip, nationalRoads.length ? `rede nacional na rota (${nationalRoads.map((r) => r.ref).slice(0, 8).join(", ")}${nationalRoads.length > 8 ? "…" : ""}) — gestor possível` : "gestor da rede rodoviária nacional");
  add(NATIONAL_AUTHORITIES.find((a) => a.id === "incm-dr")!, "legislação e regulamentos municipais publicados");
  for (const m of municipalities) add(authorities.find((a) => a.id === municipalAuthorityId(m.code))!, `município atravessado (~${m.approxKm} km)`);
  if (args.includeDev) add(DEV_TEST_AUTHORITY, "fixtures de desenvolvimento ativas");
  for (const a of args.extraAuthorities ?? []) add(a, "fonte proposta/aprovada por descoberta");

  const inScope = new Set(scopeAuthorities.map((a) => a.authorityId));
  const authorityOfSource = (s: SourceRecord): string | undefined => {
    const a = authorities.find((x) => x.sourceIds.includes(s.id));
    if (a) return a.id;
    return s.synthetic ? DEV_TEST_AUTHORITY.id : undefined;
  };
  const registeredSources = sources
    .filter((s) => s.enabled && s.access.kind !== "STATIC")
    .map((s) => ({ s, authorityId: authorityOfSource(s) }))
    .filter((x): x is { s: SourceRecord; authorityId: string } => !!x.authorityId && inScope.has(x.authorityId))
    .map(({ s, authorityId }) => ({ sourceId: s.id, name: s.name, authorityId, freshness: freshness[s.id]?.state ?? "UNKNOWN" }));

  const operational = (authorityId: string) =>
    sources.some((s) => {
      const a = authorityOfSource(s);
      return a === authorityId && s.enabled && s.coverage.provides.some((p) => p === "temporary_events" || p === "closures");
    });
  const uncoveredAuthorityIds = scopeAuthorities.filter((a) => a.kind === "municipality" && !operational(a.authorityId)).map((a) => a.authorityId);

  const tripEnd = route.departAtIso ? new Date(Date.parse(route.departAtIso) + route.durationSec * 1000 * 1.5).toISOString() : undefined;

  const topics: DiscoveryTopic[] = [...new Set([...NATIONAL_TOPICS, ...(municipalities.length ? MUNICIPAL_TOPICS : []), "legal_acts" as const])];

  return {
    id: `scope-${hashString(`${route.id}|${routeGeometryHash(route.polyline)}|${now.toISOString()}`)}`,
    createdAt: now.toISOString(),
    routeId: route.id,
    strategy: args.strategy,
    routeHash: routeGeometryHash(route.polyline),
    ...(route.departAtIso ? { departAtIso: route.departAtIso, horizon: { fromIso: route.departAtIso, toIso: tripEnd! } } : {}),
    roads,
    municipalities,
    uncertainSamples: uncertain,
    outsideSamples: outside,
    totalSamples: samples.length,
    districts: [...new Set(municipalities.map((m) => m.district))],
    authorities: scopeAuthorities,
    registeredSources,
    uncoveredAuthorityIds,
    staleSourceIds: registeredSources.filter((s) => s.freshness === "STALE" || s.freshness === "FETCH_ERROR").map((s) => s.sourceId),
    unknownCoverageSourceIds: registeredSources.filter((s) => s.freshness === "UNKNOWN").map((s) => s.sourceId),
    vehicle: scopeVehicle(args.facts),
    topics,
  };
}

/** Topics that make sense for an authority kind. */
export function topicsFor(kind: Authority["kind"], scopeTopics: DiscoveryTopic[]): DiscoveryTopic[] {
  const allowed: Record<Authority["kind"], DiscoveryTopic[]> = {
    national_road_manager: ["temporary_closures", "temporary_restrictions", "roadworks", "dimension_weight_limits"],
    concessionaire: ["temporary_closures", "roadworks", "dimension_weight_limits"],
    municipality: ["temporary_closures", "roadworks", "permanent_hgv_restrictions", "access_zones"],
    legal_publisher: ["legal_acts"],
    geodata_authority: [],
    synthetic_test: ["temporary_closures", "temporary_restrictions", "permanent_hgv_restrictions"],
  };
  return allowed[kind].filter((t) => scopeTopics.includes(t));
}
