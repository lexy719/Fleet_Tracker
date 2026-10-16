import { candidateContentHash, emptyFields, field, geometryField, type ParsedCandidate } from "../candidate";
import { normalizeWs } from "../text";
import { fromLocalMinute, LISBON } from "../time";
import type { CandidateCategory, ExtractionError, ParseOutput, RawSnapshot } from "../types";

/*
 * Lisboa — «Condicionamentos de Trânsito» (City Platform), the feed behind
 * condicionamentos-transito.cm-lisboa.pt: GET {base}/traffic/closures/ → GeoJSON
 * FeatureCollection. Fields (verified 2026-10-10): id, pedido (COND-YYYY-N),
 * periodos_condicionamentos[{date_min, date_max, hour_min, hour_max, is_interrupted}],
 * morada, freguesias, restricao_circulacao, impacto, motivo, panfleto.
 * Geometry: MultiLineString [lng, lat].
 */

export const LISBOA_CLOSURES_PARSER_VERSION = 1;

/** restricao_circulacao → category. Only "Corte total" is an unconditional prohibition. */
const CATEGORY: Record<string, CandidateCategory> = {
  "Corte total": "ROAD_CLOSURE",
  "Corte num sentido": "ROAD_CLOSURE",
  "Cortes temporários": "ROAD_CLOSURE",
  "Estreitamento de via": "LANE_CLOSURE",
  "Mantém perfil de via": "OTHER",
  Estacionamento: "OTHER",
  Passeio: "OTHER",
};

/** Daily windows are expanded into dated periods up to this many days; longer spans go to review. */
export const MAX_EXPANDED_DAYS = 400;

type Period = { date_min?: unknown; date_max?: unknown; hour_min?: unknown; hour_max?: unknown; is_interrupted?: unknown };
type Feature = { properties?: Record<string, unknown>; geometry?: { type?: unknown; coordinates?: unknown } };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? normalizeWs(v) : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" or null; "23:59" is read as end of day (24:00 → next day 00:00). */
function hhmm(v: unknown): string | null {
  const m = typeof v === "string" ? v.match(HOUR) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Expand one source period into local dated intervals [start, end).
 * The publisher's own portal renders every period as «de D1 a D2 das H1 às H2» (daily
 * window), regardless of `is_interrupted` — we follow that reading. 00:00–23:59 is one
 * continuous interval.
 */
function expand(p: Period, issues: string[]): { start: string; end: string }[] | null {
  const d0 = typeof p.date_min === "string" && DATE.test(p.date_min) ? p.date_min : null;
  const d1 = typeof p.date_max === "string" && DATE.test(p.date_max) ? p.date_max : null;
  const h0 = hhmm(p.hour_min);
  const h1 = hhmm(p.hour_max);
  if (!d0 || !d1 || !h0 || !h1 || d1 < d0) {
    issues.push(`período inválido (${JSON.stringify(p)})`);
    return null;
  }
  const fullDay = h0 === "00:00" && (h1 === "23:59" || h1 === "00:00");
  if (fullDay) return [{ start: `${d0}T00:00`, end: `${addDays(d1, 1)}T00:00` }];
  if (h1 <= h0) {
    issues.push(`janela horária que atravessa a meia-noite (${h0}–${h1}) — não expandida`);
    return null;
  }
  const days = Math.round((Date.parse(`${d1}T00:00:00Z`) - Date.parse(`${d0}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > MAX_EXPANDED_DAYS) {
    issues.push(`janela diária ${h0}–${h1} durante ${days} dias — demasiado longa para expandir automaticamente`);
    return null;
  }
  const out: { start: string; end: string }[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(d0, i);
    out.push({ start: `${day}T${h0}`, end: `${day}T${h1}` });
  }
  return out;
}

function lines(geometry: Feature["geometry"]): [number, number][][] | null {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  const raw = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : null;
  if (!raw) return null;
  const out: [number, number][][] = [];
  for (const ln of raw as unknown[]) {
    if (!Array.isArray(ln)) continue;
    const pts: [number, number][] = [];
    for (const c of ln as unknown[]) {
      if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") continue;
      const [lng, lat] = c as [number, number];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) pts.push([lat, lng]);
    }
    if (pts.length >= 2) out.push(pts);
  }
  return out.length ? out : null;
}

export function parseLisboaClosures(snapshot: RawSnapshot): ParseOutput {
  const errors: ExtractionError[] = [];
  const err = (message: string): ParseOutput => ({ candidates: [], errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message }], recordCount: 0 });
  let json: unknown;
  try {
    json = JSON.parse(snapshot.body);
  } catch (e) {
    return err(`JSON inválido: ${String(e)}`);
  }
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return err("resposta sem «features»");

  const candidates: ParsedCandidate[] = [];
  for (const [i, f] of (features as Feature[]).entries()) {
    const p = f?.properties;
    const id = p && (typeof p.id === "number" || typeof p.id === "string") ? String(p.id) : undefined;
    if (!p || !id) {
      errors.push({ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: `feature ${i} sem id` });
      continue;
    }
    const issues: string[] = [];
    const fields = emptyFields();
    const restr = str(p.restricao_circulacao);
    if (restr) {
      const cat = CATEGORY[restr];
      fields.category = cat
        ? field("VERIFIED", cat, `restricao_circulacao = ${restr}`)
        : field("VERIFIED", "OTHER", `restricao_circulacao = ${restr}`, "Valor não mapeado — tratado como OTHER.");
      if (restr === "Corte num sentido") issues.push("Corte só num sentido — a fonte não indica qual; requer revisão antes de bloquear a via.");
      if (restr === "Cortes temporários") issues.push("Cortes temporários (intermitentes) — a fonte não indica quando dentro do período; requer revisão.");
    } else issues.push("registo sem «restricao_circulacao»");

    const morada = str(p.morada);
    const freg = str(p.freguesias);
    if (morada || freg) fields.locationText = field("VERIFIED", [morada, freg].filter(Boolean).join(" · "), "morada, freguesias");

    const geom = lines(f.geometry);
    if (geom) fields.geometry = geometryField("VERIFIED", { kind: "lines", lines: geom }, "VERIFIED", "geometry (MultiLineString)");
    else issues.push("sem geometria linear válida");

    const raw = Array.isArray(p.periodos_condicionamentos) ? (p.periodos_condicionamentos as Period[]) : [];
    if (!raw.length) issues.push("sem períodos de condicionamento");
    const periods: { start: string; end: string }[] = [];
    let expandable = raw.length > 0;
    for (const per of raw) {
      const e = expand(per, issues);
      if (e) periods.push(...e);
      else expandable = false;
    }
    if (periods.length) {
      periods.sort((a, b) => a.start.localeCompare(b.start));
      const startMs = fromLocalMinute(periods[0]!.start, LISBON);
      const endMs = fromLocalMinute(periods[periods.length - 1]!.end, LISBON);
      if (startMs !== null && endMs !== null) {
        fields.validity = field("VERIFIED", { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }, "periodos_condicionamentos (date_min/date_max/hour_min/hour_max)");
      }
      if (expandable) {
        fields.periods = field(
          "INTERPRETED",
          periods,
          "periodos_condicionamentos",
          "Lido como janela diária «de D1 a D2, das H1 às H2», como o próprio portal da CM Lisboa apresenta; «is_interrupted» não é usado pelo portal e não é interpretado.",
        );
      }
    }

    if (fields.category.value === "ROAD_CLOSURE") {
      fields.vehicleApplicability = field("INTERPRETED", { kind: "all_traffic" }, `restricao_circulacao = ${restr}`, "Corte sem indicação de veículos isentos — lido como aplicável a todo o trânsito.");
    }
    const motivo = str(p.motivo);
    const impacto = str(p.impacto);
    const desc = [motivo, impacto ? `impacto: ${impacto}` : undefined, str(p.pedido)].filter(Boolean).join(" · ");
    if (desc) fields.description = field("VERIFIED", desc, "motivo, impacto, pedido");

    const title = [morada ?? `Condicionamento ${id}`, restr].filter(Boolean).join(" — ");
    candidates.push({
      id: `${snapshot.sourceId}:${id}`,
      sourceId: snapshot.sourceId,
      externalId: id,
      title,
      fields,
      extraction: { kind: "parser", parser: "lisboa-closures", version: LISBOA_CLOSURES_PARSER_VERSION },
      snapshotId: snapshot.id,
      contentHash: candidateContentHash(title, fields),
      issues,
    });
  }
  // The live service declares no publication time: it serves the platform's current state at
  // request time. The fetch time is used, and the basis says so explicitly.
  return {
    candidates,
    errors,
    recordCount: features.length,
    publishedAt: snapshot.fetchedAt,
    publishedAtBasis: "serviço em tempo real sem data declarada — usada a hora da consulta",
  };
}
