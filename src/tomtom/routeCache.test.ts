import { describe, expect, it, vi } from "vitest";
import { RouteCache } from "./routeCache";
describe("Routing freshness and bounds", () => {
  it("shares an in-flight request and reuses it without refetching", async () => {
    const cache = new RouteCache<number>(100, 2), load = vi.fn(async () => 1);
    expect(await Promise.all([cache.get("same", load, 0), cache.get("same", load, 1)])).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("invalidates changed inputs, expired traffic and an explicit refresh", async () => {
    const cache = new RouteCache<number>(100), load = vi.fn(async () => 1);
    await cache.get("vehicle-A", load, 0); await cache.get("vehicle-B", load, 1);
    await cache.get("vehicle-A", load, 101); await cache.get("vehicle-A", load, 102, true);
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("never keeps a failed provider call", async () => {
    const cache = new RouteCache<number>(), load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(1);
    await expect(cache.get("same", load, 0)).rejects.toThrow("down");
    expect(await cache.get("same", load, 1)).toBe(1);
  });
  it("evicts the oldest route at the memory bound", async () => {
    const cache = new RouteCache<number>(100, 2), load = vi.fn(async () => 1);
    await cache.get("a", load, 0); await cache.get("b", load, 1); await cache.get("c", load, 2); await cache.get("a", load, 3);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
