import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CargoItem, Truck } from "../data/types";
import {
  initialCargoByTruck,
  trucks as baseTrucks,
  warehouseStock as initialWarehouse,
} from "../data/mockData";

export type LocationRef = { kind: "warehouse" } | { kind: "truck"; truckId: string };

function sumWeight(items: CargoItem[]) {
  return items.reduce((a, c) => a + c.weightKg, 0);
}

const FleetDataContext = createContext<{
  cargoByTruck: Record<string, CargoItem[]>;
  warehouse: CargoItem[];
  trucksLive: Truck[];
  moveCargo: (itemId: string, from: LocationRef, to: LocationRef) => boolean;
  /** Reorder cargo on a truck (unload / load sequence). IDs must match current set. */
  reorderTruckCargo: (truckId: string, orderedIds: string[]) => boolean;
} | null>(null);

export function FleetDataProvider({ children }: { children: ReactNode }) {
  const [cargoByTruck, setCargoByTruck] = useState<Record<string, CargoItem[]>>(
    () => structuredClone(initialCargoByTruck),
  );
  const [warehouse, setWarehouse] = useState<CargoItem[]>(() => structuredClone(initialWarehouse));

  const trucksLive = useMemo(() => {
    return baseTrucks.map((t) => {
      const items = cargoByTruck[t.id] ?? [];
      const w = sumWeight(items);
      const slots = items.length;
      return {
        ...t,
        currentWeightKg: w,
        cargoSlots: slots,
      };
    });
  }, [cargoByTruck]);

  const moveCargo = useCallback(
    (itemId: string, from: LocationRef, to: LocationRef) => {
      if (from.kind === "warehouse" && to.kind === "warehouse") return false;
      if (from.kind === "truck" && to.kind === "truck" && from.truckId === to.truckId)
        return false;

      if (from.kind === "warehouse" && to.kind === "truck") {
        const idx = warehouse.findIndex((c) => c.id === itemId);
        if (idx === -1) return false;
        const item = warehouse[idx];
        const nextWh = warehouse.filter((c) => c.id !== itemId);
        const base = baseTrucks.find((x) => x.id === to.truckId);
        if (!base) return false;
        const destBefore = cargoByTruck[to.truckId] ?? [];
        const destAfter = [...destBefore, item];
        if (destAfter.length > base.maxSlots) return false;
        if (sumWeight(destAfter) > base.maxWeightKg) return false;
        setWarehouse(nextWh);
        setCargoByTruck({ ...cargoByTruck, [to.truckId]: destAfter });
        return true;
      }

      if (from.kind === "truck" && to.kind === "warehouse") {
        const list = cargoByTruck[from.truckId] ?? [];
        const idx = list.findIndex((c) => c.id === itemId);
        if (idx === -1) return false;
        const item = list[idx];
        setCargoByTruck({
          ...cargoByTruck,
          [from.truckId]: list.filter((c) => c.id !== itemId),
        });
        setWarehouse([...warehouse, item]);
        return true;
      }

      if (from.kind === "truck" && to.kind === "truck") {
        const fromList = cargoByTruck[from.truckId] ?? [];
        const fidx = fromList.findIndex((c) => c.id === itemId);
        if (fidx === -1) return false;
        const item = fromList[fidx];
        const base = baseTrucks.find((x) => x.id === to.truckId);
        if (!base) return false;
        const destBefore = cargoByTruck[to.truckId] ?? [];
        const destAfter = [...destBefore, item];
        if (destAfter.length > base.maxSlots) return false;
        if (sumWeight(destAfter) > base.maxWeightKg) return false;

        setCargoByTruck({
          ...cargoByTruck,
          [from.truckId]: fromList.filter((c) => c.id !== itemId),
          [to.truckId]: destAfter,
        });
        return true;
      }

      return false;
    },
    [cargoByTruck, warehouse],
  );

  const reorderTruckCargo = useCallback(
    (truckId: string, orderedIds: string[]) => {
      const list = cargoByTruck[truckId] ?? [];
      if (orderedIds.length !== list.length) return false;
      const set = new Set(list.map((c) => c.id));
      for (const id of orderedIds) {
        if (!set.has(id)) return false;
      }
      const byId = new Map(list.map((c) => [c.id, c] as const));
      const next = orderedIds.map((id) => byId.get(id)).filter((c): c is CargoItem => c != null);
      if (next.length !== list.length) return false;
      setCargoByTruck({ ...cargoByTruck, [truckId]: next });
      return true;
    },
    [cargoByTruck],
  );

  const value = useMemo(
    () => ({ cargoByTruck, warehouse, trucksLive, moveCargo, reorderTruckCargo }),
    [cargoByTruck, warehouse, trucksLive, moveCargo, reorderTruckCargo],
  );

  return <FleetDataContext.Provider value={value}>{children}</FleetDataContext.Provider>;
}

export function useFleetData() {
  const ctx = useContext(FleetDataContext);
  if (!ctx) throw new Error("useFleetData outside FleetDataProvider");
  return ctx;
}
