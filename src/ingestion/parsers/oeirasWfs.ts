import { hashString } from "../../regulations/decisionInputs";
import { candidateContentHash, emptyFields, field, geometryField, type ParsedCandidate } from "../candidate";
import { fold, normalizeWs } from "../text";
import type { CandidateCategory, ExtractionError, ParseOutput, RawSnapshot } from "../types";

/*
 * Oeiras — «Condicionalismos na Via Pública» (WFS 2.0, GeoJSON output, CC BY 4.0).
 * Fields (verified 2026-10-10): nome, local, morada, freguesia, requerente, estado_obra
 * (Concluído / Execução / Previsto), data_prevista_inicio, data_prevista_conclusao,
 * ultima_atualizacao. Point geometry. The WFS was asked for EPSG:4326 (srsName).
 *
 * `requerente` (applicant — may be a private person) is deliberately NOT read.
 */

export const OEIRAS_WFS_PARSER_VERSION = 1;

/** Prose → category. Text only ever yields INTERPRETED values. */
function categoryOf(nome: string): { value: CandidateCategory; basis: string } {
  const t = fold(nome);
  if (/\b(corte|interrupcao|encerramento|interdicao)\b/.test(t)) return { value: "ROAD_CLOSURE", basis: `nome = «${nome}»` };
  if (/condicionamento de transito/.test(t)) return { value: "LANE_CLOSURE", basis: `nome = «${nome}»` };
  return { value: "ROADWORKS", basis: `nome = «${nome}»` };
}

type Feature = { id?: unknown; properties?: Record<string, unknown>; geometry?: { type?: unknown; coordinates?: unknown } };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? normalizeWs(v) : undefined);
const day = (v: unknown): string | undefined => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

export function parseOeirasWfs(snapshot: RawSnapshot): ParseOutput {
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
  let newest = "";
  const seen = new Set<string>();
  for (const [i, f] of (features as Feature[]).entries()) {
    const p = f?.properties;
    if (!p) {
      errors.push({ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: `feature ${i} sem propriedades` });
      continue;
    }
    const nome = str(p.nome);
    const morada = str(p.morada);
    const start = day(p.data_prevista_inicio);
    const end = day(p.data_prevista_conclusao);
    const updated = typeof p.ultima_atualizacao === "string" ? p.ultima_atualizacao : undefined;
    if (updated && updated > newest) newest = updated;

    // The WFS feature id is a row index; identify by content instead.
    let externalId = `oe-${hashString([nome ?? "?", morada ?? "?", start ?? "?"].join("|"))}`;
    if (seen.has(externalId)) externalId = `${externalId}-${i}`;
    seen.add(externalId);

    const issues: string[] = [];
    const fields = emptyFields();
    if (nome) {
      const c = categoryOf(nome);
      fields.category = field("INTERPRETED", c.value, c.basis, "Categoria lida do texto «nome» (a fonte não tem campo de tipo).");
      if (c.value === "ROAD_CLOSURE") issues.push("O texto indica corte/interrupção — categoria interpretada; requer revisão.");
    } else issues.push("registo sem «nome»");

    const where = [str(p.local), morada, str(p.freguesia)].filter(Boolean).join(" · ");
    if (where) fields.locationText = field("VERIFIED", where, "local, morada, freguesia");

    const c = f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates) ? (f.geometry.coordinates as unknown[]) : null;
    if (c && typeof c[0] === "number" && typeof c[1] === "number" && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180) {
      fields.geometry = geometryField("VERIFIED", { kind: "point", point: [c[1], c[0]] }, "VERIFIED", "geometry (Point)", "Só um ponto — extensão afetada não indicada.");
    } else issues.push("sem coordenadas WGS84 válidas");

    if (start) {
      fields.validity = field(
        "VERIFIED",
        { start: `${start}T00:00:00.000Z`, ...(end ? { end: `${end}T23:59:00.000Z` } : {}) },
        "data_prevista_inicio / data_prevista_conclusao",
        "Datas PREVISTAS (dia, sem hora) — o dia é lido por inteiro.",
      );
    }
    const estado = str(p.estado_obra);
    if (estado) {
      fields.description = field("VERIFIED", [nome, `estado: ${estado}`].filter(Boolean).join(" · "), "nome, estado_obra");
      if (fold(estado) === "concluido") issues.push("estado_obra = Concluído");
    } else if (nome) fields.description = field("VERIFIED", nome, "nome");

    const title = [morada ?? str(p.local) ?? "Oeiras", nome].filter(Boolean).join(" — ");
    candidates.push({
      id: `${snapshot.sourceId}:${externalId}`,
      sourceId: snapshot.sourceId,
      externalId,
      title,
      fields,
      extraction: { kind: "parser", parser: "oeiras-wfs", version: OEIRAS_WFS_PARSER_VERSION },
      snapshotId: snapshot.id,
      contentHash: candidateContentHash(title, fields),
      issues,
    });
  }
  const pub = newest ? new Date(newest) : null;
  return {
    candidates,
    errors,
    recordCount: features.length,
    ...(pub && Number.isFinite(pub.getTime()) ? { publishedAt: pub.toISOString(), publishedAtBasis: "máximo de ultima_atualizacao dos registos" } : {}),
  };
}
