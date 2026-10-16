import type { ReactNode } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { GuidedAction, GuidedLens, GuidedState, Zone } from "../guidedWorkspace";
import { dur } from "../world";
import { Id, Plate, Status, Tri, Val } from "./honesty";
import { labWorld, LENS_LABEL } from "./model";

type Props = { state: GuidedState; act: (a: GuidedAction) => void; zone: Zone };

/**
 * Supports are fact columns, not mini-pages: no panel header, no repeated anchor.
 * Each fact answers the lead's question; lens controls appear on hover/focus.
 */
export function FactColumn({ state, act, zone }: Props) {
  const w = labWorld(state);
  const lead = state.lead;
  const lenses: GuidedLens[] =
    zone === "resources"
      ? (["Drivers", "Trucks"] as const).filter((l) => state.active.includes(l))
      : zone === "fuel"
        ? (["Fuel", "Restrictions"] as const).filter((l) => state.active.includes(l))
        : zone === "assurance"
          ? (["Documents", "Compliance DEV"] as const).filter((l) => state.active.includes(l))
          : (["Jobs"] as const).filter((l) => state.active.includes(l));
  const blocks: ReactNode[] = [];
  const job = w.job;
  const started = job.status === "in_transit" || job.status === "loading";
  const lastEta = job.stops.at(-1)!.eta;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const deliversFirst = !w.recommended && /\d/.test(lastEta) && toMin(lastEta) <= w.limitMin;
  const qual = w.driver.qualifications.find((q) => q.state === "EXPIRED" || q.state === "EXPIRING");
  for (const lens of lenses) {
    if (lens === "Drivers")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <div className="fx-fact-line" data-object={`driver:${w.driver.id}`}>
            <b>{w.driver.name}</b>
            <Id>{w.driver.id}</Id>
          </div>
          {lead === "Documents" ? (
            <>
              <span>{w.ledger[0].state === "ISSUED" ? "Identidade conferida na guia CMR" : "Será fixado na guia na emissão"}</span>
              {qual && (
                <Status tone={qual.state === "EXPIRED" ? "action" : "risk"}>
                  {qual.label} {qual.state === "EXPIRED" ? "caducado" : `a caducar · ${qual.until}`}
                </Status>
              )}
            </>
          ) : (
            !started ? (
              <Val label="Condução hoje" value="ainda não começou" size="s" prov={`início às ${job.stops[0].window[0]} · ${job.stops[0].city}`} />
            ) : deliversFirst ? (
              <Val
                label="Entrega antes do limite"
                value={`${job.stops.at(-1)!.city} ${lastEta}`}
                size="m"
                prov={`limite de 4h30 às ${w.limit} · ${dur(w.driver.spellMin)} contínuas`}
              />
            ) : (
            <>
              <Val
                label={w.stale ? "Pausa, pelo menos até" : "Pausa obrigatória até"}
                value={w.limit}
                size="m"
                state={w.stale ? "UNCERTAIN" : "KNOWN"}
                prov={`${dur(w.driver.spellMin)} contínuas · base ${w.stale ? "de ontem" : "manual 06:30"}`}
              />
              {w.selectedStop && (
                <span>
                  <Tri outcome={w.selectedStop.breakFits ? "yes" : "no"} /> {w.selectedStop.name.replace("Área de serviço de ", "")}{" "}
                  {w.selectedStop.breakFits ? `deixa ${w.selectedStop.marginMin} min` : "excede o limite"}
                </span>
              )}
            </>
            )
          )}
        </Fact>,
      );
    if (lens === "Trucks")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <div className="fx-fact-line">
            <b>
              {w.truck.make} {w.truck.model}
            </b>
            <span data-object={`truck:${w.truck.plate}`}>
              <Plate small>{w.truck.plate}</Plate>
            </span>
          </div>
          {lead === "Restrictions" ? (
            w.truck.firstAxleHeightM == null && w.restriction.all.some((p) => p.part === "firstAxle") ? (
              <>
                <Val label="Altura ao 1.º eixo" value="não registada" state="UNKNOWN" size="s" prov="registo da viatura · medição necessária" />
                <button data-ix="follow"
                  className="fx-link"
                  onClick={() => act({ type: "open", domain: "Trucks", focus: { kind: "vehicle", aspect: "restriction", part: "firstAxle" } })}
                >
                  Ver no alçado da viatura →
                </button>
              </>
            ) : (
              <span>
                {w.restriction.all.some((p) => p.part)
                  ? "Todos os factos da viatura usados por esta regra estão registados."
                  : "Esta regra não depende de factos da viatura."}
              </span>
            )
          ) : lead === "Documents" ? (
            <span>
              {w.trailer ? (
                <>
                  Reboque <Id>{w.trailer.plate}</Id> {w.ledger[0].state === "ISSUED" ? "igual ao da guia" : "a fixar na emissão"}
                </>
              ) : (
                <Status tone="blocker">Reboque {job.trailerId} não existe — guia bloqueada</Status>
              )}
            </span>
          ) : (
            <button data-ix="follow"
              className="fx-fact-pair fx-inline"
              onClick={() => act({ type: "open", domain: "Trucks", focus: { kind: "vehicle", aspect: "fuel" } })}
            >
              {w.positionKnown ? (
                <Val
                  label="Combustível agora"
                  value={`≈ ${Math.round(w.fuelNowPct)}%`}
                  size="m"
                  prov={{ kind: "ASSUMED", source: `de ${w.truck.fuel.value}% manual (${w.truck.fuel.prov.at})` }}
                />
              ) : (
                <Val label="Combustível" value={`${w.truck.fuel.value}%`} size="m" prov={w.truck.fuel.prov} />
              )}
              <Val
                label="Autonomia"
                value={`≈ ${w.rangeKm} km`}
                size="m"
                prov={{ kind: "ASSUMED", source: `${w.truck.consumptionL100.value} L/100 km` }}
              />
            </button>
          )}
        </Fact>,
      );
    if (lens === "Fuel")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          {w.recommended ? (
            <>
              <Val
                label={w.selectedStop ? "Paragem escolhida" : "Paragem recomendada"}
                value={(w.selectedStop ?? w.recommended).name.replace("Área de serviço de ", "")}
                size="m"
                prov={`${(w.selectedStop ?? w.recommended).arrival} · km ${(w.selectedStop ?? w.recommended).km} · ${(w.selectedStop ?? w.recommended).parking} lugares · sintético`}
              />
              <span>
                Coimbra às {(w.selectedStop ?? w.recommended).coimbraEta} · janela {job.stops.find((st) => st.id === "S2")?.window.join("–")}
              </span>
            </>
          ) : (
            <span>
              {!started
                ? `Ainda não partiu · ${job.stops[0].city} às ${job.stops[0].window[0]}`
                : deliversFirst
                  ? `Sem pausa necessária: entrega em ${job.stops.at(-1)!.city} às ${lastEta}`
                  : "Sem paragens candidatas registadas para esta viagem."}
            </span>
          )}
        </Fact>,
      );
    if (lens === "Restrictions")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <ul className="fx-fact-list">
            {w.restrictions.map((r) => (
              <li key={r.id}>
                <button data-ix="follow" className="fx-inline" onClick={() => act({ type: "open", domain: "Restrictions", restriction: r.id })} data-map-entity="restriction" data-entity-id={r.id}>
                  <Status tone={r.result === "UNKNOWN" ? "unknown" : r.result === "APPLIES" ? "risk" : "ok"}>
                    {r.result === "UNKNOWN" ? "Desconhecido" : r.result === "APPLIES" ? "Aplica-se" : "Não se aplica"}
                  </Status>
                  <span>{r.title.split(" — ")[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Fact>,
      );
    if (lens === "Documents")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <ul className="fx-fact-list">
            {w.ledger
              .filter((d) => d.state !== "VOID")
              .map((d) => (
                <li key={d.id}>
                  <button data-ix="follow" className="fx-inline" onClick={() => act({ type: "open", domain: "Documents", document: d.id })} data-map-entity="document" data-entity-id={d.id}>
                    <Status tone={d.state === "ISSUED" ? (d.diverges ? "risk" : "ok") : d.state === "MISSING" ? "action" : "unknown"}>
                      {d.title}
                    </Status>
                    <span>
                      {d.state === "ISSUED"
                        ? `emitida ${d.at}${d.diverges ? ` · difere em ${d.diverges} campos` : ""}`
                        : d.reason}
                    </span>
                  </button>
                </li>
              ))}
            {lead === "Restrictions" && w.restriction.id === "RI-042" && (
              <li>
                <Status tone="unknown">Habilitação VCI</Status> <span>não registada no dossier</span>
              </li>
            )}
          </ul>
        </Fact>,
      );
    if (lens === "Compliance DEV")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <span className="fx-quiet">Participação de conformidade · marcador DEV</span>
        </Fact>,
      );
    if (lens === "Jobs")
      blocks.push(
        <Fact key={lens} lens={lens} act={act}>
          <span>
            <Id>{w.jobId}</Id> {w.job.stops[0].city} → {w.job.stops.at(-1)!.city}
          </span>
        </Fact>,
      );
  }
  return <div className="fx-factcol">{blocks}</div>;
}

function Fact({
  lens,
  act,
  children,
}: {
  lens: GuidedLens;
  act: (a: GuidedAction) => void;
  children: ReactNode;
}) {
  return (
    <section className="fx-fact" data-lens={lens}>
      <span className="fx-fact-label">{LENS_LABEL[lens]}</span>
      <div className="fx-fact-tools">
        <button data-ix="follow" aria-label={`Expandir ${LENS_LABEL[lens]}`} title="Tornar principal" onClick={() => act({ type: "expand", domain: lens })}>
          <ArrowUpRight size={14} />
        </button>
        <button data-ix="inspect" aria-label={`Remover ${LENS_LABEL[lens]}`} title="Remover do contexto" onClick={() => act({ type: "toggle", domain: lens })}>
          <X size={14} />
        </button>
      </div>
      {children}
    </section>
  );
}

/** Inline consequence lines for active lenses that have no region of their own. */
export function ConsequenceLines({ state, act, exclude }: { state: GuidedState; act: (a: GuidedAction) => void; exclude: GuidedLens[] }) {
  const w = labWorld(state);
  const lines: { lens: GuidedLens; text: string; go: GuidedAction }[] = [];
  const cmr = w.ledger[0];
  const worst = w.restrictions.find((r) => r.result === "UNKNOWN") ?? w.restrictions.find((r) => r.result === "APPLIES") ?? w.restrictions[0];
  if (state.active.includes("Documents") && !exclude.includes("Documents") && state.lead !== "Documents")
    lines.push({
      lens: "Documents",
      text:
        cmr.state === "MISSING"
          ? "Guia CMR em falta — carga sem guia"
          : cmr.state === "DRAFT"
            ? `Guia CMR a emitir antes da partida às ${w.job.stops[0].window[0]}`
            : cmr.diverges
              ? `Guia CMR emitida · difere do atual em ${cmr.diverges} campos`
              : "Guia CMR emitida · igual ao transporte",
      go: { type: "open", domain: "Documents", document: cmr.id },
    });
  if (state.active.includes("Restrictions") && !exclude.includes("Restrictions") && state.lead !== "Restrictions")
    lines.push({
      lens: "Restrictions",
      text: `${worst.title.split(" — ")[0]} · ${worst.result === "UNKNOWN" ? "aplicabilidade desconhecida" : worst.answer}`,
      go: { type: "open", domain: "Restrictions", restriction: worst.id },
    });
  if (state.active.includes("Fuel") && !exclude.includes("Fuel") && state.lead !== "Fuel" && w.recommended)
    lines.push({
      lens: "Fuel",
      text: `Paragem ${(w.selectedStop ?? w.recommended).name.replace("Área de serviço de ", "")} · ${(w.selectedStop ?? w.recommended).arrival}`,
      go: { type: "open", domain: "Fuel", fuel: (w.selectedStop ?? w.recommended).id },
    });
  if (!lines.length) return null;
  return (
    <div className="fx-consequences">
      {lines.map((l) => (
        <button data-ix="follow" key={l.lens} className="fx-consequence-line" onClick={() => act(l.go)}>
          <span>{LENS_LABEL[l.lens]}</span>
          {l.text}
          <em>Ver →</em>
        </button>
      ))}
    </div>
  );
}
