import { describe, expect, it } from "vitest";
import { BENCH_SIZES, bragancaInstance } from "../bench/bragancaInstance";
import { scheduleRoute } from "../crewSchedule";
import type { Instance, Load, Pin, Solution } from "../model";
import { replan, type ReplanEvent, type ReplanResult } from "../replan";
import { solveWeek } from "../solver";
import { H, W, checkPlan, crew, load, routeOf, week } from "./kit";
import { pastChanges } from "./replanHelpers";

/*
 * Replanning a running week, as trap weeks. On every replan: what already happened is the same
 * minute for minute, loads under way stay first with their crew, pins hold, every week is legal,
 * and the plan changes as little as it can.
 */

function check(inst: Instance, base: Solution, nowMs: number, r: ReplanResult, pins: Pin[] = []) {
  checkPlan(r.instance, r.plan, pins);
  expect(pastChanges(inst, base, r.instance, r.plan, nowMs)).toEqual([]);
}

/**
 * Two crews at Bragança. One of them (X) does a1 Bragança → Porto from 06:00, then a2 Mirandela →
 * Bragança (pickup 13:00–16:00); the other (Y) stays home. At 09:00 X is driving a1 to Porto.
 */
function twoCrews(over: Partial<Record<"a1" | "a2", Partial<Load>>> = {}) {
  const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], [load("a1", "Braganca", "Porto", 0, 2, over.a1), load("a2", "Mirandela", "Braganca", 7, 10, over.a2)]);
  const base = solveWeek(inst, { iterations: 50 });
  const X = base.routes.find((r) => r.loadIds.length)!.crewId, Y = X === "A" ? "B" : "A";
  expect(routeOf(base, X)).toEqual(["a1", "a2"]);
  return { inst, base, X, Y };
}
const NINE = W + 3 * H;

describe("replanning: nothing happened", () => {
  it("the plan stays exactly as it was", () => {
    const { inst, base } = twoCrews();
    const r = replan(inst, base, NINE, []);
    check(inst, base, NINE, r);
    expect(r.plan.routes).toEqual(base.routes);
    expect(r.stability).toEqual({ moved: [], newlyDone: [], crewsTouched: [] });
  });

  it("on the Bragança S week on Tuesday 12:00, too", () => {
    const inst = bragancaInstance(BENCH_SIZES[0]!), base = solveWeek(inst, { iterations: 200 }), now = W + 30 * H;
    const r = replan(inst, base, now, []);
    check(inst, base, now, r);
    expect(r.stability.crewsTouched).toEqual([]);
  });
});

describe("replanning: a crew is delayed", () => {
  it("4 h stuck on the way to Porto: the next load no longer fits and goes to the other crew; the rest stays", () => {
    const { inst, base, X, Y } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "delay", crewId: X, hours: 4 }]);
    check(inst, base, NINE, r);
    expect(routeOf(r.plan, X)).toEqual(["a1"]);
    expect(routeOf(r.plan, Y)).toEqual(["a2"]);
    expect(r.stability.moved).toEqual([{ loadId: "a2", from: X, to: Y }]);
    expect(r.frozen[X]).toEqual(["a1"]);
    const c = r.instance.crews.find((x) => x.id === X)!;
    const s = scheduleRoute(c, [r.instance.loads.find((l) => l.id === "a1")!], r.instance.travel, true)!;
    expect(s.activities!.find((a) => a.note === "atraso")!.startMs).toBe(NINE);
  });

  it("the delivery under way will be late: the plan keeps it, widens the window and says when it arrives", () => {
    const { inst, base, X } = twoCrews({ a1: { deliveryEndMs: W + 6 * H } });
    const r = replan(inst, base, NINE, [{ kind: "delay", crewId: X, hours: 4 }]);
    check(inst, base, NINE, r);
    expect(routeOf(r.plan, X)[0]).toBe("a1");
    const note = r.notes.find((n) => n.code === "LATE_DELIVERY")!;
    expect(note).toMatchObject({ crewId: X, loadId: "a1" });
    expect(note.text).toMatch(/a1 vai chegar depois da janela: seg \d\d:\d\d \(fecha seg 12:00\); avisar o cliente/);
  });

  it("as waiting time instead of driving, when the dispatcher knows the truck is standing still", () => {
    const { inst, base, X } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "delay", crewId: X, hours: 1, as: "waiting" }]);
    check(inst, base, NINE, r);
    expect(routeOf(r.plan, X)).toEqual(["a1", "a2"]);
  });
});

describe("replanning: a truck breaks down", () => {
  it("with a load on board: the load is stranded and reported, the next one moves, the truck does nothing after", () => {
    const { inst, base, X, Y } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "breakdown", crewId: X }]);
    check(inst, base, NINE, r);
    expect(r.stranded).toEqual(["a1"]);
    expect(r.notes.find((n) => n.code === "STRANDED")!.text).toContain("precisa de resgate");
    expect(routeOf(r.plan, X)).toEqual([]);
    expect(routeOf(r.plan, Y)).toEqual(["a2"]);
    const c = r.instance.crews.find((x) => x.id === X)!;
    expect(scheduleRoute(c, [], r.instance.travel, true)!.activities!.every((a) => a.endMs <= NINE)).toBe(true);
  });

  it("booked into the workshop at noon: it finishes what ends before, the rest moves", () => {
    const { inst, base, X, Y } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "breakdown", crewId: X, fromMs: W + 6 * H }]);
    check(inst, base, NINE, r);
    expect(r.stranded).toEqual([]);
    expect(routeOf(r.plan, X)).toEqual(["a1"]);
    expect(routeOf(r.plan, Y)).toEqual(["a2"]);
  });
});

describe("replanning: loads come and go", () => {
  it("a new load goes to the crew with room, without touching the others", () => {
    const { inst, base, X, Y } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "newLoad", load: load("nova", "Braganca", "Zamora", 4, 8) }]);
    check(inst, base, NINE, r);
    expect(routeOf(r.plan, Y)).toEqual(["nova"]);
    expect(routeOf(r.plan, X)).toEqual(["a1", "a2"]);
    expect(r.stability.crewsTouched).toEqual([Y]);
  });

  it("a cancelled load leaves the plan; a load already on the truck cannot be cancelled and is reported", () => {
    const { inst, base, X } = twoCrews();
    const r = replan(inst, base, NINE, [{ kind: "cancel", loadId: "a2" }, { kind: "cancel", loadId: "a1" }]);
    check(inst, base, NINE, r);
    expect(routeOf(r.plan, X)).toEqual(["a1"]);
    expect(r.instance.loads.map((l) => l.id)).toEqual(["a1"]);
    expect(r.notes.map((n) => [n.code, n.loadId])).toEqual([["CANCEL_RUNNING", "a1"]]);
  });

  it("cancelling the load a crew is already driving to: it gets there (the past stays), then goes home", () => {
    const { inst, base, X } = twoCrews();
    const eleven = W + 5.5 * H; // a1 delivered in Porto at ~11:04: at 11:30 X is on the way to Mirandela
    const r = replan(inst, base, eleven, [{ kind: "cancel", loadId: "a2" }]);
    check(inst, base, eleven, r);
    expect(routeOf(r.plan, X)).toEqual(["a1"]);
    const c = r.instance.crews.find((x) => x.id === X)!;
    expect(c.replan!.thenTo!.note).toBe("vazio para Mirandela");
  });
});

describe("replanning keeps the dispatcher's pins", () => {
  it("a pinned crew stays pinned through a delay and a new load", () => {
    const pins: Pin[] = [{ kind: "assign", loadId: "a2", crewId: "A" }, { kind: "forbid", loadId: "nova", crewId: "B" }];
    const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], [load("a1", "Braganca", "Porto", 0, 2), load("a2", "Mirandela", "Braganca", 7, 10)]);
    const base = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, base, pins);
    const events: ReplanEvent[] = [{ kind: "delay", crewId: "A", hours: 1 }, { kind: "newLoad", load: load("nova", "Braganca", "Zamora", 4, 8) }];
    const r = replan(inst, base, NINE, events, { pins });
    check(inst, base, NINE, r, pins);
    expect(routeOf(r.plan, "A")).toContain("a2");
    expect(routeOf(r.plan, "B")).not.toContain("nova");
  });

  it("a pin to a crew that broke down cannot hold: reported, and the load is not quietly moved", () => {
    const pins: Pin[] = [{ kind: "assign", loadId: "a2", crewId: "A" }];
    const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], [load("a1", "Braganca", "Porto", 0, 2), load("a2", "Mirandela", "Braganca", 7, 10)]);
    const base = solveWeek(inst, { iterations: 50, pins });
    const r = replan(inst, base, NINE, [{ kind: "breakdown", crewId: "A" }], { pins });
    check(inst, base, NINE, r, pins);
    expect(r.plan.unassigned).toContain("a2");
    expect(r.plan.pinIssues!.map((i) => i.code)).toEqual(["OUT_OF_SERVICE"]);
  });
});

describe("replanning the large Bragança week (100 crews, generated data)", () => {
  const inst = bragancaInstance(BENCH_SIZES[2]!), now = W + 30 * H;
  const base = solveWeek(inst, { iterations: 100 });
  const fresh = bragancaInstance({ ...BENCH_SIZES[2]!, seed: 4242 }).loads.filter((l) => l.pickupStartMs > now + 2 * H).slice(0, 3);

  it.each(fresh.map((l, i) => [i + 1, { ...l, id: `N${i + 1}` }] as const))("new load %i: under 3 s, at most 3 crews change", (_, nova) => {
    const r = replan(inst, base, now, [{ kind: "newLoad", load: nova }]);
    expect(r.runtimeMs).toBeLessThan(3000);
    check(inst, base, now, r);
    expect(r.stability.crewsTouched.length).toBeLessThanOrEqual(3);
  });

  it("a breakdown: under 3 s, legal, the crew's loads go elsewhere or are explained", () => {
    const hit = base.routes.find((r) => r.loadIds.length >= 4)!;
    const r = replan(inst, base, now, [{ kind: "breakdown", crewId: hit.crewId }]);
    expect(r.runtimeMs).toBeLessThan(3000);
    check(inst, base, now, r);
    for (const id of hit.loadIds.filter((id) => !r.frozen[hit.crewId]?.includes(id) && !r.stranded.includes(id)))
      expect(r.plan.routes.some((x) => x.loadIds.includes(id)) || !!r.plan.why?.[id]).toBe(true);
  });
});
