const KEY = "fleetmap.prefs.v1";

export type FleetMapPrefs = {
  visible?: Record<string, boolean>;
  panelOpen?: boolean;
};

export function loadFleetMapPrefs(): FleetMapPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FleetMapPrefs;
  } catch {
    return {};
  }
}

export function saveFleetMapPrefs(prefs: FleetMapPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}
