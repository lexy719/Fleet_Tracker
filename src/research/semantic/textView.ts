import { fold } from "../../ingestion/text";
import type { DocumentText, EvidenceSpan } from "../types";

/*
 * Offset-preserving normalised view of a page. Matching runs on the normalised text
 * (hyphenated line breaks joined, whitespace collapsed); every match maps back to exact
 * offsets in the ORIGINAL page text, so the evidence quote is always the original wording.
 */

export type PageView = {
  page: number;
  original: string;
  /** Normalised text (same characters, whitespace collapsed, "-\n" joins removed). */
  norm: string;
  /** Accent-folded, lower-case copy of `norm` (same length) for matching. */
  folded: string;
  /** norm index → original index. */
  map: number[];
};

export function viewOf(page: number, original: string): PageView {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  while (i < original.length) {
    const ch = original[i]!;
    // Hyphenated line break inside a word: "Regu-\nlamento" → "Regulamento".
    if (ch === "-" && /\n/.test(original[i + 1] ?? "") && /\p{L}/u.test(original[i - 1] ?? "") && /\p{L}/u.test(original[i + 2] ?? "")) {
      i += 2;
      continue;
    }
    if (/[\s\u00a0]/.test(ch)) {
      if (norm.length && norm[norm.length - 1] !== " ") {
        norm += " ";
        map.push(i);
      }
      i++;
      continue;
    }
    norm += ch;
    map.push(i);
    i++;
  }
  // Fold char-by-char so lengths stay aligned with `norm`.
  const folded = [...norm].map((c) => (fold(c).length === 1 ? fold(c) : c.toLowerCase())).join("");
  return { page, original, norm, folded, map };
}

export function viewsOf(doc: DocumentText): PageView[] {
  return doc.pages.map((p) => viewOf(p.page, p.text));
}

/** Evidence span for a [start, end) range of the NORMALISED view. */
export function spanOf(v: PageView, start: number, end: number, snapshotId: string, representation: string): EvidenceSpan {
  const s = v.map[start]!;
  const e = v.map[Math.max(start, end - 1)]! + 1;
  return { snapshotId, representation, location: { page: v.page, start: s, end: e }, quote: v.original.slice(s, e) };
}

/** Is the span's quote exactly the text at its offsets in the stored representation? */
export function spanVerifies(doc: DocumentText, span: EvidenceSpan): boolean {
  const page = doc.pages.find((p) => p.page === (span.location.page ?? 1));
  if (!page) return false;
  return span.quote.length > 0 && page.text.slice(span.location.start, span.location.end) === span.quote;
}

/** Find a verbatim quote (whitespace/hyphenation-insensitive) and return its original span. */
export function locateQuote(views: PageView[], quote: string, snapshotId: string, representation: string): EvidenceSpan | null {
  const q = viewOf(0, quote).norm;
  if (!q) return null;
  for (const v of views) {
    const i = v.norm.indexOf(q);
    if (i >= 0) return spanOf(v, i, i + q.length, snapshotId, representation);
  }
  return null;
}
