import { firstTagText, htmlToText, normalizeWs } from "../ingestion/text";
import type { DocumentText } from "./types";

/*
 * Deterministic text representations of preserved bytes. Field evidence offsets point
 * into these representations; because each is a pure, versioned function of the bytes,
 * any offset can be re-derived from the snapshot later.
 */

export const HTML_TEXT = "html-main-text@1";
export const PDF_TEXT = "pdf-text@1";
export const PLAIN_TEXT = "plain-text@1";

/**
 * Main content of an HTML page: the official notice body when the page structure is
 * recognised (IP Drupal alert field), else <article>/<main>, else <body>. Title first.
 */
export function htmlMainText(html: string): DocumentText {
  const title =
    html.match(/<span class="field field--name-title[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? firstTagText(html, "title") ?? "";
  const main =
    html.match(/<div class="[^"]*field--name-field-conteudos-alerta[^"]*">([\s\S]*?)<\/div>/)?.[1] ??
    html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/)?.[1] ??
    html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/)?.[1] ??
    html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/)?.[1] ??
    html;
  const titleText = normalizeWs(htmlToText(title));
  const body = htmlToText(main);
  const text = titleText ? `${titleText}\n\n${body}` : body;
  return {
    representation: HTML_TEXT,
    pages: [{ page: 1, text }],
    status: body.length >= 40 ? "OK" : body.length > 0 ? "PARTIAL" : "NO_TEXT",
    ...(body.length < 40 ? { note: "página sem corpo de texto reconhecível" } : {}),
  };
}

export function plainText(text: string): DocumentText {
  return { representation: PLAIN_TEXT, pages: [{ page: 1, text }], status: text.trim() ? "OK" : "NO_TEXT" };
}

/* ─── PDF (pdf.js; same library in the browser and in Node tests) ─── */

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsP: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const m = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (typeof window !== "undefined" && !m.GlobalWorkerOptions.workerSrc) {
        const w = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
        m.GlobalWorkerOptions.workerSrc = w.default;
      }
      return m;
    })();
  }
  return pdfjsP;
}

/** Pages with fewer characters than this are treated as having no usable text layer. */
const MIN_PAGE_CHARS = 40;

export async function pdfText(bytes: Uint8Array): Promise<DocumentText> {
  let doc;
  let task;
  try {
    const pdfjs = await loadPdfJs();
    task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true });
    doc = await task.promise;
  } catch (e) {
    await task?.destroy().catch(() => undefined);
    return { representation: PDF_TEXT, pages: [], status: "UNSUPPORTED", note: `PDF ilegível: ${e instanceof Error ? e.message : String(e)}` };
  }
  const pages: { page: number; text: string }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((i) => ("str" in i ? `${i.str}${i.hasEOL ? "\n" : ""}` : ""))
      .join("")
      .replace(/[ \t]+\n/g, "\n");
    pages.push({ page: p, text });
  }
  await task.destroy();
  const empty = pages.filter((p) => p.text.replace(/\s/g, "").length < MIN_PAGE_CHARS).length;
  const status = pages.length === 0 || empty === pages.length ? "NO_TEXT" : empty > 0 ? "PARTIAL" : "OK";
  return {
    representation: PDF_TEXT,
    pages,
    status,
    ...(status === "NO_TEXT"
      ? { note: "PDF sem camada de texto (provavelmente digitalizado) — não suportado: não há fornecedor de OCR configurado. Nada foi extraído; isto NÃO significa ausência de restrições." }
      : status === "PARTIAL"
        ? { note: `${empty} de ${pages.length} página(s) sem texto utilizável — extração possivelmente incompleta.` }
        : {}),
  };
}
