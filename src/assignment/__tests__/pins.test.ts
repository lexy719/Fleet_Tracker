import { describe, expect, it } from "vitest";
import type { Pin } from "../model";
import { solveWeek } from "../solver";
import { checkPlan, crew, done, load, routeOf, week } from "./kit";

/*
 * Dispatcher pins and contracted loads, as trap weeks. Pins are never broken: either the plan does
 * what the pin says, or the pin is reported with the reason and its load stays undone (never handed
 * to another crew). A mandatory load is left undone only when no crew can legally do it, and then
 * the plan says why.
 */

describe("pins: this load is this crew's", () => {
  it("keeps the pinned crew even when another one is nearer", () => {
    const loads = [load("x", "Porto", "Mirandela", 2, 8)];
    const crews = [crew("A", "Braganca"), crew("B", "Porto")];
    expect(routeOf(solveWeek(week(crews, loads), { iterations: 50 }), "B")).toEqual(["x"]); // without the pin
    const pins: Pin[] = [{ kind: "assign", loadId: "x", crewId: "A" }];
    const inst = week(crews, loads);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["x"]);
    expect(sol.pinIssues).toBeUndefined();
  });

  it("several pinned loads whose windows only work in one order: finds that order", () => {
    const loads = [load("q3", "Braganca", "Mirandela", 26, 27), load("q2", "Porto", "Braganca", 10, 11), load("q1", "Braganca", "Porto", 1, 2)];
    const pins: Pin[] = loads.map((l) => ({ kind: "assign", loadId: l.id, crewId: "A" }));
    const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], loads);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["q1", "q2", "q3"]);
  });

  it("a pickup the crew cannot reach in time: reported with the times, and NOT given to the crew that could", () => {
    const pins: Pin[] = [{ kind: "assign", loadId: "sev", crewId: "A" }];
    const inst = week([crew("A", "Braganca"), crew("B", "Sevilla")], [load("sev", "Sevilla", "Porto", 0, 3)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(done(sol)).toEqual([]);
    expect(sol.pinIssues).toHaveLength(1);
    expect(sol.pinIssues![0]!.code).toBe("PICKUP_LATE");
    expect(sol.pinIssues![0]!.text).toMatch(/A não consegue fazer sev: chega tarde à recolha \(seg \d\d:\d\d; a janela fecha seg 09:00\)/);
    expect(sol.why!.sev!.code).toBe("PICKUP_LATE");
  });

  it("a driver with 54 h already this week pinned to a long load: the 56 h limit wins and is named", () => {
    const tired = crew("A", "Braganca", { driving: { dayDriveSec: 0, continuousDriveSec: 0, weekDriveSec: 54 * 3600, previousWeekDriveSec: 30 * 3600 } });
    const pins: Pin[] = [{ kind: "assign", loadId: "longe", crewId: "A" }];
    const inst = week([tired], [load("longe", "Braganca", "Madrid", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 20, pins });
    checkPlan(inst, sol, pins);
    expect(sol.pinIssues![0]!.code).toBe("WEEK_DRIVE");
    expect(sol.pinIssues![0]!.text).toContain("56 h");
  });

  it("a Friday-evening load to Sevilla pinned to a crew that must be home on Saturday: home wins and is named", () => {
    const pins: Pin[] = [{ kind: "assign", loadId: "sexta", crewId: "A" }];
    const inst = week([crew("A", "Braganca")], [load("sexta", "Braganca", "Sevilla", 108, 110)]);
    const sol = solveWeek(inst, { iterations: 20, pins });
    checkPlan(inst, sol, pins);
    expect(sol.pinIssues![0]!.code).toBe("NOT_HOME");
    expect(sol.pinIssues![0]!.text).toContain("limite sáb 14:00");
  });
});

describe("pins: this crew does not do this load", () => {
  it("the load goes to another crew", () => {
    const pins: Pin[] = [{ kind: "forbid", loadId: "x", crewId: "B" }];
    const inst = week([crew("A", "Braganca"), crew("B", "Porto")], [load("x", "Porto", "Mirandela", 2, 8)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["x"]);
  });

  it("forbidden to every crew that could: undone, and the reason says it was the dispatcher", () => {
    const pins: Pin[] = [{ kind: "forbid", loadId: "x", crewId: "A" }, { kind: "forbid", loadId: "x", crewId: "B" }];
    const inst = week([crew("A", "Braganca"), crew("B", "Porto")], [load("x", "Porto", "Mirandela", 2, 8)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(sol.why!.x!.code).toBe("FORBIDDEN");
  });
});

describe("pins: these loads of this crew stay in this order", () => {
  it("keeps a costlier order the dispatcher asked for", () => {
    const loads = [load("p1", "Braganca", "Mirandela", 0, 30), load("p2", "Mirandela", "Braganca", 0, 30)];
    expect(routeOf(solveWeek(week([crew("A", "Braganca")], loads), { iterations: 50 }), "A")).toEqual(["p1", "p2"]); // the cheap order
    const pins: Pin[] = [{ kind: "sequence", crewId: "A", loadIds: ["p2", "p1"] }];
    const inst = week([crew("A", "Braganca")], loads);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["p2", "p1"]);
  });

  it("other loads may go in between", () => {
    const pins: Pin[] = [{ kind: "sequence", crewId: "A", loadIds: ["a", "c"] }];
    const inst = week([crew("A", "Braganca")], [load("a", "Braganca", "Mirandela", 0, 2), load("b", "Mirandela", "Braganca", 2, 5), load("c", "Braganca", "Zamora", 5, 10)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["a", "b", "c"]);
  });

  it("an order that misses a window: the load that cannot follow is reported, the other is still done", () => {
    const pins: Pin[] = [{ kind: "sequence", crewId: "A", loadIds: ["tarde", "cedo"] }];
    const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], [load("cedo", "Braganca", "Mirandela", 0, 2), load("tarde", "Braganca", "Porto", 1, 3)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["tarde"]);
    expect(done(sol)).not.toContain("cedo"); // B could, but the pin says A
    expect(sol.pinIssues!.map((i) => [i.loadIds, i.code])).toEqual([[["cedo"], "PICKUP_LATE"]]);
  });
});

describe("pins that contradict each other or name nothing", () => {
  it("one load pinned to two crews, or pinned and forbidden: undone and reported, never guessed", () => {
    const pins: Pin[] = [
      { kind: "assign", loadId: "x", crewId: "A" }, { kind: "assign", loadId: "x", crewId: "B" },
      { kind: "assign", loadId: "y", crewId: "A" }, { kind: "forbid", loadId: "y", crewId: "A" },
    ];
    const inst = week([crew("A", "Braganca"), crew("B", "Braganca")], [load("x", "Braganca", "Porto", 0, 6), load("y", "Braganca", "Zamora", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 50, pins });
    checkPlan(inst, sol, pins);
    expect(done(sol)).toEqual([]);
    expect(sol.why!.x!.code).toBe("PIN_CONTRADICTION");
    expect(sol.why!.y!.code).toBe("PIN_CONTRADICTION");
    expect(sol.pinIssues!.filter((i) => i.loadIds.includes("x"))).toHaveLength(2);
  });

  it("two orders that make a cycle", () => {
    const pins: Pin[] = [{ kind: "sequence", crewId: "A", loadIds: ["x", "y"] }, { kind: "sequence", crewId: "A", loadIds: ["y", "x"] }];
    const inst = week([crew("A", "Braganca")], [load("x", "Braganca", "Mirandela", 0, 30), load("y", "Mirandela", "Braganca", 0, 30)]);
    const sol = solveWeek(inst, { iterations: 20, pins });
    checkPlan(inst, sol, pins);
    expect(done(sol)).toEqual([]);
    expect(sol.why!.x!.text).toContain("ciclo");
  });

  it("unknown crews and loads are reported and change nothing else", () => {
    const pins: Pin[] = [{ kind: "assign", loadId: "x", crewId: "Z" }, { kind: "forbid", loadId: "nada", crewId: "A" }, { kind: "sequence", crewId: "A", loadIds: ["nada", "x"] }];
    const inst = week([crew("A", "Braganca")], [load("x", "Braganca", "Porto", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 20, pins });
    checkPlan(inst, sol, pins);
    expect(routeOf(sol, "A")).toEqual(["x"]);
    expect(sol.pinIssues!.every((i) => i.code === "PIN_UNKNOWN")).toBe(true);
  });
});

describe("mandatory (contracted) and optional (spot) loads", () => {
  it("a contracted load beats a spot load that pays far more", () => {
    const loads = [load("contrato", "Braganca", "Mirandela", 0, 1), load("spot", "Braganca", "Porto", 0, 1, { rateEur: 2000 })];
    expect(done(solveWeek(week([crew("A", "Braganca")], loads), { iterations: 50 }))).toEqual(["spot"]); // as spot loads
    loads[0]!.mandatory = true;
    const inst = week([crew("A", "Braganca")], loads);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(done(sol)).toEqual(["contrato"]);
    expect(sol.why!.spot!.code).toBe("CONFLICT");
    expect(sol.why!.spot!.text).toContain("contrato");
  });

  it("a contracted load nobody can reach in time: undone, with how many crews fail and why", () => {
    const inst = week([crew("A", "Braganca"), crew("B", "Mirandela")], [load("sev", "Sevilla", "Porto", 0, 3, { mandatory: true }), load("ok", "Braganca", "Porto", 0, 6)]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(sol.unassigned).toEqual(["sev"]);
    expect(sol.why!.sev).toMatchObject({ code: "PICKUP_LATE", crews: { PICKUP_LATE: 2 } });
    expect(sol.why!.sev!.text).toMatch(/^nenhuma equipa a pode fazer \(2 chegam tarde à recolha\)/);
  });

  it("a contracted cold load and no reefer crew", () => {
    const inst = week([crew("A", "Braganca")], [load("frio", "Braganca", "Porto", 0, 6, { mandatory: true, equipment: "REEFER" })]);
    const sol = solveWeek(inst, { iterations: 20 });
    checkPlan(inst, sol);
    expect(sol.why!.frio!.code).toBe("EQUIPMENT");
  });

  it("two contracted loads at the same time and one crew: one is done, the other names it", () => {
    const inst = week([crew("A", "Braganca")], [load("m1", "Braganca", "Mirandela", 0, 1, { mandatory: true }), load("m2", "Braganca", "Porto", 0, 1, { mandatory: true })]);
    const sol = solveWeek(inst, { iterations: 50 });
    checkPlan(inst, sol);
    expect(done(sol)).toHaveLength(1);
    const [left] = sol.unassigned;
    expect(sol.why![left!]!.code).toBe("CONFLICT");
    expect(sol.why![left!]!.text).toContain(done(sol)[0]!);
  });

  it("a contracted load takes the place of spot loads already planned", () => {
    // Spot loads fill A's Monday; the contract only fits if they go (B is too far to help).
    const inst = week([crew("A", "Braganca"), crew("B", "Sevilla")], [
      load("s1", "Braganca", "Mirandela", 0, 1), load("s2", "Mirandela", "Braganca", 1, 3),
      load("contrato", "Braganca", "Porto", 0, 1, { mandatory: true }),
    ]);
    const sol = solveWeek(inst, { iterations: 0 });
    checkPlan(inst, sol);
    expect(routeOf(sol, "A")[0]).toBe("contrato");
  });

  it("a spot load that costs more than it pays is left, and the reason gives the numbers", () => {
    const inst = { ...week([crew("A", "Braganca")], [load("barata", "Sevilla", "Porto", 0, 60, { rateEur: 0 })]), costEurPerKm: 1.2 };
    const sol = solveWeek(inst, { iterations: 20 });
    checkPlan(inst, sol);
    expect(sol.why!.barata!.code).toBe("NOT_WORTH");
    expect(sol.why!.barata!.text).toMatch(/acrescenta \d+ € de custos e paga 0 €/);
  });
});
