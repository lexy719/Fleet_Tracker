import type { TemporalSpec } from "./schema";

/*
 * Temporal interpretation → dated local periods (Europe/Lisbon "YYYY-MM-DDTHH:MM").
 * Recurring windows stay recurring: "5–23 Oct, 08:00–18:00" becomes 19 separate daily
 * periods, never one continuous closure. Missing hours are surfaced as ambiguity, and
 * permanent weekly rules are NOT converted into dates (they need a curated model).
 */

export const OPEN_END = "9999-12-31T00:00";
const MAX_PERIODS = 400;

export type TemporalInterpretation = {
  periods: { start: string; end: string }[];
  openEnded: boolean;
  /** Ambiguities the reviewer must resolve (empty = none found). */
  ambiguities: string[];
  /** Permanent recurring rule that cannot be represented as dated periods. */
  permanentRule: boolean;
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayPeriod = (date: string, w?: { start: string; end: string }) =>
  w ? { start: `${date}T${w.start}`, end: `${w.end <= w.start ? addDays(date, 1) : date}T${w.end}` } : { start: `${date}T00:00`, end: `${addDays(date, 1)}T00:00` };

export function interpretTemporal(t: TemporalSpec): TemporalInterpretation {
  const amb: string[] = [];
  switch (t.kind) {
    case "days":
      if (!t.window) amb.push("horário não indicado — período do(s) dia(s) inteiro(s) usado só como envolvente; confirmar horas");
      return { periods: t.dates.map((d) => dayPeriod(d, t.window)), openEnded: false, ambiguities: amb, permanentRule: false };
    case "daily_range": {
      const periods: { start: string; end: string }[] = [];
      if (t.window) {
        for (let d = t.from; d <= t.to && periods.length < MAX_PERIODS; d = addDays(d, 1)) periods.push(dayPeriod(d, t.window));
      } else {
        amb.push("horário não indicado — não se sabe se é contínuo ou por períodos; envolvente contínua usada só para triagem");
        periods.push({ start: `${t.from}T00:00`, end: `${addDays(t.to, 1)}T00:00` });
      }
      return { periods, openEnded: false, ambiguities: amb, permanentRule: false };
    }
    case "nights":
      return { periods: t.nights.map((n) => dayPeriod(n, t.window)), openEnded: false, ambiguities: amb, permanentRule: false };
    case "open_ended":
      if (t.basis === "no_end_stated") amb.push("a fonte não indica fim");
      return { periods: [{ start: t.from, end: OPEN_END }], openEnded: true, ambiguities: amb, permanentRule: false };
    case "duration": {
      const end = `${addDays(t.from.slice(0, 10), t.days)}T${t.from.slice(11)}`;
      return { periods: [{ start: t.from, end }], openEnded: false, ambiguities: amb, permanentRule: false };
    }
    case "weekly":
      return { periods: [], openEnded: false, ambiguities: ["regra permanente semanal — não convertida em períodos datados (requer modelo curado: dias úteis/feriados)"], permanentRule: true };
  }
}
