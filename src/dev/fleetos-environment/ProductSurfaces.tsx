import {
  ArrowUpRight,
  Check,
  Clock3,
  FileText,
  MapPin,
  Maximize2,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";
import type { GuidedAction, GuidedLens, GuidedState } from "./guidedWorkspace";
import { demoContext, jobById } from "./guidedContent";
import { relevantContribution } from "./interactionGraph";

type Props = {
  state: GuidedState;
  act: (action: GuidedAction) => void;
  inlineFuel?: boolean;
  inlineResources?: boolean;
};
const context = (s: GuidedState) => {
  const job = jobById(s.anchor.kind === "job" ? s.anchor.id : "J-4217");
  return { job, c: demoContext(job, s.assignment) };
};
function Header({
  state,
  act,
  domain,
  title,
  subtitle,
}: Props & { domain: GuidedLens; title: string; subtitle: string }) {
  const { job } = context(state);
  return (
    <header className="pd-header">
      <div>
        <span className="pd-eyebrow">{subtitle}</span>
        <h2>{title}</h2>
        <button
          className="pd-anchor"
          aria-label="Expandir Jobs"
          onClick={() => act({ type: "expand", domain: "Jobs" })}
        >
          {job.id}{" "}
          <span>
            {job.origin} → {job.destination}
          </span>
          <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="pd-header-actions">
        <button
          aria-label={`Recolher ${domain}`}
          onClick={() => act({ type: "expand", domain })}
        >
          <ArrowUpRight size={16} />
        </button>
        <button
          aria-label={`Remover ${domain}`}
          onClick={() => act({ type: "toggle", domain })}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
function Relation({
  state,
  act,
  domain,
  title,
  detail,
}: Props & { domain: GuidedLens; title: string; detail: string }) {
  if (!state.active.includes(domain) || state.lead === domain) return null;
  const Icon =
    domain === "Documents"
      ? FileText
      : domain === "Restrictions"
        ? ShieldCheck
        : domain === "Drivers"
          ? Users
          : Truck;
  return (
    <button
      className="pd-relation"
      aria-label={`Expandir ${domain}`}
      data-map-entity={
        domain === "Drivers" || domain === "Trucks"
          ? "resource"
          : domain === "Restrictions"
            ? "restriction"
            : undefined
      }
      data-entity-id={
        domain === "Restrictions"
          ? (state.selection.restriction ?? context(state).c.restrictions[0].id)
          : undefined
      }
      onClick={() => act({ type: "expand", domain })}
    >
      <Icon size={16} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ArrowUpRight size={14} />
    </button>
  );
}
function Supports(props: Props) {
  const { state, inlineFuel, inlineResources } = props,
    { job, c } = context(state);
  const stop = c.stops.find((s) => s.id === state.selection.fuel) ?? c.stops[0];
  return (
    <div className="pd-supports">
      <Relation
        {...props}
        domain="Documents"
        title={
          state.lead === "Drivers"
            ? "Documentos do motorista OK"
            : "Documentos do transporte"
        }
        detail={relevantContribution(state.lead, "Documents")}
      />
      <Relation
        {...props}
        domain="Restrictions"
        title="Acesso e janela da etapa"
        detail={
          state.selection.restriction ?? "Uma condição requer confirmação"
        }
      />
      {inlineFuel && state.active.includes("Fuel") && (
        <Relation
          {...props}
          domain="Fuel"
          title={stop.name}
          detail={`Chegada ${stop.eta} · pausa e abastecimento combinados`}
        />
      )}
      {inlineResources && (
        <>
          <Relation
            {...props}
            domain="Drivers"
            title={job.driver}
            detail={
              state.exceptions.driverTimeCritical
                ? "22 min · rever paragem"
                : "3h42 · pausa planeada"
            }
          />
          <Relation
            {...props}
            domain="Trucks"
            title={job.truck}
            detail={`${c.plate} · ${c.range} km de autonomia sintética`}
          />
        </>
      )}
    </div>
  );
}
function DemoNote() {
  return (
    <p className="pd-demo">
      Cenário DEV · valores, relações e recomendações sintéticos
    </p>
  );
}
const afterPause = (eta: string) => {
  const [hours, minutes] = eta.split(":").map(Number);
  const total = hours * 60 + minutes + 45;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
function DutyTimeline({
  critical,
  nextEta,
  delivery,
}: {
  critical: boolean;
  nextEta: string;
  delivery: string;
}) {
  return (
    <section className="pd-duty">
      <div className="pd-section-heading">
        <h3>O turno de hoje</h3>
        <span>06:30 — {delivery}</span>
      </div>
      <div
        className="pd-duty-track"
        aria-label="Turno: trabalho, condução, pausa e próxima etapa"
      >
        <span style={{ flex: 45 }} data-activity="work" />
        <span style={{ flex: 230 }} data-activity="drive" />
        <span style={{ flex: 45 }} data-activity="break" />
        <span style={{ flex: 87 }} data-activity="drive" />
        <span style={{ flex: critical ? 22 : 103 }} data-activity="current" />
        <span style={{ flex: 45 }} data-activity="planned-break" />
        <span style={{ flex: 180 }} data-activity="planned" />
      </div>
      <div className="pd-duty-times">
        <span>
          06:30<small>Início de turno</small>
        </span>
        <span>
          11:05<small>Pausa concluída</small>
        </span>
        <span className="pd-now">
          13:12<small>Agora · condução</small>
        </span>
        <span>
          {critical ? "13:34" : nextEta}
          <small>Próxima pausa</small>
        </span>
        <span>
          {delivery}
          <small>Entrega</small>
        </span>
      </div>
      <div className="pd-duty-legend">
        <span>Condução</span>
        <span>Trabalho</span>
        <span>Pausa</span>
        <span>Planeado</span>
      </div>
    </section>
  );
}
export function DriverWork(props: Props) {
  const { state, act } = props,
    { job, c } = context(state),
    critical = state.exceptions.driverTimeCritical;
  const stop = c.stops.find((s) => s.id === state.selection.fuel) ?? c.stops[0];
  return (
    <article className="pd-work pd-driver" data-task="driver">
      <Header
        {...props}
        domain="Drivers"
        title={job.driver}
        subtitle={`Motorista ${c.driverId} · Em execução`}
      />
      <div className="pd-driver-status" data-map-entity="resource">
        <span className="pd-live-dot" />
        <strong>Em condução</strong>
        <span>
          {c.location} · {job.id}
        </span>
        <button
          aria-label="Inspecionar recurso"
          onClick={() =>
            act({
              type: "inspect",
              takeover: { kind: "resource", domain: "Drivers" },
            })
          }
        >
          Turno e recurso <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="pd-time-reading">
        <div>
          <strong data-critical={critical}>
            {critical ? "22" : "3h42"}
            <small>{critical ? "min" : ""}</small>
          </strong>
          <span>
            {critical
              ? "até à pausa no cenário crítico"
              : "condução diária disponível"}
          </span>
        </div>
        <dl>
          <div>
            <dt>Condução diária</dt>
            <dd>
              5h18 <small>/ 9h00</small>
            </dd>
          </div>
          <div>
            <dt>Turno iniciado</dt>
            <dd>06:30</dd>
          </div>
          <div>
            <dt>Próxima janela</dt>
            <dd>{job.window}</dd>
          </div>
        </dl>
      </div>
      <DutyTimeline critical={critical} nextEta={stop.eta} delivery={job.eta} />
      <section className="pd-next-action">
        <span className="pd-eyebrow">A seguir · pausa + abastecimento</span>
        <div>
          <h3>{stop.name}</h3>
          <strong>{stop.eta}</strong>
        </div>
        <p>
          {critical
            ? "A chegada prevista excede a margem do cenário. Rever uma paragem mais próxima antes de continuar."
            : "45 min de pausa na mesma paragem do abastecimento. Próxima pausa necessária até às 15:35; comparar essa margem com a chegada prevista."}
        </p>
        <div className="pd-next-facts">
          <span>
            <Clock3 size={14} /> 45 min de pausa
          </span>
          <span>
            <MapPin size={14} /> +{stop.detour} km
          </span>
          <span>Entrega {job.eta}</span>
        </div>
      </section>
      <div className="pd-deep pd-driver-plan">
        <section>
          <div className="pd-section-heading">
            <h3>Sequência de execução</h3>
            <span>Plano do transporte</span>
          </div>
          <ol className="pd-agenda">
            <li>
              <time>{stop.eta}</time>
              <span>
                <strong>Abastecer e iniciar pausa</strong>
                <small>
                  {stop.name} · {c.truckId}
                </small>
              </span>
              <em>45 min</em>
            </li>
            <li>
              <time>{afterPause(stop.eta)}</time>
              <span>
                <strong>Retomar a etapa de entrega</strong>
                <small>
                  Corredor para {job.destination} · janela a confirmar
                </small>
              </span>
            </li>
            <li>
              <time>{job.eta}</time>
              <span>
                <strong>Apresentar-se na descarga</strong>
                <small>
                  {job.customer} · {job.cargo}
                </small>
              </span>
              <em>{job.window}</em>
            </li>
          </ol>
        </section>
        <section>
          <div className="pd-section-heading">
            <h3>Conjunto atribuído</h3>
            <span>Recursos do Job</span>
          </div>
          <dl className="pd-facts">
            <div>
              <dt>Veículo</dt>
              <dd>
                {job.truck} · {c.plate}
              </dd>
            </div>
            <div>
              <dt>Semirreboque</dt>
              <dd>{c.trailer} · lona / 33 paletes</dd>
            </div>
            <div>
              <dt>Após a entrega</dt>
              <dd>Descanso diário planeado · 20:00</dd>
            </div>
            <div>
              <dt>Próximo trabalho</dt>
              <dd>Regresso à base · amanhã 08:00</dd>
            </div>
          </dl>
        </section>
      </div>
      <Relation
        {...props}
        domain="Trucks"
        title={job.truck}
        detail={`${c.plate} · ${c.trailer} · ${c.range} km de autonomia`}
      />
      <Supports {...props} />
      <DemoNote />
    </article>
  );
}
export function TruckWork(props: Props) {
  const { state, act } = props,
    { job, c } = context(state),
    stop = c.stops.find((s) => s.id === state.selection.fuel) ?? c.stops[0];
  return (
    <article className="pd-work pd-truck" data-task="truck">
      <Header
        {...props}
        domain="Trucks"
        title={
          state.assignment.truck === "T-18" ? "DAF XF 450 · reserva" : job.truck
        }
        subtitle={`Veículo ${c.truckId} · Em serviço`}
      />
      <div className="pd-asset-identity" data-map-entity="resource">
        <strong>{c.plate}</strong>
        <span>{c.trailer} · conjunto articulado</span>
        <span className="pd-tag">A executar {job.id}</span>
      </div>
      <section className="pd-asset-vitals">
        <div>
          <span>Combustível</span>
          <strong>
            {c.fuel}
            <small>%</small>
          </strong>
          <meter min={0} max={100} value={c.fuel} />
        </div>
        <div>
          <span>Autonomia estimada</span>
          <strong>
            {c.range}
            <small>km</small>
          </strong>
          <p>Próxima paragem: {stop.name}</p>
        </div>
        <div>
          <span>Consumo do cenário</span>
          <strong>
            29<small>L/100 km</small>
          </strong>
          <p>Perfil misto · carga parcial</p>
        </div>
      </section>
      <section className="pd-capability">
        <div className="pd-section-heading">
          <h3>Carga e capacidade do conjunto</h3>
          <span>{parseInt(job.cargo)} / 33 posições palete</span>
        </div>
        <div className="pd-load-line" aria-label="18 de 33 posições ocupadas">
          {Array.from({ length: 33 }, (_, i) => (
            <span key={i} data-loaded={i < parseInt(job.cargo)} />
          ))}
        </div>
        <dl className="pd-capability-facts">
          <div>
            <dt>Mercadoria</dt>
            <dd>{job.cargo}</dd>
          </div>
          <div>
            <dt>Massa total do cenário</dt>
            <dd>
              {(
                14.8 +
                Number(
                  job.cargo.split("·")[1]?.replace("t", "").replace(",", "."),
                )
              )
                .toFixed(1)
                .replace(".", ",")}{" "}
              t <small>/ 40 t MMA</small>
            </dd>
          </div>
          <div>
            <dt>Comprimento / altura</dt>
            <dd>16,5 m / 4,0 m</dd>
          </div>
        </dl>
      </section>
      <div className="pd-truck-execution">
        <section>
          <div className="pd-section-heading">
            <h3>Execução do transporte</h3>
            <span>{job.progress}% concluído</span>
          </div>
          <progress max={100} value={job.progress} />
          <dl className="pd-facts">
            <div>
              <dt>Posição</dt>
              <dd>{c.location}</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd>
                {job.destination} · ETA {job.eta}
              </dd>
            </div>
            <div>
              <dt>Motorista</dt>
              <dd>
                {job.driver} · {c.driverId}
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <div className="pd-section-heading">
            <h3>Prontidão do ativo</h3>
            <span className="pd-tag">Em serviço</span>
          </div>
          <dl className="pd-facts">
            <div>
              <dt>Manutenção</dt>
              <dd>Revisão em 8.200 km · sem atenção crítica</dd>
            </div>
            <div>
              <dt>Disponibilidade</dt>
              <dd>Após descanso do motorista · amanhã 07:30</dd>
            </div>
            <div>
              <dt>Veículo do cenário</dt>
              <dd>
                <select
                  aria-label="Veículo atribuído DEV"
                  value={state.assignment.truck ?? c.truckId}
                  onChange={(e) =>
                    act({ type: "assign-truck", id: e.target.value })
                  }
                >
                  <option value={demoContext(job).truckId}>
                    {demoContext(job).truckId} · conjunto atual
                  </option>
                  {job.id === "J-4217" && (
                    <option value="T-18">
                      T-18 · reserva (F-07 incompatível)
                    </option>
                  )}
                </select>
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <Relation
        {...props}
        domain="Drivers"
        title={job.driver}
        detail="Turno e próxima etapa do recurso atribuído"
      />
      <Supports {...props} />
      <DemoNote />
    </article>
  );
}
export function FuelWork(props: Props) {
  const { state, act } = props,
    { job, c } = context(state),
    selected = c.stops.find((s) => s.id === state.selection.fuel),
    recommended = c.stops.find((s) => s.recommended) ?? c.stops[0],
    stop = selected ?? recommended;
  return (
    <article className="pd-work pd-fuel" data-task="fuel">
      <Header
        {...props}
        domain="Fuel"
        title="A próxima paragem"
        subtitle="Decisão de abastecimento · demonstração"
      />
      <section className="pd-fuel-verdict">
        <span className="pd-eyebrow">
          {selected ? "Opção selecionada" : "Proposta do cenário"} · {stop.id}
        </span>
        <div>
          <h3>{stop.name}</h3>
          <strong>
            €
            {(220 * Number(stop.price.replace(",", ".")))
              .toFixed(2)
              .replace(".", ",")}
            <small>220 L estimados</small>
          </strong>
        </div>
        <p>
          {selected
            ? `${stop.eta} de chegada, +${stop.detour} km e ${stop.parking.toLowerCase()}. A seleção mantém-se ao trabalhar nos recursos do Job.`
            : "Mirandela equilibra preço, desvio e pausa antecipada. Zamora custa menos, mas chega mais tarde; Bragança reduz o desvio."}
        </p>
      </section>
      <div className="pd-section-heading">
        <h3>Comparar alternativas</h3>
        <span>Preços e capacidade sintéticos</span>
      </div>
      <div
        className="pd-station-table"
        role="table"
        aria-label="Comparação de postos"
      >
        <div className="pd-station-labels" role="row">
          <span>Posto / relação com a rota</span>
          <span>Preço</span>
          <span>Desvio</span>
          <span>Chegada</span>
          <span>Pausa / parque</span>
          <span>220 L</span>
        </div>
        {c.stops.map((s) => (
          <button
            className="pd-station-row"
            key={s.id}
            aria-label={`Selecionar posto ${s.id} — ${s.name}`}
            aria-pressed={state.selection.fuel === s.id}
            data-selected={state.selection.fuel === s.id}
            data-map-entity="stop"
            data-entity-id={s.id}
            onClick={() => act({ type: "fuel", id: s.id })}
          >
            <span>
              <strong>{s.name}</strong>
              <small>{s.location}</small>
              <em>
                {s.recommended
                  ? "Proposta do cenário"
                  : s.id === "F-07"
                    ? "Menor desvio"
                    : "Menor preço · chegada tardia"}
              </em>
            </span>
            <span>
              €{s.price}
              <small>/L</small>
            </span>
            <span>
              +{s.detour}
              <small>km</small>
            </span>
            <span>{s.eta}</span>
            <span>
              <Check size={13} /> 45 min<small>{s.parking}</small>
            </span>
            <span>€{(220 * Number(s.price.replace(",", "."))).toFixed(0)}</span>
          </button>
        ))}
      </div>
      <div className="pd-fuel-consequence">
        <section>
          <div className="pd-section-heading">
            <h3>Consequência no plano</h3>
            <span>{stop.id}</span>
          </div>
          <ol className="pd-agenda">
            <li>
              <time>{stop.eta}</time>
              <span>
                <strong>Chegada à paragem</strong>
                <small>
                  {stop.parking} · pesados / sanitários / restauração
                </small>
              </span>
            </li>
            <li>
              <time>45 min</time>
              <span>
                <strong>Abastecimento e pausa combinados</strong>
                <small>220 L · autorização do cenário disponível</small>
              </span>
            </li>
            <li>
              <time>{job.eta}</time>
              <span>
                <strong>Entrega dentro da janela do cenário</strong>
                <small>
                  {job.destination} · {job.window}
                </small>
              </span>
            </li>
          </ol>
        </section>
        <section>
          <div className="pd-section-heading">
            <h3>Antes de confirmar</h3>
            <span>Contexto do Job</span>
          </div>
          <dl className="pd-facts">
            <div>
              <dt>Veículo / alcance</dt>
              <dd>
                {c.range} km · {c.fuel}% no depósito
              </dd>
            </div>
            <div>
              <dt>Motorista</dt>
              <dd>
                {state.exceptions.driverTimeCritical
                  ? "22 min · rever chegada prevista"
                  : "Pausa antes das 15:35 · compatível no cenário"}
              </dd>
            </div>
            <div>
              <dt>Acesso / autorização</dt>
              <dd>Entrada norte · comprovativo a receber</dd>
            </div>
          </dl>
          <button
            className="pd-text-action"
            aria-label="Inspecionar posto selecionado"
            onClick={() =>
              act({
                type: "inspect",
                takeover: { kind: "station", id: stop.id },
              })
            }
          >
            Ficha do posto <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      <Supports {...props} />
      <DemoNote />
    </article>
  );
}
export function DocumentsWork(props: Props) {
  const { state, act } = props,
    { job, c } = context(state),
    doc =
      c.documents.find((d) => d.id === state.selection.document) ??
      c.documents[0];
  return (
    <article className="pd-work pd-documents" data-task="documents">
      <Header
        {...props}
        domain="Documents"
        title="Dossier do transporte"
        subtitle="Documentação operacional"
      />
      <div className="pd-dossier-status">
        <span>
          <Check size={15} /> 2 documentos disponíveis
        </span>
        <span>1 pendente após entrega</span>
        <span>{job.customer}</span>
      </div>
      <div className="pd-document-grid">
        <nav
          aria-label="Documentos do transporte"
          className="pd-document-register"
        >
          <span className="pd-eyebrow">Obrigatórios / execução</span>
          {c.documents.map((d) => (
            <button
              key={d.id}
              aria-label={`Selecionar documento ${d.id}`}
              aria-pressed={d.id === doc.id}
              onClick={() => act({ type: "document", id: d.id })}
            >
              <FileText size={19} />
              <span>
                <strong>{d.title}</strong>
                <small>
                  {d.kind} · {d.pages} páginas
                </small>
                <em>{d.status}</em>
              </span>
            </button>
          ))}
          <div className="pd-document-relation">
            <span className="pd-eyebrow">Intervenientes conferidos</span>
            <p>
              {job.driver}
              <small>{c.driverId} · motorista atribuído</small>
            </p>
            <p>
              {c.plate}
              <small>{c.trailer} · conjunto do transporte</small>
            </p>
          </div>
        </nav>
        <section className="pd-document-preview">
          <div className="pd-section-heading">
            <span>{doc.id} · pré-visualização</span>
            <button
              className="pd-text-action"
              aria-label="Inspecionar documento"
              onClick={() =>
                act({
                  type: "inspect",
                  takeover: { kind: "document", id: doc.id },
                })
              }
            >
              <Maximize2 size={14} /> Ampliar
            </button>
          </div>
          <article className="pd-paper">
            <header>
              <span>FLEETOS / DOCUMENTO SINTÉTICO</span>
              <strong>{doc.id}</strong>
            </header>
            <h3>{doc.title}</h3>
            <div className="pd-paper-parties">
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
            <div className="pd-paper-route">
              {job.origin} <span>→</span> {job.destination}
            </div>
            <dl className="pd-facts">
              <div>
                <dt>Job / referência</dt>
                <dd>{job.id}</dd>
              </div>
              <div>
                <dt>Mercadoria</dt>
                <dd>{job.cargo}</dd>
              </div>
              <div>
                <dt>Motorista / veículo</dt>
                <dd>
                  {job.driver} · {c.plate}
                </dd>
              </div>
              <div>
                <dt>Entrega prevista</dt>
                <dd>
                  {job.eta} · {job.window}
                </dd>
              </div>
            </dl>
            <div className="pd-paper-approval">
              <Check size={19} />
              <div>
                <strong>{doc.status}</strong>
                <small>
                  {doc.status === "A aguardar entrega"
                    ? "Aguarda evento de entrega e assinatura"
                    : "Operações · validação do cenário às 09:18"}
                </small>
              </div>
            </div>
            <footer>
              Representação HTML de demonstração · sem validade operacional
            </footer>
          </article>
        </section>
        <aside className="pd-document-metadata">
          <span className="pd-eyebrow">Controlo do dossier</span>
          <dl className="pd-facts">
            <div>
              <dt>Tipo</dt>
              <dd>{doc.kind}</dd>
            </div>
            <div>
              <dt>Relacionado com</dt>
              <dd>
                {job.id} / {c.driverId} / {c.truckId}
              </dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{doc.status}</dd>
            </div>
            <div>
              <dt>Versão</dt>
              <dd>v2 · 06 out 2026</dd>
            </div>
          </dl>
          <div className="pd-section-heading">
            <h3>Histórico do cenário</h3>
          </div>
          <ol className="pd-document-history">
            <li>
              <time>08:52</time>
              <strong>Dossier preparado</strong>
              <span>Operações</span>
            </li>
            <li>
              <time>09:18</time>
              <strong>Intervenientes conferidos</strong>
              <span>Identidade e conjunto</span>
            </li>
            <li>
              <time>{job.eta}</time>
              <strong>Comprovativo pendente</strong>
              <span>Após descarga</span>
            </li>
          </ol>
        </aside>
      </div>
      <Supports {...props} />
      <DemoNote />
    </article>
  );
}
export function RestrictionsWork(props: Props) {
  const { state, act } = props,
    { job, c } = context(state),
    selected =
      c.restrictions.find((r) => r.id === state.selection.restriction) ??
      c.restrictions[0];
  return (
    <article className="pd-work pd-restrictions" data-task="restrictions">
      <Header
        {...props}
        domain="Restrictions"
        title="Condições da próxima etapa"
        subtitle="Road Intelligence · cenário sintético"
      />
      <div className="pd-restriction-headline">
        <ShieldCheck size={26} />
        <div>
          <strong>1 acesso compatível · 1 janela a confirmar</strong>
          <span>Não há bloqueio confirmado neste cenário.</span>
        </div>
      </div>
      <nav className="pd-condition-list" aria-label="Condições relevantes">
        {c.restrictions.map((r, i) => (
          <button
            key={r.id}
            aria-label={`Selecionar condição ${r.id}`}
            aria-pressed={r.id === selected.id}
            data-map-entity="restriction"
            data-entity-id={r.id}
            onClick={() => act({ type: "restriction", id: r.id })}
          >
            <span className="pd-condition-type">
              {i === 0 ? "ACESSO" : "JANELA"}
            </span>
            <span>
              <strong>{r.title}</strong>
              <small>
                {r.id} ·{" "}
                {i === 0 ? "Advisory / acesso" : "Validade temporal / entrega"}
              </small>
            </span>
            <em>{r.status}</em>
          </button>
        ))}
      </nav>
      <section
        className="pd-condition-detail"
        data-map-entity="restriction"
        data-entity-id={selected.id}
      >
        <div className="pd-section-heading">
          <h3>{selected.title}</h3>
          <span>{selected.id}</span>
        </div>
        <p className="pd-impact">{selected.description}</p>
        <dl className="pd-condition-facts">
          <div>
            <dt>Fonte</dt>
            <dd>Boletim operacional de demonstração</dd>
          </div>
          <div>
            <dt>Validade temporal</dt>
            <dd>
              06 out ·{" "}
              {selected.id.endsWith("058") ? job.window : "00:00–23:59"}
            </dd>
          </div>
          <div>
            <dt>Aplicabilidade do cenário</dt>
            <dd>Pesados articulados · 16,5 m / 4,0 m / 40 t MMA</dd>
          </div>
          <div>
            <dt>Conjunto relacionado</dt>
            <dd>
              {c.truckId} · {c.plate} / {c.trailer}
            </dd>
          </div>
          <div>
            <dt>Impacto no Job</dt>
            <dd>
              {selected.id.endsWith("058")
                ? "Confirmar descarga antes de entrar"
                : "Utilizar entrada norte do acesso"}
            </dd>
          </div>
          <div>
            <dt>Posto relacionado</dt>
            <dd>{state.selection.fuel ?? "F-03"} · abastecimento e pausa</dd>
          </div>
        </dl>
        <div className="pd-condition-caution">
          <ShieldCheck size={16} />
          <span>
            Aplicabilidade ilustrativa. Confirmar fonte e regra antes de uma
            decisão real de circulação.
          </span>
        </div>
        <button
          className="pd-text-action"
          aria-label="Inspecionar segmento"
          onClick={() =>
            act({
              type: "inspect",
              takeover: { kind: "segment", id: selected.id },
            })
          }
        >
          Inspecionar segmento <ArrowUpRight size={14} />
        </button>
      </section>
      <Supports {...props} />
      <DemoNote />
    </article>
  );
}

export function FuelSupport(props: Props) {
  const { state, act } = props,
    { c } = context(state),
    stop = c.stops.find((s) => s.id === state.selection.fuel) ?? c.stops[0];
  return (
    <article className="pd-work pd-fuel-support">
      <Header
        {...props}
        domain="Fuel"
        title="Condições da paragem"
        subtitle="Fuel · apoio à execução"
      />
      <div data-map-entity="stop" data-entity-id={stop.id}>
        <h3>{stop.name}</h3>
        <label>
          Paragem de apoio{" "}
          <select
            aria-label="Paragem de apoio"
            value={stop.id}
            onChange={(e) => act({ type: "fuel", id: e.target.value })}
          >
            {c.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.eta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pd-support-price">
        <strong>
          €{stop.price}
          <small>/L</small>
        </strong>
        <span>
          +{stop.detour} km · {stop.parking}
        </span>
      </div>
      <dl className="pd-facts">
        <div>
          <dt>Chegada / pausa</dt>
          <dd>{stop.eta} · 45 min</dd>
        </div>
        <div>
          <dt>Abastecimento</dt>
          <dd>220 L · autorização disponível</dd>
        </div>
        <div>
          <dt>Adequação ao cenário</dt>
          <dd>
            {state.exceptions.driverTimeCritical
              ? "Rever chegada antes da pausa"
              : "Pesados / sanitários / restauração"}
          </dd>
        </div>
      </dl>
      <button
        className="pd-text-action"
        aria-label="Expandir Fuel"
        onClick={() => act({ type: "expand", domain: "Fuel" })}
      >
        Comparar alternativas <ArrowUpRight size={13} />
      </button>
      <DemoNote />
    </article>
  );
}
export function ResourcesSupport(props: Props) {
  const { state } = props,
    { job, c } = context(state),
    assurance = state.lead === "Documents";
  return (
    <article className="pd-work pd-resource-support">
      <span className="pd-eyebrow">
        {assurance
          ? "Intervenientes relacionados"
          : "Capacidade de executar o plano"}
      </span>
      <Relation
        {...props}
        domain="Drivers"
        title={job.driver}
        detail={`${c.driverId} · ${assurance ? "Identidade conferida no dossier" : "Em condução · " + c.location}`}
      />
      {!assurance && (
        <div className="pd-support-time">
          <strong>
            {state.exceptions.driverTimeCritical ? "22 min" : "3h42"}
          </strong>
          <span>
            {state.exceptions.driverTimeCritical
              ? "Margem crítica: rever paragem"
              : "Condução diária disponível"}
          </span>
        </div>
      )}
      <Relation
        {...props}
        domain="Trucks"
        title={
          state.assignment.truck === "T-18" ? "DAF XF 450 · reserva" : job.truck
        }
        detail={`${c.plate} · ${c.trailer}`}
      />
      {!assurance && (
        <dl className="pd-facts">
          <div>
            <dt>Autonomia</dt>
            <dd>{c.range} km</dd>
          </div>
          <div>
            <dt>Depósito / consumo</dt>
            <dd>{c.fuel}% · 29 L/100 km</dd>
          </div>
          <div>
            <dt>Carga</dt>
            <dd>{job.cargo}</dd>
          </div>
        </dl>
      )}
      <DemoNote />
    </article>
  );
}
