import { describe, expect, it } from "vitest";
import type { Job, JobStop } from "../data/types";
import { sortQueuedJobsByAnchor } from "./driverQueueOrder";

function stop(
  seq: number,
  type: "pickup" | "delivery",
  lat: number,
  lng: number,
): JobStop {
  return {
    id: `s-${seq}`,
    sequence: seq,
    type,
    clientName: "c",
    address: "",
    city: "",
    lat,
    lng,
    scheduledTime: "09:00",
    windowEnd: "12:00",
    cargoDescription: "",
    weightKg: 100,
    pallets: 1,
    completed: false,
  };
}

function jobWithStops(id: string, stops: JobStop[], queuedAt: string): Job {
  return {
    id,
    reference: "r",
    client: "c",
    status: "queued",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 1000,
    totalPallets: 1,
    stops,
    pickupDeadline: "",
    deliveryDeadline: "",
    slaStatus: "on_track",
    rateEur: 100,
    createdAt: "",
    queuedAt,
    assignedTruckId: "t1",
    assignedDriverId: "d1",
  } as Job;
}

describe("sortQueuedJobsByAnchor", () => {
  it("orders by distance from anchor final delivery to each job’s first pickup, then queuedAt", () => {
    const anchor = {
      id: "J-A",
      reference: "r",
      client: "c",
      status: "in_transit",
      priority: "normal",
      cargoType: "dry",
      totalWeightKg: 1000,
      totalPallets: 1,
      stops: [stop(1, "pickup", 38.0, -9.0), stop(2, "delivery", 40.0, -8.0)],
      pickupDeadline: "",
      deliveryDeadline: "",
      slaStatus: "on_track",
      rateEur: 100,
      createdAt: "",
      assignedTruckId: "t1",
      assignedDriverId: "d1",
    } as Job;

    const farther = jobWithStops(
      "J-FAR",
      [stop(1, "pickup", 50.0, -8.0), stop(2, "delivery", 51.0, -8.0)],
      "2026-04-18T10:00:00.000Z",
    );
    const closer = jobWithStops(
      "J-NEAR",
      [stop(1, "pickup", 40.5, -8.0), stop(2, "delivery", 41.0, -8.0)],
      "2026-04-18T11:00:00.000Z",
    );

    const sorted = sortQueuedJobsByAnchor([farther, closer], anchor);
    expect(sorted.map((x) => x.id)).toEqual(["J-NEAR", "J-FAR"]);
  });

  it("uses queuedAt when distances tie", () => {
    const anchor = {
      id: "J-A",
      reference: "r",
      client: "c",
      status: "in_transit",
      priority: "normal",
      cargoType: "dry",
      totalWeightKg: 1000,
      totalPallets: 1,
      stops: [stop(1, "pickup", 38.0, -9.0), stop(2, "delivery", 40.0, -8.0)],
      pickupDeadline: "",
      deliveryDeadline: "",
      slaStatus: "on_track",
      rateEur: 100,
      createdAt: "",
      assignedTruckId: "t1",
      assignedDriverId: "d1",
    } as Job;

    const sameCoords = (id: string, at: string) =>
      jobWithStops(id, [stop(1, "pickup", 41.0, -8.0), stop(2, "delivery", 42.0, -8.0)], at);

    const a = sameCoords("J-2", "2026-04-18T12:00:00.000Z");
    const b = sameCoords("J-1", "2026-04-18T10:00:00.000Z");
    const sorted = sortQueuedJobsByAnchor([a, b], anchor);
    expect(sorted.map((x) => x.id)).toEqual(["J-1", "J-2"]);
  });
});
