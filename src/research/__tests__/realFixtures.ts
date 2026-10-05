import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RecordedDocument } from "../retrieval";

/*
 * REAL official documents recorded by scripts/record-research-snapshots.mjs (unedited bytes +
 * retrieval metadata). Replayed offline at their original URLs — no network in tests.
 */
const DIR = resolve(__dirname, "../__fixtures__/real");

export type ManifestEntry = { name: string; label: string; requestedUrl: string; finalUrl: string; httpStatus: number; headers: Record<string, string>; sha256: string; retrievedAt: string };
export const MANIFEST: ManifestEntry[] = JSON.parse(readFileSync(resolve(DIR, "manifest.json"), "utf8"));

export const realBytes = (name: string) => new Uint8Array(readFileSync(resolve(DIR, name)));
export const entry = (name: string) => MANIFEST.find((m) => m.name === name)!;

export function realDocument(name: string, atUrl?: string): RecordedDocument {
  const m = entry(name);
  return { url: atUrl ?? m.requestedUrl, finalUrl: atUrl ?? m.finalUrl, status: m.httpStatus, contentType: m.headers["content-type"] ?? "", headers: m.headers, bytes: realBytes(name) };
}

export const allRealDocuments = (): RecordedDocument[] => MANIFEST.map((m) => realDocument(m.name));
