import { describe, expect, it } from "vitest";
import { extract, hostAllowed, parseRobots, retrieve, robotsAllows, search, type ProxyDeps } from "../researchProxy";

/* Research boundary (Node): allow-list, redirects, robots.txt, failures, secrets. */

const DOMAINS = ["infraestruturasdeportugal.pt", "cm-porto.pt", "diariodarepublica.pt"];
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
function deps(route: Route, env: ProxyDeps["env"] = {}): ProxyDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    allowDomains: () => DOMAINS,
    env,
    fetch: (async (u: string | URL | Request, init?: RequestInit) => {
      const url = String(u);
      calls.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /api/\nDisallow: /dataset/*/history\nCrawl-Delay: 0", { status: 200 });
      return route(url, init);
    }) as typeof fetch,
  };
}
const ok = (body = "<html><body>ok</body></html>", type = "text/html") => new Response(body, { status: 200, headers: { "content-type": type, "last-modified": "Wed, 30 Sep 2026 10:00:00 GMT", "set-cookie": "secret=1" } });

describe("allow-list", () => {
  it("only https hosts on verified registry domains (label boundary); no credentials-in-URL tricks", () => {
    expect(hostAllowed(new URL("https://servicos.infraestruturasdeportugal.pt/x"), DOMAINS)).toBe(true);
    expect(hostAllowed(new URL("https://notinfraestruturasdeportugal.pt/x"), DOMAINS)).toBe(false);
    expect(hostAllowed(new URL("https://infraestruturasdeportugal.pt.evil.com/x"), DOMAINS)).toBe(false);
    expect(hostAllowed(new URL("http://www.cm-porto.pt/x"), DOMAINS)).toBe(false);
    expect(hostAllowed(new URL("https://www.cm-porto.pt@evil.com/x"), DOMAINS)).toBe(false);
  });
  it("a non-registry URL is refused before any request", async () => {
    const d = deps(() => ok());
    const r = await retrieve("https://www.publico.pt/noticia", 3, d);
    expect(r).toMatchObject({ ok: false, error: { kind: "NOT_ALLOWED" } });
    expect(d.calls).toEqual([]);
  });
});

describe("retrieval", () => {
  it("success: bytes + selected headers only (never cookies)", async () => {
    const r = await retrieve("https://servicos.infraestruturasdeportugal.pt/pt-pt/alertas-ips", 3, deps(() => ok()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Buffer.from(r.bodyBase64, "base64").toString()).toContain("ok");
      expect(r.headers["last-modified"]).toBeDefined();
      expect(JSON.stringify(r)).not.toMatch(/set-cookie|secret=1/);
    }
  });
  it("redirect to a verified host is followed and recorded; to another host is refused", async () => {
    const good = await retrieve("https://www.cm-porto.pt/a", 3, deps((u) => (u.endsWith("/a") ? new Response("", { status: 301, headers: { location: "https://dadosabertos.cm-porto.pt/b" } }) : ok())));
    expect(good).toMatchObject({ ok: true, finalUrl: "https://dadosabertos.cm-porto.pt/b", redirects: ["https://dadosabertos.cm-porto.pt/b"] });
    const bad = await retrieve("https://www.cm-porto.pt/a", 3, deps(() => new Response("", { status: 302, headers: { location: "https://evil.example.com/" } })));
    expect(bad).toMatchObject({ ok: false, error: { kind: "REDIRECT_NOT_ALLOWED" } });
  });
  it("redirect loop and redirect limit", async () => {
    const loop = await retrieve("https://www.cm-porto.pt/a", 5, deps((u) => new Response("", { status: 302, headers: { location: u.endsWith("/a") ? "/b" : "/a" } })));
    expect(loop).toMatchObject({ ok: false, error: { kind: "REDIRECT_LIMIT" } });
    let n = 0;
    const many = await retrieve("https://www.cm-porto.pt/r0", 2, deps(() => new Response("", { status: 302, headers: { location: `/r${++n}` } })));
    expect(many).toMatchObject({ ok: false, error: { kind: "REDIRECT_LIMIT" } });
  });
  it.each([
    [403, "HTTP_ERROR"],
    [404, "HTTP_ERROR"],
    [500, "HTTP_ERROR"],
  ])("HTTP %i ⇒ %s (no body, no snapshot)", async (status, kind) => {
    const r = await retrieve("https://www.cm-porto.pt/x", 3, deps(() => new Response("err", { status })));
    expect(r).toMatchObject({ ok: false, status, error: { kind } });
  });
  it("network/TLS error, timeout, oversize and empty bodies are failures", async () => {
    expect(await retrieve("https://www.cm-porto.pt/x", 3, deps(() => Promise.reject(new TypeError("TLS handshake failed"))))).toMatchObject({ ok: false, error: { kind: "NETWORK" } });
    const te = new Error("t");
    te.name = "TimeoutError";
    expect(await retrieve("https://www.cm-porto.pt/x", 3, deps(() => Promise.reject(te)))).toMatchObject({ ok: false, error: { kind: "TIMEOUT" } });
    expect(await retrieve("https://www.cm-porto.pt/x", 3, deps(() => new Response("x", { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } })))).toMatchObject({ ok: false, error: { kind: "TOO_LARGE" } });
    expect(await retrieve("https://www.cm-porto.pt/x", 3, deps(() => new Response("", { status: 200 })))).toMatchObject({ ok: false, error: { kind: "EMPTY" } });
  });
});

describe("robots.txt", () => {
  it("wildcards, prefixes and Allow precedence", () => {
    const r = parseRobots("User-agent: *\nDisallow: /api/\nDisallow: /dataset/*/history\nAllow: /core/*.css$\nDisallow: /core/\nCrawl-Delay: 10");
    expect(robotsAllows(r, "/api/3/action/package_show?id=x")).toBe(false); // Porto's /api/ (used by the existing 3B CKAN source!)
    expect(robotsAllows(r, "/dataset/abc/history")).toBe(false);
    expect(robotsAllows(r, "/dataset/abc/resource/def/download/x.xml")).toBe(true); // wildcard does not block downloads
    expect(robotsAllows(r, "/core/a.css")).toBe(true);
    expect(robotsAllows(r, "/core/a.js")).toBe(false);
    expect(r.crawlDelaySec).toBe(10);
    expect(parseRobots("<!DOCTYPE html><html>…")).toEqual([]); // an HTML page at /robots.txt has no rules
  });
  it("a disallowed path is refused by the boundary", async () => {
    const d = deps(() => ok());
    const r = await retrieve("https://dadosabertos.cm-porto.pt/api/3/action/package_show?id=x", 3, d);
    expect(r).toMatchObject({ ok: false, error: { kind: "ROBOTS_DISALLOWED" } });
    expect(d.calls.every((c) => c.endsWith("/robots.txt"))).toBe(true);
  });
});

describe("secrets and unconfigured providers", () => {
  it("no extraction key ⇒ 503 UNAVAILABLE, no outbound call", async () => {
    const d = deps(() => ok());
    const r = await extract({ system: "s", user: "u" }, d);
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).toMatch(/UNAVAILABLE/);
    expect(d.calls).toEqual([]);
  });
  it("with a key: the key is sent only upstream and never echoed back", async () => {
    const KEY = "sk-test-NEVER-ECHO-123";
    let sentKey = "";
    const d = deps((_u, init) => {
      sentKey = String((init?.headers as Record<string, string>)["x-api-key"]);
      return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }], usage: { input_tokens: 10, output_tokens: 2 }, model: "m" }), { status: 200 });
    }, { FLEETOS_EXTRACTION_API_KEY: KEY });
    const r = await extract({ system: "s", user: "u" }, d);
    expect(sentKey).toBe(KEY);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    expect(r.body).toMatchObject({ ok: true, usage: { input: 10, output: 2 } });
  });
  it("rate limit and provider errors are reported, never turned into content", async () => {
    expect((await extract({ system: "s", user: "u" }, deps(() => new Response("", { status: 429 }), { FLEETOS_EXTRACTION_API_KEY: "k" }))).status).toBe(429);
    expect((await extract({ system: "s", user: "u" }, deps(() => new Response("", { status: 500 }), { FLEETOS_EXTRACTION_API_KEY: "k" }))).status).toBe(502);
  });
  it("search without a key ⇒ 503 UNAVAILABLE", async () => {
    const r = await search("Município de Penacova condicionamento", deps(() => ok()));
    expect(r.status).toBe(503);
  });
});
