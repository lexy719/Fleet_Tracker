import { describe, expect, it } from "vitest";
import { cargoTotals, createJobFromDraft, editJob, jobToDraft, validateJobDraft } from "../jobs/jobDraft";
import { formatJobNumber, maxJobNumber, newId, parseJobNumber } from "../ids";
import { isoToLocal, localToIso } from "../time";
import { deriveSla } from "../jobs/sla";
import { bragaDraft, makeJob, NOW } from "./fixtures";

describe("ids", () => {
  it("UUIDs are unique and not derived from a counter", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => newId()));
    expect(ids.size).toBe(5_000);
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("job numbers are display values (format / parse / max over legacy + new)", () => {
    expect(formatJobNumber(4302)).toBe("J-004302");
    expect(parseJobNumber("J-4201")).toBe(4201);
    expect(parseJobNumber("J-DEMO-VCI")).toBeNull();
    expect(maxJobNumber(["J-4201", "J-004302", "J-DEMO-IP3", "x"])).toBe(4302);
  });
});

describe("Lisbon time", () => {
  it("summer local time → +01:00 instant and back", () => {
    expect(localToIso("2026-10-06T08:00")).toBe("2026-10-06T08:00:00+01:00");
    expect(isoToLocal("2026-10-06T07:00:00Z")).toBe("2026-10-06T08:00");
  });
  it("winter → +00:00; non-existent DST minute → null", () => {
    expect(localToIso("2026-12-01T08:00")).toBe("2026-12-01T08:00:00+00:00");
    expect(localToIso("2026-03-29T01:30")).toBeNull();
  });
});

describe("job drafts", () => {
  it("creates the acceptance job: 3 dated stops, derived totals, dated deadlines, departure", () => {
    const j = makeJob();
    expect(j.status).toBe("backlog");
    expect(j.planStatus).toBe("UNPLANNED");
    expect(j.jobNumber).toBe("J-000001");
    expect(j.stops.map((s) => s.type)).toEqual(["pickup", "stop", "delivery"]);
    expect(j.totalPallets).toBe(18);
    expect(j.totalWeightKg).toBe(12_400);
    expect(j.pickupDeadline).toBe("2026-10-06T09:00:00+01:00");
    expect(j.deliveryDeadline).toBe("2026-10-06T15:30:00+01:00");
    expect(j.plannedDepartureAt).toBe("2026-10-06T07:30:00+01:00");
    // legacy display clocks are derived, not authoritative
    expect(j.stops[0]!.scheduledTime).toBe("08:00");
    expect(j.stops[2]!.windowEnd).toBe("15:30");
    expect(j.revision).toBe(1);
  });

  it("emits JOB_CREATED", () => {
    const r = createJobFromDraft(bragaDraft(), { id: "x", jobNumber: "J-000009", now: NOW });
    expect(r.ok && r.value.events.map((e) => e.type)).toEqual(["JOB_CREATED"]);
  });

  it("validation: first stop pickup, a delivery, coordinates, ordered windows, cargo", () => {
    const d = bragaDraft();
    expect(validateJobDraft(d)).toEqual([]);
    expect(validateJobDraft({ ...d, stops: [d.stops[2]!, d.stops[0]!] }).join()).toMatch(/primeira paragem/);
    expect(validateJobDraft({ ...d, stops: [d.stops[0]!, d.stops[1]!] }).join()).toMatch(/entrega/);
    expect(validateJobDraft({ ...d, stops: [d.stops[0]!, { ...d.stops[2]!, lat: NaN }] }).join()).toMatch(/coordenadas/);
    expect(validateJobDraft({ ...d, stops: [d.stops[0]!, { ...d.stops[2]!, windowEndAt: "2026-10-06T13:00:00+01:00" }] }).join()).toMatch(/termina antes/);
    expect(validateJobDraft({ ...d, stops: [{ ...d.stops[0]!, windowStartAt: "2026-10-07T08:00:00+01:00", windowEndAt: "2026-10-07T09:00:00+01:00" }, d.stops[2]!] }).join()).toMatch(/ordem/);
    expect(validateJobDraft({ ...d, cargo: [] }).join()).toMatch(/linha de carga/);
    expect(validateJobDraft({ ...d, cargo: [{ description: "x", quantity: 1, unit: "unit", weightKg: 0 }] }).join()).toMatch(/peso total/);
  });

  it("cargo totals: pallets from unit=pallet quantity unless explicit", () => {
    expect(cargoTotals([
      { id: "a", description: "a", quantity: 10, unit: "pallet", weightKg: 1_000 },
      { id: "b", description: "b", quantity: 40, unit: "package", weightKg: 200, pallets: 2 },
      { id: "c", description: "c", quantity: 1, unit: "bulk", weightKg: 5_000, dangerousGoods: { unNumber: "UN1202" } },
    ])).toEqual({ weightKg: 6_200, pallets: 12, dangerous: true });
  });
});

describe("editing", () => {
  it("non-planning edit keeps the plan; planning edit invalidates it (REPLAN_REQUIRED + history)", () => {
    const planned = { ...makeJob(), status: "assigned" as const, planStatus: "PLANNED" as const, plannedKm: 380, routeCompliance: { report: {} } as never };
    const notesOnly = editJob(planned, { ...jobToDraft(planned), notes: "ligar antes" }, NOW);
    expect(notesOnly.ok && notesOnly.value.invalidated).toBe(false);
    expect(notesOnly.ok && notesOnly.value.job.planStatus).toBe("PLANNED");

    const d = jobToDraft(planned);
    const moved = editJob(planned, { ...d, stops: d.stops.map((s, i) => (i === 2 ? { ...s, windowStartAt: "2026-10-06T16:00:00+01:00", windowEndAt: "2026-10-06T17:00:00+01:00" } : s)) }, NOW);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.invalidated).toBe(true);
    expect(moved.value.job.planStatus).toBe("REPLAN_REQUIRED");
    expect(moved.value.job.plannedKm).toBeUndefined();
    expect(moved.value.job.routeCompliance).toBeUndefined();
    expect(moved.value.job.routeComplianceHistory).toHaveLength(1);
    expect(moved.value.events.map((e) => e.type)).toEqual(["JOB_EDITED", "ROUTE_INVALIDATED"]);
    expect(moved.value.job.revision).toBe(planned.revision + 1);
    expect(moved.value.job.deliveryDeadline).toBe("2026-10-06T17:00:00+01:00");
  });

  it("weight, departure and stop changes are all planning-relevant", () => {
    const planned = { ...makeJob(), status: "assigned" as const, planStatus: "PLANNED" as const };
    const d = jobToDraft(planned);
    const w = editJob(planned, { ...d, cargo: [{ ...d.cargo[0]!, weightKg: 9_000 }, d.cargo[1]!] }, NOW);
    expect(w.ok && w.value.planningChanges).toContain("peso da carga");
    const dep = editJob(planned, { ...d, plannedDepartureAt: "2026-10-06T06:30:00+01:00" }, NOW);
    expect(dep.ok && dep.value.planningChanges).toContain("partida planeada");
  });

  it("stop ids are stable across edits (completion state kept)", () => {
    const j = makeJob();
    const r = editJob(j, { ...jobToDraft(j), client: "Outro" }, NOW);
    expect(r.ok && r.value.job.stops.map((s) => s.id)).toEqual(j.stops.map((s) => s.id));
  });

  it("refuses edits once loading has started", () => {
    const j = { ...makeJob(), status: "loading" as const };
    expect(editJob(j, jobToDraft(j), NOW).ok).toBe(false);
  });
});

describe("SLA is derived", () => {
  it("on track / at risk / breached from dated deadlines", () => {
    const j = makeJob();
    expect(deriveSla(j, new Date("2026-10-05T10:00:00Z"))).toBe("on_track");
    expect(deriveSla(j, new Date("2026-10-06T13:00:00Z"))).toBe("at_risk"); // within 2 h, not in transit
    expect(deriveSla(j, new Date("2026-10-06T15:00:00Z"))).toBe("breached");
    expect(deriveSla({ ...j, status: "delivered" }, new Date("2026-10-07T00:00:00Z"))).toBe("on_track");
  });
});
