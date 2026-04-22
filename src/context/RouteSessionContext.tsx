import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { OpsAlert } from "../data/types";

const RouteSessionContext = createContext<{
  routeSessionAlerts: OpsAlert[];
  setRouteSessionAlerts: (alerts: OpsAlert[]) => void;
} | null>(null);

export function RouteSessionProvider({ children }: { children: ReactNode }) {
  const [routeSessionAlerts, setRouteSessionAlertsState] = useState<OpsAlert[]>([]);

  const setRouteSessionAlerts = useCallback((alerts: OpsAlert[]) => {
    setRouteSessionAlertsState(alerts);
  }, []);

  const value = useMemo(
    () => ({ routeSessionAlerts, setRouteSessionAlerts }),
    [routeSessionAlerts, setRouteSessionAlerts],
  );

  return <RouteSessionContext.Provider value={value}>{children}</RouteSessionContext.Provider>;
}

export function useRouteSessionAlerts() {
  const ctx = useContext(RouteSessionContext);
  if (!ctx) {
    return { routeSessionAlerts: [] as OpsAlert[], setRouteSessionAlerts: () => {} };
  }
  return ctx;
}
