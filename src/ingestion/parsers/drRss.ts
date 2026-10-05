import { hashString } from "../../regulations/decisionInputs";
import { classifyLegalItem } from "../legalClassifier";
import { firstTagText, normalizeWs, parseTimestamp } from "../text";
import type { LegalFeedItem, ParseOutput, RawSnapshot } from "../types";

/** Diário da República daily RSS → classified index items (never constraints). */
export function parseDrRss(snapshot: RawSnapshot): ParseOutput & { legalItems: LegalFeedItem[] } {
  const body = snapshot.body;
  if (!/<rss[\s>]/.test(body) || !/<channel>/.test(body)) {
    return {
      candidates: [],
      legalItems: [],
      errors: [{ sourceId: snapshot.sourceId, snapshotId: snapshot.id, kind: "PARSE_ERROR", message: "não é um feed RSS" }],
      recordCount: 0,
    };
  }
  const items = body.split(/<item>/).slice(1).map((c) => c.split("</item>")[0]!);
  const legalItems: LegalFeedItem[] = [];
  let newest: string | undefined;
  for (const it of items) {
    const title = normalizeWs(firstTagText(it, "title") ?? "");
    const description = normalizeWs(firstTagText(it, "description") ?? "");
    const url = normalizeWs(firstTagText(it, "link") ?? "");
    if (!title) continue;
    // Titles end with "... Série I de 2026-09-30".
    const day = title.match(/de (\d{4}-\d{2}-\d{2})\s*$/)?.[1];
    if (day && (!newest || day > newest)) newest = day;
    const c = classifyLegalItem(title, description);
    legalItems.push({
      id: `${snapshot.sourceId}:${hashString([url, title, description].join("|"))}`,
      sourceId: snapshot.sourceId,
      title,
      description,
      url,
      ...(day ? { publishedOn: day } : {}),
      ...c,
    });
  }
  if (!newest) {
    const chan = firstTagText(body, "description")?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (chan) newest = chan;
  }
  const pub = parseTimestamp(newest);
  return {
    candidates: [],
    legalItems,
    errors: [],
    recordCount: items.length,
    // A day, not an instant: treated as the start of that day (Lisbon ≈ UTC±1, disclosed).
    ...(pub ? { publishedAt: pub.iso, publishedAtBasis: "data do Diário no título dos itens (dia, sem hora)" } : {}),
  };
}
