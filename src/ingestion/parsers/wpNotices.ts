import { candidateContentHash, emptyFields, field, type ParsedCandidate } from "../candidate";
import { fold, htmlToText, normalizeWs } from "../text";
import type { CandidateCategory, ExtractionError, ParseOutput, RawSnapshot } from "../types";

/*
 * Municipal traffic notices published as WordPress posts, read through the public REST API:
 * /wp-json/wp/v2/posts?search=…&_fields=id,date,modified,link,title,content
 * One parser for every municipality — only the source URL changes.
 * Structured: id, date, modified, link. Everything else is prose ⇒ INTERPRETED; no geometry.
 * Posts that are not traffic notices (news that merely mention «trânsito») are skipped.
 */

export const WP_NOTICES_PARSER_VERSION = 1;

const NOTICE = /\b(corte|condicionamento|interrup[cç][aã]o|interdi[cç][aã]o|altera[cç][aã]o|encerramento|restri[cç][oõ]es?|desvio)s?\b[^.]{0,40}\b(transito|circula[cç][aã]o|trafego|via|rua|estrada)\b|\bedital\b[^.]{0,80}\btransito\b|\btransito (cortado|condicionado|interdito)\b/;
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const STREET = /\b(Rua|Avenida|Av\.|Largo|Praça|Travessa|Estrada|Caminho|Alameda|Rotunda|EN ?\d+|EM ?\d+|ER ?\d+)\s[^,;.\n]{2,60}/g;

type Post = { id?: unknown; date?: unknown; modified?: unknown; modified_gmt?: unknown; link?: unknown; title?: { rendered?: unknown }; content?: { rendered?: unknown } };

const text = (v: unknown): string => (typeof v === "string" ? normalizeWs(htmlToText(v)) : "");

function categoryOf(t: string): { value: CandidateCategory; basis: string } {
  if (/\b(corte|interrup[cç][aã]o|interdi[cç][aã]o|encerramento|transito (cortado|interdito))\b/.test(t)) return { value: "ROAD_CLOSURE", basis: "texto indica corte/interrupção/interdição" };
  if (/\b(condicionamento|condicionado|restri[cç])/.test(t)) return { value: "LANE_CLOSURE", basis: "texto indica condicionamento" };
  return { value: "OTHER", basis: "aviso de trânsito sem medida reconhecida" };
}

function datesIn(t: string, defaultYear: number): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})(?:\.º|º)? de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/g)) {
    out.push(`${m[3] ?? defaultYear}-${String(MONTHS[m[2]!]).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)) {
    out.push(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  return out.filter((d) => !Number.isNaN(Date.parse(d)));
}

export function parseWpNotices(snapshot: RawSnapshot): ParseOutput {
  const errors: ExtractionError[] = [];
  const err = (message: string): ParseOutput => ({ candidates: [], errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message }], recordCount: 0 });
  let json: unknown;
  try {
    json = JSON.parse(snapshot.body);
  } catch (e) {
    return err(`JSON inválido: ${String(e)}`);
  }
  if (!Array.isArray(json)) {
    const code = (json as { code?: unknown })?.code;
    return err(`resposta não é uma lista de posts${typeof code === "string" ? ` (${code})` : ""}`);
  }

  const candidates: ParsedCandidate[] = [];
  let newest = "";
  for (const [i, p] of (json as Post[]).entries()) {
    const id = typeof p?.id === "number" || typeof p?.id === "string" ? String(p.id) : undefined;
    if (!id) {
      errors.push({ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: `post ${i} sem id` });
      continue;
    }
    const title = text(p.title?.rendered) || `Post ${id}`;
    const body = text(p.content?.rendered);
    const folded = fold(`${title} · ${body}`);
    // `modified` is site-local without offset; `modified_gmt` is UTC without the «Z».
    const modified = typeof p.modified_gmt === "string" ? `${p.modified_gmt}Z` : typeof p.modified === "string" ? p.modified : undefined;
    if (modified && modified > newest) newest = modified;
    if (!NOTICE.test(folded)) continue; // a news item that only mentions traffic

    const fields = emptyFields();
    const issues = ["Aviso municipal em texto: local, datas e medida lidos do texto; sem geometria — requer revisão antes de bloquear qualquer via."];
    const cat = categoryOf(folded);
    fields.category = field("INTERPRETED", cat.value, cat.basis);
    const streets = [...new Set([...`${title} ${body}`.matchAll(STREET)].map((m) => normalizeWs(m[0])))].slice(0, 5);
    if (streets.length) fields.locationText = field("INTERPRETED", streets.join(" · "), "vias mencionadas no texto");
    const date = typeof p.date === "string" ? p.date : undefined;
    const dates = datesIn(fold(body || title), date ? Number(date.slice(0, 4)) : new Date(snapshot.fetchedAt).getUTCFullYear()).sort();
    if (dates.length) {
      fields.validity = field(
        "INTERPRETED",
        { start: `${dates[0]}T00:00:00.000Z`, ...(dates.length > 1 ? { end: `${dates[dates.length - 1]}T23:59:00.000Z` } : {}) },
        `datas no texto: ${dates.join(", ")}`,
        "Datas lidas do texto; horas não lidas.",
      );
    } else issues.push("sem datas reconhecíveis no texto (aviso pode estar num PDF anexo)");
    const link = typeof p.link === "string" ? p.link : undefined;
    fields.description = field("VERIFIED", (body || title).slice(0, 2000), "content.rendered", link);

    candidates.push({
      id: `${snapshot.sourceId}:${id}`,
      sourceId: snapshot.sourceId,
      externalId: id,
      title,
      fields,
      extraction: { kind: "parser", parser: "wp-notices", version: WP_NOTICES_PARSER_VERSION },
      snapshotId: snapshot.id,
      contentHash: candidateContentHash(title, fields),
      issues,
    });
  }
  return {
    candidates,
    errors,
    recordCount: json.length,
    ...(newest ? { publishedAt: new Date(newest).toISOString(), publishedAtBasis: "máximo de «modified» dos posts devolvidos" } : {}),
  };
}
