// DEV-only office workspace built from the screens chosen in the design review
// (docs/visual-exploration). Synthetic lab world only; no production state.
import { useEffect } from "react";
import { NOW } from "../fleetos-environment/world";
import { WorkspaceProvider, useWs, type View } from "./store";
import { AssignWizard, Dia, Hoje, Inbox, Operacao, Planeamento, Quadro, Tabela, TransportDetail } from "./views";
import "./workspace.css";

const NAV: [View, string, string][] = [
  ["hoje", "Hoje", "☀"],
  ["inbox", "Precisa de mim", "✉"],
  ["operacao", "Operação", "⌖"],
  ["dia", "O dia", "◷"],
  ["quadro", "Quadro", "▥"],
  ["tabela", "Tabela", "▤"],
  ["planeamento", "Planeamento", "▦"],
];

function Shell() {
  const ws = useWs();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ws.wizard) ws.setWizard(null);
      else if (ws.openJob) ws.setOpenJob(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ws]);
  const V = { hoje: Hoje, inbox: Inbox, operacao: Operacao, dia: Dia, quadro: Quadro, tabela: Tabela, planeamento: Planeamento }[ws.view];
  return (
    <div className="fw">
      <nav className="fw-side" aria-label="Navegação">
        <div className="fw-logo"><i /><span>FleetOS</span></div>
        {NAV.map(([v, l, ic], i) => (
          <div key={v}>
            {i === 2 && <div className="fw-sep">Ver</div>}
            {i === 4 && <div className="fw-sep">Gerir</div>}
            <button className="fw-nav" aria-current={ws.view === v && !ws.openJob ? "page" : undefined} onClick={() => ws.setView(v)}>
              <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>{ic}</span><span>{l}</span>
              {v === "inbox" && ws.attention.length > 0 && <span className="n">{ws.attention.length}</span>}
            </button>
          </div>
        ))}
        <div className="foot">
          {NOW.label} · {NOW.clock}<br />Dados de demonstração<br />
          <button className="btn sm" style={{ marginTop: 8 }} onClick={ws.reset}>Repor dados</button>
        </div>
      </nav>
      <main className="fw-main">{ws.openJob ? <TransportDetail id={ws.openJob} /> : <V />}</main>
      {ws.wizard && <AssignWizard id={ws.wizard} />}
      {ws.toast && <div className="toast" role="status">{ws.toast}</div>}
    </div>
  );
}

export default function FleetWorkspace() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}
