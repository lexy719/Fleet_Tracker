import { Plate, Status, Tri, Val, Id, Ref } from "./honesty";

/** DEV reference sheet: one visual language for every honesty state. */
export function HonestySpecimen({ close }: { close: () => void }) {
  return (
    <div className="fx-specimen" role="dialog" aria-label="Sistema de honestidade dos dados">
      <header>
        <div>
          <h1>Honestidade dos dados</h1>
          <p>
            O estado de um valor muda o próprio valor — nunca um selo à parte. A proveniência é uma segunda linha
            discreta.
          </p>
        </div>
        <button className="fx-btn" onClick={close}>
          Fechar
        </button>
      </header>
      <div className="fx-specimen-grid">
        <Cell name="Conhecido" rule="Tinta plena · fonte e hora na segunda linha">
          <Val label="Odómetro" value="412 380 km" size="m" prov={{ kind: "KNOWN", source: "manual", at: "ontem 19:10" }} />
        </Cell>
        <Cell name="Desconhecido" rule="Tracejado diagonal · nunca um zero ou um traço">
          <Val label="Altura ao 1.º eixo" value="não registada" state="UNKNOWN" size="m" prov="facto usado pela VCI" />
        </Cell>
        <Cell name="Assumido" rule="Sublinhado tracejado · diz o pressuposto">
          <Val label="Autonomia" value="≈ 178 km" size="m" prov={{ kind: "ASSUMED", source: "29 L/100 km do cenário" }} />
        </Cell>
        <Cell name="Desatualizado" rule="Intensidade reduzida + relógio · diz quando">
          <Val label="Base de horas" value="3h20" size="m" prov={{ kind: "STALE", source: "registada", at: "ontem 18:40" }} />
        </Cell>
        <Cell name="Simulado" rule="Sublinhado pontilhado · anel pontilhado no mapa">
          <Val label="Posição" value="Carregado · km 282" size="m" prov={{ kind: "SIMULATED", source: "sem telemetria" }} />
          <span className="fx-specimen-pin" aria-hidden />
        </Cell>
        <Cell name="Incerto" rule="Ondulado âmbar · decisão exige aceitação">
          <Val label="Pausa, pelo menos até" value="11:15" size="m" state="UNCERTAIN" prov="limite real pode ser antes" />
        </Cell>
        <Cell name="Erro" rule="Frase direta · o que falhou e o que fazer">
          <p className="fx-specimen-error">Não foi possível obter a rota TomTom. Os dados do plano anterior continuam visíveis.</p>
        </Cell>
        <Cell name="A carregar" rule="Esqueleto com a forma final · sem animação ruidosa">
          <span className="fx-specimen-skeleton" aria-busy />
        </Cell>
        <Cell name="Vazio" rule="Diz porquê e o próximo passo">
          <p className="fx-quiet">Sem paragens candidatas neste transporte. A pausa pode ser feita no destino.</p>
        </Cell>
      </div>
      <div className="fx-specimen-row">
        <div>
          <h2>Estado</h2>
          <div className="fx-specimen-statuses">
            <Status tone="ok">Dentro do plano</Status>
            <Status tone="risk">Risco</Status>
            <Status tone="action">Ação necessária</Status>
            <Status tone="blocker">Bloqueio</Status>
            <Status tone="unknown">Desconhecido</Status>
            <Status tone="info">Informação</Status>
          </div>
        </div>
        <div>
          <h2>Seleção ≠ sucesso</h2>
          <p className="fx-quiet">Seleção = contorno a tinta. Recomendação = losango da marca. Verde só para «dentro do plano».</p>
        </div>
        <div>
          <h2>Lógica</h2>
          <span className="fx-specimen-tri">
            <Tri outcome="yes" /> confirmado <Tri outcome="no" /> não se verifica <Tri outcome="unknown" /> em falta
          </span>
        </div>
        <div>
          <h2>Identificadores</h2>
          <span className="fx-specimen-tri">
            <Id>J-4217</Id> <Plate small>AA-42-ZP</Plate> <Ref>DL 155-A/2026 · art. 2.º</Ref>
          </span>
        </div>
      </div>
    </div>
  );
}
function Cell({ name, rule, children }: { name: string; rule: string; children: React.ReactNode }) {
  return (
    <section className="fx-specimen-cell">
      <h2>{name}</h2>
      <div className="fx-specimen-body">{children}</div>
      <small>{rule}</small>
    </section>
  );
}
