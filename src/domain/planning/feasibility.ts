import type { Driver, Job, Trailer, Truck } from "../../data/types";
import { driverQualifications } from "../drivers/drivers";
import { truckPayloadKg } from "../fleet/trucks";
import { haversineM } from "../../regulations/geometry";
import type {
  Assignment,
  FleetState,
  PlanningConstraint,
  PlanningReason,
} from "./types";

export function assignmentReasons(
  job: Job,
  truck: Truck,
  driver: Driver,
  trailer: Trailer | undefined,
  state: FleetState,
  at: number,
  constraint?: PlanningConstraint,
): { blockers: PlanningReason[]; warnings: PlanningReason[] } {
  const blockers: PlanningReason[] = [],
    warnings: PlanningReason[] = [];
  const reject = (code: string, resourceId?: string) =>
    blockers.push({ code, jobId: job.id, resourceId });
  const warn = (code: string, resourceId?: string) =>
    warnings.push({ code, jobId: job.id, resourceId });
  if (
    (constraint?.truckId && constraint.truckId !== truck.id) ||
    (constraint?.driverId && constraint.driverId !== driver.id) ||
    (constraint?.trailerId && constraint.trailerId !== trailer?.id) ||
    constraint?.excludeTruckIds?.includes(truck.id)
  )
    reject("OVERRIDE_CONFLICT");
  if (truck.archivedAt || truck.availability !== "AVAILABLE")
    reject("TRUCK_UNAVAILABLE", truck.id);
  if (driver.archivedAt || driver.availability !== "AVAILABLE")
    reject("DRIVER_UNAVAILABLE", driver.id);
  if (trailer && (trailer.archivedAt || trailer.availability !== "AVAILABLE"))
    reject("TRAILER_UNAVAILABLE", trailer.id);
  const req = job.operationalRequirements;
  if (
    (truck.vehicleType === "TRACTOR" ||
      req?.trailerRequired ||
      req?.trailerTypes?.length) &&
    !trailer
  )
    reject("TRAILER_REQUIRED");
  if (trailer && truck.vehicleType !== "TRACTOR") reject("TRUCK_CANNOT_TOW");
  if (
    trailer &&
    req?.trailerTypes?.length &&
    !req.trailerTypes.includes(trailer.type)
  )
    reject("TRAILER_INCOMPATIBLE", trailer.id);
  const trailerCapacity =
    trailer?.payloadKg ??
    (trailer?.maxGrossWeightKg !== undefined && trailer.tareKg !== undefined
      ? trailer.maxGrossWeightKg - trailer.tareKg
      : undefined);
  if (trailer && trailerCapacity === undefined)
    reject("TRAILER_CAPACITY_UNKNOWN", trailer.id);
  const truckCapacity = truckPayloadKg(truck),
    capacity =
      trailerCapacity === undefined
        ? truckCapacity
        : truckCapacity === null
          ? trailerCapacity
          : Math.min(trailerCapacity, truckCapacity);
  if (
    trailer &&
    truck.grossVehicleWeightKg !== undefined &&
    truck.kerbWeightKg !== undefined &&
    trailer.tareKg !== undefined &&
    truck.kerbWeightKg + trailer.tareKg + job.totalWeightKg >
      truck.grossVehicleWeightKg
  )
    reject("COMBINATION_GROSS_WEIGHT_EXCEEDED");
  if (capacity === null || capacity === undefined) reject("CAPACITY_UNKNOWN");
  else if (job.totalWeightKg > capacity) reject("PAYLOAD_EXCEEDED");
  const pallets = trailer?.palletCapacity ?? truck.palletCapacity;
  if (pallets !== undefined && job.totalPallets > pallets)
    reject("PALLET_CAPACITY_EXCEEDED");
  if (pallets === undefined && job.totalPallets > 0)
    warn("PALLET_CAPACITY_UNKNOWN");
  const adr =
    job.cargoType === "hazmat" ||
    !!job.adrClass ||
    job.cargo.some((c) => !!c.dangerousGoods);
  if (
    adr &&
    (!truck.adrEquipped ||
      !driver.adr.certified ||
      (trailer && !trailer.capabilities.adrSuitable))
  )
    reject("ADR_INCOMPATIBLE");
  if (
    adr &&
    job.adrClass &&
    driver.adr.classes?.length &&
    !driver.adr.classes.some((c) => job.adrClass!.includes(c))
  )
    reject("ADR_CLASS_INCOMPATIBLE");
  if (adr && trailer?.type === "TANKER" && !driver.adr.tanks)
    reject("ADR_TANK_QUALIFICATION_REQUIRED");
  if (job.cargoType === "refrigerated" || job.tempTargetC) {
    if (
      trailer ? !trailer.capabilities.refrigerated : truck.bodyType !== "reefer"
    )
      reject("REFRIGERATION_REQUIRED");
    if (job.tempTargetC && trailer) {
      if (
        (trailer.capabilities.tempMinC !== undefined &&
          job.tempTargetC.min < trailer.capabilities.tempMinC) ||
        (trailer.capabilities.tempMaxC !== undefined &&
          job.tempTargetC.max > trailer.capabilities.tempMaxC)
      )
        reject("TEMPERATURE_INCOMPATIBLE");
      if (
        trailer.capabilities.tempMinC === undefined ||
        trailer.capabilities.tempMaxC === undefined
      )
        warn("TEMPERATURE_RANGE_UNKNOWN");
    }
  }
  if (
    job.cargoType === "bulk" &&
    (trailer ? trailer.type !== "TANKER" : truck.bodyType !== "tanker")
  )
    reject("BULK_EQUIPMENT_REQUIRED");
  if (
    job.cargoType === "automotive" &&
    (trailer ? trailer.type !== "FLATBED" : truck.bodyType !== "flatbed")
  )
    reject("AUTOMOTIVE_EQUIPMENT_REQUIRED");
  if (
    job.cargoType === "dry" &&
    (trailer ? trailer.type === "TANKER" : truck.bodyType === "tanker")
  )
    reject("DRY_CARGO_EQUIPMENT_INCOMPATIBLE");
  for (const key of ["lengthM", "widthM", "heightM"] as const) {
    const required = req?.[key],
      available = trailer?.[key] ?? truck[key];
    if (
      required !== undefined &&
      available !== undefined &&
      required > available
    )
      reject("CARGO_DIMENSIONS_EXCEEDED");
    if (required !== undefined) warn("INTERNAL_CARGO_CLEARANCE_UNVERIFIED");
  }
  const categories = driver.licence.categories;
  if (
    trailer
      ? !categories.includes("CE")
      : !categories.includes("C") &&
        !categories.includes("CE") &&
        !(
          truck.grossVehicleWeightKg !== undefined &&
          truck.grossVehicleWeightKg <= 7500 &&
          categories.includes("C1")
        )
  )
    reject("LICENCE_CATEGORY_INCOMPATIBLE", driver.id);
  for (const q of driverQualifications(driver, new Date(at))) {
    if (q.kind === "adr" && !adr) continue;
    if (q.state === "EXPIRED" || q.state === "NOT_HELD")
      reject("QUALIFICATION_EXPIRED_OR_MISSING", driver.id);
    else if (q.state === "MISSING")
      warn("QUALIFICATION_VALIDITY_UNKNOWN", driver.id);
  }
  const ts = state.trucks[truck.id],
    ds = state.drivers[driver.id],
    trs = trailer ? state.trailers[trailer.id] : undefined;
  for (const [id, s] of [
    [truck.id, ts],
    [driver.id, ds],
    [trailer?.id, trs],
  ] as const)
    if (s?.blocked) reject(s.blocked.split(":")[0], id);
  if (!ts?.position) reject("TRUCK_POSITION_UNKNOWN", truck.id);
  else
    for (const [id, s] of [
      [driver.id, ds],
      [trailer?.id, trs],
    ] as const) {
      if (!id) continue;
      if (s?.position && haversineM(ts.position.point, s.position.point) > 1)
        reject("RESOURCE_NOT_AT_TRUCK", id);
      if (!s?.position) warn("RESOURCE_COLOCATION_UNCONFIRMED", id);
    }
  if (!ds?.driving?.known) warn("DRIVING_BASELINE_UNKNOWN", driver.id);
  if (ds?.driving && ds.driving.weekSec >= 56 * 3600)
    reject("WEEKLY_DRIVING_EXHAUSTED", driver.id);
  return { blockers, warnings };
}

export function tupleKey(a: Assignment) {
  return `${a.truckId}/${a.driverId}/${a.trailerId ?? ""}`;
}
