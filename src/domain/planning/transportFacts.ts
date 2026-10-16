import type { Job, Trailer, Truck } from "../../data/types";
import { buildTransportFacts } from "../../regulations/fleetFacts";
import type { PlanningMovement } from "./types";

/** No legal inference from a generic routing preset. Trailer facts retain their own scope. */
export function movementFactsFor(
  job: Job,
  truck: Truck,
  trailer: Trailer | undefined,
  kind: PlanningMovement["kind"],
) {
  const demand = {
    ...job,
    ...(kind === "EMPTY" ? { totalWeightKg: 0 } : {}),
    recordedFacts: Object.fromEntries(
      Object.entries(job.recordedFacts ?? {}).filter(
        ([key]) => !key.startsWith("vehicle.") && !key.startsWith("trailer."),
      ),
    ),
  };
  const facts = buildTransportFacts(truck, demand);
  const add = (
    id: string,
    value: number | boolean | undefined,
    source: string,
  ) => {
    facts[id] =
      value === undefined
        ? { status: "unknown", reason: `${id} not recorded` }
        : { status: "known", value, source };
  };
  for (const key of ["heightM", "widthM", "lengthM"] as const)
    add(`vehicle.${key}`, truck[key], "recorded truck specification");
  add(
    "transport.adr",
    job.cargoType === "hazmat" ||
      !!job.adrClass ||
      job.cargo.some((c) => !!c.dangerousGoods),
    "recorded commercial demand",
  );
  if (trailer)
    for (const key of [
      "heightM",
      "widthM",
      "lengthM",
      "axleCount",
      "payloadKg",
    ] as const)
      add(`trailer.${key}`, trailer[key], `recorded trailer ${trailer.id}`);
  if (trailer) {
    facts["vehicle.axleCount"] =
      truck.axleCountScope === "COMBINATION" && truck.axleCount !== undefined
        ? {
            status: "known",
            value: truck.axleCount,
            source: "recorded combination axle count",
          }
        : truck.axleCountScope === "POWER_UNIT" &&
            truck.axleCount !== undefined &&
            trailer.axleCount !== undefined
          ? {
              status: "known",
              value: truck.axleCount + trailer.axleCount,
              source: "recorded power-unit and trailer axle counts",
            }
          : {
              status: "unknown",
              reason:
                "combination axle count or explicit power-unit scope not recorded",
            };
    for (const key of ["heightM", "widthM"] as const) {
      const a = truck[key],
        b = trailer[key];
      facts[`vehicle.${key}`] =
        a !== undefined && b !== undefined
          ? {
              status: "known",
              value: Math.max(a, b),
              source: "maximum of recorded truck and trailer dimensions",
            }
          : a !== undefined || b !== undefined
            ? {
                status: "range",
                min: Math.max(a ?? 0, b ?? 0),
                source: "one component dimension is not recorded",
              }
            : {
                status: "unknown",
                reason: "truck/trailer dimensions not recorded",
              };
    }
    // The coupling overlap is not modelled: do not call a component's length the combination length.
    facts["vehicle.lengthM"] = {
      status: "unknown",
      reason:
        "overall coupled length not recorded; component lengths retain their own scope",
    };
  }
  return facts;
}
