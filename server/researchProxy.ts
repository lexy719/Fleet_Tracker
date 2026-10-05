/*
 * Phase 4 research boundary — LOCAL DEVELOPMENT / PREVIEW ONLY (Node, Vite middleware).
 *
 * Why a server boundary at all:
 *  - official sites rarely send CORS headers, so a browser cannot fetch them directly;
 *  - search/LLM providers need secrets that must never exist in the browser bundle,
 *    IndexedDB, snapshots, metrics or logs.
 *
 * Endpoints (JSON):
 *  GET  /__research/status            → which capabilities are configured (booleans only)
 *  GET  /__research/retrieve?url=…    → bytes of an ALLOW-LISTED official URL (+ metadata)
 *  POST /__research/extract           → semantic extraction via an LLM, only if a key is set
 *  GET  /__research/search?q=…        → web search, only if a key is set
 *
 * This is not a production backend: on a static deployment none of these exist and the
 * research agent reports SOURCE_UNREACHABLE / EXTRACTION_UNAVAILABLE / SEARCH_UNAVAILABLE.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export const RETRIEVER_VERSION = 1;
export const USER_AGENT = "FleetOS-research/0.1 (portfolio prototype; road-restriction research; contact via repository)";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS_HARD = 5;
const KEEP_HEADERS = ["content-type", "content-length", "last-modified", "etag", "date", "cache-control", "expires", "age"];

export type ProxyEnv = {
  /** Server-side only. Never prefixed with VITE_ (Vite would inline it into the bundle). */
  FLEETOS_EXTRACTION_API_KEY?: string;
  FLEETOS_EXTRACTION_MODEL?: string;
  FLEETOS_SEARCH_API_KEY?: string;
};

export type ProxyDeps = {
  fetch: typeof fetch;
  /** Verified official domains (label-boundary match). */
  allowDomains: () => string[];
  env: ProxyEnv;
  now?: () => number;
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

export function hostAllowed(url: URL, domains: string[]): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/* ─── robots.txt (User-agent: * groups, Disallow prefixes; Allow wins when longer) ─── */

export type RobotsRules = { allow: boolean; path: string }[] & { crawlDelaySec?: number };
const robotsCache = new Map<string, { at: number; rules: RobotsRules }>();
const lastHit = new Map<string, number>();

export function parseRobots(txt: string): RobotsRules {
  // Not a robots file (e.g. an HTML app page served at /robots.txt): no rules known.
  if (/^\s*</.test(txt)) return [];
  const rules: RobotsRules = [];
  let applies = false;
  let inAgents = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k!.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!inAgents) applies = false;
      inAgents = true;
      if (val === "*" || /fleetos/i.test(val)) applies = true;
      continue;
    }
    inAgents = false;
    if (!applies) continue;
    if (key === "disallow" && val) rules.push({ allow: false, path: val });
    if (key === "allow" && val) rules.push({ allow: true, path: val });
    if (key === "crawl-delay" && Number.isFinite(Number(val))) rules.crawlDelaySec = Math.min(Number(val), 30);
  }
  return rules;
}

/** robots.txt path pattern: "*" wildcard, "$" end anchor, otherwise prefix. */
function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path).split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function robotsAllows(rules: { allow: boolean; path: string }[], pathAndQuery: string): boolean {
  const match = rules.filter((r) => robotsPattern(r.path).test(pathAndQuery));
  if (!match.length) return true;
  const best = match.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0]!;
  return best.allow;
}

async function robotsFor(origin: string, deps: ProxyDeps): Promise<RobotsRules> {
  const now = (deps.now ?? Date.now)();
  const hit = robotsCache.get(origin);
  if (hit && now - hit.at < 3_600_000) return hit.rules;
  let rules: RobotsRules = [];
  try {
    const r = await deps.fetch(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (r.ok) rules = parseRobots(await r.text());
  } catch {
    rules = []; // unreachable robots.txt: no rules known (the retrieval itself will report errors)
  }
  robotsCache.set(origin, { at: now, rules });
  return rules;
}

/* ─── Retrieval ─── */

export type RetrieveResult =
  | { ok: true; requestedUrl: string; finalUrl: string; redirects: string[]; status: number; contentType: string; headers: Record<string, string>; bodyBase64: string; latencyMs: number; retrieverVersion: number }
  | { ok: false; requestedUrl: string; redirects: string[]; status?: number; error: { kind: string; message: string }; latencyMs: number; retrieverVersion: number };

export async function retrieve(rawUrl: string, maxRedirects: number, deps: ProxyDeps): Promise<RetrieveResult> {
  const clock = deps.now ?? Date.now;
  const t0 = clock();
  const redirects: string[] = [];
  const fail = (kind: string, message: string, status?: number): RetrieveResult => ({
    ok: false, requestedUrl: rawUrl, redirects, ...(status ? { status } : {}), error: { kind, message }, latencyMs: clock() - t0, retrieverVersion: RETRIEVER_VERSION,
  });
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail("NOT_ALLOWED", "URL inválido");
  }
  const domains = deps.allowDomains();
  if (!hostAllowed(url, domains)) return fail("NOT_ALLOWED", `domínio fora do registo de autoridades verificadas (${url.hostname})`);
  const seen = new Set<string>();
  for (let hop = 0; ; hop++) {
    if (seen.has(url.href)) return fail("REDIRECT_LIMIT", "ciclo de redirecionamento");
    seen.add(url.href);
    const rules = await robotsFor(url.origin, deps);
    if (!robotsAllows(rules, url.pathname + url.search)) return fail("ROBOTS_DISALLOWED", `robots.txt de ${url.hostname} não permite ${url.pathname}`);
    // Crawl-Delay: wait (bounded) since the previous request to this origin.
    if (rules.crawlDelaySec) {
      const wait = (lastHit.get(url.origin) ?? 0) + rules.crawlDelaySec * 1000 - clock();
      if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 30_000)));
    }
    lastHit.set(url.origin, clock());
    let res: Response;
    try {
      res = await deps.fetch(url.href, { redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml,application/json,application/pdf;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      return fail(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK", e instanceof Error ? e.message : String(e));
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= Math.min(maxRedirects, MAX_REDIRECTS_HARD)) return fail("REDIRECT_LIMIT", `mais de ${maxRedirects} redirecionamentos`, res.status);
      const next = new URL(res.headers.get("location")!, url);
      if (!hostAllowed(next, domains)) return fail("REDIRECT_NOT_ALLOWED", `redirecionamento para domínio não verificado (${next.hostname})`, res.status);
      redirects.push(next.href);
      url = next;
      continue;
    }
    if (!res.ok) return fail("HTTP_ERROR", `HTTP ${res.status}`, res.status);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) return fail("TOO_LARGE", `documento demasiado grande (${declared} bytes)`, res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail("TOO_LARGE", `documento demasiado grande (${buf.length} bytes)`, res.status);
    if (buf.length === 0) return fail("EMPTY", "resposta vazia", res.status);
    const headers = Object.fromEntries(KEEP_HEADERS.flatMap((k) => (res.headers.get(k) ? [[k, res.headers.get(k)!]] : [])));
    return {
      ok: true, requestedUrl: rawUrl, finalUrl: url.href, redirects, status: res.status, contentType: res.headers.get("content-type") ?? "",
      headers, bodyBase64: buf.toString("base64"), latencyMs: clock() - t0, retrieverVersion: RETRIEVER_VERSION,
    };
  }
}

/* ─── Semantic extraction (LLM) — only with a server-side key ─── */

export async function extract(body: unknown, deps: ProxyDeps): Promise<{ status: number; body: unknown }> {
  const key = deps.env.FLEETOS_EXTRACTION_API_KEY;
  if (!key) return { status: 503, body: { ok: false, error: { kind: "UNAVAILABLE", message: "fornecedor de extração semântica não configurado (FLEETOS_EXTRACTION_API_KEY ausente no servidor)" } } };
  const b = body as { system?: unknown; user?: unknown; maxTokens?: unknown };
  if (typeof b?.system !== "string" || typeof b?.user !== "string") return { status: 400, body: { ok: false, error: { kind: "BAD_REQUEST", message: "system/user em falta" } } };
  const model = deps.env.FLEETOS_EXTRACTION_MODEL ?? "claude-sonnet-5-5";
  const t0 = Date.now();
  try {
    const r = await deps.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: Math.min(Number(b.maxTokens) || 4000, 8000), system: b.system, messages: [{ role: "user", content: b.user }] }),
      signal: AbortSignal.timeout(90_000),
    });
    const latencyMs = Date.now() - t0;
    if (r.status === 429) return { status: 429, body: { ok: false, error: { kind: "RATE_LIMIT", message: "limite de pedidos do fornecedor" }, latencyMs } };
    if (!r.ok) return { status: 502, body: { ok: false, error: { kind: "PROVIDER_ERROR", message: `HTTP ${r.status}` }, latencyMs } };
    const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string; stop_reason?: string };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return {
      status: 200,
      body: { ok: true, provider: "anthropic", model: j.model ?? model, text, truncated: j.stop_reason === "max_tokens", usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 }, latencyMs },
    };
  } catch (e) {
    return { status: 504, body: { ok: false, error: { kind: "TIMEOUT_OR_NETWORK", message: e instanceof Error ? e.message : String(e) }, latencyMs: Date.now() - t0 } };
  }
}

/* ─── Web search — only with a server-side key ─── */

export async function search(q: string, deps: ProxyDeps): Promise<{ status: number; body: unknown }> {
  const key = deps.env.FLEETOS_SEARCH_API_KEY;
  if (!key) return { status: 503, body: { ok: false, error: { kind: "UNAVAILABLE", message: "fornecedor de pesquisa web não configurado (FLEETOS_SEARCH_API_KEY ausente no servidor)" } } };
  if (!q.trim() || q.length > 300) return { status: 400, body: { ok: false, error: { kind: "BAD_REQUEST", message: "consulta inválida" } } };
  try {
    const r = await deps.fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&country=pt&count=10`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 429) return { status: 429, body: { ok: false, error: { kind: "RATE_LIMIT", message: "limite de pesquisas" } } };
    if (!r.ok) return { status: 502, body: { ok: false, error: { kind: "PROVIDER_ERROR", message: `HTTP ${r.status}` } } };
    const j = (await r.json()) as { web?: { results?: { url: string; title: string; description?: string }[] } };
    return { status: 200, body: { ok: true, provider: "brave", hits: (j.web?.results ?? []).map((h, i) => ({ url: h.url, title: h.title, snippet: h.description ?? "", rank: i + 1 })) } };
  } catch (e) {
    return { status: 504, body: { ok: false, error: { kind: "TIMEOUT_OR_NETWORK", message: e instanceof Error ? e.message : String(e) } } };
  }
}

/* ─── Connect middleware ─── */

async function readBody(req: IncomingMessage, max = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new Error("pedido demasiado grande");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function researchMiddleware(deps: ProxyDeps) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const u = new URL(req.url ?? "/", "http://local");
    if (!u.pathname.startsWith("/__research/")) return next();
    const route = u.pathname.slice("/__research/".length);
    try {
      if (route === "status" && req.method === "GET") {
        return json(res, 200, { retrieve: true, extract: !!deps.env.FLEETOS_EXTRACTION_API_KEY, search: !!deps.env.FLEETOS_SEARCH_API_KEY, retrieverVersion: RETRIEVER_VERSION });
      }
      if (route === "retrieve" && req.method === "GET") {
        const r = await retrieve(u.searchParams.get("url") ?? "", Number(u.searchParams.get("maxRedirects") ?? 3), deps);
        return json(res, 200, r);
      }
      if (route === "extract" && req.method === "POST") {
        const r = await extract(await readBody(req), deps);
        return json(res, r.status, r.body);
      }
      if (route === "search" && req.method === "GET") {
        const r = await search(u.searchParams.get("q") ?? "", deps);
        return json(res, r.status, r.body);
      }
      return json(res, 404, { ok: false, error: { kind: "NOT_FOUND", message: "rota desconhecida" } });
    } catch (e) {
      return json(res, 500, { ok: false, error: { kind: "INTERNAL", message: e instanceof Error ? e.message : String(e) } });
    }
  };
}
