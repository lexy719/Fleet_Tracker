import { candidateContentHash, emptyFields, field, type ParsedCandidate } from "../candidate";
import { fold, htmlToText, normalizeWs } from "../text";
import type { CandidateCategory, ExtractionError, ParseOutput, RawSnapshot } from "../types";

/*
 * IP — «Alertas · Rodovia» works notices (Drupal CMS, content type servicos_viajar_na_estrada),
 * read through the site's JSON:API: /jsonapi/node/servicos_viajar_na_estrada.
 * A different backend from the «Trânsito em Tempo Real» ArcGIS layers (no shared id).
 * Structured: uuid, drupal_internal__nid/vid, created, changed, path.alias.
 * Prose only: road, km, municipality, dates, traffic measure (title, field_alertas_destaque,
 * field_conteudos_alerta). Values read from prose are INTERPRETED; geometry is not given.
 */

export const IP_ALERTAS_PARSER_VERSION = 1;
export const IP_ALERTAS_SITE = "https://servicos.infraestruturasdeportugal.pt/pt-pt";

const ROAD = /\b(A|IC|IP|EN|ER|EM|CM)\s?(\d{1,4}(?:-\d{1,2})?)\b/g;
const KM_RANGE = /\bkm\)?\s*(\d{1,3}[,.]\d{1,3}|\d{1,3})\s*(?:e|a|ao|até)\s*(?:o\s+)?(?:km\s*)?(\d{1,3}[,.]\d{1,3}|\d{1,3})/i;
const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

/** Ordered text-measure rules; first match wins. Never VERIFIED — the source has no type field. */
const MEASURES: [RegExp, CandidateCategory, string][] = [
  [/\b(corte total|interdi[cç][aã]o (do transito|da circula[cç][aã]o)|interditar a circula[cç][aã]o|encerramento ao transito|transito (sera )?cortado|corte (de|do) (transito|trafego))\b/, "ROAD_CLOSURE", "corte/interdição"],
  [/\bdesvio de (transito|itinerario)\b/, "ROAD_CLOSURE", "desvio de trânsito"],
  [/\b(circula[cç][aã]o alternada|transito alternado|supress[aã]o (de|da) via|condicionamento|via (da direita|da esquerda) (sera )?suprimida)\b/, "LANE_CLOSURE", "condicionamento/via suprimida/alternado"],
];

type Node = { id?: unknown; attributes?: Record<string, unknown> };

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? normalizeWs(v) : undefined);
const richText = (v: unknown): string | undefined => {
  const raw = v && typeof v === "object" ? (v as { value?: unknown }).value : undefined;
  return typeof raw === "string" && raw.trim() ? normalizeWs(htmlToText(raw)) : undefined;
};

/** "12 de outubro" / "6 de novembro de 2026" → ISO dates. Year defaults to the notice's year. */
function datesIn(text: string, defaultYear: number): string[] {
  const out: string[] = [];
  for (const m of fold(text).matchAll(/\b(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/g)) {
    const y = m[3] ? Number(m[3]) : defaultYear;
    out.push(`${y}-${String(MONTHS[m[2]!]).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  return out;
}

export function parseIpAlertasJsonapi(snapshot: RawSnapshot): ParseOutput {
  const errors: ExtractionError[] = [];
  const err = (message: string): ParseOutput => ({ candidates: [], errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message }], recordCount: 0 });
  let json: unknown;
  try {
    json = JSON.parse(snapshot.body);
  } catch (e) {
    return err(`JSON inválido: ${String(e)}`);
  }
  const root = json as { data?: unknown; errors?: { title?: string }[] };
  if (root.errors?.length) return err(`JSON:API error: ${root.errors[0]?.title ?? "?"}`);
  if (!Array.isArray(root.data)) return err("resposta sem «data»");

  const candidates: ParsedCandidate[] = [];
  let newest = "";
  for (const [i, n] of (root.data as Node[]).entries()) {
    const a = n?.attributes;
    const uuid = typeof n?.id === "string" ? n.id : undefined;
    if (!a || !uuid) {
      errors.push({ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: `nó ${i} sem id/atributos` });
      continue;
    }
    const alias = (a.path as { alias?: unknown } | undefined)?.alias;
    if (typeof alias !== "string" || !alias.startsWith("/alertas/rodovia/")) continue; // rail or other pages
    const title = str(a.title) ?? "Aviso IP";
    const summary = richText(a.field_alertas_destaque);
    const body = richText(a.field_conteudos_alerta);
    const created = typeof a.created === "string" ? a.created : undefined;
    const changed = typeof a.changed === "string" ? a.changed : undefined;
    if (changed && changed > newest) newest = changed;
    const text = [title, summary, body].filter(Boolean).join(" · ");
    const folded = fold(text);

    const issues: string[] = ["Aviso em texto: estrada, km, datas e medida lidos do texto — requer revisão antes de bloquear qualquer via."];
    const fields = emptyFields();

    const measure = MEASURES.find(([re]) => re.test(folded));
    fields.category = measure
      ? field("INTERPRETED", measure[1], `texto contém «${measure[2]}»`)
      : field("INTERPRETED", "ROADWORKS", "aviso de trabalhos sem medida de trânsito reconhecida");

    const roads = [...new Set([...text.matchAll(ROAD)].map((m) => `${m[1]}${m[2]}`))];
    if (roads.length) fields.roads = field("INTERPRETED", roads, `referências no texto: ${roads.join(", ")}`);
    const km = text.match(KM_RANGE);
    if (km) fields.locationText = field("INTERPRETED", `${roads[0] ?? "?"} km ${km[1]} a ${km[2]}`, km[0]);

    const year = created ? Number(created.slice(0, 4)) : new Date(snapshot.fetchedAt).getUTCFullYear();
    const dates = datesIn(summary ?? body ?? "", year).sort();
    if (dates.length) {
      const start = dates[0]!;
      const end = dates.length > 1 ? dates[dates.length - 1]! : undefined;
      fields.validity = field(
        "INTERPRETED",
        { start: `${start}T00:00:00.000Z`, ...(end ? { end: `${end}T23:59:00.000Z` } : {}) },
        `datas no texto: ${dates.join(", ")}`,
        "Datas lidas do texto; ano implícito = ano do aviso; horas não lidas.",
      );
    } else issues.push("sem datas reconhecíveis no texto");

    const nid = typeof a.drupal_internal__nid === "number" ? a.drupal_internal__nid : undefined;
    const url = `${IP_ALERTAS_SITE}${alias}${nid !== undefined ? ` (nó ${nid})` : ""}`;
    if (body) fields.description = field("VERIFIED", body.slice(0, 2000), "field_conteudos_alerta", url);
    else if (summary) fields.description = field("VERIFIED", summary, "field_alertas_destaque", url);

    candidates.push({
      id: `${snapshot.sourceId}:${uuid}`,
      sourceId: snapshot.sourceId,
      externalId: uuid,
      title: summary ? `${title} — ${summary}` : title,
      fields,
      extraction: { kind: "parser", parser: "ip-alertas-jsonapi", version: IP_ALERTAS_PARSER_VERSION },
      snapshotId: snapshot.id,
      contentHash: candidateContentHash(title, fields),
      issues,
    });
  }
  return {
    candidates,
    errors,
    recordCount: root.data.length,
    ...(newest ? { publishedAt: new Date(newest).toISOString(), publishedAtBasis: "máximo de «changed» dos avisos" } : {}),
  };
}
