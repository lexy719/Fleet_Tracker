import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as LibreMap } from "maplibre-gl";
import { INITIAL_CAMERA } from "./composition";
import { createCameraChoreography } from "./cameraChoreography";

function renderer() {
  let camera = structuredClone(INITIAL_CAMERA),
    width = 800,
    height = 600,
    canvasWidth = width,
    canvasHeight = height;
  const map = {
    getCenter: () => ({ lng: camera.center[0], lat: camera.center[1] }),
    getZoom: () => camera.zoom,
    getPitch: () => camera.pitch,
    getBearing: () => camera.bearing,
    getPadding: () => camera.padding,
    getContainer: () => ({ clientWidth: width, clientHeight: height }),
    getCanvas: () => ({ clientWidth: canvasWidth, clientHeight: canvasHeight }),
    resize: vi.fn(() => {
      canvasWidth = width;
      canvasHeight = height;
    }),
    stop: vi.fn(),
    redraw: vi.fn(),
    cameraForBounds: vi.fn(() => ({
      center: [-8.5, 40],
      zoom: Math.log2(width / 100) + 4,
    })),
    jumpTo: vi.fn((next: typeof camera) => {
      camera = structuredClone(next);
    }),
  };
  const queue = new Map<number, FrameRequestCallback>();
  let sequence = 0,
    clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  const host = { dataset: {} } as HTMLElement,
    controller = createCameraChoreography(map as unknown as LibreMap, host);
  return {
    map,
    host,
    controller,
    camera: () => camera,
    resize: (w: number, h: number) => {
      width = w;
      height = h;
    },
    frame: (time: number) => {
      clock = time;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback(time));
    },
    queue,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("interruptible camera choreography", () => {
  it("a reduced-motion preference change completes only the active command, never replays an old focus", () => {
    const r = renderer();
    r.controller.run({ kind: "focus", domain: "Drivers" }, 800);
    r.frame(200);
    r.controller.finish();
    expect(r.camera().zoom).toBe(12.4);
    expect(r.queue.size).toBe(0);
    const calls = r.map.jumpTo.mock.calls.length;
    r.controller.finish();
    expect(r.map.jumpTo.mock.calls.length).toBe(calls);
  });
  it("fits the actual changing map size throughout motion and stops scheduling at completion", () => {
    const r = renderer();
    r.controller.run({ kind: "focus", domain: "Jobs" }, 400);
    r.frame(100);
    const first = r.camera().zoom;
    r.resize(400, 500);
    r.frame(200);
    r.frame(400);
    expect(r.map.cameraForBounds).toHaveBeenCalledTimes(3);
    expect(r.camera().zoom).toBe(6);
    expect(r.camera().zoom).not.toBe(first);
    expect(r.host.dataset.cameraChoreography).toBe("false");
    expect(r.queue.size).toBe(0);
  });
  it("interrupts from the rendered camera and rejects a cancelled callback without stale mutations", () => {
    const r = renderer();
    r.controller.run({ kind: "focus", domain: "Drivers" }, 400);
    r.frame(100);
    const intermediate = structuredClone(r.camera()),
      stale = [...r.queue.values()][0];
    r.controller.run({ kind: "restore", camera: INITIAL_CAMERA }, 300);
    stale(400);
    expect(r.camera()).toEqual(intermediate);
    r.frame(250);
    expect(r.camera().zoom).toBeLessThan(intermediate.zoom);
    r.frame(400);
    expect(r.camera()).toEqual(INITIAL_CAMERA);
    expect(r.queue.size).toBe(0);
  });
  it("reduced motion applies the complete target immediately, with exact padding restoration", () => {
    const r = renderer(),
      camera = {
        ...INITIAL_CAMERA,
        padding: { top: 24, left: 12, right: 6, bottom: 3 },
        pitch: 38,
        bearing: 21,
      };
    r.controller.run({ kind: "restore", camera }, 0);
    expect(r.camera()).toEqual(camera);
    expect(r.queue.size).toBe(0);
    expect(r.host.dataset.cameraChoreography).toBe("false");
  });
  it("document takeover leaves the current camera intact and disposal cancels motion", () => {
    const r = renderer();
    r.controller.run({ kind: "focus", domain: "Documents" }, 320);
    r.frame(160);
    r.frame(320);
    expect(r.camera()).toEqual(INITIAL_CAMERA);
    r.controller.run({ kind: "focus", domain: "Fuel" }, 320);
    r.controller.stop();
    expect(r.queue.size).toBe(0);
    expect(r.host.dataset.cameraChoreography).toBe("false");
  });
});
