import { PT_ROAD_EVENTS, type RoadEventBundle } from "./portugal/roadEvents";
import { PT_AREAS, PT_CALENDARS, PT_GEOMETRIES, PT_REGULATIONS } from "./portugal/seededRestrictions";
import type { Condition, GeometryRecord, RegulationDataset, RegulationRecord } from "./types";

/** Bump when any seeded record changes; persisted with every route decision. */
export const REGULATION_DATASET: RegulationDataset = {
  id: "fleetos-regulations-pt",
  version: "2026-09-30.2",
  regulations: PT_REGULATIONS,
  geometries: PT_GEOMETRIES,
  areas: PT_AREAS,
  calendars: PT_CALENDARS,
};

export function getRegulationDataset(): RegulationDataset {
  return REGULATION_DATASET;
}

/** Road events that can be introduced (manually, for now). */
export function availableRoadEvents(): RoadEventBundle[] {
  return PT_ROAD_EVENTS;
}

/**
 * Standing legal restrictions + the given road events. The version string records which
 * events were included, so persisted decisions stay reproducible.
 */
export function buildRegulationDataset(
  enabledEventIds: readonly string[],
  ingested?: { constraints: RegulationRecord[]; geometries: GeometryRecord[]; fingerprint: string },
): RegulationDataset {
  const events = PT_ROAD_EVENTS.filter((e) => enabledEventIds.includes(e.id));
  const hasIngested = !!ingested && ingested.constraints.length > 0;
  if (events.length === 0 && !hasIngested) return REGULATION_DATASET;
  return {
    ...REGULATION_DATASET,
    version: [
      REGULATION_DATASET.version,
      ...events.map((e) => e.id),
      ...(hasIngested ? [`ingest-${ingested.fingerprint}`] : []),
    ].join("+"),
    regulations: [
      ...REGULATION_DATASET.regulations,
      ...events.flatMap((e) => e.constraints),
      ...(hasIngested ? ingested.constraints : []),
    ],
    // Same geometry id from several origins (e.g. a curated geometry carried by a reviewed
    // constraint and by its enabled road event): keep the first occurrence.
    geometries: [
      ...REGULATION_DATASET.geometries,
      ...events.flatMap((e) => e.geometries),
      ...(hasIngested ? ingested.geometries : []),
    ].filter((g, i, all) => all.findIndex((x) => x.id === g.id) === i),
  };
}

export function findEvidence(dataset: RegulationDataset, evidenceId: string) {
  for (const r of dataset.regulations) {
    const e = r.evidence.find((x) => x.id === evidenceId);
    if (e) return e;
  }
  return undefined;
}

function conditionRefs(c: Condition, out: { evidence: string[]; areas: string[] }) {
  switch (c.kind) {
    case "all":
    case "any":
      c.of.forEach((x) => conditionRefs(x, out));
      break;
    case "not":
      conditionRefs(c.of, out);
      break;
    case "fact":
      out.evidence.push(...c.evidence);
      break;
    case "stopInArea":
      out.evidence.push(...c.evidence);
      out.areas.push(c.areaId);
      break;
  }
}

/** Referential integrity: every evidence / geometry / area / calendar reference resolves. */
export function validateDataset(dataset: RegulationDataset): string[] {
  const problems: string[] = [];
  for (const reg of dataset.regulations) {
    const evIds = new Set(reg.evidence.map((e) => e.id));
    const refs = { evidence: [] as string[], areas: [] as string[] };
    conditionRefs(reg.appliesTo, refs);
    for (const x of reg.exceptions) {
      conditionRefs(x.condition, refs);
      refs.evidence.push(...x.evidence);
    }
    refs.evidence.push(
      ...reg.effective.evidence,
      ...reg.when.timeZoneEvidence,
      ...(reg.when.activePeriods ?? []).flatMap((p) => p.evidence),
      ...(reg.when.windows ?? []).flatMap((w) => w.evidence),
      ...(reg.when.days?.weekdaysEvidence ?? []),
      ...(reg.when.days?.dateOverrides ?? []).flatMap((o) => o.evidence),
    );
    for (const alt of reg.officialAlternatives ?? []) {
      refs.evidence.push(...alt.evidence);
      if (alt.geometryId) {
        const g = dataset.geometries.find((x) => x.id === alt.geometryId);
        if (!g) problems.push(`${reg.id}: alternative geometry ${alt.geometryId} missing`);
        else refs.evidence.push(...g.legalDescriptionEvidence, ...(g.resolved?.evidence ?? []));
      }
    }
    const geom = dataset.geometries.find((g) => g.id === reg.location.geometryId);
    if (!geom) problems.push(`${reg.id}: geometry ${reg.location.geometryId} missing`);
    else {
      refs.evidence.push(...geom.legalDescriptionEvidence, ...(geom.screeningArea?.evidence ?? []), ...(geom.resolved?.evidence ?? []));
      if (geom.status === "RESOLVED" && !geom.resolved) problems.push(`${geom.id}: RESOLVED without resolved geometry`);
    }
    for (const a of refs.areas) {
      const area = dataset.areas.find((x) => x.id === a);
      if (!area) problems.push(`${reg.id}: area ${a} missing`);
      else refs.evidence.push(...area.evidence);
    }
    if (!reg.when.activePeriods && !reg.when.windows && !reg.when.days) problems.push(`${reg.id}: no temporal rule`);
    for (const o of reg.when.days?.dateOverrides ?? []) {
      const cal = dataset.calendars.find((c) => c.id === o.calendarId);
      if (!cal) problems.push(`${reg.id}: calendar ${o.calendarId} missing`);
      else refs.evidence.push(...cal.evidence);
    }
    for (const id of new Set(refs.evidence)) if (!evIds.has(id)) problems.push(`${reg.id}: evidence ${id} missing`);
    for (const e of reg.evidence) if (!e.url || !e.retrievedAt) problems.push(`${reg.id}: evidence ${e.id} lacks url/retrievedAt`);
  }
  return problems;
}
