/* Small, dependency-free text helpers shared by parsers (run in browser and in Node tests). */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", eacute: "é", ecirc: "ê", iacute: "í",
  oacute: "ó", ocirc: "ô", otilde: "õ", uacute: "ú", ccedil: "ç", Aacute: "Á", Eacute: "É",
  Oacute: "Ó", Uacute: "Ú", Ccedil: "Ç", Atilde: "Ã", Otilde: "Õ", ordm: "º", ordf: "ª",
  ndash: "–", mdash: "—", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", euro: "€",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

const WS = new RegExp("[\\s\\u00a0]+", "g");

/** Collapse whitespace (incl. NBSP) and trim. */
export function normalizeWs(s: string): string {
  return s.replace(WS, " ").trim();
}

/** HTML fragment → plain text (block tags become line breaks, then whitespace collapsed). */
export function htmlToText(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const blocks = noScripts.replace(/<\/(p|li|h\d|div|tr)>|<br\s*\/?>/gi, "\n");
  return decodeEntities(blocks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map(normalizeWs)
    .filter(Boolean)
    .join("\n");
}

/** Text of the first element matching `tag` (ignores nesting of the same tag). */
export function firstTagText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? unwrapCdata(m[1]!) : undefined;
}

export function allTagTexts(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => unwrapCdata(m[1]!));
}

export function unwrapCdata(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1]! : decodeEntities(s);
}

/**
 * Parse a timestamp. Explicit offsets / Z are honoured. Timestamps WITHOUT a zone are read
 * as UTC and flagged (`naive: true`) — the caller must disclose that interpretation.
 */
export function parseTimestamp(s: string | undefined | null): { iso: string; naive: boolean } | null {
  if (!s) return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(t);
  const ms = Date.parse(hasZone ? t : `${t.length === 10 ? `${t}T00:00:00` : t}Z`);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), naive: !hasZone };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lower-case, accent-insensitive form for keyword matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
