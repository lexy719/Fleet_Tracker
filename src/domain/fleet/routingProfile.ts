import type { Truck } from "../../data/types";
import { getTruckPreset, type TruckPreset } from "../../tomtom/truckPresets";

/*
 * Truck record → TomTom routing profile. ONE source of truth: the truck's recorded values.
 * A generic preset fills ONLY what the record lacks, and every filled value is reported as
 * an assumption so the planner can surface it (never silently pretending).
 */

export type RoutingProfile = {
  preset: TruckPreset;
  fallbackPresetId: string;
  fromRecord: string[];
  assumed: string[];
};

export function fallbackPresetIdFor(t: Pick<Truck, "routingPresetId" | "vehicleType" | "axleCount">): string {
  if (t.routingPresetId) return t.routingPresetId;
  if (t.vehicleType === "RIGID" || t.vehicleType === "VAN") return "rigid-18";
  return (t.axleCount ?? 5) >= 6 ? "artic-44" : "artic-40";
}

export function routingProfileForTruck(t: Truck): RoutingProfile {
  const fallbackPresetId = fallbackPresetIdFor(t);
  const base = getTruckPreset(fallbackPresetId);
  const fromRecord: string[] = [];
  const assumed: string[] = [];
  const pick = <K extends keyof TruckPreset>(key: K, value: number | undefined, label: string): TruckPreset[K] => {
    if (value !== undefined && Number.isFinite(value)) {
      fromRecord.push(label);
      return value as TruckPreset[K];
    }
    assumed.push(`${label} = ${String(base[key])} (perfil genérico «${base.label}»)`);
    return base[key];
  };
  const preset: TruckPreset = {
    id: `truck:${t.id}`,
    label: `${t.plate} (ficha da viatura)`,
    kerbWeightKg: pick("kerbWeightKg", t.kerbWeightKg, "tara"),
    maxGrossWeightKg: pick("maxGrossWeightKg", t.grossVehicleWeightKg, "peso bruto"),
    vehicleNumberOfAxles: pick("vehicleNumberOfAxles", t.axleCount, "eixos"),
    maxAxleWeightKg: pick("maxAxleWeightKg", t.maxAxleWeightKg, "peso por eixo"),
    vehicleLength: pick("vehicleLength", t.lengthM, "comprimento"),
    vehicleWidth: pick("vehicleWidth", t.widthM, "largura"),
    vehicleHeight: pick("vehicleHeight", t.heightM, "altura"),
    lPer100kmFallback: base.lPer100kmFallback,
  };
  return { preset, fallbackPresetId, fromRecord, assumed };
}
