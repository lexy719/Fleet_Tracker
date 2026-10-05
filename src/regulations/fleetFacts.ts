import type { Job, JobStop, TruckFacts } from "../data/types";
import type { TruckPreset } from "../tomtom/truckPresets";
import type { AreaRecord, Fact, FactSet, RouteStopInput } from "./types";

/**
 * Maps FleetOS records to regulation facts. Only values recorded on the vehicle/job
 * become "known"; generic routing-profile values are NEVER promoted to regulatory facts.
 */
export function buildTransportFacts(truck: TruckFacts | null, job: Job, preset?: TruckPreset): FactSet {
  const unknown = (reason: string): Fact => ({ status: "unknown", reason });
  const facts: FactSet = {};

  if (!truck) {
    const f = unknown("nenhuma viatura selecionada");
    return {
      "vehicle.grossWeightKg": f,
      "vehicle.axleCount": f,
      "vehicle.firstAxleHeightM": f,
      "vehicle.isGoodsVehicle": f,
      "vehicle.ownerCategory": f,
    };
  }

  const recordSource = truck.isDemo ? "ficha da viatura (DADOS DEMO)" : "ficha da viatura";

  if (truck.grossVehicleWeightKg != null) {
    facts["vehicle.grossWeightKg"] = { status: "known", value: truck.grossVehicleWeightKg, source: recordSource };
  } else if (job.totalWeightKg > 0) {
    facts["vehicle.grossWeightKg"] = {
      status: "range",
      min: job.totalWeightKg,
      source: "limite inferior = peso da carga do trabalho",
    };
  } else {
    facts["vehicle.grossWeightKg"] = unknown("peso bruto não registado na ficha da viatura");
  }

  facts["vehicle.axleCount"] =
    truck.axleCount != null
      ? { status: "known", value: truck.axleCount, source: recordSource }
      : unknown(
          `não registado na ficha da viatura${preset ? ` (o perfil de rota genérico "${preset.label}" assume ${preset.vehicleNumberOfAxles}, não usado para conformidade)` : ""}`,
        );

  facts["vehicle.firstAxleHeightM"] =
    truck.firstAxleHeightM != null
      ? { status: "known", value: truck.firstAxleHeightM, source: recordSource }
      : unknown("medida não registada na ficha da viatura");

  facts["vehicle.isGoodsVehicle"] = {
    status: "known",
    value: true,
    source: `viatura de mercadorias (${truck.bodyType ?? "carroçaria de carga"}) com trabalho de carga ${job.id}`,
  };

  facts["vehicle.ownerCategory"] =
    truck.ownerCategory != null
      ? { status: "known", value: truck.ownerCategory, source: recordSource }
      : unknown("categoria do proprietário não registada");

  // Facts explicitly recorded on the job (e.g. authorization state) — never defaulted.
  for (const [id, f] of Object.entries(job.recordedFacts ?? {})) {
    facts[id] = { status: "known", value: f.value, source: job.isDemo ? `${f.source} (DADOS DEMO)` : f.source };
  }

  return facts;
}

function recordedAttribute(stop: JobStop, attribute: string): string | undefined {
  if (attribute === "municipality") return stop.municipality;
  return undefined;
}

/**
 * Job stops in sequence order. Area membership is decided only by comparing an area's
 * `match` rule with an attribute RECORDED on the stop; otherwise it stays UNKNOWN.
 */
export function buildRouteStops(job: Job, areas: AreaRecord[] = []): RouteStopInput[] {
  return [...job.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const memberships: Record<string, Fact> = {};
      for (const area of areas) {
        if (!area.match) continue;
        const value = recordedAttribute(s, area.match.attribute);
        if (value == null) continue;
        memberships[area.id] = {
          status: "known",
          value: value === area.match.equals,
          source: `${area.match.attribute} registado na paragem: ${value}${job.isDemo ? " (DADOS DEMO)" : ""}`,
        };
      }
      return { id: s.id, type: s.type, lat: s.lat, lng: s.lng, areas: memberships };
    });
}
