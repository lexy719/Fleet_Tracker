/**
 * Preset trucks for TomTom truck routing — dimensions and weights in SI units
 * (see TomTom Routing API: vehicleWeight, vehicleLength, etc.).
 */

export type TruckPreset = {
  id: string;
  label: string;
  /** Empty / kerb weight (kg). */
  kerbWeightKg: number;
  /** Maximum gross vehicle weight (kg). */
  maxGrossWeightKg: number;
  vehicleNumberOfAxles: number;
  /** Max authorized weight per axle (kg) — TomTom `vehicleAxleWeight`. */
  maxAxleWeightKg: number;
  /** Meters */
  vehicleLength: number;
  vehicleWidth: number;
  vehicleHeight: number;
  /** Fallback L/100 km when the API does not return fuel consumption. */
  lPer100kmFallback: number;
};

export const DEFAULT_TRUCK_PRESET_ID = "artic-40";

export const TRUCK_PRESETS: TruckPreset[] = [
  {
    id: "rigid-18",
    label: "Rigid · 18 t GVW",
    kerbWeightKg: 7200,
    maxGrossWeightKg: 18000,
    vehicleNumberOfAxles: 2,
    maxAxleWeightKg: 11500,
    vehicleLength: 12.0,
    vehicleWidth: 2.5,
    vehicleHeight: 3.2,
    lPer100kmFallback: 26,
  },
  {
    id: "artic-40",
    label: "Artic · 40 t GVW (5 axles)",
    kerbWeightKg: 8800,
    maxGrossWeightKg: 40000,
    vehicleNumberOfAxles: 5,
    maxAxleWeightKg: 11500,
    vehicleLength: 16.5,
    vehicleWidth: 2.55,
    vehicleHeight: 4.0,
    lPer100kmFallback: 32,
  },
  {
    id: "artic-44",
    label: "Artic · 44 t GVW (6 axles)",
    kerbWeightKg: 9200,
    maxGrossWeightKg: 44000,
    vehicleNumberOfAxles: 6,
    maxAxleWeightKg: 11500,
    vehicleLength: 16.5,
    vehicleWidth: 2.55,
    vehicleHeight: 4.0,
    lPer100kmFallback: 34,
  },
];

export function getTruckPreset(id: string): TruckPreset {
  return TRUCK_PRESETS.find((p) => p.id === id) ?? TRUCK_PRESETS.find((p) => p.id === DEFAULT_TRUCK_PRESET_ID)!;
}

/** Total operating weight (kerb + cargo), clamped to legal GVW. */
export function totalVehicleWeightKg(preset: TruckPreset, cargoWeightKg: number): number {
  const cargo = Math.max(0, cargoWeightKg);
  return Math.min(preset.kerbWeightKg + cargo, preset.maxGrossWeightKg);
}

export function maxCargoKg(preset: TruckPreset): number {
  return Math.max(0, preset.maxGrossWeightKg - preset.kerbWeightKg);
}
