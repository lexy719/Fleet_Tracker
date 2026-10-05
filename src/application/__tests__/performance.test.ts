import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { deriveAlerts } from "../../domain/alerts";
import { makeDriver, makeJob, makeTruck } from "../../domain/__tests__/fixtures";
import { truckView } from "../../domain/fleet/trucks";
import { IdbOperationalStore, OPS_DB } from "../../repositories/operationalStore";
import { OperationsService } from "../operations";

/*
 * Performance MEASUREMENTS (printed) with generous ceilings — fake-indexeddb in Node is
 * slower than a browser's IndexedDB, so these are upper bounds, not browser figures.
 */

const N_JOBS = 2_000;
const N_TRUCKS = 200;
const N_DRIVERS = 250;

function ms(t0: number) {
  return Math.round((performance.now() - t0) * 10) / 10;
}

describe("operational core performance", () => {
  it(`load / write / derive with ${N_JOBS} jobs, ${N_TRUCKS} trucks, ${N_DRIVERS} drivers`, async () => {
    const factory = new IDBFactory();
    const store = await IdbOperationalStore.open(OPS_DB, factory);
    const trucks = Array.from({ length: N_TRUCKS }, (_, i) => makeTruck(`t${i}`, { plate: `PL-${i}` }));
    const drivers = Array.from({ length: N_DRIVERS }, (_, i) => makeDriver(`d${i}`, { name: `D ${i}` }));
    const jobs = Array.from({ length: N_JOBS }, (_, i) => ({
      ...makeJob(`j${i}`, {}, `J-${String(i + 1).padStart(6, "0")}`),
      ...(i % 3 === 0 ? { status: "assigned" as const, planStatus: "PLANNED" as const, assignedTruckId: `t${i % N_TRUCKS}`, assignedDriverId: `d${i % N_DRIVERS}` } : {}),
    }));

    let t0 = performance.now();
    await store.commit({ put: { jobs, trucks, drivers } });
    const seedMs = ms(t0);

    store.close();
    t0 = performance.now();
    const reopened = await IdbOperationalStore.open(OPS_DB, factory);
    const svc = new OperationsService(reopened);
    await svc.load();
    const loadMs = ms(t0);
    expect(svc.getState().jobs).toHaveLength(N_JOBS);

    t0 = performance.now();
    const r = await svc.transition("j3", "loading");
    const transitionMs = ms(t0);
    expect(r.ok).toBe(true);

    t0 = performance.now();
    const alerts = deriveAlerts(svc.getState(), new Date("2026-10-07T00:00:00Z"));
    const alertsMs = ms(t0);
    expect(alerts.length).toBeGreaterThan(0);

    t0 = performance.now();
    const views = svc.getState().trucks.map((t) => truckView(t, svc.getState().jobs, []));
    const viewsMs = ms(t0);
    expect(views).toHaveLength(N_TRUCKS);

    const report = { seedMs, loadMs, transitionMs, alertsMs, truckViewsMs: viewsMs };
    console.log("[perf] operational core (fake-indexeddb / node):", JSON.stringify(report));
    expect(loadMs).toBeLessThan(5_000);
    expect(transitionMs).toBeLessThan(1_000);
    expect(alertsMs).toBeLessThan(500);
    expect(viewsMs).toBeLessThan(1_000);
  }, 60_000);
});
