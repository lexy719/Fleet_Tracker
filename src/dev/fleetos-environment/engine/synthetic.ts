/**
 * Synthetic world adapter: implements the operational boundary from `world.ts`
 * plus the lab's committed/previewed facts (`labWorld`). DEV only.
 */
import type { GuidedState } from "../guidedWorkspace";
import { labWorld } from "../fx/model";
import {
  DRIVER_POOL,
  NOW,
  ROUTES,
  TRAILERS,
  TRUCKS,
  WORLD_JOBS,
  docEvents,
  driverWorld,
  pointAtKm,
  STATUS_LABEL,
  truckWorld,
  type RestrictionWorld,
} from "../world";
import type {
  EntityKind,
  EntityNode,
  EntityRef,
  OperationalEvent,
  OperationalTimelineRead,
  OperationalValue,
  OperationalWorldProvider,
  ResourceFutureRead,
  RestrictionImpactRead,
  RouteAlternativeRead,
} from "./contracts";

/** 6 Oct 2026 in Portugal (WEST, +01:00). */
const DAY0 = Date.parse("2026-10-06T00:00:00+01:00");
export const msOf = (min: number) => DAY0 + min * 60_000;
export const minOf = (ms: number) => Math.round((ms - DAY0) / 60_000);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const simulated = <T>(value: T): OperationalValue<T> => ({
  status: "KNOWN",
  value,
  source: "simulated",
});
const unknown = <T>(reason: string): OperationalValue<T> => ({
  status: "UNKNOWN",
  source: "unknown",
  reason,
});

const short = (title: string) => title.split(" — ")[0].split(" · ")[0];

export function createSyntheticProvider(
  state: GuidedState,
): OperationalWorldProvider {
  const worldFor = (jobId: string) =>
    labWorld({ ...state, anchor: { kind: "job", id: jobId } });
  const cache = new Map<string, ReturnType<typeof worldFor>>();
  const w = (jobId: string) => {
    if (!cache.has(jobId)) cache.set(jobId, worldFor(jobId));
    return cache.get(jobId)!;
  };
  const jobOfDriver = (id: string) =>
    WORLD_JOBS.find((j) => w(j.id).driver.id === id)?.id ?? null;
  const jobOfTruck = (id: string) =>
    WORLD_JOBS.find((j) => w(j.id).truck.id === id)?.id ?? null;
  const jobOfTrailer = (id: string) =>
    WORLD_JOBS.find((j) => w(j.id).job.trailerId === id)?.id ?? null;

  function currentJob(ref: EntityRef): string | null {
    switch (ref.kind) {
      case "job":
        return ref.id;
      case "driver":
        return jobOfDriver(ref.id);
      case "truck":
        return jobOfTruck(ref.id);
      case "trailer":
        return jobOfTrailer(ref.id);
      case "document":
        return (
          WORLD_JOBS.find((j) => w(j.id).ledger.some((d) => d.id === ref.id))
            ?.id ?? null
        );
      case "restriction":
        return (
          WORLD_JOBS.find((j) =>
            w(j.id).restrictions.some((r) => r.id === ref.id),
          )?.id ?? null
        );
      case "stop":
        return (
          WORLD_JOBS.find((j) =>
            w(j.id).candidates.some((c) => c.id === ref.id),
          )?.id ?? null
        );
      default:
        return null;
    }
  }

  function node(ref: EntityRef): EntityNode | null {
    if (ref.kind === "job") {
      const j = WORLD_JOBS.find((x) => x.id === ref.id);
      if (!j) return null;
      const lw = w(j.id);
      return {
        ref,
        label: `${j.id} · ${j.stops[0].city} → ${j.stops.at(-1)!.city}`,
        detail: j.client,
        status: {
          tone: j.blockers.length
            ? "blocker"
            : j.sla === "on_track"
              ? "ok"
              : "risk",
          text: STATUS_LABEL[j.status],
        },
        links: [
          { kind: "driver", id: lw.driver.id },
          { kind: "truck", id: lw.truck.id },
          { kind: "trailer", id: lw.job.trailerId },
          ...lw.ledger.map((d) => ({ kind: "document" as const, id: d.id })),
          ...lw.restrictions.map((r) => ({
            kind: "restriction" as const,
            id: r.id,
          })),
          ...j.stops.map((s) => ({
            kind: "stop" as const,
            id: `${j.id}/${s.id}`,
          })),
        ],
      };
    }
    if (ref.kind === "driver") {
      if (!DRIVER_POOL.some((d) => d.id === ref.id)) return null;
      const job = jobOfDriver(ref.id);
      const d = job ? w(job).driver : driverWorld(ref.id);
      const q = d.qualifications.find(
        (x) => x.state === "EXPIRED" || x.state === "EXPIRING",
      );
      return {
        ref,
        label: d.name,
        detail: job
          ? `${job} · ${DRIVER_POOL.find((p) => p.id === ref.id)?.where ?? ""}`
          : (DRIVER_POOL.find((p) => p.id === ref.id)?.where ??
            "sem transporte"),
        status: q
          ? {
              tone: q.state === "EXPIRED" ? "action" : "risk",
              text: `${q.label} ${q.state === "EXPIRED" ? "caducado" : "a caducar"}`,
            }
          : { tone: "ok", text: "Habilitações em dia" },
        links: job
          ? [
              { kind: "job", id: job },
              { kind: "truck", id: w(job).truck.id },
              { kind: "document", id: w(job).ledger[0].id },
              ...(w(job).planned
                ? [{ kind: "stop" as const, id: w(job).planned!.id }]
                : []),
              ...w(job).restrictions.map((r) => ({
                kind: "restriction" as const,
                id: r.id,
              })),
            ]
          : [],
      };
    }
    if (ref.kind === "truck") {
      if (!TRUCKS[ref.id]) return null;
      const job = jobOfTruck(ref.id);
      const t = job ? w(job).truck : truckWorld(ref.id);
      return {
        ref,
        label: `${t.plate} · ${t.make} ${t.model}`,
        detail: job ? `com ${job}` : "livre",
        status:
          t.availability === "MAINTENANCE"
            ? { tone: "action", text: "Em manutenção" }
            : { tone: "ok", text: "Disponível" },
        links: job
          ? [
              { kind: "job", id: job },
              { kind: "driver", id: w(job).driver.id },
              { kind: "trailer", id: w(job).job.trailerId },
              { kind: "document", id: w(job).ledger[0].id },
              ...w(job)
                .restrictions.filter((r) => r.all.some((x) => x.part))
                .map((r) => ({ kind: "restriction" as const, id: r.id })),
            ]
          : [],
      };
    }
    if (ref.kind === "trailer") {
      const t = TRAILERS[ref.id];
      if (!t) return null;
      const job = jobOfTrailer(ref.id);
      return {
        ref,
        label: `${t.id} · ${t.type}`,
        detail: job ? `com ${job}` : (t.location ?? "livre"),
        status: { tone: "neutral", text: `${t.pallets} posições` },
        links: job
          ? [
              { kind: "job", id: job },
              { kind: "truck", id: w(job).truck.id },
              { kind: "document", id: w(job).ledger[0].id },
            ]
          : [],
      };
    }
    if (ref.kind === "restriction") {
      const owner = WORLD_JOBS.find((j) =>
        w(j.id).restrictions.some((r) => r.id === ref.id),
      );
      const r = owner
        ? w(owner.id).restrictions.find((x) => x.id === ref.id)!
        : null;
      if (!r) return null;
      return {
        ref,
        label: short(r.title),
        detail: r.where,
        status: {
          tone:
            r.result === "APPLIES"
              ? "action"
              : r.result === "UNKNOWN"
                ? "unknown"
                : "ok",
          text: r.answer,
        },
        links: WORLD_JOBS.filter((j) =>
          w(j.id).restrictions.some((x) => x.id === ref.id),
        ).map((j) => ({ kind: "job" as const, id: j.id })),
      };
    }
    if (ref.kind === "document") {
      const job = currentJob(ref);
      const d = job ? w(job).ledger.find((x) => x.id === ref.id) : null;
      if (!d || !job) return null;
      return {
        ref,
        label: `${d.title}${d.number ? ` ${d.number}` : ""}`,
        detail: job,
        status: {
          tone:
            d.state === "ISSUED"
              ? d.diverges
                ? "risk"
                : "ok"
              : d.state === "MISSING"
                ? "action"
                : "neutral",
          text: d.stateText,
        },
        links: [
          { kind: "job", id: job },
          { kind: "driver", id: w(job).driver.id },
          { kind: "truck", id: w(job).truck.id },
          { kind: "trailer", id: w(job).job.trailerId },
        ],
      };
    }
    if (ref.kind === "stop") {
      const job = currentJob(ref);
      const c = job ? w(job).candidates.find((x) => x.id === ref.id) : null;
      if (!c || !job) return null;
      return {
        ref,
        label: c.name.replace("Área de serviço de ", ""),
        detail: `${c.road} · km ${c.km}`,
        status: c.breakFits
          ? { tone: "ok", text: `${c.marginMin} min de margem` }
          : { tone: "action", text: "excede o limite" },
        links: [
          { kind: "job", id: job },
          { kind: "driver", id: w(job).driver.id },
        ],
      };
    }
    return null;
  }

  function list(kind: EntityKind): EntityNode[] {
    const ids: string[] =
      kind === "job"
        ? WORLD_JOBS.map((j) => j.id)
        : kind === "driver"
          ? DRIVER_POOL.map((d) => d.id)
          : kind === "truck"
            ? [
                ...new Set([
                  ...WORLD_JOBS.map((j) => w(j.id).truck.id),
                  ...Object.keys(TRUCKS),
                ]),
              ]
            : kind === "trailer"
              ? Object.keys(TRAILERS)
              : kind === "restriction"
                ? [
                    ...new Set(
                      WORLD_JOBS.flatMap((j) =>
                        w(j.id).restrictions.map((r) => r.id),
                      ),
                    ),
                  ]
                : kind === "document"
                  ? WORLD_JOBS.flatMap((j) => w(j.id).ledger.map((d) => d.id))
                  : WORLD_JOBS.flatMap((j) =>
                      w(j.id).candidates.map((c) => c.id),
                    );
    return ids
      .map((id) => node({ kind, id }))
      .filter((n): n is EntityNode => !!n);
  }

  const restrictionOf = (
    jobId: string,
    id: string,
  ): RestrictionWorld | undefined =>
    w(jobId).restrictions.find((r) => r.id === id);

  const provider: OperationalWorldProvider = {
    name: "synthetic-world-adapter",
    nowMs: msOf(NOW.min),
    entity: node,
    list,
    related(ref, kind) {
      const n = node(ref);
      return (n?.links ?? [])
        .filter((l) => !kind || l.kind === kind)
        .map(node)
        .filter((x): x is EntityNode => !!x);
    },
    currentJob,
    getResourceAssignment(jobId) {
      const j = WORLD_JOBS.find((x) => x.id === jobId);
      if (!j)
        return {
          status: "UNAVAILABLE",
          assignment: null,
          issues: ["JOB_MISSING"],
        };
      const lw = w(jobId);
      const issues: string[] = [];
      if (!lw.trailer) issues.push("TRAILER_MISSING");
      if (lw.truck.availability === "MAINTENANCE")
        issues.push("TRUCK_UNAVAILABLE");
      if (lw.driver.qualifications.some((q) => q.state === "EXPIRED"))
        issues.push("DRIVER_QUALIFICATION_EXPIRED");
      return {
        status: issues.length ? "REVIEW_REQUIRED" : "CURRENT",
        assignment: {
          truckId: lw.truck.id,
          driverId: lw.driver.id,
          trailerId: lw.job.trailerId,
        },
        issues,
      };
    },
    getOperationalTimeline(jobId): OperationalTimelineRead {
      const j = WORLD_JOBS.find((x) => x.id === jobId);
      if (!j)
        return {
          status: "UNAVAILABLE",
          timeline: null,
          issues: ["JOB_MISSING"],
        };
      const lw = w(jobId);
      const activities = lw.driver.duty.map((d) => ({
        kind: d.kind === "work" ? ("service" as const) : d.kind,
        startMs: msOf(d.from),
        endMs: msOf(d.to),
        planned: !!d.planned,
        label: d.label,
      }));
      const stops = lw.job.stops.map((s, i) => {
        const eta = s.completedAt ?? s.eta;
        const known = /\d/.test(eta);
        const margin = known ? (toMin(s.window[1]) - toMin(eta)) * 60 : null;
        return {
          stopId: s.id,
          completed: !!s.completedAt,
          sequence: i,
          place: s.city,
          arrival: known
            ? simulated(msOf(toMin(eta)))
            : unknown<number>("ETA sem cálculo"),
          windowEndMs: msOf(toMin(s.window[1])),
          deliveryMarginSec:
            margin == null
              ? unknown<number>("ETA sem cálculo")
              : simulated(margin),
          window:
            margin == null
              ? ("UNKNOWN" as const)
              : margin >= 0
                ? ("PASS" as const)
                : ("FAIL" as const),
        };
      });
      const stale = lw.stale;
      if (stale)
        return {
          status: "STALE",
          timeline: null,
          issues: ["DRIVING_BASELINE_UNKNOWN"],
        };
      const fits = lw.planned ? lw.planned.breakFits : true;
      return {
        status: lw.job.plan === "REPLAN_REQUIRED" ? "REVIEW_REQUIRED" : "READY",
        timeline: {
          jobId,
          activities,
          stops,
          legalDriving: stale ? "UNKNOWN" : fits ? "PASS" : "FAIL",
          spellLimit: stale
            ? unknown<number>("Base de horas desatualizada")
            : simulated(msOf(lw.limitMin)),
          end: stops.at(-1)!.arrival,
        },
        issues: lw.job.plan === "REPLAN_REQUIRED" ? ["REPLAN_REQUIRED"] : [],
      };
    },
    getRouteAlternatives(jobId): RouteAlternativeRead {
      const j = WORLD_JOBS.find((x) => x.id === jobId);
      if (!j)
        return {
          status: "UNAVAILABLE",
          alternatives: [],
          issues: ["JOB_MISSING"],
        };
      const lw = w(jobId);
      const base = {
        id: `${jobId}/fastest`,
        intent: "fastest" as const,
        label: "Rota gravada · mais rápida",
        scope: "recorded_corridor" as const,
        recordedAt: ROUTES[j.routeId].retrievedAt,
        distanceM: {
          status: "KNOWN" as const,
          value: Math.round(ROUTES[j.routeId].km * 1000),
          source: "provider" as const,
        },
        durationSec: unknown<number>("Sem motor de tempo no laboratório"),
        feasibility: lw.restrictions.some((r) => r.result === "APPLIES")
          ? ("FAIL" as const)
          : ("UNKNOWN" as const),
        avoidedRestrictionIds: [],
        unknownReasons: [
          "Tempo, partida e conjunto atuais por recalcular",
          ...lw.restrictions
            .filter((r) => r.result === "UNKNOWN")
            .map((r) => `${short(r.title)}: ${r.answer}`),
        ],
      };
      const recordedNoTolls =
        ROUTES[j.routeId.replace(/__fastest$/, "__no_tolls")];
      const other = recordedNoTolls
        ? [
            {
              ...base,
              id: `${jobId}/no-tolls`,
              intent: "no_tolls" as const,
              label: "Percurso gravado · pedido sem portagens",
              recordedAt: recordedNoTolls.retrievedAt,
              distanceM: {
                status: "KNOWN" as const,
                value: Math.round(recordedNoTolls.km * 1000),
                source: "provider" as const,
              },
              feasibility: "UNKNOWN" as const,
              unknownReasons: [
                "Sem avaliação do conjunto e das janelas neste percurso",
              ],
              avoidedRestrictionIds: [],
            },
          ]
        : [];
      const avoiding = lw.restrictions
        .filter((r) => r.altLines && r.result !== "DOES_NOT_APPLY")
        .map((r) => ({
          id: `${jobId}/avoid-${r.id}`,
          intent: "restriction_avoiding" as const,
          label: `Evita ${short(r.title)} · ${r.alternative}`,
          scope: "official_segment" as const,
          distanceM: unknown<number>(
            "Só existe geometria do segmento; percurso completo não calculado",
          ),
          durationSec: unknown<number>("Exige recálculo"),
          feasibility: "UNKNOWN" as const,
          avoidedRestrictionIds: [r.id],
          unknownReasons: [
            "Ligação à rota, tempo, viatura e outras restrições por validar",
          ],
        }));
      return {
        status: "AVAILABLE",
        alternatives: [base, ...other, ...avoiding],
        issues: [],
      };
    },
    getRestrictionImpact(jobId, restrictionId): RestrictionImpactRead {
      const r = restrictionOf(jobId, restrictionId);
      if (!r)
        return {
          status: "UNKNOWN",
          reason: "RESTRICTION_MISSING",
          passage: unknown("Sem restrição"),
          missingFacts: [],
        };
      const lw = w(jobId);
      const passageMatch = /(\d\d):(\d\d)/.exec(r.when[0]?.value ?? "");
      const last = lw.job.stops.at(-1)!;
      const passage = passageMatch
        ? simulated(
            msOf(Number(passageMatch[1]) * 60 + Number(passageMatch[2])),
          )
        : /\d/.test(last.eta) && r.km && r.km > ROUTES[lw.job.routeId].km * 0.9
          ? simulated(msOf(toMin(last.eta) - 10))
          : unknown<number>("Hora de passagem não calculada");
      const missingFacts = [...r.all, ...r.any, ...r.when, ...r.exemptions]
        .filter((p) => p.outcome === "unknown")
        .map((p) => p.fact);
      return {
        status:
          r.result === "APPLIES"
            ? "FAIL"
            : r.result === "DOES_NOT_APPLY"
              ? "PASS"
              : "UNKNOWN",
        reason: r.result === "UNKNOWN" ? r.answer : undefined,
        passage,
        missingFacts,
      };
    },
    getResourceFutureState() {
      const out: Record<
        "trucks" | "drivers" | "trailers",
        Record<string, ResourceFutureRead>
      > = { trucks: {}, drivers: {}, trailers: {} };
      for (const j of WORLD_JOBS) {
        const lw = w(j.id);
        const last = lw.job.stops.at(-1)!;
        const end =
          !lw.stale && /\d/.test(last.eta) ? msOf(toMin(last.eta) + 40) : null;
        const pos =
          lw.job.positionKm != null && lw.job.positionSource !== "UNKNOWN"
            ? simulated(
                pointAtKm(lw.route, lw.job.positionKm) as [number, number],
              )
            : unknown<[number, number]>("Sem telemetria nem posição manual");
        const next = [
          {
            jobId: j.id,
            startMs: msOf(toMin(lw.job.stops[0].window[0])),
            endMs: end,
          },
        ];
        const available: OperationalValue<number> =
          end != null
            ? {
                status: "ASSUMED",
                value: end,
                source: "assumed",
                reason:
                  "ETA sintética + 40 min de descarga assumida; não confirma disponibilidade",
              }
            : unknown<number>("Fim do transporte sem estimativa");
        out.drivers[lw.driver.id] = {
          availableAt: available,
          position: pos,
          blocked: lw.driver.qualifications.some((q) => q.state === "EXPIRED")
            ? "Habilitação caducada"
            : null,
          nextAssignments: next,
        };
        out.trucks[lw.truck.id] = {
          availableAt: available,
          position: pos,
          blocked:
            lw.truck.availability === "MAINTENANCE" ? lw.truck.service : null,
          nextAssignments: next,
        };
        out.trailers[lw.job.trailerId] = {
          availableAt: available,
          position: pos,
          blocked: lw.trailer ? null : "Reboque não existe na frota",
          nextAssignments: next,
        };
        for (const resource of [
          out.drivers[lw.driver.id],
          out.trucks[lw.truck.id],
          out.trailers[lw.job.trailerId],
        ]) {
          if (resource.blocked)
            resource.availableAt = unknown(resource.blocked);
          const endpoint = lw.route.line.at(-1)!;
          resource.position =
            end == null
              ? unknown("Destino sem previsão de chegada")
              : {
                  status: "ASSUMED",
                  value: [endpoint[1], endpoint[0]],
                  source: "assumed",
                  reason: "Destino planeado; não é posição observada",
                };
        }
      }
      for (const d of DRIVER_POOL)
        out.drivers[d.id] ??= {
          availableAt: simulated(msOf(NOW.min)),
          position: unknown("Livre · posição não registada"),
          blocked: null,
          nextAssignments: [],
        };
      for (const t of Object.keys(TRUCKS))
        out.trucks[t] ??= {
          availableAt: simulated(msOf(NOW.min)),
          position: unknown("Sem posição registada"),
          blocked: null,
          nextAssignments: [],
        };
      for (const t of Object.keys(TRAILERS))
        out.trailers[t] ??= {
          availableAt: simulated(msOf(NOW.min)),
          position: unknown(TRAILERS[t].location ?? "Sem posição"),
          blocked: null,
          nextAssignments: [],
        };
      return out;
    },
    events(ref) {
      const all: OperationalEvent[] = [];
      for (const j of WORLD_JOBS) {
        const lw = w(j.id);
        for (const e of docEvents(j.id))
          all.push({
            atMs: /\d/.test(e.at) ? msOf(toMin(e.at)) : null,
            type: "DOCUMENT",
            text: `${e.text} · ${e.detail}`,
            about: [
              { kind: "job", id: j.id },
              { kind: "document", id: lw.ledger[0].id },
            ],
            origin: "SEEDED",
          });
        for (const s of lw.job.stops.filter((x) => x.completedAt))
          all.push({
            atMs: msOf(toMin(s.completedAt!)),
            type: "STOP_COMPLETED",
            text: `${s.city} concluído`,
            about: [
              { kind: "job", id: j.id },
              { kind: "driver", id: lw.driver.id },
              { kind: "truck", id: lw.truck.id },
            ],
            origin: "SEEDED",
          });
      }
      for (const [key, value] of Object.entries(state.overrides)) {
        const [kind, id] = key.split(":");
        const about: EntityRef[] =
          kind === "axle" ||
          kind === "fuel-reading" ||
          kind === "maintenance" ||
          kind === "authorization"
            ? [{ kind: "truck", id }]
            : kind === "trailer" || kind === "driver" || kind === "truck"
              ? [{ kind: "job", id }]
              : kind === "qualification"
                ? [{ kind: "driver", id: id }]
                : [];
        all.push({
          atMs: msOf(NOW.min),
          type: `RECORDED_${kind.toUpperCase()}`,
          text: `${kind} → ${value}`,
          about,
          origin: "LOCAL_USER",
        });
      }
      const touches = (e: OperationalEvent) =>
        !ref ||
        e.about.some((a) => a.kind === ref.kind && a.id === ref.id) ||
        (ref.kind !== "job" &&
          e.about.some((a) => a.kind === "job" && a.id === currentJob(ref)));
      return all.filter(touches).sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
    },
  };
  return provider;
}

let lastKey = "";
let last: OperationalWorldProvider | null = null;
/** One provider per committed/previewed world (reads are cached inside). */
export function providerFor(state: GuidedState): OperationalWorldProvider {
  const key = JSON.stringify([
    state.overrides,
    state.pending,
    state.planned,
    state.dev,
    state.exceptions,
    state.assignment,
  ]);
  if (key === lastKey && last) return last;
  lastKey = key;
  last = createSyntheticProvider(state);
  return last;
}
