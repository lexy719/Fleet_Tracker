import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  FileText,
  Route,
  ShieldCheck,
  Truck as TruckIcon,
  Users,
  X,
} from "lucide-react";
import {
  readEnvironment,
  routeName,
  contextQuestion,
  type EnvironmentJob,
  type EnvironmentRead,
  type WorkspaceDomain,
} from "../../../application/environmentQueries";
import { STATUS_LABELS } from "../../../domain/jobs/lifecycle";
import { driverQualifications } from "../../../domain/drivers/drivers";
import {
  DRIVER_AVAILABILITY_LABEL,
  DRIVER_STATE_LABEL,
} from "../../../domain/drivers/drivers";
import {
  AVAILABILITY_LABEL,
  TRUCK_STATE_LABEL,
} from "../../../domain/fleet/trucks";
import type { Result } from "../../../domain/events";
import type { Job } from "../../../data/types";
import { EnvironmentMap } from "../EnvironmentMap";
import type { EnvironmentMapApi } from "../mapApi";
import { connectedRuntime, type ConnectedRuntime } from "./runtime";
import {
  backConnected,
  contentConnected,
  currentFrame,
  initialConnectedWorkspace,
  navigateConnected,
  replaceFrame,
  type ConnectedFrame,
  type Selection,
} from "./workspace";
import "../environment.css";
import "./connected.css";

const DOMAINS: WorkspaceDomain[] = [
  "Jobs",
  "Drivers",
  "Trucks",
  "Fuel",
  "Documents",
  "Restrictions",
];
const LABEL: Record<WorkspaceDomain, string> = {
  Jobs: "Transportes",
  Drivers: "Motoristas",
  Trucks: "Viaturas",
  Fuel: "Percursos",
  Documents: "Documentos",
  Restrictions: "Condições",
};
const ICON = {
  Jobs: BriefcaseBusiness,
  Drivers: Users,
  Trucks: TruckIcon,
  Fuel: Route,
  Documents: FileText,
  Restrictions: ShieldCheck,
};
const date = (s?: string) =>
  s && Number.isFinite(Date.parse(s))
    ? new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(s))
    : "Sem data registada";
const duration = (m: number) =>
  `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
const issueLabel = (issue: string) =>
  (
    ({
      JOB_MISSING: "O transporte já não existe.",
      EXECUTION_MISSING: "Falta um plano de execução com horários calculados.",
      TRUCK_MISSING: "A viatura do plano não foi encontrada.",
      DRIVER_MISSING: "O motorista do plano não foi encontrado.",
      TRAILER_MISSING: "O reboque do plano não foi encontrado.",
      ASSIGNMENT_CHANGED: "O conjunto atribuído mudou desde a confirmação.",
      REPLAN_REQUIRED: "O percurso precisa de nova confirmação.",
      TRUCK_SPECIFICATION_CHANGED: "Os dados da viatura mudaram.",
      DRIVER_SPECIFICATION_CHANGED: "Os dados do motorista mudaram.",
      TRAILER_SPECIFICATION_CHANGED: "Os dados do reboque mudaram.",
      DEPARTURE_CHANGED: "A partida planeada mudou.",
      DEMAND_OR_ROUTE_CHANGED:
        "A carga, as paragens ou os dados de avaliação mudaram.",
    }) as Record<string, string>
  )[issue] ??
  (/^[A-Z_0-9]+$/.test(issue)
    ? "Há dados por verificar no plano de execução."
    : issue);

export default function ConnectedEnvironment() {
  const [source, setSource] = useState<"auto" | "saved" | "demo">("auto");
  const [runtime, setRuntime] = useState<ConnectedRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void connectedRuntime(source)
      .then((rt) => {
        if (alive) {
          setRuntime(rt);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [source]);
  if (!runtime)
    return (
      <main className="cw-loading" aria-busy={!error}>
        <b>FleetOS</b>
        <p>{error ?? "A abrir a operação…"}</p>
        {error && (
          <button onClick={() => setSource("demo")}>Abrir demonstração</button>
        )}
      </main>
    );
  return (
    <Workspace
      key={runtime.source}
      runtime={runtime}
      error={error}
      switchSource={setSource}
    />
  );
}

function Workspace({
  runtime,
  error,
  switchSource,
}: {
  runtime: ConnectedRuntime;
  error: string | null;
  switchSource: (s: "saved" | "demo") => void;
}) {
  const snapshot = useSyncExternalStore(
    runtime.service.subscribe,
    runtime.service.getState,
  );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const read = useMemo(
    () => readEnvironment(snapshot, new Date(clock)),
    [snapshot, clock],
  );
  const [workspace, setWorkspace] = useState(initialConnectedWorkspace);
  const workspaceRef = useRef(workspace);
  useLayoutEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);
  const frame = currentFrame(workspace);
  const board = useRef<HTMLDivElement>(null),
    detail = useRef<HTMLElement>(null),
    map = useRef<EnvironmentMapApi>(null);
  const [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const [reduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const capture = useCallback(() => {
    const w = workspaceRef.current,
      f = currentFrame(w);
    return replaceFrame(w, {
      ...f,
      scroll: board.current?.scrollTop ?? f.scroll,
      detailScroll: detail.current?.scrollTop ?? f.detailScroll,
      camera: f.mapOpen ? (map.current?.getCamera() ?? f.camera) : f.camera,
    });
  }, []);
  const change = (
    fn: (f: ConnectedFrame) => ConnectedFrame,
    composition = false,
  ) => {
    const w = capture();
    setWorkspace(navigateConnected(w, fn(currentFrame(w)), composition));
  };
  const context = (domain: WorkspaceDomain) =>
    setWorkspace(contentConnected(capture(), domain));
  const open = (selected: Selection) =>
    change((f) => ({ ...f, selected, mapOpen: false, camera: null }), true);
  const back = useCallback(
    () => setWorkspace(backConnected(capture())),
    [capture],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        back();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [back]);
  useLayoutEffect(() => {
    if (board.current) board.current.scrollTop = frame.scroll;
    if (detail.current) detail.current.scrollTop = frame.detailScroll;
  }, [workspace.active, frame.scroll, frame.detailScroll]);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") void runtime.service.load();
    };
    addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [runtime]);
  const selectedJob =
    frame.selected?.kind === "job"
      ? read.jobs.find((r) => r.job.id === frame.selected!.id)
      : undefined;
  const selectedDriver =
    frame.selected?.kind === "driver"
      ? read.drivers.find((r) => r.driver.id === frame.selected!.id)
      : undefined;
  const selectedTruck =
    frame.selected?.kind === "truck"
      ? read.trucks.find((r) => r.truck.id === frame.selected!.id)
      : undefined;
  const anchorTitle =
    selectedJob?.job.jobNumber ??
    selectedDriver?.driver.name ??
    selectedTruck?.truck.plate ??
    LABEL[frame.base];
  const points = useMemo(
    () =>
      (selectedJob?.job.routeCompliance?.route.polyline ?? []).map(
        ([lat, lng]) => [lng, lat] as [number, number],
      ),
    [selectedJob],
  );
  const visibleMap = frame.mapOpen && points.length > 1;
  const mapKey = useRef("");
  useEffect(() => {
    const key = JSON.stringify([workspace.active, visibleMap, points, size]);
    if (!visibleMap || mapKey.current === key) return;
    mapKey.current = key;
    map.current?.transitionCamera(
      frame.camera
        ? { kind: "restore", camera: frame.camera }
        : { kind: "scene", points, maxZoom: 13 },
      reduced ? 0 : 680,
      "controlled",
    );
  }, [workspace.active, visibleMap, points, size, reduced, frame.camera]);
  const write = async (
    command: () => Promise<Result<Job>>,
    saved = "Alteração guardada na operação.",
    clearDraft = false,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await command();
      setMessage(r.ok ? saved : r.errors.join(" "));
      if (r.ok && clearDraft)
        setWorkspace((w) => {
          const f = currentFrame(w);
          const drafts = { ...f.drafts };
          delete drafts[r.value.id];
          return replaceFrame(w, { ...f, drafts });
        });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const jobsForSelection = selectedJob
    ? [selectedJob]
    : (selectedDriver?.jobs ?? selectedTruck?.jobs ?? []);
  const search = frame.query.trim().toLocaleLowerCase("pt");
  const matches = (r: EnvironmentJob) =>
    (!search ||
      `${r.job.jobNumber} ${r.job.client} ${routeName(r.job)} ${r.driver?.name ?? ""} ${r.truck?.plate ?? ""}`
        .toLocaleLowerCase("pt")
        .includes(search)) &&
    (frame.filter === "all" ||
      (frame.filter === "attention" && r.issues.length > 0 && r.active) ||
      (frame.filter === "unassigned" && r.active && (!r.truck || !r.driver)) ||
      (frame.filter === "moving" && r.job.status === "in_transit"));
  const jobRows = read.jobs.filter(matches);
  const columns = frame.active.filter((d) => d !== frame.base);
  const rowData =
    frame.base === "Drivers"
      ? read.drivers
          .filter(
            (r) =>
              (!search ||
                `${r.driver.name} ${r.jobs.map((j) => `${j.job.jobNumber} ${j.job.client} ${routeName(j.job)} ${j.truck?.plate ?? ""}`).join(" ")}`
                  .toLowerCase()
                  .includes(search)) &&
              (frame.filter === "all" ||
                (frame.filter === "unassigned" && r.jobs.length === 0) ||
                (frame.filter === "attention" &&
                  (!r.driver.hours ||
                    r.qualifications.some(
                      (q) => q.state === "EXPIRED" || q.state === "MISSING",
                    ) ||
                    r.jobs.some((j) => j.issues.length))) ||
                (frame.filter === "moving" &&
                  r.jobs.some((j) => j.job.status === "in_transit"))),
          )
          .map((r) => ({
            key: `driver:${r.driver.id}`,
            selected: { kind: "driver" as const, id: r.driver.id },
            title: r.driver.name,
            sub:
              r.driver.homeTerminal ?? r.driver.employeeNumber ?? r.driver.id,
            jobs: r.jobs,
            primary: (
              <DriverRead
                driver={r.driver}
                now={clock}
                state={r.state}
                commitments={r.jobs.length}
              />
            ),
          }))
      : frame.base === "Trucks"
        ? read.trucks
            .filter(
              (r) =>
                (!search ||
                  `${r.truck.plate} ${r.truck.make ?? ""} ${r.jobs.map((j) => `${j.job.jobNumber} ${j.job.client} ${routeName(j.job)} ${j.driver?.name ?? ""}`).join(" ")}`
                    .toLowerCase()
                    .includes(search)) &&
                (frame.filter === "all" ||
                  (frame.filter === "unassigned" && r.jobs.length === 0) ||
                  (frame.filter === "attention" &&
                    (r.truck.availability !== "AVAILABLE" ||
                      r.jobs.some((j) => j.issues.length))) ||
                  (frame.filter === "moving" &&
                    r.jobs.some((j) => j.job.status === "in_transit"))),
            )
            .map((r) => ({
              key: `truck:${r.truck.id}`,
              selected: { kind: "truck" as const, id: r.truck.id },
              title: r.truck.plate,
              sub: `${r.truck.make ?? ""} ${r.truck.model ?? ""}`,
              jobs: r.jobs,
              primary: (
                <TruckRead
                  truck={r.truck}
                  state={r.state}
                  commitments={r.jobs.length}
                />
              ),
            }))
        : jobRows.map((r) => ({
            key: `job:${r.job.id}`,
            selected: { kind: "job" as const, id: r.job.id },
            title: r.job.jobNumber,
            sub: `${r.job.client} · ${routeName(r.job)}`,
            jobs: [r],
            primary: (
              <>
                <span className="cw-state">{STATUS_LABELS[r.job.status]}</span>
                {frame.base === "Jobs" && !columns.length && (
                  <div className="cw-next-work">
                    <b>
                      {r.nextStop
                        ? `Próxima tarefa: ${r.nextStop.city}`
                        : "Paragens concluídas"}
                    </b>
                    <small>
                      {r.nextStop?.windowStartAt
                        ? `Janela ${date(r.nextStop.windowStartAt)} — ${date(r.nextStop.windowEndAt)}`
                        : `Entrega prevista no registo: ${date(r.job.deliveryDeadline)}`}
                    </small>
                    <span>
                      {r.driver?.name ?? "Motorista por atribuir"} ·{" "}
                      {r.truck?.plate ?? "Viatura por atribuir"}
                    </span>
                    <p className="cw-context-issues">
                      {r.issues
                        .slice(0, 2)
                        .map((i) => i.text)
                        .join(" · ")}
                    </p>
                  </div>
                )}
                {frame.base !== "Jobs" && (
                  <DomainRead domain={frame.base} jobs={[r]} open={open} />
                )}
                <small>
                  {r.issues.length
                    ? `${r.issues.length} questões por resolver`
                    : "Sem questões assinaladas"}
                </small>
              </>
            ),
          }));
  const connectedModel = {
    frame,
    activeTab: workspace.active,
    tabs: workspace.tabs.map((t) => ({ id: t.id, frame: t.frame })),
    source: runtime.source,
    persistent: runtime.persistent,
    version: snapshot.version,
    jobs: read.jobs.length,
    rowCount: rowData.length,
  };
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__fleetosConnected = {
      state: () => runtime.service.getState(),
      reload: () => runtime.service.load(),
      database:
        runtime.source === "saved"
          ? "fleetos-operations"
          : "fleetos-environment-operations-v1",
    };
    return () => {
      delete w.__fleetosConnected;
    };
  }, [runtime]);
  return (
    <main
      className="fleetos-environment cw"
      data-connected-model={JSON.stringify(connectedModel)}
      data-reduced-motion={reduced}
      data-selected={!!frame.selected}
      data-base={frame.base}
      data-context-count={columns.length}
      data-map-open={visibleMap}
    >
      <aside className="cw-rail" aria-label="Contextos da operação">
        <b className="cw-mark">F</b>
        {DOMAINS.map((d) => {
          const Icon = ICON[d],
            active = frame.active.includes(d),
            base = frame.base === d;
          return (
            <div key={d} className="cw-rail-item">
              <button
                data-ix="context"
                aria-label={LABEL[d]}
                aria-pressed={active}
                data-base={base}
                onClick={() => context(d)}
              >
                <Icon size={19} />
                <span className="cw-tooltip">
                  {base
                    ? `Voltar à lista de ${LABEL[d].toLowerCase()}`
                    : `${active ? "Retirar" : "Adicionar"} ${LABEL[d].toLowerCase()}`}
                </span>
              </button>
              {!base && (
                <button
                  data-ix="context"
                  className="cw-context-toggle"
                  aria-label={`${active ? "Retirar" : "Adicionar"} contexto: ${LABEL[d]}`}
                  onClick={() => context(d)}
                >
                  {active ? "−" : "+"}
                </button>
              )}
            </div>
          );
        })}
        <button
          data-ix="back"
          aria-label="Voltar à composição anterior"
          disabled={!workspace.history.length}
          onClick={back}
        >
          <ArrowLeft size={18} />
        </button>
      </aside>
      <header className="cw-orientation">
        <span>
          <b>FleetOS</b>
          <i />
          {anchorTitle}
        </span>
        <span>
          {runtime.source === "demo"
            ? "Demonstração · "
            : "Operação FleetOS · "}
          {runtime.persistent ? "alterações guardadas" : "sessão temporária"}
          <select
            aria-label="Fonte dos dados"
            value={runtime.source}
            onChange={(e) => switchSource(e.target.value as "saved" | "demo")}
          >
            <option value="saved">Operação FleetOS</option>
            <option value="demo">Demonstração</option>
          </select>
          <button
            data-ix="reload"
            disabled={busy}
            onClick={() => {
              void runtime.service
                .load()
                .then(() => setMessage("Dados atualizados."));
            }}
          >
            Atualizar
          </button>
        </span>
      </header>
      <nav className="cw-tabs" aria-label="Composições abertas">
        {workspace.tabs.map((t) => {
          const f = t.frame;
          const title = `${f.selected ? (snapshot.jobs.find((j) => j.id === f.selected!.id)?.jobNumber ?? snapshot.drivers.find((d) => d.id === f.selected!.id)?.name ?? snapshot.trucks.find((v) => v.id === f.selected!.id)?.plate ?? f.selected.id) : LABEL[f.base]} · ${f.active.map((d) => LABEL[d]).join(" + ")}`;
          return (
            <span key={t.id}>
              <button
                data-ix="tab"
                aria-current={workspace.active === t.id ? "page" : undefined}
                aria-selected={workspace.active === t.id}
                title={title}
                onClick={() => {
                  const w = capture();
                  if (w.active !== t.id)
                    setWorkspace({
                      ...w,
                      active: t.id,
                      history: [
                        ...w.history,
                        structuredClone(
                          w.tabs.find((tab) => tab.id === w.active)!,
                        ),
                      ],
                    });
                }}
              >
                {title}
              </button>
              <button
                data-ix="close-tab"
                aria-label={`Fechar ${title}`}
                disabled={workspace.tabs.length === 1}
                onClick={() =>
                  setWorkspace((w) => {
                    const tabs = w.tabs.filter((tab) => tab.id !== t.id);
                    return {
                      ...w,
                      tabs,
                      active: w.active === t.id ? tabs.at(-1)!.id : w.active,
                    };
                  })
                }
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </nav>
      <section className="cw-question">
        <div>
          <small>{frame.active.map((d) => LABEL[d]).join(" / ")}</small>
          <h1>{contextQuestion(frame.base, frame.active)}</h1>
          <p>
            {read.attention.length} transportes com questões por resolver ·{" "}
            {read.unassigned.length} sem conjunto completo ·{" "}
            {read.jobs.filter((r) => r.job.status === "in_transit").length} em
            viagem
          </p>
        </div>
        <label>
          Organizar por
          <select
            aria-label="Organizar por"
            value={frame.base}
            onChange={(e) => {
              const base = e.target.value as WorkspaceDomain;
              change(
                (f) => ({
                  ...f,
                  base,
                  active: [base, ...f.active.filter((d) => d !== base)],
                  selected: null,
                  mapOpen: false,
                }),
                true,
              );
            }}
          >
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </section>
      {(message || error || runtime.error || snapshot.error) && (
        <p className="cw-message" role="status">
          {error ?? snapshot.error ?? runtime.error ?? message}
        </p>
      )}
      <section
        className="cw-work"
        style={
          {
            "--cw-columns": columns.length,
            "--cw-map-height": `${Math.max(180, size.height * 0.28)}px`,
          } as CSSProperties
        }
      >
        <div className="cw-board" ref={board} data-connected-scroll="board">
          <div className="cw-tools">
            <label>
              <span className="cw-sr">Pesquisar na operação</span>
              <input
                aria-label="Pesquisar na operação"
                placeholder="Transporte, cliente, motorista ou matrícula…"
                value={frame.query}
                onChange={(e) =>
                  setWorkspace(
                    replaceFrame(capture(), {
                      ...currentFrame(capture()),
                      query: e.target.value,
                      scroll: 0,
                    }),
                  )
                }
              />
            </label>
            <div aria-label="Filtrar operação">
              {(
                [
                  ["all", "Todos"],
                  ["attention", "Decisões"],
                  ["unassigned", "Sem atribuição"],
                  ["moving", "Em viagem"],
                ] as const
              ).map(([id, text]) => (
                <button
                  data-ix="filter"
                  key={id}
                  disabled={frame.filter === id}
                  aria-pressed={frame.filter === id}
                  onClick={() =>
                    change((f) => ({ ...f, filter: id, scroll: 0 }))
                  }
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div className="cw-grid-head">
            <b>
              {LABEL[frame.base]} <small>{rowData.length}</small>
            </b>
            {columns.map((d) => (
              <span key={d} data-domain={d}>
                {LABEL[d]}
              </span>
            ))}
          </div>
          {rowData.map((r) => (
            <article
              className="cw-row"
              key={r.key}
              data-connected-object={r.key}
              data-current={
                frame.selected?.kind === r.selected.kind &&
                frame.selected.id === r.selected.id
              }
            >
              <div className="cw-primary">
                <button data-ix="open-object" onClick={() => open(r.selected)}>
                  <b>{r.title}</b>
                  <span>{r.sub}</span>
                </button>
                <div className="cw-primary-read">{r.primary}</div>
              </div>
              {columns.map((d) => (
                <section className="cw-cell" key={d} data-context-domain={d}>
                  <DomainRead domain={d} jobs={r.jobs} open={open} />
                  {!r.jobs.length && (
                    <small>
                      Sem transporte atribuído.{" "}
                      {d === "Jobs"
                        ? "Disponibilidade não garante compatibilidade com uma carga."
                        : "Associe um transporte para avaliar este contexto."}
                    </small>
                  )}
                </section>
              ))}
            </article>
          ))}
          {!rowData.length && (
            <section className="cw-empty">
              <h2>Não há registos nesta vista</h2>
              <p>
                {snapshot.jobs.length
                  ? "A pesquisa ou o filtro não encontrou resultados."
                  : "Não há transportes guardados nesta operação."}
              </p>
              {snapshot.jobs.length ? (
                <button
                  data-ix="clear-filter"
                  onClick={() =>
                    change((f) => ({ ...f, query: "", filter: "all" }))
                  }
                >
                  Limpar pesquisa e filtro
                </button>
              ) : (
                <button onClick={() => switchSource("demo")}>
                  Abrir demonstração
                </button>
              )}
            </section>
          )}
        </div>
        <article
          className="cw-detail"
          ref={detail}
          data-connected-scroll="detail"
          aria-hidden={!frame.selected}
          inert={!frame.selected}
        >
          <header>
            <small>
              {frame.selected?.kind === "job"
                ? "Execução do transporte"
                : frame.selected?.kind === "driver"
                  ? "Trabalho do motorista"
                  : "Utilização da viatura"}
            </small>
            <h2>{anchorTitle}</h2>
            <button
              data-ix="close-selection"
              onClick={() =>
                change((f) => ({ ...f, selected: null, mapOpen: false }), true)
              }
            >
              Voltar à lista
            </button>
          </header>
          {selectedDriver && (
            <>
              <DriverRead driver={selectedDriver.driver} now={clock} />
              <h3>Compromissos atuais e em fila</h3>
            </>
          )}
          {selectedTruck && (
            <>
              <TruckRead truck={selectedTruck.truck} />
              <h3>Transportes atribuídos</h3>
            </>
          )}
          {frame.selected &&
            !selectedJob &&
            !selectedDriver &&
            !selectedTruck && (
              <p>
                Este registo já não existe. Atualize a operação ou volte à
                lista.
              </p>
            )}
          {!selectedJob &&
            jobsForSelection.map((r) => (
              <button
                className="cw-assignment"
                key={r.job.id}
                data-ix="open-job"
                onClick={() => open({ kind: "job", id: r.job.id })}
              >
                <b>{r.job.jobNumber}</b>
                <span>
                  {routeName(r.job)} · {STATUS_LABELS[r.job.status]}
                </span>
                <small>
                  {r.issues.map((i) => i.text).join(" · ") ||
                    "Sem questões assinaladas"}
                </small>
              </button>
            ))}
          {frame.selected && !selectedJob && !jobsForSelection.length && (
            <p>
              Sem transporte ativo ou em fila. Verifique habilitações,
              disponibilidade e posição antes de atribuir uma nova carga.
            </p>
          )}
          {selectedJob && (
            <JobWork
              read={read}
              row={selectedJob}
              frame={frame}
              busy={busy}
              open={open}
              toggleMap={() => change((f) => ({ ...f, mapOpen: !f.mapOpen }))}
              write={write}
              runtime={runtime}
              resolveDraft={(discard) =>
                setWorkspace((w) => {
                  const f = currentFrame(w),
                    drafts = { ...f.drafts };
                  if (discard) delete drafts[selectedJob.job.id];
                  else if (drafts[selectedJob.job.id])
                    drafts[selectedJob.job.id] = {
                      ...drafts[selectedJob.job.id],
                      revision: selectedJob.job.revision,
                    };
                  return replaceFrame(w, { ...f, drafts });
                })
              }
              draft={(text) =>
                setWorkspace((w) => {
                  const f = currentFrame(w);
                  return replaceFrame(w, {
                    ...f,
                    drafts: {
                      ...f.drafts,
                      [selectedJob.job.id]: {
                        text,
                        revision:
                          f.drafts[selectedJob.job.id]?.revision ??
                          selectedJob.job.revision,
                      },
                    },
                  });
                })
              }
            />
          )}
        </article>
      </section>
      <EnvironmentMap
        ref={map}
        placement={{
          x: size.width < 1000 ? 90 : size.width * 0.52,
          y: size.height - Math.max(180, size.height * 0.28) - 26,
          width: size.width < 1000 ? size.width - 116 : size.width * 0.48 - 26,
          height: Math.max(180, size.height * 0.28),
          radius: 12,
          visible: visibleMap,
          opacity: visibleMap ? 1 : 0,
        }}
        compositionId={snapshot.version}
        reducedMotion={reduced}
        showReference={false}
        focus="Jobs"
        mode={visibleMap ? "ROUTE_FOCUS" : "HIDDEN"}
        sceneData={{
          routes: points.length > 1 ? [points] : [],
          driver: null,
          fuel: null,
          segment: [],
          showSegment: false,
          stops: [],
        }}
      />
    </main>
  );
}

function DriverRead({
  driver,
  now,
  state,
  commitments,
}: {
  driver: EnvironmentRead["drivers"][number]["driver"];
  now: number;
  state?: EnvironmentRead["drivers"][number]["state"];
  commitments?: number;
}) {
  const q = driverQualifications(driver, new Date(now));
  return (
    <div className="cw-resource-read">
      <b>{driver.name}</b>
      {state && (
        <span className="cw-state">
          {DRIVER_STATE_LABEL[state]} · {commitments} compromissos
        </span>
      )}
      <small>
        {DRIVER_AVAILABILITY_LABEL[driver.availability]} · disponibilidade
        declarada
      </small>
      <span>
        {driver.hours
          ? `${duration(driver.hours.drivenTodayMin)} de condução diária · base manual`
          : "Horas de condução desconhecidas"}
      </span>
      {driver.hours && (
        <small>
          Registado {date(driver.hours.recordedAt)} · sem atualização automática
        </small>
      )}
      <div className="cw-qualification-strip">
        {q
          .filter((v) => v.kind !== "adr" || v.state !== "NOT_HELD")
          .map((v) => (
            <span key={v.kind} data-status={v.state}>
              {v.label} ·{" "}
              {v.state === "VALID"
                ? `até ${v.expiresOn}`
                : v.state === "EXPIRED"
                  ? "caducada"
                  : v.state === "EXPIRING"
                    ? "a caducar"
                    : "por verificar"}
            </span>
          ))}
      </div>
    </div>
  );
}
function TruckRead({
  truck,
  state,
  commitments,
}: {
  truck: EnvironmentRead["trucks"][number]["truck"];
  state?: EnvironmentRead["trucks"][number]["state"];
  commitments?: number;
}) {
  return (
    <div className="cw-resource-read">
      <b>{truck.plate}</b>
      {state && (
        <span className="cw-state">
          {TRUCK_STATE_LABEL[state]} · {commitments} compromissos
        </span>
      )}
      <span>
        {AVAILABILITY_LABEL[truck.availability]} · disponibilidade declarada
      </span>
      <small>
        {truck.payloadKg != null
          ? `${(truck.payloadKg / 1000).toLocaleString("pt-PT")} t de carga útil`
          : "Carga útil não registada"}{" "}
        ·{" "}
        {truck.palletCapacity != null
          ? `${truck.palletCapacity} paletes`
          : "Posições não registadas"}
      </small>
      <small>
        {truck.fuelLevelPct
          ? `Combustível ${truck.fuelLevelPct.value}% · ${date(truck.fuelLevelPct.recordedAt)} · leitura manual`
          : "Combustível não registado"}
      </small>
    </div>
  );
}
function DomainRead({
  domain,
  jobs,
  open,
}: {
  domain: WorkspaceDomain;
  jobs: EnvironmentJob[];
  open: (s: Selection) => void;
}) {
  return (
    <>
      {jobs.map((r) => (
        <div className="cw-context-item" key={r.job.id}>
          {domain === "Jobs" && (
            <>
              <button
                data-ix="open-job"
                onClick={() => open({ kind: "job", id: r.job.id })}
              >
                {r.job.jobNumber} · {routeName(r.job)}
              </button>
              <small>
                {STATUS_LABELS[r.job.status]} · entrega{" "}
                {date(r.job.deliveryDeadline)}
              </small>
              <span className="cw-context-issues">
                {r.issues
                  .slice(0, 3)
                  .map((i) => i.text)
                  .join(" · ") || "Sem questões assinaladas"}
              </span>
            </>
          )}
          {domain === "Drivers" && (
            <>
              {r.driver ? (
                <button
                  data-ix="open-driver"
                  onClick={() => open({ kind: "driver", id: r.driver!.id })}
                >
                  {r.driver.name}
                </button>
              ) : (
                <b>Motorista por atribuir</b>
              )}
              <small>
                {r.driver?.hours
                  ? `${duration(r.driver.hours.drivenTodayMin)} de condução diária · base manual de ${date(r.driver.hours.recordedAt)}`
                  : "Base de condução não disponível"}
              </small>
              {r.qualifications
                .filter((q) => q.state === "EXPIRED" || q.state === "MISSING")
                .map((q) => (
                  <span className="cw-context-issues" key={q.kind}>
                    {q.label} ·{" "}
                    {q.state === "EXPIRED" ? "caducada" : "em falta"}
                  </span>
                ))}
            </>
          )}
          {domain === "Trucks" && (
            <>
              {r.truck ? (
                <button
                  data-ix="open-truck"
                  onClick={() => open({ kind: "truck", id: r.truck!.id })}
                >
                  {r.truck.plate}
                </button>
              ) : (
                <b>Viatura por atribuir</b>
              )}
              <small>
                {r.trailer
                  ? `${r.trailer.plate} · ${r.trailer.type}`
                  : r.job.assignedTrailerId
                    ? "Referência de reboque não resolvida"
                    : "Sem reboque atribuído"}
              </small>
              <small>
                {r.job.totalPallets} paletes ·{" "}
                {(r.job.totalWeightKg / 1000).toLocaleString("pt-PT")} t
                {r.truck?.payloadKg != null &&
                  r.job.totalWeightKg > r.truck.payloadKg &&
                  " · peso acima da carga útil registada"}
              </small>
              {r.truck?.availability === "MAINTENANCE" && (
                <span className="cw-context-issues">Viatura em manutenção</span>
              )}
            </>
          )}
          {domain === "Fuel" && (
            <>
              <b>
                {r.nextStop
                  ? `A seguir: ${r.nextStop.city}`
                  : "Paragens concluídas"}
              </b>
              <small>
                {r.stops.filter((s) => s.completed).length}/{r.stops.length}{" "}
                concluídas ·{" "}
                {r.job.planStatus === "PLANNED"
                  ? "Percurso confirmado"
                  : "Percurso por rever"}
              </small>
              <ol className="cw-stop-chain">
                {r.stops.map((s) => (
                  <li key={s.id} data-done={s.completed}>
                    <span>{s.city}</span>
                    <small>
                      {s.completed
                        ? `Concluída ${date(s.completedAt)}`
                        : s.windowStartAt
                          ? `${date(s.windowStartAt)} — ${date(s.windowEndAt)}`
                          : `${s.scheduledTime}–${s.windowEnd} · horário sem data`}
                    </small>
                  </li>
                ))}
              </ol>
            </>
          )}
          {domain === "Documents" && (
            <>
              {r.documents
                .filter((d) => d.status === "ISSUED")
                .map((d) => (
                  <span key={d.id}>
                    {d.type} {d.number}
                    <small>Emitido {date(d.issuedAt)} · versão guardada</small>
                  </span>
                ))}
              {!r.documents.some(
                (d) => d.status === "ISSUED" && d.type === "CMR",
              ) && (
                <b>
                  {["loading", "in_transit", "delivered", "invoiced"].includes(
                    r.job.status,
                  )
                    ? "Guia CMR em falta"
                    : "Guia CMR por emitir"}
                </b>
              )}
              <small>
                Cliente: {r.job.client} ·{" "}
                {r.job.reference || "sem referência externa"}
              </small>
            </>
          )}
          {domain === "Restrictions" && (
            <>
              {r.job.routeCompliance ? (
                <>
                  <b>
                    {r.job.routeCompliance.report.status} · avaliação guardada
                  </b>
                  <small>
                    {date(r.job.routeCompliance.report.evaluatedAt)} ·{" "}
                    {r.job.routeCompliance.report.datasetVersion}
                  </small>
                  <small>
                    {r.job.planStatus === "REPLAN_REQUIRED"
                      ? "Avaliação anterior: entradas alteradas"
                      : `${r.job.routeCompliance.report.results.length} regras no relatório`}
                  </small>
                </>
              ) : (
                <>
                  <b>Sem avaliação de percurso guardada</b>
                  <small>
                    Não permite concluir que a rota está livre de restrições.
                  </small>
                </>
              )}
              {r.assignment.issues.map((issue) => (
                <small key={issue}>{issueLabel(issue)}</small>
              ))}
            </>
          )}
        </div>
      ))}
    </>
  );
}

function JobWork({
  read,
  row: r,
  frame,
  busy,
  open,
  toggleMap,
  write,
  runtime,
  draft,
  resolveDraft,
}: {
  read: EnvironmentRead;
  row: EnvironmentJob;
  frame: ConnectedFrame;
  busy: boolean;
  open: (s: Selection) => void;
  toggleMap: () => void;
  write: (
    c: () => Promise<Result<Job>>,
    saved?: string,
    clearDraft?: boolean,
  ) => Promise<void>;
  runtime: ConnectedRuntime;
  draft: (s: string) => void;
  resolveDraft: (discard: boolean) => void;
}) {
  const job = r.job,
    notes = frame.drafts[job.id],
    timeline = read.queries.getOperationalTimeline(job.id);
  const stopAction = (s: (typeof job.stops)[number]) =>
    !s.completed &&
    (s.type === "pickup"
      ? ["loading", "in_transit"].includes(job.status)
      : job.status === "in_transit");
  return (
    <>
      <p className="cw-route-title">{routeName(job)}</p>
      <p>
        {job.client} · {STATUS_LABELS[job.status]} · revisão {job.revision}
      </p>
      <section className="cw-decision" data-context-domain="Jobs">
        <h3>Próxima decisão</h3>
        {r.issues.length > 0 && (
          <ul>
            {r.issues.map((i, n) => (
              <li key={`${i.domain}:${n}`} data-severity={i.severity}>
                <b>{LABEL[i.domain]}</b>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        )}
        {r.step ? (
          <>
            <button
              data-ix="transition"
              disabled={busy || !!r.blockers.length}
              onClick={() =>
                void write(() =>
                  runtime.commands.transition(job.id, job.revision, r.step!.to),
                )
              }
            >
              {r.step.label}
            </button>
            {r.blockers.length > 0 && (
              <p className="cw-blockers">
                Para avançar: {r.blockers.join(" · ")}
              </p>
            )}
          </>
        ) : (
          <p>
            {job.status === "backlog"
              ? "Atribuição e confirmação do percurso são necessárias antes de iniciar a carga."
              : job.status === "queued"
                ? "Aguarda libertação da viatura pelo transporte anterior."
                : "Sem avanço de estado disponível."}
          </p>
        )}
      </section>
      {frame.active.includes("Drivers") && (
        <section data-context-domain="Drivers">
          <h3>Motorista e compromissos</h3>
          <DomainRead domain="Drivers" jobs={[r]} open={open} />
          {r.driver && (
            <p>
              {read.drivers.find((d) => d.driver.id === r.driver!.id)?.jobs
                .length ?? 0}{" "}
              transportes ativos ou em fila para este motorista.
            </p>
          )}
        </section>
      )}
      {frame.active.includes("Trucks") && (
        <section data-context-domain="Trucks">
          <h3>Conjunto e carga</h3>
          <DomainRead domain="Trucks" jobs={[r]} open={open} />
          <dl className="cw-cargo">
            {job.cargo.map((c) => (
              <div key={c.id}>
                <dt>{c.description}</dt>
                <dd>
                  {c.quantity} {c.unit} · {c.weightKg.toLocaleString("pt-PT")}{" "}
                  kg
                  {c.dangerousGoods?.adrClass &&
                    ` · ADR ${c.dangerousGoods.adrClass}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {(frame.active.includes("Fuel") || frame.base === "Jobs") && (
        <section data-context-domain="Fuel">
          <h3>Execução e paragens</h3>
          <p>
            {timeline.status === "READY"
              ? "Execução confirmada disponível"
              : timeline.status === "STALE"
                ? "Execução desatualizada — horários não utilizáveis"
                : "Sem execução validada para calcular chegadas e margens"}
          </p>
          {timeline.issues.length > 0 && (
            <small>{timeline.issues.map(issueLabel).join(" · ")}</small>
          )}
          <ol className="cw-execution">
            {r.stops.map((s) => {
              const time = timeline.timeline?.stops.find(
                (st) => st.stopId === s.id,
              );
              return (
                <li key={s.id} data-done={s.completed}>
                  <span className="cw-stop-index">
                    {s.completed ? (
                      <Check size={16} />
                    ) : (
                      String(s.sequence).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <b>
                      {s.city} ·{" "}
                      {s.type === "pickup"
                        ? "Recolha"
                        : s.type === "delivery"
                          ? "Entrega"
                          : "Paragem"}
                    </b>
                    <p>
                      {s.clientName} · {s.address}
                    </p>
                    <small>
                      {s.windowStartAt
                        ? `Janela: ${date(s.windowStartAt)} — ${date(s.windowEndAt)}`
                        : `Horário registado ${s.scheduledTime}–${s.windowEnd} · falta janela datada`}
                    </small>
                    {time && (
                      <small>
                        Chegada:{" "}
                        {time.arrival.status === "UNKNOWN"
                          ? "desconhecida"
                          : `${date(new Date(time.arrival.value).toISOString())} · ${time.arrival.source}`}
                      </small>
                    )}
                    {s.completed && (
                      <small>Concluída {date(s.completedAt)}</small>
                    )}
                    {stopAction(s) && (
                      <button
                        data-ix="complete-stop"
                        disabled={busy}
                        onClick={() =>
                          void write(
                            () =>
                              runtime.commands.stop(
                                job.id,
                                job.revision,
                                s.id,
                                true,
                              ),
                            `Conclusão de ${s.city} guardada.`,
                          )
                        }
                      >
                        Confirmar conclusão de {s.city}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {job.routeCompliance?.route.polyline.length ? (
            <button data-ix="map" onClick={toggleMap}>
              {frame.mapOpen
                ? "Recolher mapa"
                : "Ver percurso guardado no mapa"}
            </button>
          ) : (
            <p className="cw-unknown">
              Sem geometria de percurso guardada. As moradas das paragens não
              substituem uma rota calculada.
            </p>
          )}
        </section>
      )}
      {frame.active.includes("Documents") && (
        <section data-context-domain="Documents">
          <h3>Dossier deste transporte</h3>
          <DomainRead domain="Documents" jobs={[r]} open={open} />
          <p>As guias emitidas mantêm a cópia dos dados à data de emissão.</p>
        </section>
      )}
      {frame.active.includes("Restrictions") && (
        <section data-context-domain="Restrictions">
          <h3>Condições avaliadas</h3>
          <DomainRead domain="Restrictions" jobs={[r]} open={open} />
          <p>
            Uma avaliação guardada cobre apenas o conjunto de regras e as
            entradas registadas nessa revisão.
          </p>
        </section>
      )}
      <form
        className="cw-notes"
        onSubmit={(e) => {
          e.preventDefault();
          if (notes)
            void write(
              () => runtime.commands.notes(job.id, notes.revision, notes.text),
              "Instruções guardadas.",
              true,
            );
        }}
      >
        <label htmlFor={`notes-${job.id}`}>Instruções da operação</label>
        <textarea
          id={`notes-${job.id}`}
          value={notes?.text ?? job.notes ?? ""}
          onChange={(e) => draft(e.target.value)}
          placeholder="Instruções de carga, contacto no destino, observações…"
        />
        <button
          data-ix="save-notes"
          disabled={busy || !notes || notes.text === (job.notes ?? "")}
          type="submit"
        >
          Guardar instruções
        </button>
        {notes && notes.revision !== job.revision && (
          <section className="cw-conflict">
            <p className="cw-blockers">
              O transporte mudou. Compare a versão guardada antes de continuar.
            </p>
            <small>Instruções guardadas na revisão {job.revision}</small>
            <blockquote>{job.notes || "Sem instruções guardadas."}</blockquote>
            <button
              data-ix="discard-draft"
              type="button"
              onClick={() => resolveDraft(true)}
            >
              Usar versão guardada
            </button>
            <button
              data-ix="rebase-draft"
              type="button"
              onClick={() => resolveDraft(false)}
            >
              Continuar a edição nesta revisão
            </button>
          </section>
        )}
      </form>
    </>
  );
}
