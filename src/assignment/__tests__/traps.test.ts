import { describe, expect, it } from "vitest";
import { validateDriverTimeline } from "../../legal/driverLegality";
import { bragancaInstance } from "../bench/bragancaInstance";
import { exactPlan } from "../bench/exact";
import { appendLoad, initialState, scheduleRoute } from "../crewSchedule";
import { dispatcherPlan } from "../greedy";
import { planObjective, solveWeek } from "../solver";
import { scorePlan } from "../bench/evaluate";
import { H, W, checkPlan, crew, done, load, travel, week } from "./kit";

/*
 * Trap weeks, each built to break a specific weakness, from easy to nasty. Every plan the search
 * returns must also pass the invariants: each load at most once, every week feasible and legal.
 */

describe("trap weeks — level 1: the dispatcher's blind spots", () => {
  it("nearest-crew trap: taking the nearest crew strands a load only it could reach", () => {
    const inst = week([crew("A", "Braganca"), crew("B", "Porto")], [
      load("C1", "Mirandela", "Porto", 2, 6), // nearest is A…
      load("C2", "Braganca", "Madrid", 2, 2.5), // …but only A can be in Bragança by 08:30
    ]);
    expect(done(dispatcherPlan(inst, "nearest"))).toHaveLength(1);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(done(sol).sort()).toEqual(["C1", "C2"]);
  });

  it("Friday backhaul: takes the load home, not the better-paid one that leaves the crew stranded", () => {
    const inst = week([crew("A", "Braganca")], [
      load("ida", "Braganca", "Madrid", 72, 76), // Thursday
      load("volta", "Madrid", "Braganca", 98, 102, { rateEur: 650 }), // Friday
      load("longe", "Madrid", "Sevilla", 98, 102, { rateEur: 900 }),
    ]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(done(sol).sort()).toEqual(["ida", "volta"]);
  });

  it("backhaul polish (optional): the load home instead of a better-paid one that leaves the crew 560 km away", () => {
    const inst = week([crew("A", "Braganca")], [
      load("ida", "Braganca", "Madrid", 72, 76),
      load("rica", "Madrid", "Zaragoza", 98, 102, { rateEur: 1000 }),
      load("casa", "Madrid", "Braganca", 98, 102, { rateEur: 700 }),
    ]);
    const plain = solveWeek(inst, { iterations: 50 }), back = solveWeek(inst, { iterations: 50, backhaul: true });
    checkPlan(inst, back);
    expect(done(plain)).toEqual(["ida", "rica"]); // the objective weighs the undone load by what it pays
    expect(done(back)).toEqual(["ida", "casa"]);
    const a = scorePlan("", inst, plain, 0), b = scorePlan("", inst, back, 0);
    expect(b.marginEur).toBeGreaterThan(a.marginEur);
    expect(b.homeEmptyKm).toBeLessThan(a.homeEmptyKm);
  });

  it("tight windows that only work in one order (not the order of the ids)", () => {
    const inst = week([crew("A", "Braganca")], [
      load("A1", "Porto", "Braganca", 10, 11),
      load("B1", "Braganca", "Porto", 1, 2),
      load("C1", "Braganca", "Mirandela", 26, 27), // Tuesday 08:00, after the night's rest
    ]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(sol.routes[0]!.loadIds).toEqual(["B1", "A1", "C1"]);
    expect(planObjective(inst, sol)).toBeCloseTo(exactPlan(inst).objective, 0);
  });
});

describe("trap weeks — level 2: rules that bite", () => {
  it("cabotage: never before a delivery into Spain, never more than 3", () => {
    const inst = week([crew("A", "Braganca")], [
      load("cab1", "Zamora", "Valladolid", 6, 14),
      load("int", "Braganca", "Zamora", 0, 4),
      load("cab2", "Valladolid", "Burgos", 24, 30),
      load("cab3", "Burgos", "Leon", 32, 40),
      load("cab4", "Leon", "Zamora", 48, 54),
      load("home", "Zamora", "Braganca", 56, 62),
    ]);
    const sol = solveWeek(inst, { iterations: 100 });
    checkPlan(inst, sol);
    const route = sol.routes[0]!.loadIds;
    const cab = route.filter((id) => id.startsWith("cab"));
    expect(cab.length).toBeLessThanOrEqual(3);
    if (cab.length) expect(route.indexOf("int")).toBeLessThan(route.indexOf(cab[0]!));
  });

  it("scarce reefers: cold loads only on the reefer crew, and as many as the optimum", () => {
    const inst = week([crew("F", "Braganca", { equipment: "REEFER" }), crew("A", "Braganca"), crew("B", "Mirandela")], [
      load("frio1", "Braganca", "Porto", 0, 6, { equipment: "REEFER" }),
      load("frio2", "Mirandela", "Madrid", 2, 8, { equipment: "REEFER" }),
      load("frio3", "Porto", "Braganca", 10, 16, { equipment: "REEFER" }),
      load("seco1", "Braganca", "Zamora", 0, 6),
    ]);
    const sol = solveWeek(inst, { iterations: 100 });
    checkPlan(inst, sol);
    for (const r of sol.routes) if (r.crewId !== "F") expect(r.loadIds.some((id) => id.startsWith("frio"))).toBe(false);
    expect(planObjective(inst, sol)).toBeCloseTo(exactPlan(inst).objective, 0);
  });

  it("a driver who already drove 54 h this week only gets what still fits in 56 h", () => {
    const tired = crew("A", "Braganca", { driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 54 * 3600, previousWeekDriveSec: 30 * 3600 } });
    const inst = week([tired], [load("longe", "Braganca", "Madrid", 0, 6), load("perto", "Braganca", "Mirandela", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(done(sol)).toEqual(["perto"]);
  });

  it("starting mid-shift: a driver with 4 h of continuous driving stops for a break within 30 min", () => {
    const c = crew("A", "Braganca", { driving: { dayDriveSec: 6 * 3600, continuousDriveSec: 4 * 3600, weekDriveSec: 20 * 3600, previousWeekDriveSec: 0 } });
    const s = appendLoad(initialState(c, true), load("x", "Mirandela", "Porto", 0, 10), travel, c)!;
    const firstDrive = s.activities!.find((a) => a.kind === "DRIVE")!;
    expect((firstDrive.endMs - firstDrive.startMs) / 60_000).toBeLessThanOrEqual(30.01);
    expect(s.activities![1]!.kind).toBe("BREAK");
  });
});

describe("trap weeks — level 3: edges and bad data", () => {
  it("nothing possible: Friday-evening loads to Sevilla are all left undone", () => {
    const inst = week([crew("A", "Braganca"), crew("B", "Porto")], [load("s1", "Braganca", "Sevilla", 108, 110), load("s2", "Porto", "Sevilla", 108, 110)]);
    const sol = solveWeek(inst, { iterations: 20 });
    checkPlan(inst, sol);
    expect(done(sol)).toEqual([]);
  });

  it("empty weeks: no crews, no loads, or neither", () => {
    for (const inst of [week([], [load("x", "Braganca", "Porto", 0, 6)]), week([crew("A", "Braganca")], []), week([], [])]) {
      const sol = solveWeek(inst, { iterations: 10 });
      checkPlan(inst, sol);
    }
  });

  it("broken loads (inverted windows, missing coordinates, same place, negative rate) never crash and are never planned", () => {
    const bad = [
      load("invertida", "Braganca", "Porto", 6, 2),
      load("sem-coord", "Braganca", "Porto", 0, 6, { to: [NaN, NaN] }),
      load("entrega-antes", "Braganca", "Porto", 0, 6, { deliveryEndMs: W - H }),
      load("mesmo-sitio", "Braganca", "Braganca", 0, 6),
      load("preco-negativo", "Braganca", "Mirandela", 0, 6, { rateEur: -500 }),
    ];
    const inst = week([crew("A", "Braganca"), crew("B", "Mirandela")], [...bad, load("boa", "Braganca", "Porto", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    for (const id of ["invertida", "sem-coord", "entrega-antes", "preco-negativo"]) expect(done(sol)).not.toContain(id);
    expect(done(sol)).toContain("boa");
  });

  it("forty identical crews and loads: all done, quickly", () => {
    const crews = Array.from({ length: 40 }, (_, i) => crew(`E${i}`, "Braganca"));
    const loads = Array.from({ length: 40 }, (_, i) => load(`L${i}`, "Braganca", "Porto", 2, 12));
    const inst = week(crews, loads);
    const t0 = performance.now();
    const sol = solveWeek(inst, { iterations: 100 });
    expect(performance.now() - t0).toBeLessThan(20_000);
    checkPlan(inst, sol);
    expect(done(sol)).toHaveLength(40);
  });

  it.each([
    ["the week after summer time ends (26 Oct 2026)", Date.parse("2026-10-26T06:00:00Z")],
    ["the week after summer time starts (29 Mar 2027)", Date.parse("2027-03-29T05:00:00Z")],
  ])("clock changes: %s stays legal", (_, start) => {
    const inst = bragancaInstance({ name: "DST", crews: 8, loadsPerCrew: 4.5, seed: 77, weekStartMs: start });
    const sol = solveWeek(inst, { iterations: 100 });
    checkPlan(inst, sol);
    for (const r of sol.routes) {
      const c = inst.crews.find((x) => x.id === r.crewId)!;
      const s = scheduleRoute(c, r.loadIds.map((id) => inst.loads.find((l) => l.id === id)!), inst.travel, true)!;
      expect(validateDriverTimeline(s.activities!, { afterWeeklyRestEndMs: c.availableFromMs }).violations).toEqual([]);
    }
  });
});
