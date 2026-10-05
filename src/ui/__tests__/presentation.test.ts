import { describe, expect, it } from "vitest";
import type { Job, JobStatus } from "../../data/types";
import { confirmPlan, transitionJob } from "../../domain/jobs/lifecycle";
import { index, makeDriver, makeJob, makeTruck, NOW } from "../../domain/__tests__/fixtures";
import { alertHref, paths } from "../../lib/appLinks";
import { legacyTarget } from "../../lib/legacyRoutes";
import { fmtClock, fmtDayLabel, fmtWhen, fmtWindow, stopWindowInDay, stopWindowText } from "../format";
import { DRIVER_STATE, JOB_STATUS, PLAN_STATUS, PROVENANCE, QUALIFICATION, TRUCK_STATE, toneVars } from "../status";
import {
  activeFilterCount,
  attentionReasons,
  boardColumnOf,
  EMPTY_FILTERS,
  groupCounts,
  inGroup,
  matchesFilters,
  nextCountdown,
  requestedStatusForDrop,
  sectionOf,
  sortWork,
} from "../work/workModel";

const truck = makeTruck();
const driver = makeDriver();
const res = index([truck], [driver]);
const refs = { truck: (id: string) => id === truck.id, driver: (id: string) => id === driver.id, trailer: () => false };
const at = (status: JobStatus, over: Partial<Job> = {}, id = `j-${status}`): Job => ({ ...makeJob(id), status, ...over });

describe("Work groups (mapped to the real lifecycle)", () => {
  const jobs = [at("backlog"), at("queued"), at("assigned"), at("loading"), at("in_transit"), at("delivered"), at("invoiced"), at("cancelled", {}, "c1")];
  it("each status lands in exactly one lifecycle group", () => {
    const c = groupCounts(jobs, NOW, refs);
    expect([c.all, c.unassigned, c.planned, c.active, c.completed, c.cancelled]).toEqual([8, 1, 2, 2, 2, 1]);
  });
  it("attention: replan, SLA, unresolved references, unassigned pickup within 24 h", () => {
    const late = new Date("2026-10-06T15:00:00Z");
    expect(attentionReasons(at("assigned", { planStatus: "REPLAN_REQUIRED" }), NOW, refs).map((r) => r.kind)).toContain("replan");
    expect(attentionReasons(at("assigned"), late, refs)[0]!.kind).toBe("sla_breached");
    expect(attentionReasons(at("assigned", { assignedTruckId: "ghost" }), NOW, refs).map((r) => r.kind)).toContain("unresolved");
    expect(attentionReasons(at("backlog"), new Date("2026-10-05T12:00:00Z"), refs).map((r) => r.kind)).toEqual(["pickup_soon_unassigned"]);
    expect(attentionReasons(at("delivered", { planStatus: "REPLAN_REQUIRED" }), late, refs)).toEqual([]); // finished work never nags
    expect(inGroup(at("assigned", { planStatus: "REPLAN_REQUIRED" }), "attention", NOW, refs)).toBe(true);
  });
  it("open work sorts by pickup; finished work after it", () => {
    const a = at("assigned", {}, "a");
    const d = at("delivered", {}, "d");
    expect(sortWork([d, a]).map((j) => j.id)).toEqual(["a", "d"]);
  });
});

describe("Work filters", () => {
  const j = makeJob();
  it("search is accent- and case-insensitive across number, reference, client and cities", () => {
    expect(matchesFilters(j, { ...EMPTY_FILTERS, q: "j-000001" }, NOW)).toBe(true);
    expect(matchesFilters(j, { ...EMPTY_FILTERS, q: "COIMBRA po-778" }, NOW)).toBe(true);
    expect(matchesFilters(j, { ...EMPTY_FILTERS, q: "porto" }, NOW)).toBe(false);
  });
  it("date scope uses Lisbon calendar days of the first pickup", () => {
    expect(matchesFilters(j, { ...EMPTY_FILTERS, date: "today" }, new Date("2026-10-06T06:00:00Z"))).toBe(true);
    expect(matchesFilters(j, { ...EMPTY_FILTERS, date: "tomorrow" }, new Date("2026-10-05T23:30:00Z"))).toBe(false); // 00:30 on the 6th in Lisbon
    expect(matchesFilters(j, { ...EMPTY_FILTERS, date: "tomorrow" }, new Date("2026-10-05T12:00:00Z"))).toBe(true);
  });
  it("resource / route filters and the active-filter count", () => {
    const assigned = { ...j, assignedTruckId: truck.id };
    expect(matchesFilters(assigned, { ...EMPTY_FILTERS, truckId: truck.id }, NOW)).toBe(true);
    expect(matchesFilters(j, { ...EMPTY_FILTERS, truckId: truck.id }, NOW)).toBe(false);
    expect(matchesFilters(j, { ...EMPTY_FILTERS, origin: "Braga", destination: "Lisboa" }, NOW)).toBe(true);
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: "x", origin: "Braga", replanOnly: true })).toBe(2);
  });
});

describe("Board drops only REQUEST a status — the lifecycle decides", () => {
  it("maps columns to one lifecycle step", () => {
    expect(boardColumnOf(at("queued"))).toBe("planned");
    expect(requestedStatusForDrop(at("assigned"), "active")).toBe("loading");
    expect(requestedStatusForDrop(at("loading"), "active")).toBeNull(); // same column → no-op
    expect(requestedStatusForDrop(at("in_transit"), "completed")).toBe("delivered");
    expect(requestedStatusForDrop(at("backlog"), "completed")).toBe("delivered");
  });
  it("an invalid drop is rejected by the domain with a readable reason; a valid one passes", () => {
    const backlog = makeJob("b1");
    const bad = transitionJob([backlog], "b1", requestedStatusForDrop(backlog, "completed")!, { now: NOW, resources: res });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors[0]).toMatch(/sem saltar etapas/);
    const planned = confirmPlan([backlog], "b1", { truckId: truck.id, driverId: driver.id, mode: "assigned", km: 1, durationMin: 1, costEur: 1 }, { now: NOW, resources: res });
    if (!planned.ok) throw new Error();
    const good = transitionJob(planned.value.jobs, "b1", requestedStatusForDrop(planned.value.jobs[0]!, "active")!, { now: NOW, resources: res });
    expect(good.ok && good.value.jobs[0]!.status).toBe("loading");
    const toBacklog = requestedStatusForDrop(planned.value.jobs[0]!, "unassigned");
    expect(transitionJob(planned.value.jobs, "b1", toBacklog!, { now: NOW, resources: res }).ok).toBe(true);
  });
});

describe("Date / time presentation is Lisbon wall-clock, never raw UTC", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  it("clock and relative day labels", () => {
    expect(fmtClock("2026-10-06T07:00:00Z")).toBe("08:00");
    expect(fmtWhen("2026-10-05T07:30:00Z", now)).toBe("08:30");
    expect(fmtWhen("2026-10-06T07:30:00Z", now)).toBe("Amanhã · 08:30");
    expect(fmtWhen("2026-10-07T07:30:00Z", now)).toBe("07 out · 08:30");
    expect(fmtDayLabel("2026-10-04T12:00:00Z", now)).toBe("Ontem");
    // 23:30 UTC on the 5th is already the 6th in Lisbon (summer time)
    expect(fmtWhen("2026-10-05T23:30:00Z", now)).toBe("Amanhã · 00:30");
  });
  it("windows: same-day compact, cross-day explicit, legacy undated labelled", () => {
    expect(fmtWindow("2026-10-06T08:00:00+01:00", "2026-10-06T09:00:00+01:00", now)).toBe("Amanhã · 08:00–09:00");
    expect(fmtWindow("2026-10-05T22:00:00+01:00", "2026-10-06T01:00:00+01:00", now)).toBe("22:00 – Amanhã · 01:00");
    expect(stopWindowText({ scheduledTime: "07:00", windowEnd: "09:00" }, now)).toBe("07:00–09:00 s/d");
    expect(stopWindowText({}, now)).toBe("sem janela");
  });
});

describe("Central status / provenance system", () => {
  it("every domain state has exactly one presentation", () => {
    for (const map of [JOB_STATUS, PLAN_STATUS, TRUCK_STATE, DRIVER_STATE, QUALIFICATION]) {
      for (const v of Object.values(map)) {
        expect(v.label.length).toBeGreaterThan(0);
        expect(toneVars(v.tone).fg).toMatch(/^var\(--/);
      }
    }
    expect(Object.keys(JOB_STATUS)).toHaveLength(8);
  });
  it("blocked/failed states are red, healthy green, unknown/inactive grey", () => {
    expect(TRUCK_STATE.OUT_OF_SERVICE.tone).toBe("danger");
    expect(TRUCK_STATE.AVAILABLE.tone).toBe("ok");
    expect(QUALIFICATION.EXPIRED.tone).toBe("danger");
    expect(QUALIFICATION.EXPIRING.tone).toBe("warn");
    expect(QUALIFICATION.MISSING.tone).toBe("neutral");
    expect(PLAN_STATUS.REPLAN_REQUIRED.tone).toBe("warn");
  });
  it("provenance kinds are distinct and none claims liveness", () => {
    const labels = Object.values(PROVENANCE).map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(PROVENANCE.MANUAL.title).toMatch(/não é telemetria/);
    expect(JSON.stringify(PROVENANCE)).not.toMatch(/ao vivo|tempo real|live/i);
  });
});

describe("Deep links", () => {
  it("alerts lead to the entity (never dead text)", () => {
    expect(alertHref({ id: "sla-J-1", entityType: "job", entityId: "J-1" })).toBe("/work?job=J-1");
    expect(alertHref({ id: "replan-J-1", entityType: "job", entityId: "J-1" })).toBe("/dispatch?job=J-1");
    expect(alertHref({ id: "q-d1-cpc", entityType: "driver", entityId: "d1" })).toBe("/drivers/d1?tab=qualifications");
    expect(alertHref({ id: "ref-J-1-truck", entityType: "job", entityId: "J-1" })).toBe("/work/J-1");
    expect(alertHref({ id: "docs-pending", entityType: "document", entityId: "pending" })).toBe("/documents?view=pending");
    expect(alertHref({ id: "unavail-t1", entityType: "truck", entityId: "t1" })).toBe("/fleet/trucks/t1");
  });
  it("entity URLs are encoded and stable", () => {
    expect(paths.job("J-4301~2", "stops")).toBe("/work/J-4301~2?tab=stops");
    expect(paths.workJob("a b")).toBe("/work?job=a%20b");
    expect(paths.trailer("tr-demo-1")).toBe("/fleet/trailers/tr-demo-1");
  });
});

describe("Old /app URLs redirect to the new routes", () => {
  it("maps pages and deep links", () => {
    expect(legacyTarget("/app", "")).toBe("/");
    expect(legacyTarget("/app/jobs", "?job=J-4201")).toBe("/work?job=J-4201");
    expect(legacyTarget("/app/fleet", "?truck=t1")).toBe("/fleet/trucks/t1");
    expect(legacyTarget("/app/drivers", "?driver=d2")).toBe("/drivers/d2");
    expect(legacyTarget("/app/map", "")).toBe("/");
    expect(legacyTarget("/app/dispatch", "?tab=cargo")).toBe("/dispatch");
  });
});

describe("Work visual model — countdown, sections, in-section windows", () => {
  it("countdown targets pickup until departure, then delivery; tone follows urgency", () => {
    const j = makeJob();
    const far = nextCountdown(j, new Date("2026-10-05T10:00:00Z"))!;
    expect([far.kind, far.tone]).toEqual(["pickup", "neutral"]);
    expect(far.label).toBe("recolha em 22 h");
    const soon = nextCountdown(j, new Date("2026-10-06T07:00:00Z"))!;
    expect(soon.tone).toBe("danger"); // pickup deadline 09:00 Lisbon = 08:00Z, 60 min away
    const late = nextCountdown(j, new Date("2026-10-06T10:00:00Z"))!;
    expect(late.label).toMatch(/^recolha atrasada/);
    expect(nextCountdown({ ...j, status: "in_transit" }, new Date("2026-10-06T10:00:00Z"))!.kind).toBe("delivery");
    expect(nextCountdown({ ...j, status: "delivered" }, NOW)).toBeNull();
  });
  it("sections: open work by Lisbon pickup day, finished work together", () => {
    expect(sectionOf(makeJob())).toBe("d:2026-10-06");
    expect(sectionOf({ ...makeJob(), status: "invoiced" })).toBe("done");
  });
  it("row windows drop the day when it matches the section heading", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    const s = { windowStartAt: "2026-10-06T08:00:00+01:00", windowEndAt: "2026-10-06T09:00:00+01:00" };
    expect(stopWindowInDay(s, "2026-10-06", now)).toBe("08:00–09:00");
    expect(stopWindowInDay(s, "2026-10-05", now)).toBe("Amanhã · 08:00–09:00");
    expect(stopWindowInDay({ scheduledTime: "07:00", windowEnd: "09:00" }, "2026-10-06", now)).toBe("07:00–09:00 s/d");
  });
});
