import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Users, Truck, Route, Signpost, FileText, X } from "lucide-react";
import type { GuidedAction, GuidedLens, GuidedState } from "../guidedWorkspace";
import { anchorJob } from "../guidedWorkspace";
import { sharedWork } from "../sharedComposition";
import { LENS_LABEL } from "./model";

const DOMAINS = [
  { id: "Jobs", icon: BriefcaseBusiness, detail: "Etapas, carga e decisões do transporte", material: "O trabalho" },
  { id: "Drivers", icon: Users, detail: "Pessoas, turnos e habilitações", material: "Quem conduz" },
  { id: "Trucks", icon: Truck, detail: "Conjunto, capacidade e medições", material: "Com que meios" },
  { id: "Fuel", icon: Route, detail: "Percurso, pausas e próximas paragens", material: "Por onde avançar" },
  { id: "Restrictions", icon: Signpost, detail: "Condições de passagem e factos em falta", material: "O que condiciona" },
  { id: "Documents", icon: FileText, detail: "Guias, versões e evidência do trabalho", material: "Com que evidência" },
] as const;

export function NavigationLayer({ state, act, collection, close, trigger }: {
  state: GuidedState; act: (action: GuidedAction) => void;
  collection: (domain: GuidedLens) => void; close: () => void;
  trigger: HTMLButtonElement | null;
}) {
  const panel = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<(typeof DOMAINS)[number]["id"]>("Drivers");
  const domain = DOMAINS.find((item) => item.id === selected)!;
  const included = state.active.includes(selected);
  const next = included ? state.active.filter((item) => item !== selected) : [...state.active, selected];
  const preview = sharedWork({ active: next });
  const job = anchorJob(state.anchor);
  useLayoutEffect(() => {
    const root = panel.current?.closest<HTMLElement>("main");
    if (root) root.dataset.navigationOpen = "true";
    panel.current?.querySelector<HTMLButtonElement>("[data-navigation-domain]")?.focus();
    return () => { if (root) delete root.dataset.navigationOpen; };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close(); trigger?.focus();
      }
      if (event.key !== "Tab") return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [close, trigger]);
  const dismiss = () => { close(); trigger?.focus(); };
  return <>
    <button className="fx-navigation-shade" aria-label="Fechar navegação" tabIndex={-1} data-ix="inspect" onClick={dismiss} />
    <section ref={panel} className="fx-navigation-layer" role="dialog" aria-modal="true" aria-labelledby="fx-navigation-title" id="fx-navigation-layer">
      <header>
        <div><span className="fx-navigation-eyebrow">FleetOS · ambiente de trabalho</span><h2 id="fx-navigation-title">Ligar o que precisa de decidir.</h2></div>
        <button className="fx-navigation-close" aria-label="Fechar menu" data-ix="inspect" onClick={dismiss}><X size={20} /></button>
      </header>
      <div className="fx-navigation-content">
        <nav aria-label="Conteúdo disponível">
          {DOMAINS.map(({ id, icon: Icon, material }) => <button key={id}
            data-navigation-domain={id} data-ix="inspect" aria-pressed={selected === id}
            onPointerEnter={() => setSelected(id)} onFocus={() => setSelected(id)} onClick={() => setSelected(id)}>
            <Icon size={20} strokeWidth={1.5} /><span><b>{LENS_LABEL[id]}</b><small>{material}</small></span>
            {state.active.includes(id) && <span className="fx-navigation-included">Ligado</span>}
            <ArrowRight size={16} />
          </button>)}
        </nav>
        <div className="fx-navigation-preview" aria-live="polite">
          <span className="fx-navigation-eyebrow">{job ? `Neste transporte · ${job}` : "No trabalho de hoje"}</span>
          <h3>{preview?.title ?? (next.length ? LENS_LABEL[selected] : "Operação")}</h3>
          <p>{preview?.question ?? domain.detail}</p>
          <div className="fx-navigation-relationship" aria-label="Conteúdo da composição resultante">
            {DOMAINS.filter((item) => next.includes(item.id)).map(({ id, icon: Icon }) =>
              <span key={id}><Icon size={19} /><span>{LENS_LABEL[id]}</span></span>,
            )}
            {!next.length && <span>O dia em movimento</span>}
          </div>
          <button className="fx-navigation-primary" data-ix="follow" onClick={() => { close(); act({ type: "content", domain: selected }); }}>
            {included ? `Retirar ${LENS_LABEL[selected].toLowerCase()}` : `Ligar ${LENS_LABEL[selected].toLowerCase()}`}<ArrowRight size={18} />
          </button>
          <button className="fx-navigation-collection" data-ix="follow" onClick={() => { close(); collection(selected); }}>
            Abrir coleção de {LENS_LABEL[selected].toLowerCase()}<ArrowRight size={16} />
          </button>
        </div>
      </div>
      <footer><span>{state.active.length ? `${state.active.length} conteúdos ligados à composição atual` : "Operação · escolher uma perspetiva ou ligar conteúdos"}</span><span>Fechar · Esc</span></footer>
    </section>
  </>;
}
