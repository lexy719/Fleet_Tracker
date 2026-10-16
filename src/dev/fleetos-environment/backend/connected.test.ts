import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { buildDemoSeed } from "../../../data/mockData";
import { OperationsService } from "../../../application/operations";
import { readEnvironment } from "../../../application/environmentQueries";
import {
  IdbOperationalStore,
  MemoryOperationalStore,
} from "../../../repositories/operationalStore";
import { environmentCommands } from "./runtime";
import {
  backConnected,
  contentConnected,
  currentFrame,
  frameKey,
  initialConnectedWorkspace,
  navigateConnected,
  replaceFrame,
} from "./workspace";

const now = new Date("2026-10-09T09:00:00Z");
describe("connected compositions", () => {
  it("keeps the source draft, filters and scroll when adding/removing context or following an object", () => {
    let w = initialConnectedWorkspace();
    w = replaceFrame(w, {
      ...currentFrame(w),
      query: "Lisboa",
      filter: "attention",
      drafts: { actual: { text: "draft", revision: 7 } },
      scroll: 190,
      detailScroll: 40,
    });
    const source = structuredClone(w);
    w = contentConnected(w, "Drivers");
    expect(currentFrame(w).active).toEqual(["Jobs", "Drivers"]);
    expect(w.tabs).toHaveLength(2);
    expect(w.tabs[0]).toEqual(source.tabs[0]);
    w = navigateConnected(
      w,
      { ...currentFrame(w), selected: { kind: "driver", id: "actual-driver" } },
      true,
    );
    w = contentConnected(w, "Trucks");
    expect(currentFrame(w).selected?.id).toBe("actual-driver");
    expect(currentFrame(w).active).toEqual(["Jobs", "Drivers", "Trucks"]);
    w = backConnected(backConnected(backConnected(w)));
    expect(currentFrame(w)).toEqual(currentFrame(source));
    w = contentConnected(contentConnected(w, "Drivers"), "Drivers");
    expect(currentFrame(w)).toEqual(currentFrame(source));
  });
  it("returning to a base collection reuses its tab without changing object identity", () => {
    let w = initialConnectedWorkspace();
    const collection = w.active;
    w = navigateConnected(
      w,
      { ...currentFrame(w), selected: { kind: "job", id: "stored-job" } },
      true,
    );
    const objectTab = w.active;
    w = contentConnected(w, "Jobs");
    expect(w.active).toBe(collection);
    expect(w.tabs.find((t) => t.id === objectTab)?.frame.selected?.id).toBe(
      "stored-job",
    );
    expect(w.tabs.every((t) => frameKey(t.frame) === t.id)).toBe(true);
  });
});
describe("operational writes", () => {
  it("persists instructions and events, rejecting stale edits across service instances", async () => {
    const store = await IdbOperationalStore.open(
      "connected-test",
      new IDBFactory(),
    );
    await store.commit({ put: buildDemoSeed(now.toISOString()) });
    const a = new OperationsService(store, () => now),
      b = new OperationsService(store, () => now);
    await Promise.all([a.load(), b.load()]);
    const job = a.getState().jobs[0];
    expect(
      (
        await environmentCommands(a).notes(
          job.id,
          job.revision,
          "Access gate B",
        )
      ).ok,
    ).toBe(true);
    const stale = await environmentCommands(b).notes(
      job.id,
      job.revision,
      "Obsolete draft",
    );
    expect(stale.ok).toBe(false);
    const reloaded = new OperationsService(store, () => now);
    await reloaded.load();
    const stored = reloaded.getState().jobs.find((j) => j.id === job.id)!;
    expect(stored.notes).toBe("Access gate B");
    expect(stored.revision).toBe(job.revision + 1);
    expect(
      (await store.listEvents(job.id)).filter(
        (e) => e.type === "NOTES_UPDATED",
      ),
    ).toHaveLength(1);
    store.close();
  });
  it("serializes same-revision writes and preserves the service's stop/status validation", async () => {
    const store = new MemoryOperationalStore();
    await store.commit({ put: buildDemoSeed(now.toISOString()) });
    const svc = new OperationsService(store, () => now);
    await svc.load();
    const commands = environmentCommands(svc),
      job = svc.getState().jobs.find((j) => j.status === "backlog")!;
    const results = await Promise.all([
      commands.notes(job.id, job.revision, "first"),
      commands.notes(job.id, job.revision, "second"),
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    const current = svc.getState().jobs.find((j) => j.id === job.id)!;
    expect(
      (await commands.stop(job.id, current.revision, current.stops[0].id, true))
        .ok,
    ).toBe(false);
    expect(
      (await commands.transition(job.id, current.revision, "delivered")).ok,
    ).toBe(false);
    expect(svc.getState().jobs.find((j) => j.id === job.id)?.notes).toBe(
      "first",
    );
  });
});
describe("backend read model", () => {
  it("uses only the supplied records, orders commitments, and leaves absent execution unknown", async () => {
    const store = new MemoryOperationalStore();
    await store.commit({ put: buildDemoSeed(now.toISOString()) });
    const snapshot = await store.loadAll();
    const job = snapshot.jobs[0];
    job.assignedDriverId = "unresolved-reference";
    delete job.operationalPlan;
    delete job.routeCompliance;
    job.notes = "Backend instruction";
    const read = readEnvironment(snapshot, now),
      row = read.jobs.find((r) => r.job.id === job.id)!;
    expect(row.driver).toBeUndefined();
    expect(row.job.notes).toBe("Backend instruction");
    expect(row.issues.some((i) => i.domain === "Drivers")).toBe(true);
    expect(read.queries.getOperationalTimeline(job.id).timeline).toBeNull();
    expect(read.drivers).toHaveLength(
      snapshot.drivers.filter((d) => !d.archivedAt).length,
    );
    expect(
      read.drivers.every((d) =>
        d.jobs.every((j) => j.active && j.job.assignedDriverId === d.driver.id),
      ),
    ).toBe(true);
    expect(snapshot.jobs[0].notes).toBe("Backend instruction");
  });
});
