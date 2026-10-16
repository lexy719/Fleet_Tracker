// Studio read model. Reads the active world (lab or operational store, see world/) and
// derives ETAs from route geometry + driver hours so a change of driver, vehicle or route
// visibly changes the plan. Every derived time is an estimate, labelled as such.
import { DAY_LIMIT, SPELL_LIMIT, haversineKm, pointAtKm } from "../fleetos-environment/world";
import { W } from "./world/active";
import { findPlace } from "./world/lab";
import type { Point, RecordedRoute, StudioRoute, WorldJob } from "./world/types";

export { SPELL_LIMIT, DAY_LIMIT };
export type { WorldJob, RecordedRoute, Point, StudioRoute };

/* ─── Accessors over the active world ──────────────────────────────────── */

export const NOW = {
  get min() {
    return W().now.min;
  },
  get label() {
    return W().now.label;
  },
  get clock() {
    return W().now.clock;
  },
};
export const ROUTES = new Proxy({} as Record<string, StudioRoute>, {
  get: (_, k) => W().routes[k as string],
  ownKeys: () => Reflect.ownKeys(W().routes),
  getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: W().routes[k as string] }),
});
export const worldJobs = () => W().jobs;
export const driverWorld = (id: string) => W().driver(id);
export const truckWorld = (id: string) => W().truck(id);
export const trailerWorld = (id: string) => W().trailer(id);
export const holderOf = (kind: "driverId" | "truckId" | "trailerId", id: string) =>
  id ? (W().jobs.find((j) => j[kind] === id)?.id ?? null) : null;
export const dayStart = () => W().day.start;
/** Days ahead of a stop's window (0 = today). */
export const dayOf = (jobId: string, stopId: string) => W().stopDay?.(jobId, stopId) ?? 0;
export const dayEnd = () => W().day.end;

export const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const clock = (m: number) => {
  const d = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
};
export const span = (m: number) => {
  const a = Math.round(Math.abs(m));
  return a >= 60 ? `${Math.floor(a / 60)} h ${String(a % 60).padStart(2, "0")}` : `${a} min`;
};

export const placeOf = (where: string): Point | null => findPlace(W().places, where);

export const initials = (name: string) =>
  !name
    ? "—"
    : name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

/** Alternatives share origin/destination with the job's recorded route. */
export function alternatives(job: WorldJob): RecordedRoute[] {
  const [from, to] = job.routeId.split("__");
  return Object.values(ROUTES).filter((r) => r.id.startsWith(`${from}__${to}__`));
}
const STRATEGY_LABEL: Record<string, string> = {
  fastest: "Mais rápida",
  no_tolls: "Sem portagens",
};
export const strategyLabel = (s: string) => STRATEGY_LABEL[s.toLowerCase()] ?? s;
/** Roads that set this route apart from the others recorded for the same trip. */
export function distinctRoads(r: RecordedRoute, others: RecordedRoute[]) {
  const shared = new Set(others.filter((o) => o.id !== r.id).flatMap((o) => o.roads));
  const own = r.roads.filter((x) => !shared.has(x));
  return (own.length ? own : r.roads).slice(0, 5);
}

export type Placed = WorldJob & { route: RecordedRoute; scale: number; at: Point; moving: boolean };
export function place(job: WorldJob, routeId = job.routeId): Placed {
  const orig = ROUTES[job.routeId];
  const route = ROUTES[routeId] ?? orig;
  const scale = route.km / orig.km;
  const km = (job.positionKm ?? 0) * scale;
  return { ...job, route, scale, at: pointAtKm(route, km), moving: job.status === "in_transit" };
}

/* ─── Edits: what the office changes on a transport ─────────────────────── */

export type Edit = {
  driverId?: string;
  routeId?: string;
  truckId?: string;
  trailerId?: string;
  windows?: Record<string, [string, string]>;
  /** Text of the (simulated) client notice. */
  notified?: string;
  /** Exception recorded for an issue that cannot be fixed mid-trip (simulated). */
  exception?: string;
};
export type Edited = WorldJob & { notified?: string; exception?: string; edit: Edit };

/** What can still change depends on where the transport is in its life. */
export type Phase = "planning" | "loading" | "transit" | "closed";
export const phaseOf = (status: string): Phase =>
  status === "loading" ? "loading" : status === "in_transit" ? "transit" : ["delivered", "invoiced", "cancelled"].includes(status) ? "closed" : "planning";
/** Resources and route are fixed once loading starts: the cargo is on that truck, with that driver. */
export const canReassign = (status: string) => phaseOf(status) === "planning";

export const seedOf = (id: string) => W().jobs.find((j) => j.id === id)!;
const plateOf = (truckId: string) => truckWorld(truckId).plate;

/** The seeded transport with the office's edits applied; resolved blockers disappear. */
export function applyEdit(id: string, e: Edit): Edited {
  const seed = seedOf(id);
  let blockers = [...seed.blockers];
  let planNote = seed.planNote;
  let next = seed.next;
  const job: WorldJob = {
    ...seed,
    driverId: e.driverId ?? seed.driverId,
    truckId: e.truckId ?? seed.truckId,
    trailerId: e.trailerId ?? seed.trailerId,
    stops: seed.stops.map((s) => (e.windows?.[s.id] ? { ...s, window: e.windows[s.id] } : s)),
  };
  if (e.trailerId && e.trailerId !== seed.trailerId && trailerWorld(e.trailerId)) {
    blockers = blockers.filter((b) => !/Reboque/.test(b));
    next = `Engatar o reboque ${trailerWorld(e.trailerId)!.plate} (${trailerWorld(e.trailerId)!.location?.replace("livre · ", "")})`;
  }
  if (e.truckId && e.truckId !== seed.truckId && truckWorld(e.truckId).availability === "AVAILABLE") {
    blockers = blockers.filter((b) => !/Viatura/.test(b));
    next = `Confirmar a chegada de ${plateOf(e.truckId)} a ${seed.stops[0].city}`;
  }
  if (e.windows) {
    blockers = blockers.filter((b) => !/janela/.test(b));
    planNote = undefined;
    next = `Confirmar a nova janela com ${seed.client}`;
  }
  if (e.driverId && e.driverId !== seed.driverId) next = `Acompanhar a passagem do camião para ${driverWorld(e.driverId).name}`;
  if (e.notified) next = "Cliente avisado · acompanhar a chegada";
  if (e.exception) next = "Exceção registada · motorista conclui e fica indisponível até regularizar";
  return { ...job, blockers, planNote, next, notified: e.notified, exception: e.exception, edit: e };
}

/* ─── Readiness: when people and equipment can be at the start ─────────── */

const travelMin = (a: Point, b: Point) => Math.round((haversineKm(a, b) / 70) * 60) + 15;
export const truckPlace = (truckId: string): Point | null =>
  W().truckPositions[truckId] ?? placeOf(truckWorld(truckId).fuel.prov.source);

export type Ready = { at: number; travel: number; issues: string[]; from: Point | null };

export function truckReady(job: WorldJob, truckId = job.truckId): Ready {
  const seed = seedOf(job.id);
  const t = truckWorld(truckId);
  const pickup = ROUTES[job.routeId].line[0];
  const issues: string[] = [];
  const from = truckPlace(truckId);
  let at = NOW.min;
  let travel = 0;
  if (t.availability === "MAINTENANCE") {
    const until = /previsão (\d\d:\d\d)/.exec(t.service)?.[1];
    at = until ? toMin(until) : 20 * 60;
    issues.push(`Em oficina até ${until ?? "sem previsão"}`);
  }
  if (truckId !== seed.truckId || t.availability === "MAINTENANCE") {
    travel = from ? travelMin(from, pickup) : 0;
    at += travel;
    const busy = holderOf("truckId", truckId);
    if (busy && busy !== job.id) issues.push(`Deixa ${busy} sem viatura`);
  }
  return { at, travel, issues, from };
}

export function trailerFit(job: WorldJob, trailerId = job.trailerId): Ready {
  const seed = seedOf(job.id);
  const tr = trailerWorld(trailerId);
  if (!tr) return { at: Infinity, travel: 0, issues: [`Reboque «${trailerId}» não existe na frota`], from: null };
  const issues: string[] = [];
  const need = job.cargo.reduce((a, c) => a + c.pallets, 0);
  if (tr.pallets < need) issues.push(`Leva ${tr.pallets} paletes, carga tem ${need}`);
  if (job.cargo.some((c) => c.tempC) && !tr.capabilities.some((c) => /Frio/.test(c))) issues.push("Sem frio para a carga");
  if (job.cargo.some((c) => c.adr) && !tr.capabilities.some((c) => /ADR/.test(c))) issues.push("Sem equipamento ADR");
  const from = tr.location ? placeOf(tr.location) : null;
  const travel = trailerId !== seed.trailerId && from ? travelMin(from, ROUTES[job.routeId].line[0]) : 0;
  const busy = holderOf("trailerId", trailerId);
  if (busy && busy !== job.id) issues.push(`Em uso em ${busy}`);
  return { at: NOW.min + travel, travel, issues, from };
}

/* ─── Plan: the transport's day, minute by minute ─────────────────────── */

export type Seg = { kind: "drive" | "break" | "stop" | "handover" | "wait" | "fuel"; from: number; to: number; km0: number; km1: number; past?: boolean };
export type StopPlan = { id: string; eta: number | null; done?: string; late: boolean; early: boolean };
export type Plan = {
  driverId: string;
  routeId: string;
  stops: StopPlan[];
  final: number | null;
  start: number | null;
  breaks: number;
  handoverMin: number;
  driveMin: number;
  issues: string[];
  spellLeft: number;
  dayLeft: number;
  estimated: boolean;
  /** Piecewise day of the transport: where the truck is at any minute. */
  trace: Seg[];
  /** Refuel stops of the route (from the refuel engine), with their time in the day. */
  fuelStops: { at: number; km: number; name: string; merged: boolean }[];
};

/**
 * Forward simulation from the demo clock: travel at the recorded route's average
 * speed, a 45-min break whenever the 4 h 30 spell runs out, 40-min loading and
 * unloading, 30-min service at intermediate stops, waiting for windows to open.
 * Not-started transports begin when driver, truck and trailer can all be there.
 */
export function plan(job: WorldJob, driverId: string, routeId: string, refuels: { km: number; name: string }[] = []): Plan {
  const seed = seedOf(job.id);
  const p = place(job, routeId);
  const kmh = p.route.km / p.route.hours;
  const own = driverId === seed.driverId;
  const d = driverWorld(driverId);
  const issues: string[] = [];
  let spellLeft = SPELL_LIMIT - d.spellMin;
  let dayLeft = DAY_LIMIT - d.dayMin;
  const where = W().drivers.find((x) => x.id === driverId)?.where ?? "";
  const from = placeOf(where);
  const handoverMin = own || !from ? 0 : travelMin(from, p.at);
  const started = seed.status === "in_transit" || seed.status === "loading";
  let cursor = (job.positionKm ?? 0) * p.scale;
  const trace: Seg[] = [];
  let t: number;
  let start: number | null = null;
  if (started) {
    // Clock-only records can wrap past midnight: never let the departure lie in the future —
    // fall back to the time needed to reach the recorded position at average speed.
    let dep = toMin(/\d\d:\d\d/.test(job.stops[0].completedAt ?? "") ? job.stops[0].completedAt! : job.stops[0].window[0]);
    if (dep > NOW.min) dep = NOW.min - (cursor / kmh) * 60;
    if (seed.status === "loading") {
      trace.push({ kind: "stop", from: dep, to: NOW.min, km0: 0, km1: 0, past: true });
      t = NOW.min;
      trace.push({ kind: "stop", from: t, to: t + 10, km0: 0, km1: 0 });
      t += 10;
    } else {
      // Past (simulated): loading at origin, then constant pace up to the demo clock.
      trace.push({ kind: "stop", from: dep - 40, to: dep, km0: 0, km1: 0, past: true });
      trace.push({ kind: "drive", from: dep, to: NOW.min, km0: 0, km1: cursor, past: true });
      t = NOW.min;
    }
    if (handoverMin) trace.push({ kind: "handover", from: t, to: t + handoverMin, km0: cursor, km1: cursor });
    t += handoverMin;
  } else {
    const tr = job.truckId ? truckReady(job) : { at: Infinity, travel: 0, issues: ["Sem viatura atribuída"], from: null };
    // A trailer is only required when the job names one (lab) — the store records it explicitly.
    const tl = job.trailerId ? trailerFit(job) : { at: NOW.min, travel: 0, issues: [], from: null };
    if (!driverId) issues.push("Sem motorista atribuído");
    issues.push(...tr.issues, ...tl.issues);
    const w0 = toMin(job.stops[0].window[0]) + dayOf(job.id, job.stops[0].id) * 1440;
    const driverAt = own ? NOW.min : NOW.min + handoverMin;
    const ready = Math.max(driverAt, tr.at, Number.isFinite(tl.at) ? tl.at : NOW.min);
    t = Math.max(w0, Number.isFinite(ready) ? ready : w0);
    start = Number.isFinite(tl.at) && Number.isFinite(tr.at) && driverId ? t : null;
  }
  const drive = (min: number) => {
    if (min <= 0) return;
    const km0 = cursor;
    cursor += (min / 60) * kmh;
    trace.push({ kind: "drive", from: t, to: t + min, km0, km1: cursor });
    t += min;
  };
  let breaks = 0;
  let driveMin = 0;
  const fuelStops: Plan["fuelStops"] = [];
  /** Drive to route km `target`, taking the 45-min break whenever the spell runs out. */
  const travelTo = (target: number) => {
    let seg = Math.max(0, ((target - cursor) / kmh) * 60);
    while (seg > spellLeft) {
      drive(spellLeft);
      driveMin += spellLeft;
      dayLeft -= spellLeft;
      seg -= spellLeft;
      trace.push({ kind: "break", from: t, to: t + 45, km0: cursor, km1: cursor });
      t += 45;
      breaks++;
      spellLeft = SPELL_LIMIT;
    }
    drive(seg);
    cursor = target;
    driveMin += seg;
    dayLeft -= seg;
    spellLeft -= seg;
  };
  const pendingFuel = refuels.filter((r) => r.km >= cursor).sort((a, b) => a.km - b.km);
  const last = job.stops.length - 1;
  const stops: StopPlan[] = job.stops.map((s, i) => {
    if (s.completedAt) return { id: s.id, eta: null, done: s.completedAt, late: false, early: false };
    if (i === 0 && started) return { id: s.id, eta: toMin(s.window[0]), late: false, early: false };
    const target = s.km * p.scale;
    while (pendingFuel.length && pendingFuel[0].km <= target) {
      const r = pendingFuel.shift()!;
      travelTo(r.km);
      // Refuel inside the mandatory break when one is due within the next hour of driving.
      const merged = spellLeft < 60;
      const dur = merged ? 45 : 20;
      trace.push({ kind: "fuel", from: t, to: t + dur, km0: cursor, km1: cursor });
      fuelStops.push({ at: t, km: cursor, name: r.name, merged });
      t += dur;
      if (merged) {
        breaks++;
        spellLeft = SPELL_LIMIT;
      }
    }
    travelTo(target);
    const eta = t;
    const off = dayOf(job.id, s.id) * 1440;
    const [w0, w1] = s.window.map((x) => toMin(x) + off);
    const early = eta < w0;
    const late = eta > w1;
    if (early && i < last) {
      trace.push({ kind: "wait", from: t, to: w0, km0: cursor, km1: cursor });
      t = w0;
    }
    const service = i === 0 || i === last ? 40 : 30;
    trace.push({ kind: "stop", from: t, to: t + service, km0: cursor, km1: cursor });
    if (i < last) t += service;
    return { id: s.id, eta, late, early };
  });
  if (dayLeft < 0) issues.push(`Ultrapassa as 9 h de condução diária em ${span(-dayLeft)}`);
  const lateStop = job.stops.find((_, i) => stops[i].late);
  if (lateStop) issues.push(`Chega fora da janela em ${lateStop.city}`);
  if (!own) {
    const busy = holderOf("driverId", driverId);
    if (where.includes("folga")) issues.unshift(where.split("·")[0].trim());
    if (busy && busy !== job.id) issues.unshift(`Deixa ${busy} sem motorista`);
  }
  const q = d.qualifications.find((x) => x.state === "EXPIRED");
  if (q) issues.unshift(`${q.label} ${q.detail}`);
  return {
    driverId,
    routeId,
    stops,
    final: started || start != null ? (stops.at(-1)?.eta ?? null) : null,
    start,
    breaks,
    handoverMin,
    driveMin,
    issues,
    spellLeft: Math.max(0, spellLeft),
    dayLeft,
    estimated: true,
    trace: start == null && !started ? [] : trace,
    fuelStops,
  };
}

export type Tone = "bad" | "warn" | "ok" | "idle";
const SERIOUS = /Ultrapassa|sem motorista|sem viatura|caducou|oficina|não existe|paletes|frio|ADR|Em uso|Sem motorista|Sem viatura/;
export function toneOf(job: Edited, pl: Plan, fuelShort = false): Tone {
  const serious = pl.issues.filter((i) => SERIOUS.test(i) && !(job.exception && /caducou|caducad/i.test(i)));
  if (job.blockers.length || serious.length) return "bad";
  if (fuelShort) return "warn";
  // A risk only stays a risk while the plan still misses a window and nobody told the client.
  const late = pl.issues.some((i) => /fora da janela/.test(i));
  if (late && !job.notified) return "warn";
  if (job.status === "backlog" || job.status === "queued") return "idle";
  return "ok";
}

export const allDrivers = () =>
  W().drivers.map((x) => ({ ...x, name: driverWorld(x.id).name, holder: holderOf("driverId", x.id) }));
export const allTrucks = () =>
  W().trucks.map((t) => ({ ...t, holder: holderOf("truckId", t.id), where: t.fuel.prov.source.replace("manual · ", "") }));
export const freeTrailers = () => W().trailers.filter((t) => t.location);

/** What the transport most needs from the office right now. */
export type Need = "plan" | "driver" | "truck" | "trailer" | "exception" | "window" | "notify" | null;
export function needOf(job: Edited, pl: Plan): Need {
  const phase = phaseOf(job.status);
  if (phase === "closed") return null;
  if (phase === "planning" && W().source === "ops") {
    // Real data: resources are assigned only by confirming a route plan (same as Expedição).
    if (job.plan !== "PLANNED" || !job.driverId || !job.truckId || job.blockers.length) return "plan";
  } else if (phase === "planning") {
    if (!job.driverId || job.blockers.some((b) => /sem motorista|motorista .* não existe/i.test(b))) return "driver";
    if (!job.truckId || job.blockers.some((b) => /Viatura|sem viatura|viatura .* não existe/i.test(b)) || pl.issues.some((i) => /oficina/.test(i)))
      return "truck";
    if (job.blockers.some((b) => /Reboque/i.test(b))) return "trailer";
  } else if (!job.exception && pl.issues.some((i) => /caducou|caducad/i.test(i))) {
    // Mid-trip the driver cannot be swapped: the decision is to record an exception.
    return "exception";
  }
  if (job.planNote || job.blockers.some((b) => /janela/.test(b))) return "window";
  if (pl.issues.some((i) => /fora da janela/.test(i)) && !job.notified) return "notify";
  return null;
}

/** Window proposals: move the loading earlier, or ask the client for a window the plan can meet. */
export function windowOptions(job: Edited, pl: Plan): { label: string; detail: string; windows: Record<string, [string, string]> }[] {
  const out: { label: string; detail: string; windows: Record<string, [string, string]> }[] = [];
  const first = job.stops[0];
  const lastStop = job.stops.at(-1)!;
  const route = ROUTES[job.routeId];
  const driveMin = (route.hours * 60) | 0;
  const [d0] = lastStop.window.map(toMin);
  const earlyLoad = Math.max(NOW.min + 30, d0 - driveMin - 40 - 20);
  const roundUp = (m: number) => Math.ceil(m / 30) * 30;
  const e0 = roundUp(earlyLoad);
  if (!first.completedAt && e0 < toMin(first.window[0]))
    out.push({
      label: `Antecipar a carga para ${clock(e0)}`,
      detail: `${first.city} · pedir ao expedidor`,
      windows: { [first.id]: [clock(e0), clock(e0 + 60)] },
    });
  const eta = pl.final ?? roundUp(toMin(first.window[0]) + driveMin + 80);
  const n0 = roundUp(eta + 10);
  out.push({
    label: `Pedir nova janela ${clock(n0)}–${clock(n0 + 60)}`,
    detail: `${lastStop.city} · ${job.client}`,
    windows: { [lastStop.id]: [clock(n0), clock(n0 + 60)] },
  });
  return out;
}

export function noticeText(job: Edited, pl: Plan) {
  const s = job.stops.at(-1)!;
  const eta = pl.final != null ? clock(pl.final) : "por confirmar";
  return `Bom dia, ${job.client}. O transporte ${job.reference} para ${s.city} tem chegada prevista às ${eta}, fora da janela combinada (${s.window[0]}–${s.window[1]}). Confirmam a receção a essa hora? Obrigado.`;
}

/** Km along the route at minute `t` (flat before departure, during stops/breaks, after arrival). */
export function kmAt(pl: Plan, t: number): number {
  const tr = pl.trace;
  if (!tr.length) return 0;
  if (t <= tr[0].from) return tr[0].km0;
  for (const g of tr)
    if (t <= g.to) return g.kind === "drive" ? g.km0 + ((t - g.from) / Math.max(1e-6, g.to - g.from)) * (g.km1 - g.km0) : g.km0;
  return tr.at(-1)!.km1;
}
export function segAt(pl: Plan, t: number): Seg | null {
  return pl.trace.find((g) => t >= g.from && t <= g.to) ?? null;
}

/** Where a stop sits on its (possibly alternative) recorded route. */
export function stopPoint(route: RecordedRoute, scale: number, km: number, i: number, n: number): Point {
  if (i === 0) return route.line[0];
  if (i === n - 1) return route.line.at(-1)!;
  return pointAtKm(route, km * scale);
}
