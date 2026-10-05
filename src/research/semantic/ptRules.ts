import type { DocumentText, EvidenceSpan } from "../types";
import { SEMANTIC_SCHEMA_VERSION, type EventKind, type PkReference, type SemanticEvent, type SemanticExtraction, type TemporalSpec, type TimeWindow, type Valued, type VehicleCondition, type VehicleSpec } from "./schema";
import { spanOf, viewsOf, type PageView } from "./textView";

/*
 * Deterministic Portuguese road-notice / legal-text extractor ("pt-rules").
 *
 * A SemanticExtractor implementation with no model: explicit, testable patterns for the
 * wording Portuguese authorities actually use (IP alerts, Diário da República acts). Every
 * value carries the exact original span. When a pattern does not establish a value, the
 * value is null. Anything read by inheritance from another sentence, or by convention (e.g.
 * a missing year), is INTERPRETED, never EXPLICIT.
 *
 * Output is MACHINE_EXTRACTED: it always goes through the trust gate and human review.
 */

export const PT_RULES_ID = "pt-rules";
export const PT_RULES_VERSION = 1;

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const M = `(${MONTHS.join("|")})`;
const D = "(\\d{1,2})(?:\\.?º)?";
const Y = "(?:,? de (\\d{4}))?";
const T = "(\\d{1,2})\\s?h\\s?(\\d{2})?";

/* ─── Segments (sentences / list items) with offsets into the page view ─── */

type Seg = { v: PageView; start: number; end: number; norm: string; folded: string };

const ABBREV = /(?:^|\s)(?:s|st|sr|sra|dr|dra|n|art|al|av|eng|lda|nº|n\.º|i\.p|s\.a)$/i;

function segmentsOf(views: PageView[]): Seg[] {
  const out: Seg[] = [];
  for (const v of views) {
    let s = 0;
    for (let i = 0; i < v.norm.length; i++) {
      const c = v.norm[i]!;
      const atEnd = i === v.norm.length - 1;
      let cut = false;
      if (c === ";" || (c === ":" && /\s[a-z]\)|\s[A-ZÁÉÍÓÚÂÊÔ]/.test(v.norm.slice(i + 1, i + 4)))) cut = true;
      else if (c === "." && (atEnd || /\s[A-ZÁÉÍÓÚÂÊÔÃÕÇ«"0-9]/.test(v.norm.slice(i + 1, i + 3)))) {
        const before = v.norm.slice(Math.max(0, i - 6), i);
        if (!ABBREV.test(before)) cut = true;
      }
      if (cut || atEnd) {
        const e = i + 1;
        const norm = v.norm.slice(s, e).trim();
        if (norm.length > 2) {
          const lead = v.norm.slice(s, e).length - v.norm.slice(s, e).trimStart().length;
          out.push({ v, start: s + lead, end: s + lead + norm.length, norm, folded: v.folded.slice(s + lead, s + lead + norm.length) });
        }
        s = e;
      }
    }
  }
  return out;
}

/* ─── Small helpers ─── */

type Ctx = { snapshotId: string; representation: string; refDate: Date };
type Hit = { value: string; from: number; to: number; groups: (string | undefined)[] };

function find(seg: Seg, re: RegExp): Hit[] {
  const flags = new Set([...re.flags, "g", "u"]);
  const g = new RegExp(re.source, [...flags].join(""));
  return [...seg.folded.matchAll(g)].map((m) => ({ value: seg.norm.slice(m.index!, m.index! + m[0].length), from: m.index!, to: m.index! + m[0].length, groups: [...m].slice(1) }));
}

function ev(seg: Seg, h: { from: number; to: number }, ctx: Ctx): EvidenceSpan {
  return spanOf(seg.v, seg.start + h.from, seg.start + h.to, ctx.snapshotId, ctx.representation);
}

function val<T>(value: T, seg: Seg, h: { from: number; to: number; value: string }, ctx: Ctx, certainty: "EXPLICIT" | "INTERPRETED" = "EXPLICIT", note?: string): NonNullable<Valued<T>> {
  return { value, sourceWording: h.value, evidence: [ev(seg, h, ctx)], certainty, ...(note ? { note } : {}) };
}

const pad = (n: number) => String(n).padStart(2, "0");
const num = (s: string) => Number(s.replace(",", "."));

/** Year for a day/month the text gives without one: the occurrence within ±6 months of the reference date. */
function yearFor(day: number, month: number, explicit: string | undefined, ref: Date): { year: number; interpreted: boolean } {
  if (explicit) return { year: Number(explicit), interpreted: false };
  const y = ref.getUTCFullYear();
  const cands = [y - 1, y, y + 1].map((yy) => ({ yy, d: Math.abs(Date.UTC(yy, month - 1, day) - ref.getTime()) }));
  return { year: cands.sort((a, b) => a.d - b.d)[0]!.yy, interpreted: true };
}

function isoDate(day: number, month: number, explicitYear: string | undefined, ref: Date): { date: string; interpreted: boolean } {
  const { year, interpreted } = yearFor(day, month, explicitYear, ref);
  return { date: `${year}-${pad(month)}-${pad(day)}`, interpreted };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const hhmm = (h: string | undefined, m: string | undefined) => `${pad(Number(h))}:${m ? pad(Number(m)) : "00"}`;
const monthIdx = (m: string | undefined) => MONTHS.indexOf(m ?? "") + 1;

/* ─── Feature extraction per segment ─── */

const ROAD_RE = /\b(A|IP|IC|EN|ER|EM|CM|N|R)\s?-?\s?(\d{1,3})(?:-(\d{1,2}))?\b|\bVCI\b/g;

function roadsIn(seg: Seg, before = Infinity): Hit[] {
  return [...seg.norm.matchAll(ROAD_RE)].filter((m) => m.index! < before).map((m) => ({
    value: m[0] === "VCI" ? "VCI" : `${m[1]}${m[2]}${m[3] ? `-${m[3]}` : ""}`,
    from: m.index!,
    to: m.index! + m[0].length,
    groups: [],
  }));
}

function windowIn(seg: Seg): (Hit & { window: TimeWindow }) | null {
  const h = find(seg, new RegExp(`(?:das|entre as|entre os|entre) ${T} (?:as|e as|e) ${T}`))[0];
  return h ? { ...h, window: { start: hhmm(h.groups[0], h.groups[1]), end: hhmm(h.groups[2], h.groups[3]) } } : null;
}

type DateFeat =
  | { kind: "range"; from: string; to: string; interpreted: boolean; hit: Hit }
  | { kind: "nights"; nights: string[]; interpreted: boolean; hit: Hit }
  | { kind: "day"; dates: string[]; interpreted: boolean; hit: Hit; startTime?: string; from?: boolean }
  | { kind: "inForce"; date: string; hit: Hit };

function datesIn(seg: Seg, ref: Date): DateFeat | null {
  // "nas noites de 28 de setembro a 2 de outubro" → nights starting 28/9 … 1/10
  let h = find(seg, new RegExp(`noites de ${D}(?: de ${M})? a ${D} de ${M}${Y}`))[0];
  if (h) {
    const [d1, m1, d2, m2, y] = h.groups;
    const a = isoDate(Number(d1), monthIdx(m1 ?? m2), y, ref), b = isoDate(Number(d2), monthIdx(m2), y, ref);
    return { kind: "nights", nights: daysBetween(a.date, addDays(b.date, -1)), interpreted: a.interpreted, hit: h };
  }
  // "na noite de 28 para 29 de setembro" / "na noite de 30 de setembro para 1 de outubro" / "na noite de 3ª para 4ª feira, 22 de setembro"
  h = find(seg, new RegExp(`noite de ${D}(?: de ${M})? para ${D} de ${M}${Y}`))[0];
  if (h) {
    const [d1, m1, , m2, y] = h.groups;
    const a = isoDate(Number(d1), monthIdx(m1 ?? m2), y, ref);
    return { kind: "nights", nights: [a.date], interpreted: a.interpreted, hit: h };
  }
  h = find(seg, new RegExp(`noite de \\d[ªa]? para \\d[ªa]? feira,? ${D} de ${M}${Y}`))[0];
  if (h) {
    const [d1, m1, y] = h.groups;
    const a = isoDate(Number(d1), monthIdx(m1), y, ref);
    return { kind: "nights", nights: [a.date], interpreted: a.interpreted, hit: h };
  }
  // ranges: "entre os dias 21 de setembro e 2 de outubro", "entre 5 e 23 de outubro", "de 1 a 9 de outubro", "de 21 a 26 de setembro"
  h = find(seg, new RegExp(`(?:entre (?:os dias |o dia )?${D}(?: de ${M})? e ${D} de ${M}${Y})|(?:\\bde ${D}(?: de ${M})? a ${D} de ${M}${Y})`))[0];
  if (h) {
    const g = h.groups;
    const [d1, m1, d2, m2, y] = g[0] ? g.slice(0, 5) : g.slice(5, 10);
    const a = isoDate(Number(d1), monthIdx(m1 ?? m2), y, ref), b = isoDate(Number(d2), monthIdx(m2), y, ref);
    return { kind: "range", from: a.date, to: b.date, interpreted: a.interpreted, hit: h };
  }
  h = find(seg, new RegExp(`entra em vigor (?:no dia )?${D} de ${M} de (\\d{4})`))[0];
  if (h) return { kind: "inForce", date: isoDate(Number(h.groups[0]), monthIdx(h.groups[1]), h.groups[2], ref).date, hit: h };
  // single day(s): "no dia 30 de setembro", "a partir do dia 21 de setembro, as 22h00", "inicio no dia 15 de setembro, as 17h00"
  h = find(seg, new RegExp(`(a partir d[oa] |inicio n[oa] )?dia ${D} de ${M}${Y}(?:,? (?:as|pelas) ${T})?`))[0];
  if (h) {
    const [fromWord, d1, m1, y, th, tm] = h.groups;
    const a = isoDate(Number(d1), monthIdx(m1), y, ref);
    return { kind: "day", dates: [a.date], interpreted: a.interpreted, hit: h, ...(th ? { startTime: hhmm(th, tm) } : {}), ...(fromWord ? { from: true } : {}) };
  }
  return null;
}

const KIND_RULES: [EventKind, RegExp, "EXPLICIT" | "INTERPRETED"][] = [
  ["VEHICLE_PROHIBITION", /proibid[oa]s? de circular|proibida a circulacao|interdita a circulacao de/, "EXPLICIT"],
  ["ROAD_CLOSURE", /\bencerr(ar|amento|ad[oa])\b|corte (temporario |total )?da circulacao|cortada ao transito|interdit[oa] ao transito/, "EXPLICIT"],
  ["ALTERNATING_TRAFFIC", /\balternad[oa]\b|regime alternado|forma alternada/, "EXPLICIT"],
  ["LANE_RESTRICTION", /supressao da via|uma via em cada sentido|cortada uma via|corte de via|estreitamento/, "EXPLICIT"],
  ["ROADWORKS", /trabalhos|obras|pavimenta|empreitada/, "INTERPRETED"],
];

/** Strongest kind stated across the segments (rule order = priority). */
function kindIn(segs: Seg[], ctx: Ctx): NonNullable<Valued<EventKind>> | null {
  for (const [k, re, c] of KIND_RULES) {
    for (const seg of segs) {
      const h = find(seg, re)[0];
      if (h) return val(k, seg, h, ctx, c);
    }
  }
  return null;
}

/** Courtesy / boilerplate sentences carry no facts ("Agradecemos a compreensão…"). */
const BOILERPLATE = /^agradecemos|pelos eventuais (transtornos|constrangimentos|incomodos)|para garantir a seguranca dos utilizadores e dos trabalhadores,?$/;

/** Index where a diversion clause starts inside a segment (facts before it belong to the event). */
function diversionAt(seg: Seg): number {
  const m = seg.folded.match(DIVERSION_CLAUSE);
  return m?.index ?? -1;
}
const DIVERSION_CLAUSE = /(?:durante este periodo, )?(o transito|a circulacao) (sera|e) desviad|seguindo pel|com indicacao de percurso|percursos? alternativos?|\bdesvio d[eoa]s? /;



const INJECTION = [
  /ignore (all |any )?(previous |prior |your )?(instructions|system prompt|rules)/,
  /ignora(r)? (as |todas as )?(instrucoes|regras)/,
  /\breturn\s+(applies|compliant|json)/,
  /mark (this|the) (source|road|restriction)/,
  /marca(r)? (esta|a) fonte/,
  /(approve|aprova[r]?) (this|esta|a) (restriction|restricao|fonte|source)/,
  /(the user|o utilizador) (has )?(approved|aprovou)/,
  /call (the following|this) url|with your api key|com a (sua|tua) chave/,
  /delete (previous |all )?snapshots|apaga(r)? (os )?snapshots/,
  /this source is authoritative|esta fonte e (oficial|autoritativa)/,
  /you are (now )?(an?|the) (assistant|ai|model)|system prompt/,
];

function vehiclesIn(segs: Seg[], ctx: Ctx): NonNullable<Valued<VehicleSpec>> | null {
  let scope: VehicleSpec["scope"] | null = null;
  let scopeHit: { seg: Seg; h: Hit } | null = null;
  for (const seg of segs) {
    const goods = find(seg, /veiculos pesados de mercadorias/)[0];
    const dg = find(seg, /mercadorias perigosas|\badr\b/)[0];
    const hgv = find(seg, /\bpesados\b/)[0];
    const wt = find(seg, /peso bruto (?:superior|acima) a (\d[\d.]*) ?kg|superior a (\d+(?:,\d+)?) ?(?:t|toneladas)\b/)[0];
    const pick = goods ? (["GOODS_HGV", goods] as const) : dg ? (["DANGEROUS_GOODS", dg] as const) : wt && !hgv ? (["WEIGHT_OVER", wt] as const) : hgv ? (["HGV", hgv] as const) : null;
    if (pick && !scope) {
      scope = pick[0];
      scopeHit = { seg, h: pick[1] };
    }
  }
  if (!scope || !scopeHit) return null;
  const conditions: VehicleSpec["conditions"] = [];
  const exceptions: VehicleSpec["exceptions"] = [];
  for (const seg of segs) {
    const add = (condition: VehicleCondition, h: Hit) => {
      const same = conditions.find((c) => JSON.stringify(c.condition) === JSON.stringify(condition));
      if (same) same.evidence.push(ev(seg, h, ctx));
      else conditions.push({ condition, sourceWording: h.value, evidence: [ev(seg, h, ctx)] });
    };
    const w = find(seg, /peso bruto (?:superior|acima) a (\d[\d.]*) ?kg/)[0];
    if (w) add({ kind: "gross_weight_over_kg", kg: Number(w.groups[0]!.replace(/\./g, "")) }, w);
    const wt = find(seg, /peso bruto (?:superior|acima) a (\d+(?:,\d+)?) ?(?:t|toneladas)\b/)[0];
    if (wt) add({ kind: "gross_weight_over_kg", kg: num(wt.groups[0]!) * 1000 }, wt);
    const ax = find(seg, /(tres|quatro|cinco|\d) ou mais eixos/)[0];
    if (ax) add({ kind: "axles_at_least", n: { tres: 3, quatro: 4, cinco: 5 }[ax.groups[0]!] ?? Number(ax.groups[0]) }, ax);
    const hgt = find(seg, /altura,? medida na vertical do primeiro eixo,? igual ou superior a (\d+(?:,\d+)?) ?m\b/)[0];
    if (hgt) add({ kind: "first_axle_height_at_least_m", m: num(hgt.groups[0]!) }, hgt);
    const goods = find(seg, /destinam ao transporte de carga|transporte de mercadorias/)[0];
    if (goods && (w || ax)) add({ kind: "goods_transport" }, goods);
    for (const x of find(seg, /^(?:[a-z]\) )?.*?(?:excecionam-se|exceto|excepto|com excecao d|nao se aplica a)[^;.]*/)) {
      if (/excecionam-se do disposto/.test(x.value.toLowerCase()) && x.value.length < 60) continue;
      exceptions.push({ text: x.value, evidence: [ev(seg, x, ctx)] });
    }
    // list items of an exception clause: "a) Os veículos …", "b) Os veículos …"
    if (/^[a-z]\) /.test(seg.folded) && segs.some((s) => /excecionam-se/.test(s.folded) && s.start < seg.start && s.v === seg.v)) {
      exceptions.push({ text: seg.norm, evidence: [ev(seg, { from: 0, to: seg.norm.length }, ctx)] });
    }
  }
  return {
    value: { scope, conditions, exceptions },
    sourceWording: scopeHit.h.value,
    evidence: [ev(scopeHit.seg, scopeHit.h, ctx)],
    certainty: "EXPLICIT",
  };
}

/* ─── Main ─── */

export function extractPortugueseRules(doc: DocumentText, snapshotId: string, refDate: Date): SemanticExtraction {
  const ctx: Ctx = { snapshotId, representation: doc.representation, refDate };
  const views = viewsOf(doc);
  const issues: string[] = [];
  const injectionSignals: string[] = [];
  const all = segmentsOf(views);
  const segs = all.filter((s) => {
    if (BOILERPLATE.test(s.folded)) return false;
    if (INJECTION.some((re) => re.test(s.folded))) {
      injectionSignals.push(s.norm.slice(0, 200));
      return false;
    }
    return true;
  });
  if (injectionSignals.length) issues.push(`${injectionSignals.length} frase(s) com instruções dirigidas a sistemas automáticos — tratadas como texto, ignoradas na extração; requer revisão.`);

  const fullFolded = segs.map((s) => s.folded).join(" ");
  const anyRoad = segs.some((s) => roadsIn(s).length > 0);
  const legal = /decreto-lei|decreto regulamentar|portaria n|regulamento municipal/.test(fullFolded) && /\bartigo\b/.test(fullFolded);
  const roadish = /circulacao|transito|corte|encerr|condicionamento|via\b/.test(fullFolded);
  const firstSeg = segs[0];
  const docKindSeg = segs.find((s) => /decreto-lei|circulacao|transito|corte|encerr|condicionamento/.test(s.folded)) ?? firstSeg;
  const documentKind: SemanticExtraction["documentKind"] = docKindSeg
    ? val(legal ? "LEGAL_ACT" : anyRoad && roadish ? "ROAD_NOTICE" : "NOT_ROAD_INFORMATION", docKindSeg, { from: 0, to: Math.min(docKindSeg.norm.length, 120), value: docKindSeg.norm.slice(0, 120) }, ctx, "INTERPRETED", "classificação do documento por padrões de texto")
    : null;

  let authorityClaim: SemanticExtraction["authorityClaim"] = null;
  for (const s of segs) {
    const h = find(s, /a infraestruturas de portugal|presidencia do conselho de ministros|camara municipal d[eoa] [a-z ]+|municipio d[eoa] [a-z ]+/)[0];
    if (h) {
      authorityClaim = val(h.value.replace(/^a /i, ""), s, h, ctx, "EXPLICIT", "organização que o texto declara — não é prova de autoridade");
      break;
    }
  }

  if (!documentKind || documentKind.value === "NOT_ROAD_INFORMATION") {
    return { schemaVersion: SEMANTIC_SCHEMA_VERSION, extractorId: PT_RULES_ID, extractorVersion: PT_RULES_VERSION, documentKind, authorityClaim, events: [], issues: [...issues, "documento sem informação rodoviária reconhecível"], injectionSignals };
  }

  /* Group: a dated sentence starts an event; following undated sentences attach to it. */
  type Block = { head: Seg; segs: Seg[]; date: DateFeat | null };
  const context: Seg[] = [];
  const blocks: Block[] = [];
  for (const s of segs) {
    const d = datesIn(s, refDate);
    if (d && d.kind !== "inForce") blocks.push({ head: s, segs: [s], date: d });
    else if (blocks.length) blocks.at(-1)!.segs.push(s);
    else context.push(s);
  }
  // An umbrella block (e.g. "nas noites de 28/9 a 2/10") whose dates contain ≥2 later blocks becomes context.
  const datesOf = (d: DateFeat | null): string[] => (!d ? [] : d.kind === "range" ? daysBetween(d.from, d.to) : d.kind === "nights" ? d.nights : d.kind === "day" ? d.dates : []);
  const umbrellas = new Set<Block>();
  blocks.forEach((b, i) => {
    const mine = new Set(datesOf(b.date).flatMap((x) => [x, addDays(x, 1)]));
    const inside = blocks.slice(i + 1).filter((o) => datesOf(o.date).length > 0 && datesOf(o.date).every((x) => mine.has(x)));
    if (inside.length >= 2) umbrellas.add(b);
  });
  const umbrellaSegs = blocks.filter((b) => umbrellas.has(b)).flatMap((b) => b.segs);
  const eventBlocks = blocks.filter((b) => !umbrellas.has(b));
  const ctxSegs = [...context, ...umbrellaSegs];
  // Legal acts are usually undated rules: one event built from the whole text.
  if (legal && eventBlocks.length === 0) {
    const prohib = segs.filter((s) => /proibid[oa]s? de circular|proibida a circulacao/.test(s.folded));
    // The operative clause states the rule with its time window; preambles merely mention it.
    const head = prohib.find((s) => windowIn(s)) ?? prohib[0] ?? segs[0]!;
    eventBlocks.push({ head, segs: [head, ...segs.filter((x) => x !== head)], date: null });
  }
  if (eventBlocks.length === 0 && context.length) eventBlocks.push({ head: context[0]!, segs: context, date: null });

  const firstFrom = <T,>(own: Seg[], inherited: Seg[], f: (s: Seg) => T | null): { v: T; inherited: boolean } | null => {
    for (const s of own) { const r = f(s); if (r) return { v: r, inherited: false }; }
    for (const s of inherited) { const r = f(s); if (r) return { v: r, inherited: true }; }
    return null;
  };
  const inh = <T,>(x: NonNullable<Valued<T>>, inherited: boolean, what: string): NonNullable<Valued<T>> =>
    inherited ? { ...x, certainty: "INTERPRETED", note: [x.note, `${what} lido noutra frase do mesmo aviso (aplicado a este evento por interpretação)`].filter(Boolean).join("; ") } : x;

  const events: SemanticEvent[] = eventBlocks.map((b) => {
    const own = b.segs;
    const diversionSegs = own.filter((s) => diversionAt(s) >= 0);
    const factSegs = own;
    const cut = (x: Seg) => (diversionAt(x) >= 0 ? diversionAt(x) : Infinity);
    // kind: strongest stated in this event; the context only when the event states nothing stronger than "works"
    const ownKind = kindIn(factSegs, ctx);
    const ctxKind = kindIn(ctxSegs, ctx);
    const rank = (k: EventKind | undefined) => (k ? KIND_RULES.findIndex(([x]) => x === k) : 99);
    let kind = ownKind && rank(ownKind.value) <= rank(ctxKind?.value) ? ownKind : ctxKind ? inh(ctxKind, true, "tipo") : ownKind;
    const hasDiversion = diversionSegs.length > 0 || ctxSegs.some((s) => diversionAt(s) >= 0);
    const dirHit = firstFrom(factSegs, [], (s) => {
      const h = find(s, /\bno sentido ([a-z-]+(?: [a-z-]+)?)|\bem ambos os sentidos|\(sentido [a-z-]+\)/).filter((x) => x.from < cut(s))[0];
      return h ? { s, h } : null;
    });
    if (kind?.value === "LANE_RESTRICTION" && /corte de via/.test(kind.sourceWording.toLowerCase()) && hasDiversion && dirHit) {
      kind = { ...kind, value: "CARRIAGEWAY_CLOSURE", certainty: "INTERPRETED", note: "«corte de via» num sentido com desvio do trânsito — interpretado como corte desse sentido; requer revisão" };
    }
    // roads (diversion sentences excluded: their roads are the detour, not the affected road)
    const r = firstFrom(factSegs, ctxSegs, (s) => {
      const hs = roadsIn(s, cut(s));
      return hs.length ? { s, hs } : null;
    });
    const roads = r
      ? inh<string[]>({ value: [...new Set(r.v.hs.map((h) => h.value))], sourceWording: r.v.hs.map((h) => h.value).join(", "), evidence: r.v.hs.map((h) => ev(r.v.s, h, ctx)), certainty: "EXPLICIT" }, r.inherited, "estrada")
      : null;
    // nodes
    // Node names may contain abbreviations ("St.ª Maria", "S. Miguel").
    const NAME = String.raw`((?:[^,;.]|\.(?=\S)|(?<=(?:^|\s)[a-z]{1,2})\.\s)+?)`;
    const nodeRe = new RegExp(String.raw`\bentre (?:o |os )?nos? de ${NAME} e (?:o no de |de )?${NAME}(?=(?<!(?:^|\s)[a-z]{1,2})[,;.]| durante| para|$)`);
    const n = firstFrom(factSegs, ctxSegs, (s) => {
      const hs = find(s, nodeRe).filter((h) => h.from < cut(s));
      return hs.length ? { s, hs } : null;
    });
    const nodes = n
      ? inh({ value: n.v.hs.map((h) => ({ from: s(n.v.s, h, 0), to: s(n.v.s, h, 1) })), sourceWording: n.v.hs.map((h) => h.value).join("; "), evidence: n.v.hs.map((h) => ev(n.v.s, h, ctx)), certainty: "EXPLICIT" as const }, n.inherited, "troço")
      : null;
    function s(seg: Seg, h: Hit, gi: number): string {
      const g = h.groups[gi]!;
      const at = seg.folded.indexOf(g, h.from);
      return seg.norm.slice(at, at + g.length).trim();
    }
    // PK references (fact sentences; diversion PKs are diversion details)
    const pk: PkReference[] = [];
    for (const seg of [...factSegs, ...ctxSegs]) {
      for (const h of find(seg, /(?:quilometro \(km\)|\(km\)|\bkm) (\d+(?:,\d+)?)(?: e (?:o km )?(\d+(?:,\d+)?))?/).filter((x) => x.from < cut(seg))) {
        const road = roadsIn(seg).sort((a, b) => Math.abs(a.from - h.from) - Math.abs(b.from - h.from))[0]?.value ?? roads?.value[0] ?? "?";
        pk.push({ road, km: num(h.groups[0]!), sourceWording: h.value, evidence: [ev(seg, h, ctx)] });
        if (h.groups[1]) pk.push({ road, km: num(h.groups[1]), sourceWording: h.value, evidence: [ev(seg, h, ctx)] });
      }
      if (pk.length) break;
    }
    // municipalities
    const mu = firstFrom(factSegs, ctxSegs, (s0) => {
      const h = find(s0, /\bconcelhos? de ([a-z ]+?)(?: e (?:de )?([a-z ]+?))?(?=[,;.]|$)/)[0];
      return h ? { s0, h } : null;
    });
    const municipalities = mu
      ? inh({ value: [s(mu.v.s0, mu.v.h, 0), ...(mu.v.h.groups[1] ? [s(mu.v.s0, mu.v.h, 1)] : [])].map((x) => x.replace(/\s+/g, " ")), sourceWording: mu.v.h.value, evidence: [ev(mu.v.s0, mu.v.h, ctx)], certainty: "EXPLICIT" as const }, mu.inherited, "concelho")
      : null;
    // direction
    const direction = dirHit ? val(dirHit.v.h.value.replace(/^no /i, ""), dirHit.v.s, dirHit.v.h, ctx) : null;
    // diversion
    // A diversion stated "durante este período" covers every event of the notice, wherever it sits.
    const shared = segs.find((x) => /durante este periodo, (o transito|a circulacao) (sera|e) desviad/.test(x.folded));
    const div = diversionSegs[0] ?? ctxSegs.find((x) => diversionAt(x) >= 0) ?? shared;
    const dAt = div ? diversionAt(div) : -1;
    const diversion = div ? inh(val(div.norm.slice(dAt), div, { from: dAt, to: div.norm.length, value: div.norm.slice(dAt) }, ctx), !diversionSegs.includes(div), "desvio") : null;
    // temporal
    const temporal = temporalOf(b, factSegs, ctxSegs, ctx, issues);
    // vehicles
    let vehicles = vehiclesIn([...factSegs, ...(legal ? segs : ctxSegs)], ctx);
    if (!vehicles && (kind?.value === "ROAD_CLOSURE" || kind?.value === "CARRIAGEWAY_CLOSURE" || kind?.value === "LANE_RESTRICTION") && div && /(o transito|a circulacao) (sera|e) desviad/.test(div.folded)) {
      const h = find(div, /(o transito|a circulacao) (sera|e) desviad[oa]/)[0]!;
      vehicles = val({ scope: "ALL_TRAFFIC" as const, conditions: [], exceptions: [] }, div, h, ctx, "INTERPRETED", "o aviso desvia o trânsito sem distinguir veículos — «todo o trânsito» interpretado");
    }
    const locationText = nodes
      ? { value: nodes.value.map((x) => `${x.from} ↔ ${x.to}`).join("; "), sourceWording: nodes.sourceWording, evidence: nodes.evidence, certainty: nodes.certainty, ...(nodes.note ? { note: nodes.note } : {}) }
      : pk.length
        ? { value: pk.map((p) => `${p.road} km ${p.km}`).join(" – "), sourceWording: pk.map((p) => p.sourceWording).join("; "), evidence: pk.flatMap((p) => p.evidence), certainty: "EXPLICIT" as const }
        : null;
    return { kind, roads, locationText, nodes, pk, municipalities, direction, temporal, vehicles, diversion };
  });

  for (const [i, e] of events.entries()) {
    if (!e.kind) issues.push(`evento ${i + 1}: tipo não identificado`);
    if (!e.temporal) issues.push(`evento ${i + 1}: período não identificado`);
    if (!e.vehicles) issues.push(`evento ${i + 1}: o texto não indica a que veículos se aplica`);
  }
  return { schemaVersion: SEMANTIC_SCHEMA_VERSION, extractorId: PT_RULES_ID, extractorVersion: PT_RULES_VERSION, documentKind, authorityClaim, events, issues, injectionSignals };
}

const withEvidence = <T,>(v: Valued<T>, evidence: EvidenceSpan[]): Valued<T> => (v ? { ...v, evidence } : v);

function temporalOf(b: { head: Seg; date: DateFeat | null }, own: Seg[], ctxSegs: Seg[], ctx: Ctx, issues: string[]): Valued<TemporalSpec> {
  const yearNote = "ano não indicado no texto — interpretado pela data de obtenção do documento";
  const w = own.map(windowIn).find(Boolean) ?? null;
  const ctxW = w ? null : ctxSegs.map(windowIn).find(Boolean) ?? null;
  const window = w ?? ctxW;
  const winEv = window ? [ev(w ? own.find((s) => windowIn(s) === w || windowIn(s)?.from === w.from)! : ctxSegs.find((s) => windowIn(s)?.from === ctxW!.from)!, window, ctx)] : [];
  const allSegs = [...own, ...ctxSegs];
  const d = b.date;
  // Legal recurring rule: "nos dias úteis, entre as 07h00 e as 21h00"
  const wdRe = /nos dias uteis|aos fins de semana|todos os dias/;
  const wd = [b.head, ...allSegs].flatMap((s) => find(s, wdRe).map((h) => ({ s, h })))[0];
  if (!d && wd && window) {
    const inForce = allSegs.map((s) => datesIn(s, ctx.refDate)).find((x) => x?.kind === "inForce") as Extract<DateFeat, { kind: "inForce" }> | undefined;
    const f = wd.s.folded.slice(wd.h.from, wd.h.to);
    const days = /uteis/.test(f) ? "WORKDAYS" : /fins/.test(f) ? "WEEKENDS" : "EVERY_DAY";
    return {
      value: { kind: "weekly", days, window: window.window, ...(inForce ? { inForceFrom: inForce.date } : {}) },
      sourceWording: [wd.h.value, window.value, inForce?.hit.value].filter(Boolean).join(" … "),
      evidence: [ev(wd.s, wd.h, ctx), ...winEv],
      certainty: "EXPLICIT",
      note: "regra permanente recorrente (não é um período datado)",
    };
  }
  if (!d || d.kind === "inForce") return null;
  const head = ev(b.head, d.hit, ctx);
  const interp = (base: boolean) => (base || !!ctxW ? "INTERPRETED" : "EXPLICIT") as "EXPLICIT" | "INTERPRETED";
  const notes = (yearInterp: boolean, extra?: string) => [yearInterp ? yearNote : "", ctxW ? "horário lido noutra frase do aviso" : "", extra ?? ""].filter(Boolean).join("; ") || undefined;
  const mk = (value: TemporalSpec, certainty: "EXPLICIT" | "INTERPRETED", note?: string): Valued<TemporalSpec> => ({ value, sourceWording: [d.hit.value, window?.value].filter(Boolean).join(" … "), evidence: [head, ...winEv], certainty, ...(note ? { note } : {}) });

  if (d.kind === "nights") {
    if (!window) {
      issues.push(`noites ${d.nights.join(", ")}: horário não indicado`);
      return mk({ kind: "days", dates: d.nights }, "INTERPRETED", notes(d.interpreted, "noite sem horário indicado"));
    }
    return mk({ kind: "nights", nights: d.nights, window: window.window }, interp(d.interpreted), notes(d.interpreted));
  }
  if (d.kind === "range") {
    if (window && window.window.end <= window.window.start) {
      // Overnight window over a date range: nights starting each day before the last.
      return mk({ kind: "nights", nights: daysBetween(d.from, addDays(d.to, -1)), window: window.window }, "INTERPRETED", notes(d.interpreted, "janela noturna sobre intervalo de datas — noites a começar em cada dia exceto o último"));
    }
    if (!window) issues.push(`período ${d.from}…${d.to}: horário não indicado`);
    return mk({ kind: "daily_range", from: d.from, to: d.to, ...(window ? { window: window.window } : {}) }, interp(d.interpreted), notes(d.interpreted, window ? "janela diária recorrente (não é um corte contínuo)" : "horário não indicado"));
  }
  // single day / start
  const ue = allSegs.flatMap((s) => find(s, /sem previsao de reabertura|ate (nova|novo) (indicacao|aviso)|ate a conclusao d|ate ao fim d/).map((h) => ({ s, h })))[0];
  const dur = allSegs.flatMap((s) => find(s, /por um periodo de (\d+) dias/).map((h) => ({ s, h })))[0];
  const start = d.startTime ?? window?.window.start;
  if (d.from || ue || dur) {
    if (!start) issues.push(`início ${d.dates[0]}: hora não indicada`);
    const from = `${d.dates[0]}T${start ?? "00:00"}`;
    if (dur) {
      return withEvidence(mk({ kind: "duration", from, days: Number(dur.h.groups[0]) }, interp(d.interpreted || !start), notes(d.interpreted)), [head, ev(dur.s, dur.h, ctx)]);
    }
    const ueFolded = ue ? ue.s.folded.slice(ue.h.from, ue.h.to) : "";
    const basis = !ue ? "no_end_stated" : /conclusao|fim d/.test(ueFolded) ? "until_completion" : "until_further_notice";
    return withEvidence(mk({ kind: "open_ended", from, basis }, interp(d.interpreted || !start), notes(d.interpreted, ue ? undefined : "sem fim indicado")), ue ? [head, ev(ue.s, ue.h, ctx)] : [head]);
  }
  if (!window) issues.push(`dia ${d.dates.join(", ")}: horário não indicado`);
  return mk({ kind: "days", dates: d.dates, ...(window ? { window: window.window } : {}) }, interp(d.interpreted), notes(d.interpreted, window ? undefined : "horário não indicado"));
}
