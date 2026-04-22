/** Deep links across the app — keep query param names in sync with pages. */

export type AppQuery = {
  truck?: string;
  driver?: string;
  job?: string;
};

function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export function mapUrl(q?: Pick<AppQuery, "truck" | "job">) {
  return `/app/map${qs({ truck: q?.truck, job: q?.job })}`;
}

export function dispatchUrl(truckId?: string) {
  return `/app/dispatch${qs({ truck: truckId })}`;
}

/** Abre o separador Carga (LIFO) com viatura opcional. */
export function dispatchCargoUrl(truckId?: string) {
  const u = new URLSearchParams();
  if (truckId) u.set("truck", truckId);
  u.set("tab", "cargo");
  return `/app/dispatch?${u.toString()}`;
}

export function fleetUrl(truckId?: string) {
  return `/app/fleet${qs({ truck: truckId })}`;
}

export function driversUrl(driverId?: string) {
  return `/app/drivers${qs({ driver: driverId })}`;
}

export function jobsUrl(jobId?: string) {
  return `/app/jobs${qs({ job: jobId })}`;
}
