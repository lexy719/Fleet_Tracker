import { hashString } from "../regulations/decisionInputs";
import { htmlMainText, pdfText, plainText } from "./documentText";
import type { EvidenceStore } from "./evidence";
import type { DocumentSnapshot, DocumentText, Observation, ResearchReason, RetrievalErrorKind, RetrievalRecord } from "./types";

/*
 * Retrieval: fetch an official document, then PRESERVE it — original bytes, SHA-256,
 * request/response metadata and a deterministic text representation. A failed retrieval
 * produces a RetrievalRecord with an error and NOTHING else: no snapshot, no observation,
 * and therefore never a "no longer reported" inference.
 */

export type RawRetrieval =
  | { ok: true; requestedUrl: string; finalUrl: string; redirects: string[]; status: number; contentType: string; headers: Record<string, string>; bytes: Uint8Array; latencyMs: number; retrieverVersion: number }
  | { ok: false; requestedUrl: string; redirects: string[]; status?: number; error: { kind: RetrievalErrorKind; message: string }; latencyMs: number; retrieverVersion: number };

export interface DocumentRetriever {
  id: string;
  method: RetrievalRecord["method"];
  retrieve(url: string, maxRedirects: number): Promise<RawRetrieval>;
}

const KINDS: RetrievalErrorKind[] = ["NOT_ALLOWED", "ROBOTS_DISALLOWED", "REDIRECT_LIMIT", "REDIRECT_NOT_ALLOWED", "HTTP_ERROR", "TIMEOUT", "NETWORK", "TOO_LARGE", "EMPTY", "UNAVAILABLE", "BUDGET_EXHAUSTED"];

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Browser retriever through the local research boundary (allow-listed official domains only). */
export function proxyRetriever(fetchImpl: typeof fetch = (u, i) => fetch(u, i), endpoint = "/__research/retrieve"): DocumentRetriever {
  return {
    id: "research-proxy",
    method: "research-proxy",
    async retrieve(url, maxRedirects) {
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetchImpl(`${endpoint}?url=${encodeURIComponent(url)}&maxRedirects=${maxRedirects}`, { headers: { Accept: "application/json" } });
      } catch (e) {
        return { ok: false, requestedUrl: url, redirects: [], error: { kind: "UNAVAILABLE", message: `fronteira de investigação inacessível: ${e instanceof Error ? e.message : String(e)}` }, latencyMs: Date.now() - t0, retrieverVersion: 0 };
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
        return { ok: false, requestedUrl: url, redirects: [], error: { kind: "UNAVAILABLE", message: `fronteira de investigação indisponível neste ambiente (HTTP ${res.status})` }, latencyMs: Date.now() - t0, retrieverVersion: 0 };
      }
      const j = (await res.json()) as Record<string, unknown>;
      if (j.ok !== true) {
        const err = (j.error ?? {}) as { kind?: string; message?: string };
        const kind = KINDS.includes(err.kind as RetrievalErrorKind) ? (err.kind as RetrievalErrorKind) : "NETWORK";
        return { ok: false, requestedUrl: url, redirects: (j.redirects as string[]) ?? [], ...(typeof j.status === "number" ? { status: j.status } : {}), error: { kind, message: String(err.message ?? "erro") }, latencyMs: Number(j.latencyMs) || Date.now() - t0, retrieverVersion: Number(j.retrieverVersion) || 0 };
      }
      return {
        ok: true,
        requestedUrl: url,
        finalUrl: String(j.finalUrl),
        redirects: (j.redirects as string[]) ?? [],
        status: Number(j.status),
        contentType: String(j.contentType ?? ""),
        headers: (j.headers as Record<string, string>) ?? {},
        bytes: base64ToBytes(String(j.bodyBase64 ?? "")),
        latencyMs: Number(j.latencyMs) || Date.now() - t0,
        retrieverVersion: Number(j.retrieverVersion) || 0,
      };
    },
  };
}

export type RecordedDocument =
  | { url: string; finalUrl?: string; redirects?: string[]; status: number; contentType: string; headers?: Record<string, string>; bytes: Uint8Array }
  | { url: string; error: { kind: RetrievalErrorKind; message: string }; status?: number; redirects?: string[] };

/** Replays preserved documents (real recorded snapshots or labelled failure fixtures). Unknown URL ⇒ HTTP 404. */
export function recordedRetriever(docs: RecordedDocument[], id = "recorded"): DocumentRetriever & { calls: string[] } {
  const calls: string[] = [];
  return {
    id,
    method: "recorded",
    calls,
    async retrieve(url) {
      calls.push(url);
      const d = docs.find((x) => x.url === url);
      if (!d) return { ok: false, requestedUrl: url, redirects: [], status: 404, error: { kind: "HTTP_ERROR", message: "HTTP 404" }, latencyMs: 0, retrieverVersion: 1 };
      if ("error" in d) return { ok: false, requestedUrl: url, redirects: d.redirects ?? [], ...(d.status ? { status: d.status } : {}), error: d.error, latencyMs: 0, retrieverVersion: 1 };
      return { ok: true, requestedUrl: url, finalUrl: d.finalUrl ?? url, redirects: d.redirects ?? [], status: d.status, contentType: d.contentType, headers: d.headers ?? { "content-type": d.contentType }, bytes: d.bytes, latencyMs: 0, retrieverVersion: 1 };
    },
  };
}

/** Text representation by content type (sniffing PDF magic bytes too). */
export async function textFor(contentType: string, bytes: Uint8Array): Promise<DocumentText> {
  const isPdf = /pdf/i.test(contentType) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (isPdf) return pdfText(bytes);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/html/i.test(contentType) || /^\s*<(!doctype html|html)/i.test(text)) return htmlMainText(text);
  return plainText(text);
}

export type Preserved = { record: RetrievalRecord; snapshot?: DocumentSnapshot; observation?: Observation; created?: boolean };

export async function preserveRetrieval(
  raw: RawRetrieval,
  ctx: { store: EvidenceStore; method: RetrievalRecord["method"]; now: Date; why: ResearchReason; sourceId?: string; authorityId?: string },
): Promise<Preserved> {
  const at = ctx.now.toISOString();
  const base = {
    id: `ret-${hashString(`${raw.requestedUrl}|${at}|${Math.random()}`)}`,
    requestedUrl: raw.requestedUrl,
    redirects: raw.redirects,
    retrievedAt: at,
    method: ctx.method,
    retrieverVersion: raw.retrieverVersion,
    latencyMs: raw.latencyMs,
    why: ctx.why,
    ...(ctx.sourceId ? { sourceId: ctx.sourceId } : {}),
    ...(ctx.authorityId ? { authorityId: ctx.authorityId } : {}),
  };
  if (!raw.ok) {
    const record: RetrievalRecord = { ...base, headers: {}, ...(raw.status ? { httpStatus: raw.status } : {}), error: raw.error };
    await ctx.store.addRetrieval(record);
    return { record };
  }
  const sha256 = await sha256Bytes(raw.bytes);
  const snapshotId = `snap-${sha256.slice(0, 32)}`;
  const prev = (await ctx.store.observationsFor(raw.finalUrl)).at(-1);
  const text = await textFor(raw.contentType, raw.bytes);
  const { snapshot, created } = await ctx.store.preserveSnapshot({
    id: snapshotId,
    sha256,
    contentType: raw.contentType,
    byteLength: raw.bytes.length,
    bytesBase64: bytesToBase64(raw.bytes),
    text,
    firstSeenAt: at,
    firstUrl: raw.finalUrl,
  });
  const unchanged = prev?.snapshotId === snapshotId;
  const record: RetrievalRecord = {
    ...base,
    finalUrl: raw.finalUrl,
    httpStatus: raw.status,
    contentType: raw.contentType,
    headers: raw.headers,
    sha256,
    byteLength: raw.bytes.length,
    snapshotId,
    unchanged,
  };
  const observation: Observation = { id: `obs-${record.id}`, url: raw.finalUrl, snapshotId, observedAt: at, retrievalId: record.id, unchanged };
  await ctx.store.addRetrieval(record);
  await ctx.store.addObservation(observation);
  return { record, snapshot, observation, created };
}
