import { useRef, useState } from "react";
import { JobRoutePlanner } from "./JobRoutePlanner";
import { OperationalPlanningPanel } from "./OperationalPlanningPanel";
import { useOperations } from "../../context/OperationsContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import { useFuel } from "../../context/FuelContext";
import { planningRouter } from "../../application/planningRouter";
import { getTomTomKey } from "../../tomtom/config";
import type { Job } from "../../data/types";
import type {
  PlanningConstraint,
  OperationalPlan,
} from "../../domain/planning/types";
import { Button } from "../../ui/kit";
import type { RoutePlanOption, RouteOptionId } from "../../tomtom/planRoutes";
import type { RouteMapMarker } from "../routes/RoutePlannerMap";

type Props = {
  job: Job;
  onRoutesReady: (
    options: RoutePlanOption[],
    selected: RouteOptionId | null,
    markers: RouteMapMarker[],
  ) => void;
  onRouteSelect: (id: RouteOptionId | null) => void;
  requestedRouteId: RouteOptionId | null;
  onClose: () => void;
  onConfirmed: () => void;
};
export function AutomaticJobPlanner(props: Props) {
  const { state, service } = useOperations(),
    { dataset } = useRoadEvents(),
    { intelligence: fuel } = useFuel();
  const [manual, setManual] = useState(false),
    [departure] = useState(() =>
      Math.max(
        Date.now() + 600000,
        Date.parse(props.job.plannedDepartureAt ?? "") || 0,
      ),
    );
  const router = useRef<ReturnType<typeof planningRouter> | undefined>(
    undefined,
  );
  const makeRequest = (
    constraints: PlanningConstraint[],
    departureMs: number,
  ) => {
    router.current = planningRouter(getTomTomKey() ?? "", dataset, undefined, undefined, fuel);
    return {
      ...state,
      scopeJobIds: [props.job.id],
      nowMs: Date.now(),
      earliestStartMs: departureMs,
      horizonEndMs: Math.max(departureMs, Date.now()) + 6 * 86400_000,
      dataset,
      constraints,
      route: router.current.route,
    };
  };
  const showPlan = (plan: OperationalPlan | null) => {
    const movements = plan?.executions.flatMap((e) => e.movements) ?? [],
      options = movements.map((m, i) => ({
        ...m.route,
        id: `movement-${i}`,
        title:
          m.kind === "EMPTY" ? "Deslocação em vazio" : "Transporte carregado",
        colorIndex: i,
      }));
    props.onRoutesReady(
      options,
      options.find((_, i) => movements[i].kind === "LOADED")?.id ??
        options[0]?.id ??
        null,
      props.job.stops.map((s, i) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        label: s.city || s.address,
        role:
          i === 0
            ? "start"
            : i === props.job.stops.length - 1
              ? "finish"
              : "via",
      })),
    );
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <strong>{props.job.jobNumber}</strong>
        <Button variant="ghost" onClick={props.onClose}>
          Fechar
        </Button>
      </div>
      {manual || props.job.status !== "backlog" ? (
        <>
          <p className="px-5 pt-3 text-[13px] text-[var(--text-2)]">
            Replaneamento manual explícito. Compromissos existentes ficam
            bloqueados no planeamento automático.
          </p>
          <JobRoutePlanner {...props} />
        </>
      ) : (
        <OperationalPlanningPanel
          service={service}
          makeRequest={makeRequest}
          defaultDepartureMs={departure}
          overrideJobId={props.job.id}
          onPlan={showPlan}
          onConfirmed={props.onConfirmed}
          providerStats={() => router.current?.stats}
        />
      )}
      {props.job.status === "backlog" ? (
        <div className="border-t border-[var(--border)] p-4">
          <Button
            variant="ghost"
            onClick={() => {
              setManual(!manual);
              props.onRoutesReady([], null, []);
            }}
          >
            {manual
              ? "Voltar ao planeamento automático"
              : "Abrir planeador manual"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
