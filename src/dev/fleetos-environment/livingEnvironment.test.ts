import { describe, expect, it } from "vitest";
import { INITIAL_CAMERA, randomComposition, nextSeed } from "./composition";
import {
  createWorkspaceSpace,
  intersection,
  contains,
} from "./workspaceGeometry";
import { labChrome } from "./labGeometry";
import {
  DOMAINS,
  initialLivingState,
  toggleDomain,
  enterFocus,
  leaveFocus,
  snapshotLiving,
  composeLivingWorkspace,
  interpolateCamera,
  motionProgress,
} from "./livingEnvironment";

function allocation(
  state: ReturnType<typeof initialLivingState>,
  size: { width: number; height: number },
) {
  const space = createWorkspaceSpace(
    size,
    labChrome(size, state.explorerOpen),
    state.variables.margin,
  );
  return composeLivingWorkspace(state, size, space);
}
function assertSpace(model: ReturnType<typeof allocation>) {
  for (const occupied of model.occupiedRegions) {
    expect(contains(model.usableWorkspaceBounds, occupied)).toBe(true);
    for (const chrome of model.reservedChromeBounds)
      expect(intersection(occupied, chrome.bounds)).toBeNull();
  }
  for (let i = 0; i < model.occupiedRegions.length; i++)
    for (let j = i + 1; j < model.occupiedRegions.length; j++)
      expect(
        intersection(model.occupiedRegions[i], model.occupiedRegions[j]),
      ).toBeNull();
  expect(
    model.area.occupied + model.area.free + model.area.protected,
  ).toBeCloseTo(model.area.usable, 3);
}
describe("living context environment", () => {
  it.each([
    { width: 1199, height: 884 },
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ])(
    "negotiates map priority when white space cannot fit any active context at $width × $height",
    (size) => {
      let state = initialLivingState();
      for (const d of ["Jobs", "Drivers", "Fuel"] as const)
        state = toggleDomain(state, d);
      const result = allocation(state, size);
      expect(result.surfaces.some((s) => s.id !== "map" && s.bounds)).toBe(
        true,
      );
      assertSpace(result);
      expect(allocation(state, size)).toEqual(result);
      state.variables.dominance = 1;
      expect(allocation(state, size).contextNegotiated).toBe(false);
    },
  );
  it("closing a focused shell leaves its takeover and removes only that context", () => {
    let base = toggleDomain(
      toggleDomain(initialLivingState(), "Jobs"),
      "Documents",
    );
    const focused = enterFocus(base, "Documents", INITIAL_CAMERA),
      closed = toggleDomain(focused, "Documents");
    expect(closed.focus).toBeNull();
    expect(closed.variables.visible).toBe(true);
    expect(closed.surfaces.find((s) => s.id === "Documents")?.enabled).toBe(
      false,
    );
    expect(closed.surfaces.find((s) => s.id === "Jobs")?.enabled).toBe(true);
    expect(closed.history.length).toBe(0);
    base = enterFocus(base, "Drivers", INITIAL_CAMERA);
    const nested = toggleDomain(
      enterFocus(base, "Documents", INITIAL_CAMERA),
      "Documents",
    );
    expect(nested.focus).toBe("Drivers");
  });
  it("starts clean and every toggle is independent and reversible", () => {
    const base = initialLivingState();
    expect(base.surfaces.some((s) => s.enabled)).toBe(false);
    for (const domain of DOMAINS) {
      const next = toggleDomain(base, domain);
      expect(next.surfaces.filter((s) => s.enabled).map((s) => s.id)).toEqual([
        domain,
      ]);
      expect(toggleDomain(next, domain)).toEqual(base);
    }
  });
  it.each([
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ])(
    "all 64 context subsets are deterministic and respect geometry at $width × $height",
    (size) => {
      for (let mask = 0; mask < 64; mask++) {
        let a = initialLivingState(),
          b = initialLivingState();
        const domains = DOMAINS.filter((_, i) => mask & (1 << i));
        for (const d of domains) a = toggleDomain(a, d);
        for (const d of [...domains].reverse()) b = toggleDomain(b, d);
        expect(allocation(a, size)).toEqual(allocation(b, size));
        assertSpace(allocation(a, size));
      }
    },
  );
  it("opening supporting surfaces can preserve the map geometry", () => {
    const base = initialLivingState(),
      size = { width: 1440, height: 900 };
    expect(allocation(toggleDomain(base, "Jobs"), size).map).toEqual(
      allocation(base, size).map,
    );
  });
  it("restores actual manual values, surface states, tools and camera through nested focus", () => {
    let base = initialLivingState();
    base = toggleDomain(
      toggleDomain(toggleDomain(base, "Jobs"), "Drivers"),
      "Fuel",
    );
    base.variables = {
      ...base.variables,
      mapX: 0.31,
      mapY: 0.72,
      mapWidth: 0.48,
      margin: 39,
      duration: 710,
    };
    base.explorerOpen = true;
    base.reference = false;
    base.surfaces[0] = {
      ...base.surfaces[0],
      state: "hidden",
      x: 0.84,
      demand: 0.68,
    };
    const camera = {
      ...INITIAL_CAMERA,
      center: [-7.19, 40.22] as [number, number],
      zoom: 8.37,
      bearing: -37,
      pitch: 26,
      padding: { top: 17, left: 9, right: 11, bottom: 8 },
    };
    const driver = enterFocus(base, "Drivers", camera),
      driverCamera = { ...camera, zoom: 11.3, pitch: 42 };
    const document = enterFocus(driver, "Documents", driverCamera),
      restoredDriver = leaveFocus(document);
    expect(snapshotLiving(restoredDriver)).toEqual(snapshotLiving(driver));
    expect(restoredDriver.cameraRequest?.target).toEqual({
      kind: "restore",
      camera: driverCamera,
    });
    const restoredBase = leaveFocus(restoredDriver);
    expect(snapshotLiving(restoredBase)).toEqual(snapshotLiving(base));
    expect(restoredBase.history).toEqual([]);
    expect(restoredBase.cameraRequest?.target).toEqual({
      kind: "restore",
      camera,
    });
    expect(leaveFocus(restoredBase)).toBe(restoredBase);
  });
  it("snapshots are immutable and focusing the current domain creates no fictitious frame", () => {
    const base = toggleDomain(initialLivingState(), "Jobs"),
      focused = enterFocus(base, "Jobs", INITIAL_CAMERA);
    expect(enterFocus(focused, "Jobs", INITIAL_CAMERA)).toBe(focused);
    focused.surfaces[0].width = 0.9;
    focused.variables.mapX = 0.1;
    expect(leaveFocus(focused).surfaces[0].width).toBe(base.surfaces[0].width);
    expect(leaveFocus(focused).variables.mapX).toBe(base.variables.mapX);
  });
  it("interrupted focus stores the rendered camera and restores that exact intermediate camera", () => {
    const target = {
      ...INITIAL_CAMERA,
      center: [-8.62, 41.16] as [number, number],
      zoom: 12.4,
      bearing: 24,
      pitch: 42,
    };
    const mid = interpolateCamera(INITIAL_CAMERA, target, motionProgress(0.4));
    const driver = enterFocus(initialLivingState(), "Drivers", INITIAL_CAMERA),
      job = enterFocus(driver, "Jobs", mid);
    expect(leaveFocus(job).cameraRequest?.target).toEqual({
      kind: "restore",
      camera: mid,
    });
    expect(interpolateCamera(target, mid, 1)).toEqual(mid);
  });
  it("rapid toggles and nested focus exits leave no stale contexts or history", () => {
    let state = initialLivingState();
    for (let i = 0; i < 120; i++) state = toggleDomain(state, DOMAINS[i % 6]);
    expect(snapshotLiving(state)).toEqual(snapshotLiving(initialLivingState()));
    for (const d of DOMAINS) state = enterFocus(state, d, INITIAL_CAMERA);
    for (let i = 0; i < 6; i++) state = leaveFocus(state);
    expect(snapshotLiving(state)).toEqual(snapshotLiving(initialLivingState()));
    expect(state.history.length).toBe(0);
  });
  it.each([
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
  ])(
    "focus and 100 pressured compositions retain allocation invariants at $width × $height",
    (size) => {
      let state = initialLivingState();
      for (const d of DOMAINS) state = toggleDomain(state, d);
      for (const d of DOMAINS) {
        const focus = enterFocus(state, d, INITIAL_CAMERA),
          model = allocation(focus, size);
        assertSpace(model);
        if (d === "Drivers") {
          expect(model.map.width).toBe(size.width - 96);
          expect(model.map.height).toBe(size.height);
        }
        if (d === "Documents") {
          expect(model.map.visible).toBe(false);
          expect(
            model.surfaces.find((s) => s.id === "Documents")?.bounds,
          ).not.toBeNull();
        }
      }
      let seed = 42;
      for (let i = 0; i < 100; i++) {
        seed = nextSeed(seed);
        state.variables = randomComposition(seed, state.variables);
        state.surfaces = state.surfaces.map((s, j) => ({
          ...s,
          demand: ((i + j) % 10) / 9,
          prominence: ((i * 3 + j) % 10) / 9,
          priority: (i * 7 + j) % 100,
        }));
        assertSpace(allocation(state, size));
      }
    },
  );
  it("camera interpolation is bounded and restores all padding and orientation exactly", () => {
    const a = { ...INITIAL_CAMERA, bearing: 170 },
      b = {
        ...INITIAL_CAMERA,
        bearing: -170,
        pitch: 45,
        padding: { top: 10, right: 20, left: 30, bottom: 40 },
      };
    expect(interpolateCamera(a, b, 0)).toEqual(a);
    expect(interpolateCamera(a, b, 1)).toEqual(b);
    expect(interpolateCamera(a, b, 0.5).bearing).toBe(180);
    for (let i = 0; i <= 100; i++) {
      const p = motionProgress(i / 100);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      if (i) expect(p).toBeGreaterThanOrEqual(motionProgress((i - 1) / 100));
    }
  });
});
