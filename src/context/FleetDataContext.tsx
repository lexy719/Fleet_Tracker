import { useCallback, useMemo } from "react";
import type { Driver, Trailer, Truck, TruckView } from "../data/types";
import { deriveAlerts } from "../domain/alerts";
import { truckView } from "../domain/fleet/trucks";
import { useOperations } from "./OperationsContext";

/*
 * Fleet resources (trucks, trailers, drivers) — read from the operational store.
 * `trucksLive` is the display read model: load derived from active jobs' cargo, position
 * SIMULATED for demo vehicles and UNKNOWN (null) otherwise. The former in-memory cargo /
 * warehouse simulation was removed in Phase 5.
 */

export function useFleetData() {
  const { state, service } = useOperations();
  const { trucks, trailers, drivers, jobs } = state;
  const trucksLive: TruckView[] = useMemo(() => trucks.map((t) => truckView(t, jobs, trailers)), [trucks, jobs, trailers]);
  const maps = useMemo(
    () => ({ t: new Map(trucks.map((x) => [x.id, x])), d: new Map(drivers.map((x) => [x.id, x])), r: new Map(trailers.map((x) => [x.id, x])), v: new Map(trucksLive.map((x) => [x.id, x])) }),
    [trucks, drivers, trailers, trucksLive],
  );
  const getTruck = useCallback((id: string | null | undefined): Truck | undefined => (id ? maps.t.get(id) : undefined), [maps]);
  const getTruckView = useCallback((id: string | null | undefined): TruckView | undefined => (id ? maps.v.get(id) : undefined), [maps]);
  const getDriver = useCallback((id: string | null | undefined): Driver | undefined => (id ? maps.d.get(id) : undefined), [maps]);
  const getTrailer = useCallback((id: string | null | undefined): Trailer | undefined => (id ? maps.r.get(id) : undefined), [maps]);
  return {
    trucks,
    trucksLive,
    trailers,
    drivers,
    getTruck,
    getTruckView,
    getDriver,
    getTrailer,
    service,
  };
}

/** Alerts derived from the operational records (no static alert list). */
export function useOpsAlerts() {
  const { state } = useOperations();
  const { jobs, trucks, drivers, trailers, documents } = state;
  return useMemo(() => deriveAlerts({ jobs, trucks, drivers, trailers, documents }, new Date()), [jobs, trucks, drivers, trailers, documents]);
}
