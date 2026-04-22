import { describe, expect, it } from "vitest";
import { draftsToWaypoints } from "../components/routes/waypointsFromDrafts";
import { createEmptyPoint } from "../components/routes/routePlannerTypes";
import { evaluateEuDrivingRules, simulateDrivingSchedule } from "./euDrivingRules";

describe("draftsToWaypoints", () => {
  it("returns validation error when finish is missing coordinates", () => {
    const start = createEmptyPoint("start");
    start.lat = 38.72;
    start.lng = -9.13;
    start.label = "Lisbon";

    const finish = createEmptyPoint("finish");
    finish.label = "Madrid";

    const result = draftsToWaypoints(start, [], finish);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Finish");
    }
  });

  it("builds ordered waypoints with stop labels", () => {
    const start = createEmptyPoint("start");
    start.lat = 38.72;
    start.lng = -9.13;
    start.label = "Lisbon";

    const finish = createEmptyPoint("finish");
    finish.lat = 40.41;
    finish.lng = -3.7;
    finish.label = "Madrid";

    const result = draftsToWaypoints(start, [], finish);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.coords).toHaveLength(2);
      expect(result.data.waypointStops[0]?.name).toBe("Madrid");
    }
  });
});

describe("evaluateEuDrivingRules", () => {
  it("flags multi-day warning (never critical) when trip exceeds today remaining hours", () => {
    // 4.5h today + 8h trip = must split over 2 days
    const issues = evaluateEuDrivingRules([8 * 3600], 4.5, 40);
    const md = issues.find((x) => x.code === "MULTI_DAY");
    expect(md).toBeDefined();
    expect(md?.severity).toBe("warning");
  });

  it("flags break warning for a long single-day trip", () => {
    // 0h today, 6h trip (> 4h30 continuous) → needs 1 break, single day
    const issues = evaluateEuDrivingRules([6 * 3600], 0, 30);
    expect(issues.some((x) => x.code === "BREAKS_NEEDED")).toBe(true);
    expect(issues.every((x) => x.severity !== "critical")).toBe(true);
  });

  it("blocks when weekly limit is already at max", () => {
    const issues = evaluateEuDrivingRules([2 * 3600], 1, 56);
    expect(issues.some((x) => x.code === "WEEKLY_EXCEEDED" && x.severity === "critical")).toBe(true);
  });

  it("blocks when trip hours exceed remaining weekly allowance", () => {
    // 50h this week, 10h trip: 50+10=60 > 56 → blocker
    const issues = evaluateEuDrivingRules([10 * 3600], 0, 50);
    expect(issues.some((x) => x.code === "TRIP_EXCEEDS_WEEKLY" && x.severity === "critical")).toBe(true);
  });

  it("adds weekly-low warning when near weekly cap", () => {
    const issues = evaluateEuDrivingRules([2 * 3600], 1, 53);
    expect(issues.some((x) => x.code === "WEEKLY_LOW")).toBe(true);
  });

  it("correctly counts breaks for 17h trip with 0h today (Braga→Grenoble scenario)", () => {
    // 17h driving, 0h today:
    //   Day 1: drive 4.5h → break → drive 4.5h (9h) → rest
    //   Day 2: drive 4.5h → break → drive 3.5h (8h) → done
    // → 2 breaks, 1 rest, 2 driving days
    const sched = simulateDrivingSchedule(17 * 3600, 0);
    expect(sched.breakCount).toBe(2);
    expect(sched.restCount).toBe(1);
    expect(sched.drivingDays).toBe(2);
  });
});
