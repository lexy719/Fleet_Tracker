import { newId } from "./ids";

/*
 * Append-only operational history. Records what changed, when, why and through which
 * channel. There is no authentication yet, so the actor is the channel ("LOCAL_USER" =
 * someone using this browser) — never an invented person.
 */

export type EntityType = "job" | "truck" | "trailer" | "driver" | "customer" | "site" | "document";
export type EventSource = "LOCAL_USER" | "SYSTEM" | "MIGRATION" | "DEMO_SEED";

export type OperationalEventType =
  | "JOB_CREATED"
  | "JOB_EDITED"
  | "ROUTE_PLANNED"
  | "ROUTE_INVALIDATED"
  | "STATUS_CHANGED"
  | "ASSIGNMENT_CHANGED"
  | "STOP_UPDATED"
  | "JOB_CANCELLED"
  | "NOTES_UPDATED"
  | "RESOURCE_CREATED"
  | "RESOURCE_UPDATED"
  | "RESOURCE_ARCHIVED"
  | "RESOURCE_RESTORED"
  | "RESOURCE_DELETED"
  | "DOCUMENT_ISSUED"
  | "DOCUMENT_VOIDED"
  | "MIGRATED"
  | "DEMO_SEEDED";

export interface OperationalEvent {
  id: string;
  entityType: EntityType;
  entityId: string;
  type: OperationalEventType;
  at: string;
  source: EventSource;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  data?: Record<string, unknown>;
  /** Creation order within this session — orders events that share the same `at`. */
  seq?: number;
}

let seq = 0;
export function makeEvent(e: Omit<OperationalEvent, "id" | "seq">): OperationalEvent {
  return { id: newId(), seq: ++seq, ...e };
}

/** Chronological order: instant, then creation sequence. */
export function compareEvents(a: OperationalEvent, b: OperationalEvent): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : (a.seq ?? 0) - (b.seq ?? 0);
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(...errors: string[]): Result<T> => ({ ok: false, errors });
