import { JOBS, demoContext, jobById } from "./guidedContent";
import {
  ROUTES,
  WORLD_JOBS,
  kmOf,
  pointAtKm,
  sliceKm,
  worldJob,
} from "./world";
import {
  anchorJob,
  type GuidedLens,
  type GuidedState,
} from "./guidedWorkspace";
import { entityRecipe, isEntity } from "./entityRecipes";
import { providerFor } from "./engine/synthetic";
import type { CameraTarget, MapScene, Point } from "./mapTypes";
import { usesSharedWork, sharedWork } from "./sharedComposition";

export type SpatialQuestion =
  | "NONE"
  | "CURRENT_ENTITY"
  | "NEXT_LEG"
  | "FULL_ROUTE"
  | "ROUTE_AND_STOP"
  | "ORIGIN_DESTINATION"
  | "AFFECTED_SEGMENT"
  | "MULTI_ENTITY"
  | "RESOURCE_AND_JOB"
  | "USER_REQUESTED";
export type SpatialIntent = {
  purpose?: "reachability";
  question: SpatialQuestion;
  target: "resource" | "stop" | "job" | "restriction" | "candidates";
  source: "automatic" | "user";
};
export type SpatialAction = { label: string; intent: SpatialIntent };
const intent = (
  question: SpatialQuestion,
  target: SpatialIntent["target"],
  source: SpatialIntent["source"] = "automatic",
): SpatialIntent => ({ question, target, source });
/** An entity's missing transport never grants permission to draw a fixture route. */
export function hasTransportGeometry(state: GuidedState): boolean {
  const anchor = state.anchor;
  if (anchor.kind === "job")
    return WORLD_JOBS.some((job) => job.id === anchor.id);
  if (!isEntity(state.anchor)) return true;
  const job = anchorJob(state.anchor);
  return (
    !!job &&
    WORLD_JOBS.some((j) => j.id === job) &&
    providerFor(state)
      .related({ kind: state.anchor.kind, id: state.anchor.id }, "job")
      .some((node) => node.ref.id === job)
  );
}
export function defaultSpatial(
  state: GuidedState,
  lead: GuidedLens | null = state.lead,
): SpatialIntent {
  if (!hasTransportGeometry(state)) return intent("NONE", "resource");
  if (usesSharedWork(state)) {
    const work = sharedWork(state)!;
    if (work.variant === "credentials" && !state.mapFull)
      return intent("NONE", "resource");
    return state.anchor.kind === "jobs"
      ? intent("MULTI_ENTITY", "job")
      : intent(
          work.variant === "clearance"
            ? "AFFECTED_SEGMENT"
            : work.kind === "matching"
              ? "RESOURCE_AND_JOB"
              : "FULL_ROUTE",
          "job",
        );
  }
  const answer = facetSpatial(state, lead);
  // In spatial mode the map is the canvas: a question without geography
  // falls back to the whole transport (or fleet) instead of hiding the map.
  if (state.mapFull && answer.question === "NONE")
    return state.anchor.kind === "jobs"
      ? intent("MULTI_ENTITY", "job")
      : intent("FULL_ROUTE", "job");
  return answer;
}
/** The map question of an entity composition (none when the question has no geography). */
function entitySpatial(state: GuidedState): SpatialIntent {
  const job = anchorJob(state.anchor);
  const known = !!job && worldJob(job).positionSource !== "UNKNOWN";
  const candidates = job === "J-4217";
  switch (entityRecipe(state)) {
    case "DRIVER_DAY":
      return candidates
        ? intent("NEXT_LEG", "stop")
        : known
          ? intent("CURRENT_ENTITY", "resource")
          : intent("FULL_ROUTE", "job");
    case "DRIVER_THROUGH_RESTRICTIONS":
    case "DRIVER_VEHICLE_RESTRICTIONS":
      return intent("AFFECTED_SEGMENT", "restriction");
    case "DRIVER_SPATIAL":
      return known
        ? intent("CURRENT_ENTITY", "resource")
        : intent("FULL_ROUTE", "job");
    case "TRUCK_OBJECT":
      return known
        ? intent("CURRENT_ENTITY", "resource")
        : intent("FULL_ROUTE", "job");
    case "TRUCK_SPATIAL":
      return known
        ? intent("RESOURCE_AND_JOB", "resource")
        : intent("FULL_ROUTE", "job");
    case "TRAILER_SHEET":
      return job
        ? known
          ? intent("CURRENT_ENTITY", "resource")
          : intent("FULL_ROUTE", "job")
        : intent("NONE", "resource");
    case "DOCUMENT_ROUTE":
      return intent("FULL_ROUTE", "job");
    case "RESTRICTION_LOGIC":
    case "RESTRICTION_TIME":
    case "RESTRICTION_TRANSPORTS":
    case "RESTRICTION_SPATIAL":
      return intent("AFFECTED_SEGMENT", "restriction");
    case "STOP_DECISION":
    case "STOP_WITH_DRIVER":
    case "STOP_SPATIAL":
      return intent("ROUTE_AND_STOP", "stop");
    default:
      return intent("NONE", "resource");
  }
}
/** Each facet of a domain asks its own spatial question (or none). */
function facetSpatial(
  state: GuidedState,
  lead: GuidedLens | null,
): SpatialIntent {
  // Entity pages ask their composition's question before any lens rule.
  if (state.anchor.kind !== "jobs" && state.anchor.kind !== "job")
    return entitySpatial(state);
  const facet = state.facet ?? {};
  if (
    lead === "Documents" ||
    lead === "Pricing DEV" ||
    lead === "Compliance DEV"
  )
    return intent("NONE", "job");
  if (state.anchor.kind === "jobs") return intent("MULTI_ENTITY", "job");
  // Without a known position there is no "where is it now"; without recorded
  // candidates there is no stop choice. Both fall back to the whole transport.
  const known =
    worldJob(anchorJob(state.anchor) ?? "J-4217").positionSource !== "UNKNOWN";
  const here = known
    ? intent("CURRENT_ENTITY", "resource")
    : intent("FULL_ROUTE", "job");
  const candidates = anchorJob(state.anchor) === "J-4217";
  // Driver's question is the next leg to the break; Truck's is the asset itself.
  if (lead === "Drivers") {
    const f = facet.Drivers ?? "execution";
    if (f === "legality" || f === "qualifications" || f === "assignment")
      return intent("NONE", "resource");
    if (f === "corridor" || (state.focus?.kind === "time" && candidates))
      return intent("NEXT_LEG", "stop");
    return state.active.includes("Fuel") && candidates
      ? intent("NEXT_LEG", "stop")
      : here;
  }
  if (lead === "Trucks") {
    const f = facet.Trucks ?? "load";
    if (f === "restriction" || f === "assignment" || f === "maintenance")
      return intent("NONE", "resource");
    if (f === "fuel")
      return candidates && known ? intent("NEXT_LEG", "stop") : here;
    // On the spatial canvas the vehicle is shown with its transport, not as a dot.
    if (state.mapFull && known) return intent("RESOURCE_AND_JOB", "resource");
    return state.selection.fuel && state.active.includes("Fuel")
      ? intent("NEXT_LEG", "stop")
      : here;
  }
  if (lead === "Restrictions") {
    const f = facet.Restrictions ?? "logic";
    if (f === "missing" || f === "physical" || f === "evidence")
      return intent("NONE", "restriction");
    return intent("AFFECTED_SEGMENT", "restriction");
  }
  if (lead === "Fuel") {
    const f = facet.Fuel ?? "journey";
    if (f === "management" || f === "comparison") return intent("NONE", "job");
    if (f === "window") return intent("NONE", "job");
    if (f === "segment") return intent("AFFECTED_SEGMENT", "restriction");
    return candidates
      ? intent("ROUTE_AND_STOP", "candidates")
      : intent("FULL_ROUTE", "job");
  }
  return intent("FULL_ROUTE", "job");
}
export function spatialActions(state: GuidedState): SpatialAction[] {
  const actions: SpatialAction[] = [];
  const add = (
    label: string,
    question: SpatialQuestion,
    target: SpatialIntent["target"],
  ) => actions.push({ label, intent: intent(question, target, "user") });
  if (state.anchor.kind === "job") {
    if (state.active.includes("Drivers") || state.active.includes("Trucks")) {
      add("Localização atual", "CURRENT_ENTITY", "resource");
      add("Próxima etapa", "NEXT_LEG", "stop");
      if (state.lead === "Drivers" || state.lead === "Trucks")
        actions.push({
          label:
            state.lead === "Drivers"
              ? "Alcance até à pausa"
              : "Alcance ao posto",
          intent: {
            ...intent("NEXT_LEG", "stop", "user"),
            purpose: "reachability",
          },
        });
      add("Recurso e Job", "RESOURCE_AND_JOB", "resource");
    }
    add("Job completo", "FULL_ROUTE", "job");
    if (state.active.includes("Fuel")) {
      if (state.lead === "Fuel")
        add("Comparar postos", "ROUTE_AND_STOP", "candidates");
      if (state.selection.fuel) {
        add("Posto selecionado", "CURRENT_ENTITY", "stop");
        add("Desvio ao posto", "ROUTE_AND_STOP", "stop");
        add("Recurso e posto", "NEXT_LEG", "stop");
      }
    }
    if (state.active.includes("Restrictions")) {
      add("Segmento afetado", "AFFECTED_SEGMENT", "restriction");
      add("Condições na rota", "FULL_ROUTE", "restriction");
      if (state.selection.fuel)
        add("Condição e posto", "ROUTE_AND_STOP", "restriction");
    }
    if (state.lead === "Jobs")
      add("Origem e destino", "ORIGIN_DESTINATION", "job");
  } else add("Transportes no mapa", "MULTI_ENTITY", "job");
  add("Sem geografia", "NONE", "job");
  return actions;
}
const distance = (a: Point, b: Point) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function nearest(route: Point[], point: Point) {
  return route.reduce(
    (best, p, i) =>
      distance(p, point) < distance(route[best], point) ? i : best,
    0,
  );
}
/** Authored fixture geometry, not a calculated drivable detour or legal reachability. */
export function spatialGeometry(state: GuidedState): {
  scene: MapScene;
  points: Point[];
  description: string;
} {
  if (!hasTransportGeometry(state))
    return {
      scene: {
        routes: [],
        driver: null,
        fuel: null,
        segment: [],
        showSegment: false,
        segments: [],
        stops: [],
      },
      points: [],
      description: "Geografia indisponível: contexto do transporte em falta",
    };
  const question = state.spatial;
  const job = anchorJob(state.anchor)
    ? jobById(anchorJob(state.anchor)!)
    : JOBS[0];
  const context = demoContext(job, state.assignment);
  const stop =
    context.stops.find((s) => s.id === state.selection.fuel) ??
    context.stops[0];
  const restriction =
    context.restrictions.find((r) => r.id === state.selection.restriction) ??
    context.restrictions[0];
  let routes: Point[][] = [job.route],
    driver: Point | null =
      worldJob(job.id).positionSource === "UNKNOWN" ? null : context.position,
    // Only J-4217 has recorded stop candidates; other jobs show no invented stop.
    fuel: Point | null =
      state.active.includes("Fuel") && job.id === "J-4217" ? stop.point : null;
  let segment: Point[] = restriction.segment,
    showSegment = state.active.includes("Restrictions"),
    points: Point[] = job.route;
  let description = "Geografia do transporte";
  const corridor = () => {
    const a = nearest(job.route, context.position),
      b = nearest(job.route, stop.point);
    return [
      context.position,
      ...job.route.slice(Math.min(a, b), Math.max(a, b) + 1),
      stop.point,
    ];
  };
  switch (question.question) {
    case "NONE":
      routes = [];
      driver = null;
      fuel = null;
      showSegment = false;
      points = [];
      description = "Sem pergunta espacial";
      break;
    case "CURRENT_ENTITY": {
      const isStop = question.target === "stop";
      const point = isStop ? stop.point : context.position;
      // 1.2 km of context around a resource; 0.45 km around a station entrance.
      const km = isStop ? 0.45 : 1.2,
        lat = km / 111,
        lng = lat / Math.cos((point[1] * Math.PI) / 180);
      points = [
        [point[0] - lng, point[1] - lat],
        [point[0] + lng, point[1] + lat],
      ];
      routes = [];
      driver = isStop ? null : driver;
      fuel = isStop ? point : null;
      showSegment = false;
      description = isStop
        ? `Onde fica ${stop.name}?`
        : `Onde está o recurso em ${context.location}?`;
      break;
    }
    case "NEXT_LEG":
      routes = [corridor()];
      points = routes.flat();
      fuel = stop.point;
      description =
        question.purpose === "reachability"
          ? `Alcance até ${stop.name} · contexto sintético`
          : `Recurso até ${stop.name} · corredor sintético`;
      break;
    case "RESOURCE_AND_JOB":
      points = [context.position, ...job.route];
      description = "Recurso no contexto do transporte";
      break;
    case "ROUTE_AND_STOP":
      if (question.target === "restriction") {
        routes = [corridor()];
        points = [...restriction.lines.flat(), stop.point];
        fuel = stop.point;
        description = "Acesso afetado em relação ao posto";
      } else if (question.target === "stop") {
        const n = nearest(job.route, stop.point);
        routes = [[job.route[Math.max(0, n - 1)], job.route[n], stop.point]];
        points = routes.flat();
        fuel = stop.point;
        driver = null;
        showSegment = false;
        description = "Desvio de referência ao posto · não calculado";
      } else {
        points = [...job.route, ...context.stops.map((s) => s.point)];
        description = "Comparar postos no contexto da rota";
      }
      break;
    case "AFFECTED_SEGMENT":
      routes = [];
      points = [...restriction.lines.flat(), ...restriction.altLines.flat()];
      driver = null;
      fuel = null;
      showSegment = true;
      description = restriction.title;
      break;
    case "ORIGIN_DESTINATION":
      points = [job.route[0], job.route.at(-1)!];
      driver = null;
      fuel = null;
      showSegment = false;
      description = "Origem e destino do transporte";
      break;
    case "MULTI_ENTITY":
      routes = JOBS.filter(
        (j) => state.filter !== "moving" || j.status === "Em trânsito",
      ).map((j) => j.route);
      points = routes.flat();
      driver = null;
      fuel = null;
      showSegment = false;
      description = "Transportes da coleção";
      break;
    case "FULL_ROUTE":
      if (question.target === "restriction") {
        points = [
          ...job.route,
          ...context.restrictions.flatMap((r) => r.lines.flat()),
        ];
        segment = restriction.segment;
        showSegment = true;
        description = "Todas as condições da rota · referências sintéticas";
      } else description = "Job completo, origem até entrega";
      break;
    case "USER_REQUESTED":
      if (question.target === "stop") {
        routes = [corridor()];
        points = routes.flat();
        fuel = stop.point;
        description = "Geografia pedida · recurso e posto";
      } else description = "Geografia pedida · transporte completo";
      break;
  }
  const restrictionLines =
    question.question === "FULL_ROUTE" && question.target === "restriction"
      ? context.restrictions.flatMap((r) =>
          r.lines.map((l) => ({ id: r.id, l })),
        )
      : restriction.lines.map((l) => ({ id: restriction.id, l }));
  const world = worldJob(job.id);
  const route = ROUTES[world.routeId];
  return {
    scene: {
      selectedStop: state.selection.fuel,
      selectedRestriction: state.selection.restriction,
      segmentIds: restrictionLines.map((r) => r.id),
      routes,
      routeIds:
        question.question === "MULTI_ENTITY"
          ? JOBS.filter(
              (j) => state.filter !== "moving" || j.status === "Em trânsito",
            ).map((j) => j.id)
          : undefined,
      driver,
      driverSource: world.positionSource,
      fuel,
      segment,
      showSegment,
      segments: restrictionLines.map((r) => r.l),
      alt:
        question.question === "AFFECTED_SEGMENT" && showSegment
          ? restriction.altLines
          : undefined,
      done:
        routes.length === 1 &&
        routes[0] === job.route &&
        world.positionKm != null &&
        world.positionKm > 0
          ? sliceKm(route, 0, world.positionKm)
          : undefined,
      fleet:
        question.question === "MULTI_ENTITY"
          ? WORLD_JOBS.filter((j) => j.positionKm != null).map((j) => ({
              id: j.id,
              point: pointAtKm(ROUTES[j.routeId], j.positionKm!),
              source: j.positionSource,
            }))
          : undefined,
      stops:
        question.question === "ROUTE_AND_STOP" &&
        question.target === "candidates"
          ? context.stops.map((s) => ({ id: s.id, point: s.point }))
          : [],
    },
    points,
    description,
  };
}
/** The visible map caption: why the map looks the way it does. */
export function spatialLabel(state: GuidedState): {
  title: string;
  detail: string;
} {
  if (!hasTransportGeometry(state))
    return {
      title: "Geografia indisponível",
      detail: "Selecione um objeto e um transporte válidos",
    };
  const q = state.spatial;
  const job = anchorJob(state.anchor)
    ? jobById(anchorJob(state.anchor)!)
    : JOBS[0];
  const world = worldJob(job.id);
  const route = ROUTES[world.routeId];
  const context = demoContext(job, state.assignment);
  const stop =
    context.stops.find((s) => s.id === state.selection.fuel) ??
    context.stops[0];
  const restriction =
    context.restrictions.find((r) => r.id === state.selection.restriction) ??
    context.restrictions[0];
  const here = context.location;
  const stopKm = route ? Math.round(kmOf(route, stop.point)) : 0;
  const posKm = world.positionKm ?? 0;
  switch (q.question) {
    case "NONE":
      return {
        title: "Sem geografia",
        detail: "O trabalho atual não depende do mapa",
      };
    case "CURRENT_ENTITY":
      return q.target === "stop"
        ? { title: stop.name, detail: `${stop.location} · acesso ao posto` }
        : {
            title: "Posição atual",
            detail: `${here} · ${world.positionSource === "SIMULATED" ? "posição simulada" : "posição desconhecida"}`,
          };
    case "NEXT_LEG":
      return {
        title:
          q.purpose === "reachability"
            ? "Alcance até à paragem"
            : "Próxima etapa",
        detail: `${here} → ${stop.name.replace("Área de serviço de ", "")} · ${Math.max(0, stopKm - Math.round(posKm))} km`,
      };
    case "FULL_ROUTE":
      return q.target === "restriction"
        ? {
            title: "Condições na rota",
            detail: `${context.restrictions.length} registos ao longo de ${Math.round(route.km)} km`,
          }
        : {
            title: "Transporte completo",
            detail: `${job.origin} → ${job.destination} · ${Math.round(route.km)} km · rota TomTom gravada`,
          };
    case "ROUTE_AND_STOP":
      return q.target === "restriction"
        ? {
            title: "Condição e paragem",
            detail: `${restriction.title.split(" — ")[0]} · ${stop.name.replace("Área de serviço de ", "")}`,
          }
        : q.target === "stop"
          ? {
              title: "Desvio à paragem",
              detail: `${stop.name} · referência, não calculado`,
            }
          : {
              title: "Paragens candidatas",
              detail: `${context.stops.length} ${context.stops.length === 1 ? "opção" : "opções"} antes do limite de condução`,
            };
    case "AFFECTED_SEGMENT":
      return {
        title: "Troço da restrição",
        detail:
          restriction.title.split(" — ")[0] +
          (restriction.altLines.length
            ? " · alternativa oficial CREP a tracejado"
            : " · geometria registada"),
      };
    case "MULTI_ENTITY":
      return {
        title: "Frota em operação",
        detail: "Posições simuladas · desconhecidas ficam fora do mapa",
      };
    case "RESOURCE_AND_JOB":
      return {
        title: "Recurso no transporte",
        detail: `${here} no percurso ${job.origin} → ${job.destination}`,
      };
    case "ORIGIN_DESTINATION":
      return {
        title: "Origem e destino",
        detail: `${job.origin} → ${job.destination}`,
      };
    default:
      return { title: "Geografia pedida", detail: description(state) };
  }
}
const description = (state: GuidedState) => spatialGeometry(state).description;
export function spatialCamera(state: GuidedState): CameraTarget {
  const { points } = spatialGeometry(state);
  return { kind: "scene", points, maxZoom: 16, pitch: 0, bearing: 0 };
}
