import { DEFAULT_TRUCK_PRESET_ID, getTruckPreset, type TruckPreset } from "./truckPresets";

/**
 * Maps fleet / telematics truck ids (mockData) to TomTom routing presets.
 * Extend this table when adding trucks — keeps one source for kerb mass & dimensions.
 */
const FLEET_TRUCK_TO_PRESET: Record<string, string> = {
  t1: "artic-40",
  t2: "artic-40",
  t3: "artic-40",
  t4: "artic-40",
  t5: "artic-40",
  t6: "rigid-18",
};

export function routingPresetIdForFleetTruck(truckId: string): string {
  return FLEET_TRUCK_TO_PRESET[truckId] ?? DEFAULT_TRUCK_PRESET_ID;
}

export function routingPresetForFleetTruck(truckId: string): TruckPreset {
  return getTruckPreset(routingPresetIdForFleetTruck(truckId));
}
