import type { DragEvent } from "react";
import type { LocationRef } from "../../context/FleetDataContext";

export type CargoDragPayload = {
  itemId: string;
  from: LocationRef;
};

const MIME = "application/x-fleetlink-cargo";

export function setDragData(e: DragEvent, payload: CargoDragPayload) {
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.setData("text/plain", payload.itemId);
  e.dataTransfer.effectAllowed = "move";
}

export function getDragData(e: DragEvent): CargoDragPayload | null {
  const raw = e.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CargoDragPayload;
  } catch {
    return null;
  }
}

export function sameLocation(a: LocationRef, b: LocationRef) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "warehouse" && b.kind === "warehouse") return true;
  if (a.kind === "truck" && b.kind === "truck") return a.truckId === b.truckId;
  return false;
}
