import { relevantContribution } from "./interactionGraph";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Fuel,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  Users,
  X,
  Maximize2,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { JOBS, demoContext, jobById, type DemoJob } from "./guidedContent";
import type { GuidedAction, GuidedLens, GuidedState } from "./guidedWorkspace";
import { LENS_CONTRACTS, type InformationForm } from "./compositionGrammar";
type Props = {
  state: GuidedState;
  act: (action: GuidedAction) => void;
  inlineFuel?: boolean;
  inlineResources?: boolean;
  form?: InformationForm;
  primary?: boolean;
};
const title = (job: DemoJob) => `${job.origin} → ${job.destination}`;
const currentJob = (state: GuidedState) =>
  state.anchor.kind === "job" ? jobById(state.anchor.id) : JOBS[0];
function LensTitle({
  domain,
  state,
  act,
  children,
}: { domain: GuidedLens; children?: ReactNode } & Props) {
  const lead = state.lead === domain;
  return (
    <div className="gw-lens-heading">
      <div>
        <span className="gw-eyebrow">
          {lead ? "Perspetiva principal" : "Contexto ativo"}
        </span>
        <h2>{children ?? domain}</h2>
      </div>
      <div className="gw-lens-actions">
        <button
          aria-label={`${lead ? "Recolher" : "Expandir"} ${domain}`}
          title={lead ? "Recolher" : "Expandir"}
          onClick={() => act({ type: "expand", domain })}
        >
          {lead ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
          <span>{lead ? "Recolher" : "Expandir"}</span>
        </button>
        <button
          className="gw-icon-only"
          aria-label={`Remover ${domain}`}
          onClick={() => act({ type: "toggle", domain })}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
function AnchorLine({ state, act }: Pick<Props, "state" | "act">) {
  if (state.anchor.kind !== "job")
    return <p className="gw-anchor-line">Transportes de demonstração</p>;
  const j = jobById(state.anchor.id);
  return (
    <p className="gw-anchor-line">
      <button
        className="gw-anchor-job"
        aria-label="Expandir Jobs"
        onClick={() => act({ type: "expand", domain: "Jobs" })}
      >
        <strong>{j.id}</strong>
      </button>
      <span>{title(j)}</span>
      <span className="gw-anchor-status">{j.status}</span>
    </p>
  );
}
function LensLink({
  domain,
  state,
  act,
  children,
}: { domain: GuidedLens; children: ReactNode } & Props) {
  return (
    <button
      className="gw-inline-lens"
      aria-label={`Expandir ${domain}`}
      onClick={() => act({ type: "expand", domain })}
    >
      <span>{children}</span>
      {state.lead === domain ? <Check size={14} /> : <ArrowUpRight size={14} />}
    </button>
  );
}
function AssuranceBrief({ state, act }: Props) {
  return (
    <div className="gw-assurance-brief">
      {state.active.includes("Documents") && state.lead !== "Documents" && (
        <LensLink domain="Documents" state={state} act={act}>
          <FileText size={15} />{" "}
          {state.lead === "Drivers"
            ? "Documentos do motorista OK"
            : "CMR conferido"}{" "}
          <small>{relevantContribution(state.lead, "Documents")}</small>
        </LensLink>
      )}
      {state.active.includes("Restrictions") &&
        state.lead !== "Restrictions" && (
          <LensLink domain="Restrictions" state={state} act={act}>
            <ShieldCheck size={15} />
            {state.lead === "Fuel"
              ? "Acesso ao posto compatível"
              : "2 condições de acesso"}
            <small>
              {state.lead === "Trucks"
                ? "Dimensões e acesso verificados"
                : "Uma janela a confirmar"}
            </small>
          </LensLink>
        )}
      {state.active.includes("Restrictions") &&
        state.lead !== "Restrictions" && (
          <button
            className="gw-inspect-inline"
            aria-label="Inspecionar condição relevante"
            onClick={() =>
              act({
                type: "inspect",
                takeover: {
                  kind: "segment",
                  id:
                    state.selection.restriction ??
                    demoContext(currentJob(state)).restrictions[0].id,
                },
              })
            }
          >
            Inspecionar acesso <MapPin size={13} />
          </button>
        )}
      {(["Pricing DEV", "Compliance DEV"] as const)
        .filter((l) => state.active.includes(l) && state.lead !== l)
        .map((l) => (
          <LensLink key={l} domain={l} state={state} act={act}>
            {l === "Pricing DEV" ? (
              <Package size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            <strong>{l}</strong>
            <small>{LENS_CONTRACTS[l].inline}</small>
          </LensLink>
        ))}
    </div>
  );
}
export function ExceptionBrief({ state, act }: Props) {
  if (!state.exceptions.driverTimeCritical || !state.active.includes("Drivers"))
    return null;
  return (
    <div className="gw-exception" role="status" data-exception="driver-time">
      <TriangleAlert size={20} />
      <div>
        <strong>Condução crítica · 22 min restantes</strong>
        <p>
          A chegada prevista ao posto excede este tempo. Rever a pausa antes de
          continuar. Cenário DEV.
        </p>
      </div>
      {state.lead !== "Drivers" && (
        <button
          aria-label="Expandir Drivers por exceção"
          onClick={() => act({ type: "expand", domain: "Drivers" })}
        >
          Rever motorista <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
export function JobsSurface({
  state,
  act,
  inlineFuel,
  inlineResources,
  form,
}: Props) {
  const selected =
      state.anchor.kind === "job" ? jobById(state.anchor.id) : null,
    rows = JOBS.filter(
      (j) => state.filter !== "moving" || j.status === "Em trânsito",
    );
  const context = demoContext(selected ?? JOBS[0], state.assignment);
  return (
    <>
      <LensTitle domain="Jobs" state={state} act={act}>
        {selected ? "Overview do transporte" : "Transportes"}
      </LensTitle>
      {selected ? (
        <>
          <AnchorLine state={state} act={act} />
          <div className="gw-job-title">
            <span className="gw-eyebrow">{selected.customer}</span>
            <h3>{title(selected)}</h3>
            <p>
              {selected.cargo} <span>·</span> Semirreboque {context.trailer}
            </p>
          </div>
          <div className="gw-job-metrics">
            <div>
              <small>Chegada prevista</small>
              <strong>{selected.eta}</strong>
            </div>
            <div>
              <small>Janela de entrega</small>
              <strong>{selected.window}</strong>
            </div>
            <div>
              <small>Percurso concluído</small>
              <strong>{selected.progress}%</strong>
            </div>
          </div>
          <div className="gw-progress-track">
            <i style={{ width: `${selected.progress}%` }} />
          </div>
          {form !== "SUPPORT" && (
            <div className="gw-job-route">
              <div>
                <MapPin size={17} />
                <small>Origem</small>
                <strong>{selected.origin}</strong>
                <span>Carregamento concluído</span>
              </div>
              <div>
                <Fuel size={17} />
                <small>Próxima decisão</small>
                <strong>
                  {state.selection.fuel
                    ? context.stops.find((s) => s.id === state.selection.fuel)
                        ?.name
                    : "Paragem de apoio"}
                </strong>
                <span>
                  {state.selection.fuel
                    ? "Paragem selecionada"
                    : "Comparar abastecimento e pausa"}
                </span>
              </div>
              <div>
                <Package size={17} />
                <small>Destino</small>
                <strong>{selected.destination}</strong>
                <span>{selected.window}</span>
              </div>
            </div>
          )}
          {form !== "SUPPORT" && (
            <div
              className="gw-job-assignment"
              data-related-resources={
                state.active.includes("Drivers") ||
                state.active.includes("Trucks")
              }
            >
              <div>
                <Users size={16} />
                <span>
                  <small>Motorista atribuído</small>
                  <strong>{selected.driver}</strong>
                </span>
              </div>
              <div>
                <Truck size={16} />
                <span>
                  <small>Veículo atribuído</small>
                  <strong>{selected.truck}</strong>
                </span>
              </div>
            </div>
          )}
          {form !== "SUPPORT" && (
            <div className="gw-job-note">
              <Check size={16} />
              <span>
                {selected.exception ??
                  (selected.status === "Entregue"
                    ? "Entrega concluída."
                    : "Plano dentro da janela de entrega.")}
                <small>Localização de demonstração: {context.location}</small>
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="gw-section-intro">A operação de hoje, num só lugar.</p>
          {state.lead === "Jobs" && (
            <div className="gw-collection-overview">
              <div className="gw-collection-summary">
                <div>
                  <strong>2</strong>
                  <span>Em trânsito</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Descarga a confirmar</span>
                </div>
                <div>
                  <strong>6</strong>
                  <span>Equipas atribuídas</span>
                </div>
              </div>
              <div className="gw-collection-next">
                <span className="gw-eyebrow">Próximas chegadas</span>
                <ol>
                  {[JOBS[2], JOBS[4], JOBS[0]].map((j) => (
                    <li key={j.id}>
                      <strong>{j.eta}</strong>
                      <span>{j.destination}</span>
                      <small>
                        {j.id}
                        {j.exception ? " · confirmar descarga" : ""}
                      </small>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          <div className="gw-collection-controls">
            <span>
              <strong>{rows.length}</strong> transportes
            </span>
            <button
              aria-pressed={state.filter === "moving"}
              onClick={() =>
                act({
                  type: "filter",
                  value: state.filter === "moving" ? "all" : "moving",
                })
              }
            >
              Em trânsito <span>2</span>
            </button>
          </div>
          <div className="gw-jobs-list">
            {rows.map((j) => (
              <button
                className="gw-job-row"
                key={j.id}
                data-map-entity="job" data-entity-id={j.id} aria-label={`Selecionar ${j.id} — ${title(j)}`}
                onClick={() => act({ type: "job", id: j.id })}
              >
                <div className="gw-job-row-top">
                  <strong>{j.id}</strong>
                  <span
                    className={`gw-status ${j.exception ? "gw-status-warning" : ""}`}
                  >
                    {j.status}
                  </span>
                </div>
                <div className="gw-job-row-route">
                  {title(j)}
                  <ChevronRight size={15} />
                </div>
                <div className="gw-job-row-window">
                  <Clock3 size={13} />
                  <span>{j.eta}</span>
                  <small>{j.window}</small>
                </div>
                <div className="gw-job-row-resources">
                  <span>{j.driver}</span>
                  <small>{j.truck}</small>
                </div>
                <div className="gw-job-row-progress">
                  <i style={{ width: `${j.progress}%` }} />
                </div>
                {j.exception && (
                  <p className="gw-job-row-exception">{j.exception}</p>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <AssuranceBrief state={state} act={act} />
      {inlineFuel && <FuelBrief state={state} act={act} />}{" "}
      {inlineResources && <ResourceBrief state={state} act={act} />}
      <p className="gw-demo-note">
        Dados sintéticos · nenhuma ação operacional real
      </p>
    </>
  );
}
function FuelBrief({ state, act }: Props) {
  const context = demoContext(currentJob(state));
  const stop =
    context.stops.find((s) => s.id === state.selection.fuel) ??
    context.stops[0];
  return (
    <>
      <LensLink domain="Fuel" state={state} act={act}>
        <Fuel size={16} />
        <strong>{stop.name}</strong>
        <span>
          {state.lead === "Documents"
            ? "Autorização disponível · comprovativo a emitir"
            : state.lead === "Trucks"
              ? `${context.range} km de autonomia · +${stop.detour} km de desvio`
              : `€${stop.price}/L · +${stop.detour} km`}
        </span>
      </LensLink>
      <StopPicker state={state} act={act} />
    </>
  );
}
function StopPicker({ state, act }: Props) {
  const stops = demoContext(currentJob(state)).stops;
  return (
    <label className="gw-stop-picker">
      <span>Paragem de apoio</span>
      <select
        aria-label="Paragem de apoio"
        value={state.selection.fuel ?? stops[0].id}
        onChange={(e) => act({ type: "fuel", id: e.target.value })}
      >
        {stops.map((stop) => (
          <option key={stop.id} value={stop.id}>
            {stop.name} · {stop.eta}
          </option>
        ))}
      </select>
    </label>
  );
}
function ResourceBrief({ state, act }: Props) {
  const job = currentJob(state),
    context = demoContext(job, state.assignment);
  return (
    <div className="gw-assurance-brief">
      {state.active.includes("Drivers") && (
        <LensLink domain="Drivers" state={state} act={act}>
          <Users size={15} />
          {job.driver}
          <small>
            {state.exceptions.driverTimeCritical
              ? "22 min · pausa a rever"
              : state.lead === "Fuel"
                ? "3h42 disponíveis · pausa planeada"
                : state.lead === "Documents"
                  ? "Identidade conferida no documento"
                  : "Recurso atribuído ao transporte"}
          </small>
        </LensLink>
      )}
      {state.active.includes("Trucks") && (
        <LensLink domain="Trucks" state={state} act={act}>
          <Truck size={15} />
          {job.truck}
          <small>
            {state.lead === "Documents"
              ? `${context.plate} · ${context.trailer} · conferido`
              : `${context.plate} · ${context.fuel}% combustível · ${context.range} km${state.lead === "Fuel" ? " · 29 L/100 km" : ""}`}
          </small>
        </LensLink>
      )}
    </div>
  );
}
export function FuelSurface({ state, act, inlineResources }: Props) {
  const job = currentJob(state),
    context = demoContext(job, state.assignment);
  const stop =
      context.stops.find((s) => s.id === state.selection.fuel) ??
      context.stops[0],
    deep = state.lead === "Fuel";
  if (
    state.lead === "Documents" ||
    state.lead === "Drivers" ||
    state.lead === "Trucks"
  ) {
    const docs = state.lead === "Documents";
    return (
      <>
        <LensTitle domain="Fuel" state={state} act={act}>
          {docs ? "Documentação da paragem" : "Próxima paragem"}
        </LensTitle>
        <AnchorLine state={state} act={act} />
        <StopPicker state={state} act={act} />
        <div className="gw-context-fuel">
          <span className="gw-eyebrow">
            {state.selection.fuel
              ? "Paragem selecionada"
              : "Proposta de demonstração"}
          </span>
          <h3>{stop.name}</h3>
          {docs ? (
            <dl>
              <div>
                <dt>Autorização de abastecimento</dt>
                <dd>Disponível</dd>
              </div>
              <div>
                <dt>Comprovativo do posto</dt>
                <dd>A emitir após a paragem</dd>
              </div>
            </dl>
          ) : (
            <p>
              Chegada {stop.eta} · abastecimento e pausa de 45 min na mesma
              paragem.
            </p>
          )}
          <p className="gw-support-answer">
            {docs
              ? "O comprovativo fica ligado ao mesmo transporte."
              : state.exceptions.driverTimeCritical
                ? "Rever a pausa: a chegada excede os 22 min disponíveis."
                : "A paragem cabe no tempo de condução disponível."}
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <LensTitle domain="Fuel" state={state} act={act}>
        Abastecimento
      </LensTitle>
      <AnchorLine state={state} act={act} />
      <AssuranceBrief state={state} act={act} />
      <p className="gw-section-intro">
        {deep
          ? "Escolher a paragem que faz sentido para este transporte."
          : "Uma paragem, combustível e pausa no mesmo percurso."}
      </p>
      <div className="gw-fuel-summary">
        <div>
          <small>Autonomia atual</small>
          <strong>
            {context.range} <span>km</span>
          </strong>
        </div>
        <div>
          <small>Necessidade até ao destino</small>
          <strong>
            {context.remaining} <span>km</span>
          </strong>
        </div>
        <span className="gw-quiet-tag">
          {context.range >= context.remaining
            ? "Dentro do alcance"
            : "Abastecimento necessário"}
        </span>
      </div>
      <div className="gw-fuel-decision">
        <div className="gw-station-list">
          {context.stops.map((s) => (
            <button
              className="gw-station"
              aria-label={`Selecionar posto ${s.id} — ${s.name}`}
              aria-pressed={state.selection.fuel === s.id}
              key={s.id}
              onClick={() => act({ type: "fuel", id: s.id })}
            >
              <span className="gw-station-radio">
                {state.selection.fuel === s.id ? <Check size={12} /> : null}
              </span>
              <span className="gw-station-name">
                <strong>{s.name}</strong>
                <small>
                  {s.location} · {s.parking}
                </small>
                <span className="gw-station-impact">
                  +{s.detour} km · chegada {s.eta}
                </span>
                {s.recommended && <em>Equilíbrio entre desvio e pausa</em>}
              </span>
              <span className="gw-station-price">
                €{s.price}
                <small>/L</small>
              </span>
              <span className="gw-station-detour">
                +{s.detour} km<small>{s.eta}</small>
              </span>
            </button>
          ))}
        </div>
        {deep && (
          <>
            <div className="gw-fuel-plan">
              <span className="gw-eyebrow">
                {state.selection.fuel
                  ? "Paragem selecionada"
                  : "Proposta de comparação"}
              </span>
              <h3>{stop.name}</h3>
              <button
                className="gw-inspect"
                aria-label="Inspecionar posto selecionado"
                onClick={() =>
                  act({
                    type: "inspect",
                    takeover: { kind: "station", id: stop.id },
                  })
                }
              >
                <Maximize2 size={14} /> Inspecionar paragem
              </button>
              <div className="gw-fuel-plan-metrics">
                <div>
                  <strong>220 L</strong>
                  <small>Abastecimento previsto</small>
                </div>
                <div>
                  <strong>45 min</strong>
                  <small>Pausa combinada</small>
                </div>
                <div>
                  <strong>{stop.eta}</strong>
                  <small>Chegada ao posto</small>
                </div>
              </div>
              <ol className="gw-stop-timeline">
                <li>
                  <strong>Chegar</strong>
                  <span>{stop.eta}</span>
                </li>
                <li>
                  <strong>Abastecer + pausa</strong>
                  <span>45 min</span>
                </li>
                <li>
                  <strong>Continuar para {job.destination}</strong>
                  <span>Dentro da janela</span>
                </li>
              </ol>
            </div>
          </>
        )}
      </div>
      {deep && (
        <p className="gw-context-answer">
          {state.exceptions.driverTimeCritical ? (
            <TriangleAlert size={16} />
          ) : (
            <Check size={16} />
          )}
          {state.exceptions.driverTimeCritical
            ? "Rever a paragem: 22 min de condução não permitem a chegada prevista."
            : "A pausa cabe no plano; etapa seguinte inferior às 3h42 disponíveis."}
        </p>
      )}
      {inlineResources && <ResourceBrief state={state} act={act} />}
      <p className="gw-demo-note">
        Preços, horários e disponibilidade de demonstração
      </p>
    </>
  );
}
export function ResourceSurface({ state, act, inlineFuel, form }: Props) {
  const driver = state.active.includes("Drivers"),
    truck = state.active.includes("Trucks"),
    truckLead = state.lead === "Trucks" || state.takeover?.domain === "Trucks",
    driverLead =
      state.lead === "Drivers" || state.takeover?.domain === "Drivers",
    deep = truckLead || driverLead,
    job = state.anchor.kind === "job" ? jobById(state.anchor.id) : JOBS[0];
  const context = demoContext(job, state.assignment);
  const stop =
    context.stops.find((s) => s.id === state.selection.fuel) ??
    context.stops[0];
  return (
    <>
      <div className="gw-resource-heading">
        <span className="gw-eyebrow">
          {deep ? "Equipa do transporte" : "Recursos ligados ao plano"}
        </span>
        <div>
          {deep && (
            <button
              aria-label="Inspecionar recurso"
              onClick={() =>
                act({
                  type: "inspect",
                  takeover: {
                    kind: "resource",
                    domain: truckLead ? "Trucks" : "Drivers",
                  },
                })
              }
            >
              <Maximize2 size={14} /> Inspecionar
            </button>
          )}
          {driver && (
            <button
              aria-label={`${driverLead ? "Recolher" : "Expandir"} Drivers`}
              onClick={() => act({ type: "expand", domain: "Drivers" })}
            >
              Motorista{" "}
              {driverLead ? (
                <ArrowDownLeft size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
            </button>
          )}
          {truck && (
            <button
              aria-label={`${truckLead ? "Recolher" : "Expandir"} Trucks`}
              onClick={() => act({ type: "expand", domain: "Trucks" })}
            >
              Veículo{" "}
              {truckLead ? (
                <ArrowDownLeft size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
            </button>
          )}
        </div>
      </div>
      {deep && <AnchorLine state={state} act={act} />}
      <div className={`gw-resource-pair ${truckLead ? "gw-truck-first" : ""}`}>
        {driver && (
          <section className="gw-driver-info">
            <div className="gw-person">
              <span className="gw-avatar">
                {job.driver
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div>
                <small>Motorista · {context.driverId}</small>
                <h3>{job.driver}</h3>
                <span>
                  {state.lead === "Documents"
                    ? "Identidade conferida"
                    : `${job.status} · ${context.location}`}
                </span>
              </div>
            </div>
            {state.lead === "Documents" ? (
              <p className="gw-support-answer">
                <Check size={13} /> Motorista atribuído e conferido no CMR.
              </p>
            ) : (
              <div className="gw-driver-time">
                <strong>
                  {state.exceptions.driverTimeCritical ? "22 min" : "3h42"}
                </strong>
                <span>
                  {state.lead === "Fuel"
                    ? "Condução disponível para chegar ao posto"
                    : "Condução legal restante"}
                </span>
              </div>
            )}
            {driverLead && form !== "SUPPORT" && (
              <>
                <div className="gw-shift-track">
                  <i />
                  <span>
                    06:30<small>Início</small>
                  </span>
                  <span>
                    13:12<small>Agora</small>
                  </span>
                  <span>
                    {stop.eta}
                    <small>Pausa prevista</small>
                  </span>
                  <span>
                    {job.eta}
                    <small>Entrega</small>
                  </span>
                </div>
                <div className="gw-driver-details">
                  <div>
                    <small>Estado de descanso</small>
                    <strong>Pausa de 45 min planeada</strong>
                  </div>
                  <div>
                    <small>Próxima etapa</small>
                    <strong>
                      {stop.name} · {stop.eta}
                    </strong>
                  </div>
                </div>
              </>
            )}
            {state.lead === "Fuel" && (
              <p className="gw-support-answer">
                {state.exceptions.driverTimeCritical
                  ? "Pausa a rever: a chegada excede a condução disponível."
                  : "Chegada ao posto antes da pausa obrigatória."}
              </p>
            )}
          </section>
        )}
        {truck && (
          <section className="gw-truck-info">
            <div className="gw-truck-identity">
              <Truck size={deep ? 36 : 22} />
              <div>
                <small>Veículo · {context.truckId}</small>
                <h3>{job.truck}</h3>
                <span>
                  {context.plate} · {context.trailer}
                </span>
              </div>
            </div>
            {state.lead === "Documents" ? (
              <p className="gw-support-answer">
                <Check size={13} /> Matrícula e semirreboque coincidem com o
                documento.
              </p>
            ) : (
              <div className="gw-truck-reading">
                <div>
                  <strong>{context.fuel}%</strong>
                  <span>Combustível</span>
                </div>
                <div>
                  <strong>{context.range} km</strong>
                  <span>Autonomia</span>
                </div>
                {(deep || state.lead === "Fuel") && (
                  <div>
                    <strong>29 L</strong>
                    <span>/100 km · consumo demo</span>
                  </div>
                )}
              </div>
            )}
            {truckLead && (
              <>
                <div className="gw-capacity">
                  <span>
                    <strong>{job.cargo}</strong> / 24 t úteis
                  </span>
                  <i>
                    <b style={{ width: `${context.loadPercent}%` }} />
                  </i>
                  <small>Carga de demonstração</small>
                </div>
                <div className="gw-driver-details">
                  <div>
                    <small>Dimensões do conjunto</small>
                    <strong>16,5 m · 4 m · 40 t MMA</strong>
                  </div>
                  <div>
                    <small>Acesso ao posto</small>
                    <strong>Compatível com pesados</strong>
                  </div>
                </div>
              </>
            )}
            {state.lead === "Fuel" && (
              <p className="gw-support-answer">
                Autonomia e nível de combustível apoiam a escolha da paragem.
              </p>
            )}
          </section>
        )}
      </div>
      {deep && <AssuranceBrief state={state} act={act} />}
      {inlineFuel && <FuelBrief state={state} act={act} />}
      <p className="gw-demo-note">
        {state.lead === "Documents"
          ? "Identidades do transporte, sem ruído operacional"
          : "Recursos sintéticos do mesmo transporte"}
      </p>
    </>
  );
}
export function AssuranceSurface({
  state,
  act,
  inlineFuel,
  inlineResources,
}: Props) {
  const job = currentJob(state),
    context = demoContext(job, state.assignment);
  const docs =
      state.takeover?.kind === "document" ||
      state.lead === "Documents" ||
      (!state.lead && state.active[0] === "Documents"),
    doc =
      context.documents.find((d) => d.id === state.selection.document) ??
      context.documents[0];
  const documentWork =
    state.lead === "Documents" || state.takeover?.kind === "document";
  const restrictionWork = state.lead === "Restrictions";
  return (
    <>
      <LensTitle
        domain={docs ? "Documents" : "Restrictions"}
        state={state}
        act={act}
      >
        {docs ? "Documentação" : "Condições de acesso"}
      </LensTitle>
      <AnchorLine state={state} act={act} />
      {docs ? (
        <>
          <p className="gw-section-intro">
            Documentos, transporte e intervenientes no mesmo contexto.
          </p>
          <AssuranceBrief state={state} act={act} />
          {!state.takeover && (
            <button
              className="gw-inspect"
              aria-label="Inspecionar documento"
              onClick={() =>
                act({
                  type: "inspect",
                  takeover: { kind: "document", id: doc.id },
                })
              }
            >
              <Maximize2 size={14} /> Abrir documento em área ampla
            </button>
          )}
          <div className="gw-document-workspace">
            <nav aria-label="Documentos do transporte">
              {context.documents.map((d) => (
                <button
                  key={d.id}
                  aria-pressed={doc.id === d.id}
                  onClick={() => act({ type: "document", id: d.id })}
                >
                  <FileText size={18} />
                  <strong>{d.title}</strong>
                  <span>{d.status}</span>
                  <small>
                    {d.pages} {d.pages === 1 ? "página" : "páginas"}
                  </small>
                </button>
              ))}
            </nav>
            {documentWork ? (
              <article className="gw-paper">
                <div className="gw-paper-heading">
                  <span>FLEETOS / DOCUMENTO SINTÉTICO</span>
                  <strong>{doc.id}</strong>
                </div>
                <h3>{doc.title}</h3>
                <div className="gw-paper-parties">
                  <div>
                    <small>Expedidor</small>
                    <strong>{job.customer}</strong>
                    <span>{job.origin} · Portugal</span>
                  </div>
                  <div>
                    <small>Destinatário</small>
                    <strong>Centro de distribuição</strong>
                    <span>{job.destination}</span>
                  </div>
                </div>
                <div className="gw-paper-route">
                  <MapPin size={16} />
                  {title(job)}
                </div>
                <dl>
                  <div>
                    <dt>Transporte</dt>
                    <dd>{job.id}</dd>
                  </div>
                  <div>
                    <dt>Mercadoria</dt>
                    <dd>{job.cargo}</dd>
                  </div>
                  <div>
                    <dt>Motorista</dt>
                    <dd>{job.driver}</dd>
                  </div>
                  <div>
                    <dt>Conjunto</dt>
                    <dd>
                      {context.plate} / {context.trailer}
                    </dd>
                  </div>
                </dl>
                <div className="gw-paper-stamp">
                  <Check size={17} />
                  {doc.status}
                </div>
                <footer>
                  Documento de demonstração, sem validade operacional.
                </footer>
              </article>
            ) : (
              <article className="gw-document-summary">
                <span className="gw-eyebrow">
                  {doc.id} · {doc.status}
                </span>
                <h3>{doc.title}</h3>
                <p>
                  {doc.pages} páginas ligadas a {job.id} · {title(job)}
                </p>
                <p>
                  Intervenientes conferidos: {job.driver}, {context.plate} e{" "}
                  {context.trailer}.
                </p>
                <p>
                  Expandir Documents para trabalhar no documento; inspecionar
                  para uma leitura temporária ampla.
                </p>
              </article>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="gw-section-intro">
            O que condiciona o acesso à paragem e à entrega.
          </p>
          <div className="gw-restriction-list">
            {context.restrictions.map((r) => (
              <section
                key={r.id}
                data-selected={state.selection.restriction === r.id}
              >
                <ShieldCheck size={22} />
                <div>
                  <span className="gw-eyebrow">{r.id}</span>
                  <h3>{r.title}</h3>
                  {restrictionWork && <p>{r.description}</p>}
                  <span className="gw-quiet-tag">{r.status}</span>
                  <button
                    className="gw-inspect-inline"
                    aria-label={`Selecionar condição ${r.id}`}
                    aria-pressed={state.selection.restriction === r.id}
                    onClick={() => act({ type: "restriction", id: r.id })}
                  >
                    Selecionar condição
                  </button>
                </div>
              </section>
            ))}
          </div>
          {restrictionWork && (
            <div className="gw-context-answer">
              Conjunto: 16,5 m · 4 m · 40 t MMA. Verificação sintética, sem
              decisão legal real.
            </div>
          )}
          <button
            className="gw-inspect"
            aria-label="Inspecionar segmento"
            onClick={() =>
              act({
                type: "inspect",
                takeover: {
                  kind: "segment",
                  id: state.selection.restriction ?? context.restrictions[0].id,
                },
              })
            }
          >
            <MapPin size={14} /> Inspecionar acesso no mapa
          </button>
          {state.active.includes("Documents") && (
            <AssuranceBrief state={state} act={act} />
          )}
        </>
      )}
      {inlineFuel && <FuelBrief state={state} act={act} />}{" "}
      {inlineResources && <ResourceBrief state={state} act={act} />}
      <p className="gw-demo-note">Dados inventados para rever a composição</p>
    </>
  );
}
export function StationDetail({ state, act }: Props) {
  const job = currentJob(state),
    context = demoContext(job, state.assignment);
  const stop =
    context.stops.find((s) => s.id === state.selection.fuel) ??
    context.stops[0];
  return (
    <>
      <AnchorLine state={state} act={act} />
      <span className="gw-eyebrow">Inspeção temporária da paragem</span>
      <h2 className="gw-detail-title">{stop.name}</h2>
      <p className="gw-section-intro">
        {stop.location} · {stop.parking} · dados de demonstração
      </p>
      <div className="gw-fuel-summary">
        <div>
          <small>Preço sintético</small>
          <strong>
            €{stop.price}
            <span> /L</span>
          </strong>
        </div>
        <div>
          <small>Desvio</small>
          <strong>
            {stop.detour}
            <span> km</span>
          </strong>
        </div>
        <div>
          <small>Chegada prevista</small>
          <strong>{stop.eta}</strong>
        </div>
      </div>
      <div className="gw-detail-columns">
        <section>
          <h3>Abastecimento e pausa</h3>
          <p>
            Proposta de 220 L e pausa de 45 minutos no mesmo ponto de apoio.
          </p>
          <p>
            {state.exceptions.driverTimeCritical
              ? "Tempo restante de 22 min: rever o plano antes da chegada."
              : "A proposta ilustrativa combina abastecimento e descanso."}
          </p>
        </section>
        <section>
          <h3>Continuidade do transporte</h3>
          <p>
            {job.id} · {title(job)} · chegada {job.eta}
          </p>
          <p>
            O posto selecionado, as lentes e a perspetiva principal continuam no
            workspace.
          </p>
        </section>
      </div>
      <button
        className="gw-inspect"
        aria-label="Expandir mapa da paragem"
        onClick={() => act({ type: "map", intent: "expand" })}
      >
        <MapPin size={16} /> Abrir contexto geográfico
      </button>
      <AssuranceBrief state={state} act={act} />
    </>
  );
}
export function FutureSurface({ state, act }: Props) {
  const lens = state.lead === "Pricing DEV" ? "Pricing DEV" : "Compliance DEV";
  return (
    <>
      <LensTitle domain={lens} state={state} act={act} />
      <AnchorLine state={state} act={act} />
      <h3 className="gw-detail-title">Participação de demonstração</h3>
      <p className="gw-section-intro">
        {LENS_CONTRACTS[lens].lead}. Esta lente apenas prova agrupamento e
        prioridade; não tem regras, cálculos ou dados de produção.
      </p>
      <AssuranceBrief state={state} act={act} />
      <ResourceBrief state={state} act={act} />
      <p className="gw-demo-note">
        Placeholder DEV · sem lógica comercial ou de compliance
      </p>
    </>
  );
}
