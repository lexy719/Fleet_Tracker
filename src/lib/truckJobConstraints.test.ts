import { describe, expect, it } from "vitest";
import type { Job } from "../data/types";
import {
  isAssignmentAllowed,
  isDriverAvailableForJobAssignment,
  isTruckAvailableForJobAssignment,
  resolveAssignmentMode,
} from "./truckJobConstraints";

/** Minimal job row for assignment rules (only id, truck, driver, status matter here). */
function j(partial: Pick<Job, "id" | "status"> & Partial<Job>): Job {
  return {
    reference: "r",
    client: "c",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 1000,
    totalPallets: 1,
    stops: [],
    pickupDeadline: "",
    deliveryDeadline: "",
    slaStatus: "on_track",
    rateEur: 100,
    createdAt: "",
    ...partial,
  } as Job;
}

describe("isTruckAvailableForJobAssignment", () => {
  it("allows the same job to keep planning on its truck while operational", () => {
    const jobs = [
      j({
        id: "J-A",
        status: "in_transit",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
    ];
    expect(isTruckAvailableForJobAssignment(jobs, "J-A", "t1")).toBe(true);
  });

  it("blocks a different backlog job from taking a truck that already has an operational haul", () => {
    const jobs = [
      j({
        id: "J-A",
        status: "in_transit",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
      j({ id: "J-B", status: "backlog" }),
    ];
    expect(isTruckAvailableForJobAssignment(jobs, "J-B", "t1")).toBe(false);
  });

  it("allows assignment when the only work on that truck is delivered (not operational)", () => {
    const jobs = [
      j({
        id: "J-OLD",
        status: "delivered",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
      j({ id: "J-NEW", status: "backlog" }),
    ];
    expect(isTruckAvailableForJobAssignment(jobs, "J-NEW", "t1")).toBe(true);
  });
});

describe("isDriverAvailableForJobAssignment", () => {
  it("allows the same job to keep planning with its driver while operational", () => {
    const jobs = [
      j({
        id: "J-A",
        status: "in_transit",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
    ];
    expect(isDriverAvailableForJobAssignment(jobs, "J-A", "d1")).toBe(true);
  });

  it("blocks a different backlog job from assigning a driver who already has an operational delivery", () => {
    const jobs = [
      j({
        id: "J-A",
        status: "loading",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
      j({ id: "J-B", status: "backlog" }),
    ];
    expect(isDriverAvailableForJobAssignment(jobs, "J-B", "d1")).toBe(false);
  });

  it("allows assignment when the driver’s previous job is delivered", () => {
    const jobs = [
      j({
        id: "J-OLD",
        status: "delivered",
        assignedTruckId: "t1",
        assignedDriverId: "d1",
      }),
      j({ id: "J-NEW", status: "backlog" }),
    ];
    expect(isDriverAvailableForJobAssignment(jobs, "J-NEW", "d1")).toBe(true);
  });
});

describe("isAssignmentAllowed / resolveAssignmentMode", () => {
  const jobs = [
    j({
      id: "J-A",
      status: "in_transit",
      assignedTruckId: "t1",
      assignedDriverId: "d1",
    }),
    j({ id: "J-B", status: "backlog" }),
  ];

  it("allows free truck+driver as operational assignment", () => {
    expect(isAssignmentAllowed(jobs, "J-B", "t2", "d2")).toBe(true);
    expect(resolveAssignmentMode(jobs, "J-B", "t2", "d2")).toBe("assigned");
  });

  it("rejects mismatched line (wrong truck for busy driver)", () => {
    expect(isAssignmentAllowed(jobs, "J-B", "t2", "d1")).toBe(false);
    expect(resolveAssignmentMode(jobs, "J-B", "t2", "d1")).toBe(null);
  });

  it("rejects mismatched line (wrong driver for busy truck)", () => {
    expect(isAssignmentAllowed(jobs, "J-B", "t1", "d2")).toBe(false);
    expect(resolveAssignmentMode(jobs, "J-B", "t1", "d2")).toBe(null);
  });

  it("allows same truck+driver as queued behind the active job", () => {
    expect(isAssignmentAllowed(jobs, "J-B", "t1", "d1")).toBe(true);
    expect(resolveAssignmentMode(jobs, "J-B", "t1", "d1")).toBe("queued");
  });
});
