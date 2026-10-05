import { getPassageWindow, type PassageWindow, type TimingModel } from "./timeline";
import { classifyDay, inAnyWindow, localParts } from "./calendar";
import { assertValidRoute, MAX_ROUTE_GAP_M, routeExposure, timeAtPos } from "./geometry";
import { factLabel } from "./factLabels";
import type {
  ComplianceReport,
  ComplianceStatus,
  Condition,
  ExposureSummary,
  EvaluationInput,
  Fact,
  FactOperator,
  FactValue,
  Reason,
  RegulationDataset,
  RegulationRecord,
  RegulationResult,
  RouteStopInput,
  Tri,
} from "./types";

/* ─── Three-valued logic ─────────────────────────────── */

export function triAnd(values: Tri[]): Tri {
  if (values.some((v) => v === "DOES_NOT_APPLY")) return "DOES_NOT_APPLY";
  if (values.every((v) => v === "APPLIES")) return "APPLIES";
  return "UNKNOWN";
}

export function triOr(values: Tri[]): Tri {
  if (values.some((v) => v === "APPLIES")) return "APPLIES";
  if (values.every((v) => v === "DOES_NOT_APPLY")) return "DOES_NOT_APPLY";
  return "UNKNOWN";
}

export function triNot(v: Tri): Tri {
  return v === "APPLIES" ? "DOES_NOT_APPLY" : v === "DOES_NOT_APPLY" ? "APPLIES" : "UNKNOWN";
}

/* ─── Condition evaluation ───────────────────────────── */

type Eval = {
  value: Tri;
  /** Reasons explaining an UNKNOWN (what is missing). */
  unknowns: Reason[];
  /** Reasons that decided a determinate value. */
  decisive: Reason[];
};

type Ctx = { input: EvaluationInput; dataset: RegulationDataset };

const OP_TEXT: Record<FactOperator, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", in: "∈" };

function compareKnown(op: FactOperator, actual: FactValue, expected: FactValue | FactValue[]): Tri {
  if (op === "in") return (expected as FactValue[]).includes(actual) ? "APPLIES" : "DOES_NOT_APPLY";
  if (op === "eq") return actual === expected ? "APPLIES" : "DOES_NOT_APPLY";
  if (typeof actual !== "number" || typeof expected !== "number") return "UNKNOWN";
  const ok =
    op === "gt" ? actual > expected : op === "gte" ? actual >= expected : op === "lt" ? actual < expected : actual <= expected;
  return ok ? "APPLIES" : "DOES_NOT_APPLY";
}

/** A numeric range [min, max] decides a comparison only when every value in it agrees. */
function compareRange(op: FactOperator, min: number | undefined, max: number | undefined, expected: number): Tri {
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  switch (op) {
    case "gt":  return lo > expected ? "APPLIES" : hi <= expected ? "DOES_NOT_APPLY" : "UNKNOWN";
    case "gte": return lo >= expected ? "APPLIES" : hi < expected ? "DOES_NOT_APPLY" : "UNKNOWN";
    case "lt":  return hi < expected ? "APPLIES" : lo >= expected ? "DOES_NOT_APPLY" : "UNKNOWN";
    case "lte": return hi <= expected ? "APPLIES" : lo > expected ? "DOES_NOT_APPLY" : "UNKNOWN";
    default:    return lo === hi && lo === expected ? "APPLIES" : "UNKNOWN";
  }
}

function evalFact(c: Extract<Condition, { kind: "fact" }>, facts: EvaluationInput["facts"]): Eval {
  const fact: Fact | undefined = facts[c.fact];
  const name = factLabel(c.fact);
  if (!fact || fact.status === "unknown") {
    const why = fact?.status === "unknown" ? fact.reason : "não registado no FleetOS";
    return { value: "UNKNOWN", unknowns: [{ kind: "missing_fact", text: `${name}: valor desconhecido — ${why}`, evidence: c.evidence }], decisive: [] };
  }
  let value: Tri;
  let shown: string;
  if (fact.status === "range") {
    value = typeof c.value === "number" ? compareRange(c.op, fact.min, fact.max, c.value) : "UNKNOWN";
    shown = `${fact.min ?? "?"}–${fact.max ?? "?"}`;
  } else {
    value = compareKnown(c.op, fact.value, c.value);
    shown = String(fact.value);
  }
  if (value === "UNKNOWN") {
    return {
      value,
      unknowns: [{ kind: "missing_fact", text: `${name} insuficiente para decidir "${c.label}" (${shown}; ${fact.source})`, evidence: c.evidence }],
      decisive: [],
    };
  }
  const expected = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
  const verdict = value === "APPLIES" ? "cumpre" : "não cumpre";
  return {
    value,
    unknowns: [],
    decisive: [{ kind: "info", text: `${name} ${verdict} ${OP_TEXT[c.op]} ${expected} (${shown}; ${fact.source})`, evidence: c.evidence }],
  };
}

function selectStops(stops: RouteStopInput[], sel: Extract<Condition, { kind: "stopInArea" }>): RouteStopInput[] {
  if (stops.length === 0) return [];
  const byRole =
    sel.stops === "origin" ? [stops[0]!]
    : sel.stops === "destination" ? [stops[stops.length - 1]!]
    : sel.stops === "originOrDestination" ? (stops.length === 1 ? [stops[0]!] : [stops[0]!, stops[stops.length - 1]!])
    : stops;
  // Intermediate stops ("stop") never match a pickup/delivery selector (conservative).
  return sel.stopTypes ? byRole.filter((s) => (sel.stopTypes as string[]).includes(s.type)) : byRole;
}

function evalStopInArea(c: Extract<Condition, { kind: "stopInArea" }>, ctx: Ctx): Eval {
  const area = ctx.dataset.areas.find((a) => a.id === c.areaId);
  const areaName = area?.label ?? c.areaId;
  const stops = selectStops(ctx.input.stops, c);
  if (stops.length === 0) {
    return { value: "DOES_NOT_APPLY", unknowns: [], decisive: [{ kind: "info", text: `Nenhuma paragem elegível para "${c.label}"`, evidence: c.evidence }] };
  }
  const values: Tri[] = [];
  const unknowns: Reason[] = [];
  for (const s of stops) {
    const f = s.areas?.[c.areaId];
    if (!f || f.status !== "known" || typeof f.value !== "boolean") {
      values.push("UNKNOWN");
      unknowns.push({ kind: "missing_fact", text: `Paragem ${s.id}: pertença a ${areaName} desconhecida`, evidence: c.evidence });
    } else {
      values.push(f.value ? "APPLIES" : "DOES_NOT_APPLY");
    }
  }
  const value = triOr(values);
  return value === "UNKNOWN"
    ? { value, unknowns, decisive: [] }
    : { value, unknowns: [], decisive: [{ kind: "info", text: `${c.label}: ${value === "APPLIES" ? "sim" : "não"}`, evidence: c.evidence }] };
}

export function evalCondition(c: Condition, ctx: Ctx): Eval {
  switch (c.kind) {
    case "fact":
      return evalFact(c, ctx.input.facts);
    case "stopInArea":
      return evalStopInArea(c, ctx);
    case "not": {
      const r = evalCondition(c.of, ctx);
      return { value: triNot(r.value), unknowns: r.unknowns, decisive: r.decisive };
    }
    case "all":
    case "any": {
      const rs = c.of.map((x) => evalCondition(x, ctx));
      const value = c.kind === "all" ? triAnd(rs.map((r) => r.value)) : triOr(rs.map((r) => r.value));
      const decidingValue: Tri = c.kind === "all" ? "DOES_NOT_APPLY" : "APPLIES";
      return {
        value,
        unknowns: value === "UNKNOWN" ? rs.filter((r) => r.value === "UNKNOWN").flatMap((r) => r.unknowns) : [],
        decisive:
          value === decidingValue
            ? rs.filter((r) => r.value === decidingValue).flatMap((r) => r.decisive)
            : value === "UNKNOWN" ? [] : rs.flatMap((r) => r.decisive),
      };
    }
  }
}

/* ─── Temporal evaluation over an exposure ───────────── */

export type EvaluateOptions = {
  /** ETA uncertainty: an instant within this margin of a rule boundary is UNKNOWN. */
  timeToleranceMin: number;
  /** Max spacing between evaluated instants inside a gap between route points. */
  sampleStepMin: number;
  /**
   * Timing model used to build the route input (recorded so a saved decision is replayed
   * with the same timeline). Absent on legacy records.
   */
  timing?: TimingModel;
};

export const DEFAULT_EVALUATE_OPTIONS: EvaluateOptions = { timeToleranceMin: 15, sampleStepMin: 5 };

type InstantEval = { value: Tri; reason?: Reason };

const MINUTE_MS = 60_000;

/** A constraint's record cannot be evaluated (bad data) — surfaced as an evaluation error. */
export class ConstraintDataError extends Error {}

export function isValidTimeZone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function evalInstant(reg: RegulationRecord, ctx: Ctx, ms: number): InstantEval {
  const w = reg.when;
  const p = localParts(ms, w.timeZone);
  if (p.isoDate < reg.effective.from) return { value: "DOES_NOT_APPLY" };
  if (reg.effective.to && p.isoDate >= reg.effective.to) return { value: "DOES_NOT_APPLY" };
  const parts: Tri[] = [];
  if (w.activePeriods) {
    const local = `${p.isoDate}T${String(Math.floor(p.minutes / 60)).padStart(2, "0")}:${String(p.minutes % 60).padStart(2, "0")}`;
    parts.push(w.activePeriods.some((ap) => local >= ap.start && local < ap.end) ? "APPLIES" : "DOES_NOT_APPLY");
  }
  if (w.windows) parts.push(inAnyWindow(p.minutes, w.windows) ? "APPLIES" : "DOES_NOT_APPLY");
  const day = w.days ? classifyDay(w.days, ctx.dataset.calendars, p) : undefined;
  if (day) parts.push(day.outcome);
  const value = triAnd(parts);
  if (value === "UNKNOWN" && day?.matchedCalendar && w.days) {
    return {
      value,
      reason: {
        kind: "calendar",
        text: `${p.isoDate} é ${day.matchedCalendar.entry}: não verificado se conta como "${w.days.label}"`,
        evidence: w.days.dateOverrides.flatMap((o) => o.evidence),
      },
    };
  }
  return { value };
}

/**
 * Minute grid of the rule's state over [fromMs, toMs], with prefix counts so any
 * interval can be queried in O(1). Rules are minute-precise, so a minute grid is exact.
 */
type RuleGrid = {
  startMs: number;
  values: Tri[];
  reasons: (Reason | undefined)[];
  applies: Int32Array;
  unknown: Int32Array;
};

function buildGrid(reg: RegulationRecord, ctx: Ctx, fromMs: number, toMs: number): RuleGrid {
  const startMs = Math.floor(fromMs / MINUTE_MS) * MINUTE_MS;
  const n = Math.max(1, Math.floor((toMs - startMs) / MINUTE_MS) + 2);
  const values: Tri[] = new Array(n);
  const reasons: (Reason | undefined)[] = new Array(n);
  const applies = new Int32Array(n + 1);
  const unknown = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const r = evalInstant(reg, ctx, startMs + i * MINUTE_MS);
    values[i] = r.value;
    reasons[i] = r.reason;
    applies[i + 1] = applies[i]! + (r.value === "APPLIES" ? 1 : 0);
    unknown[i + 1] = unknown[i]! + (r.value === "UNKNOWN" ? 1 : 0);
  }
  return { startMs, values, reasons, applies, unknown };
}

/** State of the rule anywhere within [aMs, bMs] (inclusive minute cells). */
function stateOver(g: RuleGrid, aMs: number, bMs: number): Tri {
  const lo = Math.max(0, Math.floor((aMs - g.startMs) / MINUTE_MS));
  const hi = Math.min(g.values.length - 1, Math.floor((bMs - g.startMs) / MINUTE_MS));
  if (hi < lo) return "DOES_NOT_APPLY";
  if (g.applies[hi + 1]! - g.applies[lo]! > 0) return "APPLIES";
  if (g.unknown[hi + 1]! - g.unknown[lo]! > 0) return "UNKNOWN";
  return "DOES_NOT_APPLY";
}

/**
 * Is the vehicle on the element while the rule is in force, given ETA uncertainty?
 * The exposure interval [a, b] may be shifted by any s ∈ [−tol, +tol]:
 *  - APPLIES only if EVERY shift overlaps an in-force minute;
 *  - DOES_NOT_APPLY only if NO shift overlaps an in-force (or unknown) minute;
 *  - otherwise UNKNOWN.
 * This covers short events, entering before / leaving after a boundary, and overnight periods.
 */
function intervalUnderUncertainty(g: RuleGrid, aMs: number, bMs: number, minShiftMs: number, maxShiftMs: number): Tri {
  const lo = Math.min(0, Math.round(minShiftMs / MINUTE_MS));
  const hi = Math.max(0, Math.round(maxShiftMs / MINUTE_MS));
  let allApply = true;
  let allNone = true;
  for (let k = lo; k <= hi; k++) {
    const v = stateOver(g, aMs + k * MINUTE_MS, bMs + k * MINUTE_MS);
    if (v !== "APPLIES") allApply = false;
    if (v !== "DOES_NOT_APPLY") allNone = false;
    if (!allApply && !allNone) return "UNKNOWN";
  }
  return allApply ? "APPLIES" : allNone ? "DOES_NOT_APPLY" : "UNKNOWN";
}

function calendarReasonsWithin(g: RuleGrid, aMs: number, bMs: number): Reason[] {
  const out: Reason[] = [];
  const seen = new Set<string>();
  const lo = Math.max(0, Math.floor((aMs - g.startMs) / MINUTE_MS));
  const hi = Math.min(g.values.length - 1, Math.floor((bMs - g.startMs) / MINUTE_MS));
  for (let i = lo; i <= hi; i++) {
    const r = g.reasons[i];
    if (r && !seen.has(r.text)) {
      seen.add(r.text);
      out.push(r);
    }
  }
  return out;
}

/** Group sorted indices into contiguous [first, last] ranges. */
function indexRanges(indices: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const i of indices) {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else out.push([i, i]);
  }
  return out;
}

/* ─── Regulation evaluation ──────────────────────────── */

export function evaluateRegulation(
  reg: RegulationRecord,
  dataset: RegulationDataset,
  input: EvaluationInput,
  opts: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
): RegulationResult {
  const ctx: Ctx = { input, dataset };
  if (!isValidTimeZone(reg.when?.timeZone)) {
    throw new ConstraintDataError(`fuso horário inválido ou em falta na restrição (${String(reg.when?.timeZone)})`);
  }
  const caveats = [...reg.openQuestions];
  const interpreted = reg.evidence.filter((e) => e.verification === "INTERPRETED");
  for (const e of interpreted) caveats.push(`Interpretação: ${e.note ?? e.locator ?? e.id}`);

  /* 1. Vehicle / cargo applicability */
  const target = evalCondition(reg.appliesTo, ctx);

  /* 2. Location × time */
  const geom = dataset.geometries.find((g) => g.id === reg.location.geometryId);
  const locationReasons: Reason[] = [];
  let whereWhen: Tri;
  const tolMs = Math.max(0, opts.timeToleranceMin) * MINUTE_MS;

  const exposure = geom ? routeExposure(input.route, geom) : ({ kind: "noRoute" } as const);
  let exposureSummary: ExposureSummary | undefined;
  if (!geom) {
    whereWhen = "UNKNOWN";
    locationReasons.push({ kind: "geometry", text: `Geometria ${reg.location.geometryId} em falta no conjunto de dados` });
  } else if (exposure.kind === "none") {
    whereWhen = "DOES_NOT_APPLY";
    locationReasons.push({
      kind: "geometry",
      text:
        exposure.via === "resolvedGeometry"
          ? `A rota não passa em ${geom.label}`
          : `A rota não entra na área de triagem de ${geom.label} (área não verificada legalmente — ${geom.screeningArea?.method ?? ""})`,
      evidence: exposure.via === "screeningArea" ? geom.screeningArea?.evidence : geom.resolved?.evidence,
    });
  } else {
    // Time intervals during which the vehicle may be on the element, each with its own
    // shift range: the local passage window (timeline) or, for legacy inputs, ±tolerance.
    const times = input.route.pointTimesMs;
    const timing = input.route.timing && input.route.timing.expectedMs.length === times.length ? input.route.timing : undefined;
    let intervals: [number, number][] = [];
    let positions: [number, number][] = [];
    if (exposure.kind === "noRoute") {
      const w = input.route.tripWindowMs;
      if (w && Number.isFinite(w[0]) && Number.isFinite(w[1]) && w[1] >= w[0]) intervals = [[w[0], w[1]]];
      locationReasons.push({ kind: "geometry", text: "Geometria da rota indisponível — não é possível saber se a rota usa o troço restrito" });
    } else if (exposure.kind === "exact") {
      positions = exposure.runs.map((r) => [r.fromPos, r.toPos] as [number, number]);
      intervals = exposure.runs.map((r) => [timeAtPos(times, r.fromPos), timeAtPos(times, r.toPos)] as [number, number]);
    } else {
      positions = indexRanges(exposure.indices);
      intervals = positions.map(([i, j]) => [times[i]!, times[j]!] as [number, number]);
      locationReasons.push({
        kind: "geometry",
        text:
          exposure.via === "lowResolution"
            ? `Geometria da rota demasiado esparsa junto de ${geom.label} (segmentos > ${MAX_ROUTE_GAP_M} m) — não é possível excluir a passagem`
            : geom.status === "UNRESOLVED"
              ? `Geometria de ${geom.label} ainda não verificada — não é possível confirmar se a rota a usa`
              : `Não foi possível confirmar a passagem em ${geom.label}`,
        evidence: geom.legalDescriptionEvidence,
      });
      if (geom.diagnosticHints && input.routeRoadNumbers) {
        const seen = geom.diagnosticHints.roadNumbers.filter((r) => input.routeRoadNumbers!.includes(r));
        if (seen.length > 0) {
          locationReasons.push({ kind: "info", text: `Indício (diagnóstico, não decisivo): a rota inclui ${seen.join(", ")} — ${geom.diagnosticHints.note}` });
        }
      }
    }

    const windows = intervals.map((_, k) => (timing && positions[k] ? getPassageWindow(timing, positions[k]![0], positions[k]![1]) : undefined));
    const shifts = intervals.map((_, k) => (windows[k] ? [windows[k]!.minShiftMs, windows[k]!.maxShiftMs] : [-tolMs, tolMs]) as [number, number]);
    let timeTri: Tri = "UNKNOWN";
    let grid: RuleGrid | undefined;
    if (intervals.length > 0) {
      const lo = Math.min(...intervals.map((x, k) => x[0] + shifts[k]![0]));
      const hi = Math.max(...intervals.map((x, k) => x[1] + shifts[k]![1]));
      grid = buildGrid(reg, ctx, lo, hi);
      timeTri = triOr(intervals.map(([a, b], k) => intervalUnderUncertainty(grid!, a, b, shifts[k]![0], shifts[k]![1])));
    }
    const win = windows.filter((w): w is PassageWindow => !!w);
    const windowSummary = win.length
      ? {
          earliestIso: new Date(Math.min(...win.map((w) => w.earliestMs))).toISOString(),
          latestIso: new Date(Math.max(...win.map((w) => w.latestMs))).toISOString(),
          // One ETA-margin line (the widest, i.e. the latest stretch) + the distinct other reasons.
          sources: [
            ...new Set([
              ...win.flatMap((w) => w.uncertaintySources).filter((x) => x.startsWith("margem de ETA")).slice(-1),
              ...win.flatMap((w) => w.uncertaintySources).filter((x) => !x.startsWith("margem de ETA")),
            ]),
          ],
        }
      : undefined;
    const uncertaintyText = windowSummary
      ? `janela possível ${formatClock(windowSummary.earliestIso, reg.when.timeZone)}–${formatClock(windowSummary.latestIso, reg.when.timeZone)} (${windowSummary.sources.join("; ")})`
      : `margem de ±${Math.round(tolMs / MINUTE_MS)} min sobre a ETA`;
    const exactLocation = exposure.kind === "exact";
    whereWhen = exactLocation ? timeTri : triAnd(["UNKNOWN", timeTri]);

    let geometryReason: Reason | undefined;
    if (exposure.kind === "exact" && geom.resolved && intervals.length > 0) {
      exposureSummary = {
        fromIso: new Date(Math.min(...intervals.map((x) => x[0]))).toISOString(),
        toIso: new Date(Math.max(...intervals.map((x) => x[1]))).toISOString(),
        lengthM: exposure.matchedLengthM,
        timeZone: reg.when.timeZone,
        ...(windowSummary ? { window: windowSummary } : {}),
      };
      geometryReason = {
        kind: "geometry",
        text: `A rota segue ${geom.label} em ${(exposure.matchedLengthM / 1000).toFixed(1)} km (correspondência com a geometria; mapeamento ${geom.resolved.verification})`,
        evidence: geom.resolved.evidence,
      };
      locationReasons.push(geometryReason);
    }

    if (timeTri === "DOES_NOT_APPLY") {
      locationReasons.length = 0;
      if (geometryReason) locationReasons.push(geometryReason);
      locationReasons.push({
        kind: "info",
        text: `Passagem estimada${exposureSummary ? ` ${formatWindow(exposureSummary)}` : ""} fora do período em vigor (${describeWhen(reg)})`,
        evidence: whenEvidence(reg),
      });
    } else if (timeTri === "UNKNOWN") {
      if (intervals.length === 0) {
        locationReasons.push({ kind: "timing", text: "Sem horários estimados para a passagem" });
      } else {
        const lo = Math.min(...intervals.map((x, k) => x[0] + shifts[k]![0]));
        const hi = Math.max(...intervals.map((x, k) => x[1] + shifts[k]![1]));
        const cal = grid ? calendarReasonsWithin(grid, lo, hi) : [];
        locationReasons.push(...cal);
        if (cal.length === 0) {
          locationReasons.push({
            kind: "timing",
            text: `Passagem prevista${exposureSummary ? ` ${formatWindow(exposureSummary)}` : ""}; ${uncertaintyText} — perto de um limite do período em vigor (${describeWhen(reg)})`,
            evidence: whenEvidence(reg),
          });
        }
      }
    } else {
      if (exposureSummary) {
        locationReasons.push({
          kind: "timing",
          text: `Passagem estimada ${formatWindow(exposureSummary)} — dentro do período em vigor (${describeWhen(reg)})`,
          evidence: whenEvidence(reg),
        });
      }
      if (input.route.timesAreEstimates) {
        locationReasons.push({ kind: "timing", text: `Horário de passagem baseado em ETA estimada — em vigor em toda a ${uncertaintyText}` });
      }
    }
  }

  /* 3. Exceptions — any exception that holds lifts the restriction */
  const exEvals = reg.exceptions.map((x) => ({ x, r: evalCondition(x.condition, ctx) }));
  const exceptionHolds = triOr(exEvals.map((e) => e.r.value));

  /* 4. Combine */
  let outcome = triAnd([target.value, whereWhen, triNot(exceptionHolds)]);
  const reasons: Reason[] = [];

  if (outcome === "APPLIES" && reg.legalStatus !== "VERIFIED") {
    outcome = "UNKNOWN";
    reasons.push({ kind: "legal_status", text: `Regra legal com estado ${reg.legalStatus} — não pode determinar uma violação` });
  }

  if (outcome === "DOES_NOT_APPLY") {
    if (target.value === "DOES_NOT_APPLY") reasons.push(...target.decisive);
    if (whereWhen === "DOES_NOT_APPLY") reasons.push(...locationReasons);
    if (exceptionHolds === "APPLIES") {
      for (const e of exEvals.filter((e) => e.r.value === "APPLIES")) {
        reasons.push({ kind: "info", text: `Exceção aplicável: ${e.x.label}`, evidence: e.x.evidence });
      }
    }
  } else if (outcome === "UNKNOWN") {
    if (target.value === "UNKNOWN") reasons.push(...target.unknowns);
    if (whereWhen === "UNKNOWN") reasons.push(...locationReasons);
    if (exceptionHolds === "UNKNOWN") {
      for (const e of exEvals.filter((e) => e.r.value === "UNKNOWN")) {
        reasons.push({ kind: "missing_fact", text: `Exceção por confirmar: ${e.x.label}`, evidence: e.x.evidence });
        reasons.push(...e.r.unknowns.map((u) => ({ ...u, text: `  · ${u.text}` })));
      }
    }
  } else {
    reasons.push(...target.decisive, ...locationReasons);
    for (const e of exEvals) {
      reasons.push({ kind: "info", text: `Exceção não aplicável: ${e.x.label}`, evidence: e.x.evidence });
      reasons.push(...e.r.decisive.map((d) => ({ ...d, text: `  · ${d.text}` })));
    }
  }

  const evidenceIds = [...new Set(reasons.flatMap((r) => r.evidence ?? []))];
  return {
    regulationId: reg.id,
    effect: reg.effect,
    regulationVersion: reg.version,
    title: reg.title,
    outcome,
    reasons: dedupeReasons(reasons),
    caveats: outcome === "DOES_NOT_APPLY" && target.value === "DOES_NOT_APPLY" ? [] : caveats,
    evidenceIds,
    exposure: exposureSummary,
  };
}

/** Human description of when a constraint is in force, e.g. "dias úteis, 07:00–21:00". */
export function describeWhen(reg: RegulationRecord): string {
  const w = reg.when;
  const parts: string[] = [];
  if (w.activePeriods) parts.push(w.activePeriods.map((p) => `${p.start.replace("T", " ")} → ${p.end.replace("T", " ")}`).join("; "));
  if (w.days) parts.push(w.days.label);
  if (w.windows) parts.push(w.windows.map((x) => `${x.start}–${x.end}`).join(", "));
  return `${parts.join(", ")}; ${w.timeZone}`;
}

function whenEvidence(reg: RegulationRecord): string[] {
  const w = reg.when;
  return [
    ...(w.activePeriods ?? []).flatMap((p) => p.evidence),
    ...(w.windows ?? []).flatMap((x) => x.evidence),
    ...(w.days?.weekdaysEvidence ?? []),
  ];
}

const WEEKDAY_PT = ["", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "quarta-feira 2026-10-07, 10:12–10:19 (Europe/Lisbon)" */
/** "HH:MM" local time of an ISO instant (dd/mm added when the day differs is left to formatWindow). */
export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function formatWindow(e: ExposureSummary): string {
  const a = localParts(Date.parse(e.fromIso), e.timeZone);
  const b = localParts(Date.parse(e.toIso), e.timeZone);
  const day = `${WEEKDAY_PT[a.weekday]} ${a.isoDate}`;
  const range = a.isoDate === b.isoDate ? `${hhmm(a.minutes)}–${hhmm(b.minutes)}` : `${hhmm(a.minutes)}–${b.isoDate} ${hhmm(b.minutes)}`;
  return `${day}, ${range} (${e.timeZone})`;
}

function dedupeReasons(rs: Reason[]): Reason[] {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)));
}

export function summarizeStatus(results: RegulationResult[]): ComplianceStatus {
  if (results.some((r) => r.outcome === "APPLIES" && r.effect !== "advisory")) return "ROUTE_AFFECTED";
  if (results.some((r) => r.error)) return "EVALUATION_ERROR";
  if (results.some((r) => r.outcome === "UNKNOWN")) return "POTENTIALLY_AFFECTED";
  return "ROUTE_COMPLIANT";
}

function errorResult(reg: RegulationRecord, message: string): RegulationResult {
  return {
    regulationId: reg.id,
    regulationVersion: reg.version,
    title: reg.title,
    outcome: "UNKNOWN",
    reasons: [{ kind: "error", text: `Não foi possível avaliar esta restrição: ${message}` }],
    caveats: [],
    evidenceIds: [],
    error: message,
  };
}

export function evaluateCompliance(
  dataset: RegulationDataset,
  input: EvaluationInput,
  opts: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
  now: Date = new Date(),
): ComplianceReport {
  // A malformed route must never read as "not affected": every constraint becomes an error.
  let routeError: string | undefined;
  try {
    assertValidRoute(input.route.points, input.route.pointTimesMs);
  } catch (e) {
    routeError = e instanceof Error ? e.message : String(e);
  }
  const results = dataset.regulations.map((reg) => {
    if (routeError) return errorResult(reg, `rota inválida — ${routeError}`);
    try {
      return evaluateRegulation(reg, dataset, input, opts);
    } catch (e) {
      return errorResult(reg, e instanceof Error ? e.message : String(e));
    }
  });
  return {
    status: summarizeStatus(results),
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    evaluatedAt: now.toISOString(),
    results,
  };
}
