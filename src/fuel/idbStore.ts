import type { FuelSourceState, FuelStore } from "./collector";
import type { FuelPriceObservation, FuelStation } from "./types";

/*
 * Fuel persistence in IndexedDB (separate DB from ingestion). Stations and current prices are
 * stored per source as one record each; superseded prices go to an append-only history,
 * capped so a browser profile cannot grow without bound.
 */

export const FUEL_DB = "fleetos-fuel";
export const FUEL_SCHEMA_VERSION = 1;
export const HISTORY_KEPT = 250_000;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

type StoreName = "state" | "stations" | "prices" | "history";

export class IdbFuelStore implements FuelStore {
  private dbp: Promise<IDBDatabase>;

  constructor(name = FUEL_DB) {
    this.dbp = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, FUEL_SCHEMA_VERSION);
      open.onupgradeneeded = (ev) => {
        const db = open.result;
        if ((ev.oldVersion ?? 0) < 1) {
          db.createObjectStore("state", { keyPath: "sourceId" });
          db.createObjectStore("stations", { keyPath: "sourceId" });
          db.createObjectStore("prices", { keyPath: "sourceId" });
          db.createObjectStore("history", { autoIncrement: true });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error("IndexedDB de combustível bloqueada por outro separador"));
    });
  }

  private async os(store: StoreName, mode: IDBTransactionMode = "readonly") {
    return (await this.dbp).transaction(store, mode).objectStore(store);
  }

  async getState(id: string) { return (await req((await this.os("state")).get(id))) as FuelSourceState | undefined; }
  async putState(s: FuelSourceState) { await req((await this.os("state", "readwrite")).put(s)); }
  async getStations(id: string) { return ((await req((await this.os("stations")).get(id))) as { items: FuelStation[] } | undefined)?.items ?? []; }
  async putStations(id: string, items: FuelStation[]) { await req((await this.os("stations", "readwrite")).put({ sourceId: id, items })); }
  async getCurrentPrices(id: string) { return ((await req((await this.os("prices")).get(id))) as { items: FuelPriceObservation[] } | undefined)?.items ?? []; }
  async putCurrentPrices(id: string, items: FuelPriceObservation[]) { await req((await this.os("prices", "readwrite")).put({ sourceId: id, items })); }
  async appendHistory(observations: FuelPriceObservation[]) {
    if (!observations.length) return;
    const st = await this.os("history", "readwrite");
    for (const o of observations) st.add(o);
    const count = await req(st.count());
    if (count > HISTORY_KEPT) {
      const keys = (await req(st.getAllKeys(null, count - HISTORY_KEPT))) as IDBValidKey[];
      for (const k of keys) st.delete(k);
    }
  }
  async historyCount() { return req((await this.os("history")).count()); }
}
