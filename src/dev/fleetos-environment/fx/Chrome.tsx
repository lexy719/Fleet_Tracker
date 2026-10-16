import { useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  FileText,
  GitCompareArrows,
  Container,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Route,
  Scan,
  ShieldCheck,
  Signpost,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { GuidedAction, GuidedLens, GuidedState } from "../guidedWorkspace";
import {
  hasTransportGeometry,
  spatialActions,
  spatialLabel,
} from "../spatialQuestions";
import type { MapPlacement } from "../mapTypes";
import { NOW, PLAN_LABEL, SLA_LABEL, STATUS_LABEL, WORLD_JOBS } from "../world";
import { Id, Status } from "./honesty";
import { labWorld, LENS_LABEL } from "./model";
import { impactOf } from "./impact";
import { providerFor } from "../engine/synthetic";
import { entityLayers, entityRecipe, RECIPE_QUESTION } from "../entityRecipes";
import { mainLens } from "../guidedWorkspace";
import { sharedWork, usesSharedWork } from "../sharedComposition";
import { NavigationLayer } from "./NavigationLayer";
import { sharedScope, sharedWorkRows } from "../sharedReadModel";

type Act = (a: GuidedAction) => void;
const ENTITY_KIND: Record<string, string> = {
  driver: "Motorista",
  truck: "Viatura",
  trailer: "Reboque",
  document: "Documento",
  restriction: "Restrição",
  stop: "Paragem",
  job: "Transporte",
  jobs: "Operação",
};
/** The human name of the anchored object (read through the world adapter). */
export function entityTitle(state: GuidedState): string {
  const a = state.anchor;
  if (a.kind === "jobs") return "Operação";
  if (a.kind === "job") return a.id;
  return (
    providerFor(state)
      .entity({ kind: a.kind, id: a.id })
      ?.label.split(" · ")[0] ?? a.id
  );
}

const OP_VIEW: Partial<Record<GuidedLens, string>> = {
  Jobs: "Todos os transportes",
  Drivers: "Todos os motoristas",
  Trucks: "Toda a frota",
  Fuel: "Viagens em curso",
  Restrictions: "Restrições por transporte",
  Documents: "Registo documental",
};

/** One orientation line. The transport context is stated once, here. */
export function AnchorStrip({
  state,
  left,
  right,
  top,
  back,
  takeoverText,
  crumbs,
}: {
  state: GuidedState;
  left: number;
  right: number;
  top: number;
  back: () => void;
  takeoverText?: string;
  crumbs?: { label: string; go: () => void }[];
}) {
  const style: CSSProperties = { left, right, top };
  const crumbTrail =
    crumbs && crumbs.length > 0 ? (
      <span className="fx-crumbs" aria-label="Caminho">
        {crumbs.map((c, i) => (
          <span key={i}>
            <button data-ix="follow" onClick={c.go}>
              {c.label}
            </button>
            <i aria-hidden>›</i>
          </span>
        ))}
      </span>
    ) : null;
  if (state.anchor.kind === "jobs") {
    const rows = sharedWorkRows({ ...state, filter: "all" });
    const work = sharedWork(state);
    return (
      <div className="fx-strip-anchor fx-day-strip" style={style} role="banner">
        <span className="fx-strip-main">
          <b>Operação</b>
          <span className="fx-strip-sep" />
          <span className="fx-strip-quiet">{rows.length} transportes hoje</span>
          <Status tone="action">
            {rows.filter((row) => row.decisions.length > 0).length} a rever
          </Status>
          <span className="fx-strip-quiet">
            {
              WORLD_JOBS.filter((j) =>
                ["in_transit", "loading"].includes(j.status),
              ).length
            }{" "}
            em curso
          </span>
        </span>
        <span className="fx-strip-trail">
          {work ? (
            <b>{work.title}</b>
          ) : (
            state.active.length > 0 && (
              <>
                <b>{OP_VIEW[state.lead ?? "Jobs"]}</b>
                {state.active.filter((l) => l !== (state.lead ?? "Jobs"))
                  .length > 0 && (
                  <span>
                    {" "}
                    com{" "}
                    {state.active
                      .filter((l) => l !== (state.lead ?? "Jobs"))
                      .map((l) => LENS_LABEL[l].toLowerCase())
                      .join(", ")}
                  </span>
                )}
              </>
            )
          )}
          <span className="fx-strip-clock">
            {NOW.label} · <b>{NOW.clock}</b>
          </span>
        </span>
      </div>
    );
  }
  if (state.anchor.kind !== "job") {
    const w = labWorld(state);
    const layers = entityLayers(state);
    const recipe = entityRecipe(state);
    const work = usesSharedWork(state) ? sharedWork(state) : null;
    const scope = work ? sharedScope(state) : null;
    return (
      <div className="fx-strip-anchor" style={style} role="banner">
        <span className="fx-strip-main">
          {crumbTrail}
          <b>{entityTitle(state)}</b>
          <Id>{state.anchor.id}</Id>
          <span className="fx-strip-quiet">
            {ENTITY_KIND[state.anchor.kind]}
          </span>
          <span className="fx-strip-sep" />
          {state.anchor.job &&
          (!scope || scope.status === "SELECTED") &&
          providerFor(state).entity({ kind: "job", id: state.anchor.job }) ? (
            <span>
              {w.job.id} · {w.job.stops[0].city} → {w.job.stops.at(-1)!.city}
            </span>
          ) : (
            <span className="fx-strip-quiet">
              {scope?.status === "UNASSIGNED"
                ? "sem transporte associado"
                : state.anchor.job
                  ? "transporte não encontrado"
                  : "sem transporte hoje"}
            </span>
          )}
        </span>
        <span className="fx-strip-trail">
          {work ? (
            <b>{work.title}</b>
          ) : (
            layers.length > 0 && (
              <span>
                com {layers.map((l) => LENS_LABEL[l].toLowerCase()).join(" · ")}
              </span>
            )
          )}
          {recipe && state.active.length <= 1 && (
            <em className="fx-strip-question">{RECIPE_QUESTION[recipe]}</em>
          )}
          <span className="fx-strip-clock">
            {NOW.label} · <b>{NOW.clock}</b>
          </span>
        </span>
      </div>
    );
  }
  const w = labWorld(state);
  const j = w.job;
  const trail = state.active.filter((l) => l !== state.lead && l !== "Jobs");
  return (
    <div
      className="fx-strip-anchor"
      style={style}
      role="banner"
      data-takeover={!!state.takeover}
    >
      <span className="fx-strip-main">
        {crumbTrail}
        <Id>{j.id}</Id>
        <b>
          {j.stops[0].city} → {j.stops.at(-1)!.city}
        </b>
        <span className="fx-strip-quiet">{j.client}</span>
        <span className="fx-strip-sep" />
        <span>{STATUS_LABEL[j.status]}</span>
        <Status tone={j.sla === "on_track" ? "ok" : "risk"}>
          {SLA_LABEL[j.sla]}
        </Status>
        <Status
          tone={
            j.plan === "PLANNED"
              ? "ok"
              : j.plan === "REPLAN_REQUIRED"
                ? "action"
                : "neutral"
          }
        >
          {PLAN_LABEL[j.plan]}
        </Status>
        {j.priority !== "normal" && <Status tone="risk">Urgente</Status>}
      </span>
      {takeoverText ? (
        <span className="fx-strip-trail">
          <span>{takeoverText}</span>
          <button
            className="fx-strip-back"
            onClick={back}
            aria-label="Terminar inspeção e voltar"
          >
            <ArrowLeft size={14} /> Voltar <kbd>Esc</kbd>
          </button>
        </span>
      ) : (
        <span className="fx-strip-trail">
          {usesSharedWork(state) ? (
            <b>{sharedWork(state)!.title}</b>
          ) : state.lead && state.lead !== "Jobs" ? (
            <>
              <b>{LENS_LABEL[state.lead]}</b>
              {trail.length > 0 && (
                <span>
                  {" "}
                  com {trail.map((l) => LENS_LABEL[l].toLowerCase()).join(", ")}
                </span>
              )}
            </>
          ) : (
            <span>Visão do transporte</span>
          )}
          <span className="fx-strip-clock">
            {NOW.label} · <b>{NOW.clock}</b>
          </span>
        </span>
      )}
    </div>
  );
}

type RailItem = {
  lens?: GuidedLens;
  icon: LucideIcon;
  label: string;
  reserved?: boolean;
};
const RAIL: RailItem[][] = [
  [
    { lens: "Jobs", icon: BriefcaseBusiness, label: "Transportes" },
    { icon: GitCompareArrows, label: "Planear · reservado", reserved: true },
  ],
  [
    { lens: "Drivers", icon: Users, label: "Motorista" },
    { lens: "Trucks", icon: Truck, label: "Viatura" },
    { icon: Container, label: "Reboque · reservado", reserved: true },
  ],
  [
    { lens: "Fuel", icon: Route, label: "Percurso e paragens" },
    { lens: "Restrictions", icon: Signpost, label: "Restrições" },
  ],
  [
    { lens: "Documents", icon: FileText, label: "Documentos" },
    { icon: ShieldCheck, label: "Conformidade · reservado", reserved: true },
  ],
];

/** Rail grouped by semantic group. Active = dot, lead = filled. */
export function Rail({
  state,
  act,
  navigate,
  collection,
  back,
  canBack,
}: {
  state: GuidedState;
  act: Act;
  navigate: (domain: GuidedLens) => void;
  collection: (domain: GuidedLens) => void;
  back: () => void;
  canBack: boolean;
}) {
  const canMap = hasTransportGeometry(state);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  return (
    <>
    <aside className="fx-rail" aria-label="Lentes do workspace">
      <button ref={navigationTrigger} className="fx-mark fx-navigation-trigger" aria-label="Abrir navegação do ambiente"
        aria-expanded={navigationOpen} aria-controls="fx-navigation-layer" data-ix="inspect"
        onClick={() => setNavigationOpen((value) => !value)}>
        F
      </button>
      <div role="toolbar" aria-label="Domínios" className="fx-rail-groups">
        {RAIL.map((group, gi) => (
          <div className="fx-rail-group" key={gi}>
            {group.map((item) => {
              const Icon = item.icon;
              const main = usesSharedWork(state) ? null : mainLens(state);
              const active = item.lens
                ? state.active.includes(item.lens) || main === item.lens
                : false;
              const isMain = !!item.lens && main === item.lens;
              const order =
                item.lens && active && !isMain
                  ? state.active
                      .filter(
                        (l) =>
                          l !== main &&
                          l !== "Pricing DEV" &&
                          l !== "Compliance DEV",
                      )
                      .indexOf(item.lens) + 1
                  : 0;
              return (
                <div
                  className="fx-rail-item"
                  key={item.label}
                  data-state={
                    item.reserved
                      ? "reserved"
                      : isMain
                        ? "main"
                        : active
                          ? "content"
                          : "off"
                  }
                >
                  <button
                    aria-label={item.lens ?? item.label}
                    aria-pressed={active}
                    data-lead={isMain}
                    data-role={
                      item.reserved
                        ? "reserved"
                        : isMain
                          ? "lead"
                          : active
                            ? "support"
                            : "available"
                    }
                    data-layer={order || undefined}
                    data-reserved={!!item.reserved}
                    disabled={
                      item.reserved || (isMain && state.anchor.kind === "jobs")
                    }
                    data-ix={item.reserved ? undefined : "follow"}
                    // Another domain combines with the current page. The base
                    // domain returns to its collection without discarding this tab.
                    onClick={() =>
                      item.lens &&
                      (isMain
                        ? navigate(item.lens)
                        : act({ type: "content", domain: item.lens }))
                    }
                  >
                    <Icon size={17} strokeWidth={1.7} />
                  </button>
                  {item.lens && !isMain && (
                    <button
                      className="fx-rail-main"
                      data-ix="follow"
                      aria-label={`${active ? "Retirar" : "Adicionar"} conteúdo: ${item.label}`}
                      title={
                        active
                          ? "Abrir composição sem este conteúdo"
                          : "Abrir composição com este conteúdo"
                      }
                      onClick={() =>
                        act({ type: "content", domain: item.lens! })
                      }
                    >
                      <span aria-hidden>{active ? "−" : "+"}</span>
                    </button>
                  )}
                  <span role="tooltip">
                    {item.label}
                    <small>
                      {item.reserved
                        ? "Linguagem visual reservada"
                        : isMain
                          ? "Abrir coleção"
                          : active
                            ? "Abrir composição sem este conteúdo"
                            : "Combinar com o conteúdo desta página"}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="fx-rail-bottom">
        <div className="fx-rail-item">
          <button
            data-ix={state.mapFull || !canMap ? undefined : "spatial"}
            disabled={state.mapFull || !canMap}
            aria-label="Abrir mapa"
            onClick={() => act({ type: "map", intent: "open" })}
          >
            <MapIcon size={16} strokeWidth={1.7} />
          </button>
          <span role="tooltip">
            Mapa
            <small>
              {canMap
                ? "Geografia deste contexto"
                : "Contexto do transporte em falta"}
            </small>
          </span>
        </div>
        <div className="fx-rail-item">
          <button
            aria-label="Voltar à composição anterior"
            disabled={!canBack}
            onClick={back}
          >
            <ArrowLeft size={16} strokeWidth={1.7} />
          </button>
          <span role="tooltip">
            Voltar<small>Esc</small>
          </span>
        </div>
      </div>
    </aside>
    {navigationOpen && <NavigationLayer state={state} act={act} collection={collection}
      close={() => setNavigationOpen(false)} trigger={navigationTrigger.current} />}
    </>
  );
}

/** DEV controls live apart from the product rail. */
export function DevDrawer({
  state,
  act,
  openGraph,
  openSpecimen,
  reset,
}: {
  state: GuidedState;
  act: Act;
  openGraph: () => void;
  openSpecimen: () => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fx-dev" data-open={open}>
      <button
        className="fx-dev-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        DEV · 5.7I
      </button>
      {open && (
        <div className="fx-dev-panel" role="dialog" aria-label="Controlos DEV">
          <button onClick={openGraph}>Matriz de transições</button>
          <button onClick={openSpecimen}>
            Sistema de honestidade dos dados
          </button>
          <button onClick={() => act({ type: "stress" })}>
            Composição de stress · 8 lentes
          </button>
          <button
            aria-pressed={state.exceptions.driverTimeCritical}
            onClick={() => act({ type: "exception" })}
          >
            Exceção de condução (margem crítica)
          </button>
          <button
            aria-pressed={state.dev.staleBaseline}
            onClick={() => act({ type: "stale-baseline" })}
          >
            Base de horas desatualizada
          </button>
          <button
            aria-pressed={state.active.includes("Pricing DEV")}
            onClick={() => act({ type: "toggle", domain: "Pricing DEV" })}
          >
            Lente Economia · DEV
          </button>
          <button
            aria-pressed={state.active.includes("Compliance DEV")}
            onClick={() => act({ type: "toggle", domain: "Compliance DEV" })}
          >
            Lente Conformidade · DEV
          </button>
          <button
            onClick={() =>
              act({
                type: "assign-truck",
                id: state.assignment.truck === "T-18" ? "T-08" : "T-18",
              })
            }
          >
            Alternar viatura T-08 / T-18
          </button>
          <button onClick={reset}>Restaurar base</button>
          <small>Dados sintéticos · geometria TomTom/OSM gravada</small>
        </div>
      )}
    </div>
  );
}

/**
 * Staged change as an operational instrument: what changes, why, what stays,
 * which domains are affected and what remains uncertain. Uncertainty needs an
 * explicit acknowledgement before Confirm. Affected domains are followable.
 */
export function PendingBar({ state, act }: { state: GuidedState; act: Act }) {
  const [accepted, setAccepted] = useState(false);
  const impact = impactOf(state);
  if (!state.pending || !impact) return null;
  const needsAck = impact.uncertain.length > 0;
  return (
    <div
      className="fx-pending"
      role="region"
      aria-label="Alteração por confirmar"
      data-kind={state.pending.kind}
    >
      <div className="fx-pending-what">
        <span>Proposta · por confirmar</span>
        <b>
          {impact.title}: <s>{impact.from}</s> → <ins>{impact.to}</ins>
        </b>
        <small>{impact.why}</small>
      </div>
      <ul className="fx-pending-effects" aria-label="O que muda">
        {impact.changes.map((c) => (
          <li key={c.text} data-tone={c.tone}>
            <i aria-hidden>
              {c.tone === "ok"
                ? "✓"
                : c.tone === "unknown"
                  ? "?"
                  : c.tone === "action"
                    ? "!"
                    : c.tone === "history"
                      ? "⌂"
                      : "·"}
            </i>
            {c.text}
          </li>
        ))}
      </ul>
      <div className="fx-pending-side">
        <small>Mantém-se</small>
        <span>{impact.unchanged.join(" · ")}</span>
        <small>Afeta</small>
        <span className="fx-pending-domains">
          {impact.affected.map((d) => (
            <button
              key={d}
              data-ix={state.lead === d ? undefined : "follow"}
              disabled={state.lead === d}
              onClick={() => act({ type: "open", domain: d })}
              aria-pressed={state.lead === d}
            >
              {LENS_LABEL[d]}
            </button>
          ))}
        </span>
        <small>Evento</small>
        <code>{impact.event}</code>
      </div>
      {needsAck && (
        <label className="fx-accept">
          <input
            type="checkbox"
            data-ix="edit"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          Aceito a incerteza: {impact.uncertain.join(" · ").toLowerCase()}
        </label>
      )}
      <div className="fx-pending-actions">
        <button
          className="fx-btn"
          data-kind="quiet"
          data-ix="propose"
          onClick={() => act({ type: "discard" })}
        >
          Cancelar
        </button>
        <button
          className="fx-btn"
          data-kind="primary"
          data-ix="commit"
          disabled={needsAck && !accepted}
          onClick={() => act({ type: "commit" })}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

/** The map states its question; controls stay quiet. */
export function MapCaption({
  state,
  act,
  map,
  canFit,
}: {
  state: GuidedState;
  act: Act;
  map: MapPlacement;
  canFit: boolean;
}) {
  const label = spatialLabel(state);
  const options = spatialActions(state).filter(
    (a) => JSON.stringify(a.intent) !== JSON.stringify(state.spatial),
  );
  return (
    <nav
      className="fx-map-caption"
      aria-label="Pergunta espacial"
      data-compact={map.width < 520}
      data-spatial={state.mapFull}
      style={{
        left: map.x + 12 + (map.inset?.left ?? 0),
        top: map.y + 12,
        maxWidth:
          map.width - 70 - (map.inset?.left ?? 0) - (map.inset?.right ?? 0),
      }}
    >
      <div className="fx-map-q">
        <b>{label.title}</b>
        <span>{label.detail}</span>
      </div>
      <div className="fx-map-tools">
        <label className="fx-map-change">
          <span className="gw-sr-only">Mudar pergunta espacial</span>
          <select
            aria-label="Pergunta espacial"
            value=""
            onChange={(e) =>
              e.target.value &&
              act({ type: "spatial", intent: JSON.parse(e.target.value) })
            }
          >
            <option value="">Mudar</option>
            {options.map((a) => (
              <option key={a.label} value={JSON.stringify(a.intent)}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {state.mapIntent === "open" && !state.takeover && (
          <button
            data-ix="spatial"
            aria-label="Mapa automático"
            title="Voltar ao mapa automático"
            onClick={() => act({ type: "map", intent: "auto" })}
          >
            Auto
          </button>
        )}
        <button
          disabled={!canFit}
          data-ix="spatial"
          aria-label="Enquadrar rota ou entidade"
          title={canFit ? "Voltar a enquadrar a pergunta" : "Já enquadrado"}
          onClick={() => act({ type: "map", intent: "fit" })}
        >
          <Scan size={14} />
        </button>
        {state.mapFull ? (
          <button
            className="fx-map-exit"
            data-ix="spatial"
            aria-label="Sair do modo espacial"
            title="Sair do modo espacial"
            onClick={() => act({ type: "map-exit" })}
          >
            <Minimize2 size={14} /> Sair do mapa
          </button>
        ) : (
          (!state.takeover || state.takeover.kind === "segment") && (
            <button
              aria-label="Expandir mapa"
              data-ix="spatial"
              title="Mapa como espaço de trabalho"
              onClick={() => act({ type: "map", intent: "expand" })}
            >
              <Maximize2 size={14} />
            </button>
          )
        )}
      </div>
    </nav>
  );
}
