import { describe, expect, it } from "vitest";
import { checkAssignment } from "../assignments/assignment";
import { driverHoursForPlanning, driverOperationalState, driverQualifications, validateDriver } from "../drivers/drivers";
import { routingProfileForTruck } from "../fleet/routingProfile";
import { trailerOperationalState, validateTrailer } from "../fleet/trailers";
import { createTruck, truckOperationalState, truckView, updateTruck, validateTruck } from "../fleet/trucks";
import { archiveBlockers, deleteBlockers, unresolvedReferences } from "../integrity";
import { deriveAlerts } from "../alerts";
import { driverDraft, makeDriver, makeJob, makeTrailer, makeTruck, NOW, trailerDraft, truckDraft } from "./fixtures";

describe("trucks", () => {
  it("validates plausible ranges, unique active plate, tare < GVW", () => {
    expect(validateTruck(truckDraft())).toEqual([]);
    expect(validateTruck(truckDraft({ plate: " " })).join()).toMatch(/Matrícula/);
    expect(validateTruck(truckDraft({ heightM: 9 })).join()).toMatch(/Altura/);
    expect(validateTruck(truckDraft({ axleCount: 2.5 })).join()).toMatch(/eixos/);
    expect(validateTruck(truckDraft({ kerbWeightKg: 41_000 })).join()).toMatch(/tara/i);
    const other = makeTruck("t-x");
    expect(validateTruck(truckDraft({ plate: "aa 11 bb" }), [other]).join()).toMatch(/matrícula/);
    expect(validateTruck(truckDraft(), [{ ...other, archivedAt: NOW.toISOString() }])).toEqual([]);
  });
  it("update keeps demo / archive markers and creation time", () => {
    const t = { ...makeTruck(), isDemo: true, demoPurpose: "regulatory-test" };
    const r = updateTruck(t, truckDraft({ model: "FH 540" }), { now: new Date("2026-10-05T00:00:00Z"), others: [] });
    expect(r.ok && [r.value.truck.isDemo, r.value.truck.demoPurpose, r.value.truck.createdAt, r.value.truck.model]).toEqual([true, "regulatory-test", NOW.toISOString(), "FH 540"]);
  });
  it("operational state: manual availability wins; ASSIGNED / IN_SERVICE derived from jobs", () => {
    const t = makeTruck();
    const j = { ...makeJob(), assignedTruckId: t.id, status: "assigned" as const };
    expect(truckOperationalState(t, [])).toBe("AVAILABLE");
    expect(truckOperationalState(t, [j])).toBe("ASSIGNED");
    expect(truckOperationalState(t, [{ ...j, status: "in_transit" }])).toBe("IN_SERVICE");
    expect(truckOperationalState({ ...t, availability: "MAINTENANCE" }, [j])).toBe("MAINTENANCE");
    expect(truckOperationalState({ ...t, archivedAt: "x" }, [j])).toBe("ARCHIVED");
  });
  it("view: no telemetry → position UNKNOWN (null), never invented; load from job cargo", () => {
    const t = makeTruck();
    const v = truckView(t, [{ ...makeJob(), assignedTruckId: t.id, status: "in_transit" }]);
    expect([v.lat, v.lng, v.positionSource, v.fuelPct]).toEqual([null, null, "UNKNOWN", null]);
    expect(v.currentWeightKg).toBe(12_400);
  });
  it("routing profile uses the record; generic preset fills ONLY missing values (reported)", () => {
    const full = routingProfileForTruck(makeTruck("a", { lengthM: 16.5, widthM: 2.55, maxAxleWeightKg: 11_500 }));
    expect(full.preset.vehicleHeight).toBe(4);
    expect(full.preset.maxGrossWeightKg).toBe(40_000);
    expect(full.assumed).toEqual([]);
    const sparse = routingProfileForTruck(makeTruck("b", { heightM: undefined, lengthM: undefined }));
    expect(sparse.assumed.join()).toMatch(/altura/);
    expect(sparse.fallbackPresetId).toBe("artic-40");
    expect(routingProfileForTruck(makeTruck("c", { vehicleType: "RIGID" })).fallbackPresetId).toBe("rigid-18");
  });
  it("create emits RESOURCE_CREATED", () => {
    const r = createTruck(truckDraft(), { id: "n", now: NOW, others: [] });
    expect(r.ok && r.value.events[0]!.type).toBe("RESOURCE_CREATED");
  });
});

describe("trailers", () => {
  it("validation and derived state", () => {
    expect(validateTrailer(trailerDraft())).toEqual([]);
    expect(validateTrailer(trailerDraft({ type: "OTHER" })).join()).toMatch(/tipo/);
    expect(validateTrailer(trailerDraft({ capabilities: { tempMinC: -20 } })).join()).toMatch(/frigoríficos/);
    expect(validateTrailer(trailerDraft({ tareKg: 50_000, maxGrossWeightKg: 39_000 })).join()).toMatch(/Tara|tara/);
    const tr = makeTrailer();
    expect(trailerOperationalState(tr, [{ ...makeJob(), assignedTrailerId: tr.id, status: "loading" }])).toBe("IN_SERVICE");
  });
});

describe("drivers", () => {
  it("validation: categories, dates, hours baseline", () => {
    expect(validateDriver(driverDraft(), NOW)).toEqual([]);
    expect(validateDriver(driverDraft({ licence: { categories: ["Z"] } }), NOW).join()).toMatch(/desconhecidas/);
    expect(validateDriver(driverDraft({ cpc: { expiresOn: "31/12/2027" } }), NOW).join()).toMatch(/data inválida/);
    expect(validateDriver(driverDraft({ hours: { drivenTodayMin: 300, drivenWeekMin: 100, recordedAt: NOW.toISOString(), source: "MANUAL" } }), NOW).join()).toMatch(/semana/);
    expect(validateDriver(driverDraft({ hours: { drivenTodayMin: 0, drivenWeekMin: 0, recordedAt: "2026-10-05T10:00:00Z", source: "MANUAL" } }), NOW).join()).toMatch(/futuro/);
  });
  it("qualifications: VALID / EXPIRING (≤60 d) / EXPIRED / MISSING / NOT_HELD", () => {
    const d = makeDriver("d", { licence: { categories: ["CE"], expiresOn: "2026-11-01" }, cpc: {}, tachoCardExpiresOn: "2026-01-01" });
    const q = Object.fromEntries(driverQualifications(d, NOW).map((x) => [x.kind, x.state]));
    expect(q).toEqual({ licence: "EXPIRING", cpc: "MISSING", adr: "NOT_HELD", tacho: "EXPIRED" });
  });
  it("EU 561 hours: baseline counts only for its own day/week; otherwise 0 with a note", () => {
    const d = makeDriver(); // recorded 2026-10-04 (Sunday) 10:00 Lisbon: 2 h today, 20 h week
    const same = driverHoursForPlanning(d, Date.parse("2026-10-04T15:00:00Z"));
    expect([same.hoursToday, same.hoursWeek, same.todayKnown, same.notes]).toEqual([2, 20, true, []]);
    const nextWeek = driverHoursForPlanning(d, Date.parse("2026-10-06T06:30:00Z")); // Tuesday, new ISO week
    expect([nextWeek.hoursToday, nextWeek.hoursWeek, nextWeek.todayKnown, nextWeek.weekKnown]).toEqual([0, 0, false, false]);
    expect(nextWeek.notes.length).toBe(2);
    const none = driverHoursForPlanning(makeDriver("x", { hours: null }), NOW.getTime());
    expect(none.notes.join()).toMatch(/desconhecido/);
  });
  it("derived state", () => {
    const d = makeDriver();
    expect(driverOperationalState(d, [{ ...makeJob(), assignedDriverId: d.id, status: "in_transit" }])).toBe("ON_JOB");
    expect(driverOperationalState({ ...d, availability: "LEAVE" }, [])).toBe("LEAVE");
  });
});

describe("assignment checks", () => {
  const job = makeJob();
  it("valid pair → mode assigned, no blockers", () => {
    const r = checkAssignment({ jobs: [job], job, truck: makeTruck(), driver: makeDriver(), now: NOW });
    expect(r.blockers).toEqual([]);
    expect(r.mode).toBe("assigned");
  });
  it("blocks unavailable / archived resources and overweight", () => {
    expect(checkAssignment({ jobs: [job], job, truck: { ...makeTruck(), availability: "MAINTENANCE" }, driver: makeDriver(), now: NOW }).blockers.join()).toMatch(/manutenção/);
    expect(checkAssignment({ jobs: [job], job, truck: makeTruck(), driver: { ...makeDriver(), availability: "LEAVE" }, now: NOW }).blockers.join()).toMatch(/ausente/);
    expect(checkAssignment({ jobs: [job], job, truck: makeTruck("t", { payloadKg: 10_000 }), driver: makeDriver(), now: NOW }).blockers.join()).toMatch(/excede/);
    expect(checkAssignment({ jobs: [job], job, truck: makeTruck(), driver: makeDriver(), trailerId: "ghost", now: NOW }).blockers.join()).toMatch(/não existe/);
  });
  it("trailer payload overrides truck payload; qualification gaps are warnings (Phase 6 enforces)", () => {
    const r = checkAssignment({ jobs: [job], job, truck: makeTruck("t", { payloadKg: 10_000 }), driver: makeDriver("d", { cpc: { expiresOn: "2026-01-01" } }), trailer: makeTrailer(), now: NOW });
    expect(r.blockers).toEqual([]);
    expect(r.warnings.join()).toMatch(/caducado/);
  });
  it("busy driver on another truck → invalid line", () => {
    const busy = { ...makeJob("other", {}, "J-000002"), status: "in_transit" as const, assignedTruckId: "t-other", assignedDriverId: "driver-1" };
    const r = checkAssignment({ jobs: [job, busy], job, truck: makeTruck(), driver: makeDriver(), now: NOW });
    expect(r.mode).toBeNull();
    expect(r.blockers.join()).toMatch(/J-000002/);
  });
});

describe("referential integrity + derived alerts", () => {
  it("unresolved references are reported (and preserved), archive/delete guarded", () => {
    const j = { ...makeJob(), status: "assigned" as const, assignedTruckId: "gone", assignedDriverId: "driver-1" };
    const refs = unresolvedReferences([j], [], [makeDriver()], []);
    expect(refs).toEqual([{ jobId: "job-1", jobNumber: "J-000001", kind: "truck", refId: "gone" }]);
    expect(archiveBlockers([j], "driver", "driver-1").join()).toMatch(/J-000001/);
    expect(deleteBlockers([{ ...j, status: "invoiced" }], "driver", "driver-1").join()).toMatch(/Arquive/);
    expect(deleteBlockers([], "driver", "driver-1")).toEqual([]);
  });
  it("alerts derive from records (no static list)", () => {
    const j = { ...makeJob(), status: "assigned" as const, assignedTruckId: "gone", planStatus: "REPLAN_REQUIRED" as const };
    const alerts = deriveAlerts({ jobs: [j], trucks: [], drivers: [makeDriver("d", { cpc: { expiresOn: "2026-01-01" } })], trailers: [] }, new Date("2026-10-07T00:00:00Z"));
    const ids = alerts.map((a) => a.id.split("-")[0]);
    expect(ids).toEqual(expect.arrayContaining(["sla", "replan", "ref", "q"]));
    // Broken reference blocks work; it sorts first. Expired qualification and replan need a person.
    expect(alerts[0]!.severity).toBe("BLOCKER");
    expect(alerts.find((a) => a.id.startsWith("replan"))!.severity).toBe("ACTION_REQUIRED");
    expect(alerts.find((a) => a.id.startsWith("q-"))!.severity).toBe("ACTION_REQUIRED");
  });
});
