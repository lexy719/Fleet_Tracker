import { parseTimestamp } from "../text";
import type { ParseOutput, RawSnapshot } from "../types";

/** CKAN package_show — metadata only (modification date, licence, declared frequency). */
export function parseCkanPackage(snapshot: RawSnapshot): ParseOutput & { meta?: { license?: string; frequency?: string; resources: { format: string; lastModified?: string }[] } } {
  const fail = (message: string): ParseOutput => ({
    candidates: [],
    errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message }],
    recordCount: 0,
  });
  let json: unknown;
  try {
    json = JSON.parse(snapshot.body);
  } catch (e) {
    return fail(`JSON inválido: ${String(e)}`);
  }
  const root = json as { success?: boolean; result?: Record<string, unknown> };
  if (root.success !== true || !root.result) return fail("CKAN: success ≠ true");
  const r = root.result;
  const resources = Array.isArray(r.resources) ? (r.resources as Record<string, unknown>[]) : [];
  const times = [r.metadata_modified, ...resources.map((x) => x.last_modified)]
    .map((t) => parseTimestamp(typeof t === "string" ? t : null))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const newest = times.sort((a, b) => b.iso.localeCompare(a.iso))[0];
  return {
    candidates: [],
    errors: [],
    recordCount: resources.length,
    ...(newest ? { publishedAt: newest.iso, publishedAtBasis: `CKAN metadata_modified/last_modified${newest.naive ? " (sem fuso — lido como UTC)" : ""}` } : {}),
    meta: {
      license: typeof r.license_title === "string" ? r.license_title : undefined,
      frequency: typeof r.frequency === "string" ? r.frequency : undefined,
      resources: resources.map((x) => ({ format: String(x.format ?? "?"), lastModified: typeof x.last_modified === "string" ? x.last_modified : undefined })),
    },
  };
}
