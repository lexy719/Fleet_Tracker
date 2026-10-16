import type { CSSProperties } from "react";
import { DEMO_CONTENT, type DemoRow } from "./demoContent";
import type { Domain } from "./livingEnvironment";
import type { RepresentationDecision } from "./representationEngine";
import {
  dataShape,
  demoRows,
  DOMAIN_LIBRARY,
  type DataShape,
} from "./representationLibrary";

const columns: Record<Domain, string[]> = {
  Jobs: ["Movimento", "Janela / distância", "Carga / recursos", "Estado"],
  Drivers: ["Condutor", "Camião / localização", "Turno disponível", "Estado"],
  Trucks: ["Veículo", "Capacidade", "Disponibilidade", "Estado"],
  Fuel: ["Estação", "Corredor", "Preço / desvio", "Opção"],
  Restrictions: ["Segmento", "Âmbito demo", "Impacto", "Severidade"],
  Documents: ["Documento", "Tipo / referência", "Prontidão", "Estado"],
};
export type SelectEntity = (domain: Domain, id: string) => void;
function Timeline({ domain, rows }: { domain: Domain; rows: DemoRow[] }) {
  const labels: Record<Domain, string[]> = {
    Jobs: ["Origem", "Janela", "Paragem", "Destino"],
    Drivers: ["Condução", "Pausa", "Disponível", "Fim de turno"],
    Trucks: ["Inspeção", "Pronto", "Carga", "Saída"],
    Fuel: ["Rota", "Desvio", "Abastecer", "Regresso"],
    Restrictions: ["Entrada", "Trecho afetado", "Saída", "Rever"],
    Documents: ["Criado", "Revisão", "Completo", "Arquivo"],
  };
  return (
    <div className="liquid-timeline">
      {rows.slice(0, 6).map((r, i) => (
        <div key={r.id}>
          <strong>{r.title}</strong>
          <div className="liquid-timeline-track">
            {labels[domain].map((label, n) => (
              <span key={label} data-emphasis={n === i % 4}>
                <i />
                {label}
              </span>
            ))}
          </div>
          <small>{r.signal}</small>
        </div>
      ))}
    </div>
  );
}
function SelectedWorkspace({
  domain,
  rows,
  shape,
  onSelect,
}: {
  domain: Domain;
  rows: DemoRow[];
  shape: DataShape;
  onSelect?: SelectEntity;
}) {
  const selected = rows.find((r) => r.id === shape.selected) ?? rows[0];
  if (!selected) return <p className="liquid-empty">Sem itens sintéticos.</p>;
  return (
    <div className="liquid-workspace" data-domain={domain}>
      <nav aria-label={`Selecionar ${domain} demo`}>
        {rows.slice(0, 12).map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect?.(domain, r.id)}
            aria-pressed={selected.id === r.id}
          >
            {r.title}
            <small>{r.state}</small>
          </button>
        ))}
      </nav>
      <article>
        <span className="environment-eyebrow">{selected.id} / SYNTHETIC</span>
        <h3>{selected.title}</h3>
        {domain === "Documents" ? (
          <div className="liquid-paper">
            <b>CMR / DEMO</b>
            <dl>
              <dt>Referência</dt>
              <dd>{selected.id}</dd>
              <dt>Movimento</dt>
              <dd>Lisboa → Porto / exemplo</dd>
              <dt>Validade</dt>
              <dd>Documento sintético sem validade operacional</dd>
            </dl>
            <div className="liquid-paper-lines" />
          </div>
        ) : domain === "Jobs" ? (
          <>
            <div className="liquid-route-steps">
              {["Lisboa", "Paragem demo", "Porto"].map((s, i) => (
                <span key={s}>
                  <b>0{i + 1}</b>
                  {s}
                  <small>{["09:30", "12:20", "15:00"][i]}</small>
                </span>
              ))}
            </div>
            <dl>
              <dt>Recursos demo</dt>
              <dd>Ana Demo · DEMO-AA-01</dd>
              <dt>Janela</dt>
              <dd>{selected.signal}</dd>
              <dt>Documento</dt>
              <dd>CMR de demonstração</dd>
            </dl>
          </>
        ) : domain === "Fuel" ? (
          <>
            <div className="liquid-price">
              €1,62<small>/L · valor inventado</small>
            </div>
            <div className="liquid-key-metrics">
              <span>
                +6 km<small>desvio demo</small>
              </span>
              <span>
                12:20<small>ETA demo</small>
              </span>
              <span>
                30 min<small>pausa demo</small>
              </span>
            </div>
            <Timeline domain={domain} rows={[selected]} />
          </>
        ) : domain === "Drivers" ? (
          <>
            <div className="liquid-duty-clock">
              <b>4h20</b>
              <span>disponibilidade sintética</span>
            </div>
            <Timeline domain={domain} rows={[selected]} />
            <p>DEMO-AA-01 · DEMO-J01 · Porto / exemplo</p>
          </>
        ) : domain === "Trucks" ? (
          <>
            <div className="liquid-capacity">
              <span style={{ width: "68%" }}>14 t / 20 t</span>
            </div>
            <div className="liquid-key-metrics">
              <span>
                DEMO<small>matrícula inventada</small>
              </span>
              <span>
                68%<small>ocupação demo</small>
              </span>
              <span>
                Pronto<small>estado sintético</small>
              </span>
            </div>
            <Timeline domain={domain} rows={[selected]} />
          </>
        ) : (
          <>
            <div className="liquid-segment">
              <i />
              <strong>Trecho A</strong>
              <i data-alert />
              <strong>Trecho B</strong>
              <i />
            </div>
            <p>{selected.detail}</p>
            <dl>
              <dt>Impacto</dt>
              <dd>{selected.signal}</dd>
              <dt>Natureza</dt>
              <dd>Sinal fictício, sem regra operacional</dd>
            </dl>
          </>
        )}
        <p className="liquid-disclaimer">
          DEV / demonstração · sem dados ou decisões reais.
        </p>
      </article>
    </div>
  );
}
export function DomainGrammar({
  domain,
  decision,
  onSelect,
}: {
  domain: Domain;
  decision: RepresentationDecision;
  onSelect?: SelectEntity;
}) {
  const shape =
      decision.content?.[domain] ?? decision.facts ?? dataShape(domain),
    rows = demoRows(domain, shape),
    data = DEMO_CONTENT[domain],
    form = decision.form;
  const first = rows.find((r) => r.id === shape.selected) ?? rows[0];
  const entity = (r: DemoRow, index: number) => (
    <button
      className="liquid-entity"
      key={r.id}
      data-tone={r.tone}
      aria-pressed={r.id === shape.selected}
      onClick={() => onSelect?.(domain, r.id)}
      style={{ "--row-index": index } as CSSProperties}
    >
      <span>
        <small>{r.id}</small>
        <strong>{r.title}</strong>
        <small>{r.detail}</small>
      </span>
      <span>{r.signal}</span>
      <em>{r.state}</em>
    </button>
  );
  if (form === "indicator")
    return (
      <span className="environment-indicator-count">
        {shape.count}
        <small>demo</small>
      </span>
    );
  if (form === "micro-summary")
    return (
      <div className="liquid-micro">
        <b>{domain === "Fuel" ? data.metric : shape.count}</b>
        <span>
          {domain === "Drivers"
            ? "Disponibilidade de equipa"
            : domain === "Restrictions"
              ? "Sinais por rever"
              : domain === "Documents"
                ? "Prontidão do dossier"
                : data.unit}
          <small>{Math.round(shape.urgency * 100)}% prioridade demo</small>
        </span>
        <svg viewBox="0 0 110 30" aria-hidden>
          <path d="M1 26L18 18L34 22L50 8L68 14L85 5L109 11" />
        </svg>
      </div>
    );
  if (form === "strip")
    return (
      <div className="liquid-strip">
        {rows.slice(0, 3).map((r) => (
          <span key={r.id}>
            <strong>{r.title}</strong>
            <small>{r.signal}</small>
          </span>
        ))}
        {!rows.length && <span>Sem itens demo</span>}
      </div>
    );
  if (form === "vertical-strip")
    return (
      <div className="liquid-rail">
        <b>{shape.count}</b>
        {rows.slice(0, 5).map((r, i) => (
          <button key={r.id} onClick={() => onSelect?.(domain, r.id)}>
            <i>
              {domain === "Drivers"
                ? r.title[0]
                : domain === "Documents"
                  ? "▤"
                  : i + 1}
            </i>
            <strong>{r.title}</strong>
            <small>{r.state}</small>
          </button>
        ))}
      </div>
    );
  if (form === "contextual")
    return (
      <div className="liquid-floating">
        <span className="environment-eyebrow">
          {first?.id ?? "EMPTY"} / selecionado demo
        </span>
        <b>
          {domain === "Fuel"
            ? data.metric
            : domain === "Drivers"
              ? "4h20"
              : domain === "Trucks"
                ? "14 t"
                : shape.count}
        </b>
        <strong>{first?.title ?? "Sem itens sintéticos"}</strong>
        <small>{first?.signal}</small>
        <p>{first?.detail}</p>
      </div>
    );
  if (["workspace", "takeover"].includes(form))
    return (
      <SelectedWorkspace
        domain={domain}
        rows={rows}
        shape={shape}
        onSelect={onSelect}
      />
    );
  if (form === "timeline") return <Timeline domain={domain} rows={rows} />;
  if (form === "wide-list")
    return (
      <div className="liquid-ledger" data-domain={domain}>
        <div className="liquid-ledger-heading">
          {columns[domain].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        {rows.map(entity)}
      </div>
    );
  if (form === "dense-grid")
    return (
      <div className="liquid-dense" data-domain={domain}>
        {rows.map((r, i) => (
          <button
            key={r.id}
            onClick={() => onSelect?.(domain, r.id)}
            aria-pressed={r.id === shape.selected}
          >
            <span>
              {domain === "Drivers"
                ? r.title[0]
                : String(i + 1).padStart(2, "0")}
            </span>
            <strong>{r.title}</strong>
            <small>{r.state}</small>
            <em>{r.signal}</em>
          </button>
        ))}
      </div>
    );
  if (form === "flow")
    return (
      <div className="liquid-flow" data-domain={domain}>
        {rows.slice(0, 8).map((r, i) => (
          <button key={r.id} onClick={() => onSelect?.(domain, r.id)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <strong>{r.title}</strong>
            <small>{r.signal}</small>
            <em>{r.state}</em>
          </button>
        ))}
      </div>
    );
  if (form === "grid" && domain === "Jobs")
    return (
      <div className="liquid-kanban">
        {["Planeado", "Em curso", "Rever"].map((status, index) => (
          <div key={status}>
            <h3>{status}</h3>
            {rows.filter((_, i) => i % 3 === index).map(entity)}
          </div>
        ))}
      </div>
    );
  if (form === "grid" && domain === "Documents")
    return (
      <div className="liquid-gallery">
        {rows.map((r) => (
          <button key={r.id} onClick={() => onSelect?.(domain, r.id)}>
            <i>
              DEV
              <br />
              DOCUMENT
            </i>
            <strong>{r.title}</strong>
            <small>{r.state}</small>
          </button>
        ))}
      </div>
    );
  if (form === "grid")
    return (
      <div className="liquid-matrix" data-domain={domain}>
        {rows.map((r, i) => (
          <button key={r.id} onClick={() => onSelect?.(domain, r.id)}>
            <b>
              {domain === "Drivers"
                ? r.title[0]
                : domain === "Fuel"
                  ? ["€1,62", "€1,67", "€1,51", "€1,65"][i % 4]
                  : domain === "Trucks"
                    ? "20t"
                    : r.tone === "amber"
                      ? "!"
                      : "i"}
            </b>
            <strong>{r.title}</strong>
            <small>{r.signal}</small>
            <em>{r.state}</em>
          </button>
        ))}
      </div>
    );
  if (form === "analysis")
    return (
      <div className="liquid-analysis" data-domain={domain}>
        <div className="liquid-analysis-head">
          <b>{domain === "Fuel" ? data.metric : shape.count}</b>
          <span>
            {DOMAIN_LIBRARY[domain].find((f) => f.form === "analysis")?.title}
            <small>
              {Math.round(shape.urgency * 100)}% prioridade · valores sintéticos
            </small>
          </span>
        </div>
        <div className="liquid-chart">
          {rows.slice(0, 12).map((r, i) => (
            <div key={r.id}>
              <span>{r.title}</span>
              <i style={{ width: `${35 + ((i * 17) % 60)}%` }} />
              <small>{r.signal}</small>
            </div>
          ))}
        </div>
        <div className="liquid-analysis-footer">
          <Timeline domain={domain} rows={rows.slice(0, 2)} />
        </div>
      </div>
    );
  if (form === "relation")
    return <RelationGrammar decision={decision} onSelect={onSelect} />;
  return (
    <div className="liquid-list" data-domain={domain}>
      {rows.map(entity)}
    </div>
  );
}
export function RelationGrammar({
  decision,
  onSelect,
}: {
  decision: RepresentationDecision;
  onSelect?: SelectEntity;
}) {
  const members = decision.members.filter((a) => a !== "map") as Domain[],
    primary = members[0],
    related =
      members.length > 1
        ? members.slice(1)
        : primary === "Drivers"
          ? ["Trucks" as Domain]
          : primary === "Documents"
            ? ["Jobs" as Domain]
            : ["Fuel" as Domain, "Drivers" as Domain];
  if (!primary) return null;
  const primaryShape =
      decision.content?.[primary] ?? decision.facts ?? dataShape(primary),
    rows = demoRows(primary, primaryShape),
    entity = rows.find((r) => r.id === primaryShape.selected) ?? rows[0];
  if (
    [
      "indicator",
      "strip",
      "vertical-strip",
      "micro-summary",
      "contextual",
    ].includes(decision.form)
  ) {
    if (decision.form === "indicator")
      return (
        <span className="environment-indicator-count">
          {members.length}
          <small>ligados</small>
        </span>
      );
    return (
      <div
        className={
          decision.form === "strip" ? "liquid-strip" : "liquid-floating"
        }
      >
        <span>
          <strong>{entity?.title ?? primary}</strong>
          <small>{entity?.signal}</small>
        </span>
        {related.map((domain) => {
          const r = DEMO_CONTENT[domain].rows[0];
          return (
            <span key={domain}>
              <strong>{domain}</strong>
              <small>{r.signal}</small>
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div className="liquid-relation">
      <div className="liquid-relation-anchor">
        <span>RELAÇÃO SINTÉTICA</span>
        <h3>{entity?.title ?? primary}</h3>
        <p>{entity?.detail}</p>
        <b>{entity?.signal}</b>
      </div>
      <div className="liquid-relation-arms">
        {related.map((domain) => {
          const shape = decision.content?.[domain] ?? dataShape(domain),
            r = demoRows(domain, shape)[0];
          return (
            <button key={domain} onClick={() => r && onSelect?.(domain, r.id)}>
              <small>{domain} / DEMO</small>
              <strong>{r?.title ?? "Sem itens demo"}</strong>
              <span>{r?.signal}</span>
              <em>{r?.state}</em>
            </button>
          );
        })}
      </div>
      <div className="liquid-relation-register">
        <div className="liquid-ledger-heading">
          <span>{primary}</span>
          {related.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {rows.slice(0, 8).map((r) => (
          <div key={r.id}>
            <strong>{r.title}</strong>
            {related.map((domain) => (
              <span key={domain}>{DEMO_CONTENT[domain].rows[0].signal}</span>
            ))}
          </div>
        ))}
      </div>
      <small className="liquid-disclaimer">
        Ligação inventada · um workspace comum · sem cálculo operacional
      </small>
    </div>
  );
}
