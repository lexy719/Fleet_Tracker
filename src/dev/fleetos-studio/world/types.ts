// The studio reads one world per page load. Two implementations:
//  · lab — the environment lab's synthetic world (recorded TomTom geometry, invented people)
//  · ops — the application's operational store (OperationsService), read through readEnvironment
// Everything the UI shows comes through this shape, so a source can be swapped without
// touching presentation code.
import type {
  AttentionItem,
  DriverWorld,
  RecordedRoute,
  TrailerWorld,
  TruckWorld,
  WorldJob,
} from "../../fleetos-environment/world";
import type { Point } from "../../fleetos-environment/mapTypes";
import type { OperationsService } from "../../../application/operations";
import type { Customer, Site } from "../../../data/types";

export type { AttentionItem, DriverWorld, RecordedRoute, TrailerWorld, TruckWorld, WorldJob, Point };

export type StudioRoute = RecordedRoute & {
  /** false = straight line between stops: no road geometry is recorded for this transport yet. */
  recorded: boolean;
  /** Road geometry from TomTom for display only — no plan has been confirmed for it yet. */
  preview?: boolean;
};

export type StudioWorld = {
  source: "lab" | "ops";
  /** Human description of where the data comes from (shown in the UI). */
  label: string;
  now: { label: string; clock: string; min: number };
  /** Minutes of the day shown on the timeline. */
  day: { start: number; end: number };
  jobs: WorldJob[];
  routes: Record<string, StudioRoute>;
  drivers: { id: string; where: string }[];
  driver: (id: string) => DriverWorld;
  trucks: TruckWorld[];
  truck: (id: string) => TruckWorld;
  trailers: TrailerWorld[];
  trailer: (id: string) => TrailerWorld | null;
  /** Named places (cities, depots) used to place people and parked equipment. */
  places: Record<string, Point>;
  /** Known positions of trucks that are not on a transport (parked / free). */
  truckPositions: Record<string, Point>;
  attention: AttentionItem[];
  /** Map bounds that frame the whole operation. */
  bounds: [[number, number], [number, number]];
  /** Days from today of a stop's window (store windows are dated; lab windows are today). */
  stopDay?: (jobId: string, stopId: string) => number;
  /** ops only: display id → store id, for commands. */
  storeIds?: Record<string, string>;
  /** ops only: transports still drawn as straight lines whose road geometry can be fetched. */
  roadsToFetch?: { key: string; stops: { lat: number; lng: number }[] }[];
  /** ops only: the application's service (real commands) and the records forms pick from. */
  ops?: { service: OperationsService; customers: Customer[]; sites: Site[]; persistent: boolean };
};
