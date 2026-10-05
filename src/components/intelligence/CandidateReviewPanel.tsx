import { useMemo, useState } from "react";
import { CURATED_GEOMETRIES, useIngestion } from "../../context/IngestionContext";
import { useRoadEvents } from "../../context/RoadEventsContext";
import { checkApproval, reviewState, type ReviewResolution } from "../../ingestion/review";
import type { CandidateConstraint } from "../../ingestion/types";

/*
 * Minimal human review for a REVIEW_REQUIRED candidate. Approval is blocked until every
 * operational fact is explicitly resolved and a verbatim source snippet is cited.
 */

type GeomChoice = "" | "source_lines" | "reviewer_lines" | `curated:${string}`;

/** "lat, lng" per line; a blank line starts a new polyline. */
export function parsePolylineText(text: string): [number, number][][] | null {
  const lines: [number, number][][] = [[]];
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) {
      if (lines.at(-1)!.length) lines.push([]);
      continue;
    }
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    lines.at(-1)!.push([Number(m[1]), Number(m[2])]);
  }
  const out = lines.filter((l) => l.length);
  return out.length ? out : null;
}

/** "YYYY-MM-DDTHH:MM -> YYYY-MM-DDTHH:MM" per line. */
export function parsePeriodsText(text: string): { start: string; end: string }[] | null {
  const out: { start: string; end: string }[] = [];
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(\S+)\s*(?:->|→)\s*(\S+)$/);
    if (!m) return null;
    out.push({ start: m[1]!, end: m[2]! });
  }
  return out;
}

const inputCls = "w-full rounded-md border border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1 text-[11px]";

export function CandidateReviewPanel({ c }: { c: CandidateConstraint }) {
  const ing = useIngestion();
  const { dataset } = useRoadEvents();
  const source = ing.sources.find((s) => s.id === c.sourceId);
  const record = ing.reviews.find((r) => r.candidateId === c.id);
  const state = record ? reviewState(record) : null;

  const [reviewer, setReviewer] = useState("");
  const [confirmClosure, setConfirmClosure] = useState(false);
  const [quote, setQuote] = useState("");
  const [geom, setGeom] = useState<GeomChoice>("");
  const [polyText, setPolyText] = useState("");
  const [veh, setVeh] = useState<"" | "all_traffic" | "gross_weight_over_kg">("");
  const [kg, setKg] = useState("3500");
  const [temporal, setTemporal] = useState<"" | "source_validity" | "periods">("");
  const [openEnded, setOpenEnded] = useState(false);
  const [periodsText, setPeriodsText] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string[] | null>(null);

  const resolution = useMemo((): { r: ReviewResolution; parseProblems: string[] } => {
    const parseProblems: string[] = [];
    let geometry: ReviewResolution["geometry"];
    if (geom === "source_lines") geometry = { kind: "source_lines" };
    else if (geom === "reviewer_lines") {
      const lines = parsePolylineText(polyText);
      if (!lines) parseProblems.push("polilinha: use «lat, lng» por linha");
      else geometry = { kind: "reviewer_lines", lines };
    } else if (geom.startsWith("curated:")) geometry = { kind: "curated", geometryId: geom.slice(8) };
    let temporalRes: ReviewResolution["temporal"];
    if (temporal === "source_validity") temporalRes = { kind: "source_validity", confirmOpenEnded: openEnded };
    else if (temporal === "periods") {
      const p = parsePeriodsText(periodsText);
      if (!p) parseProblems.push("períodos: use «AAAA-MM-DDTHH:MM -> AAAA-MM-DDTHH:MM» por linha");
      else temporalRes = { kind: "periods", periods: p };
    }
    const vehicles: ReviewResolution["vehicles"] =
      veh === "all_traffic" ? { kind: "all_traffic" } : veh === "gross_weight_over_kg" ? { kind: "gross_weight_over_kg", kg: Number(kg) } : undefined;
    return {
      r: { confirmClosure, evidenceQuote: quote, geometry, vehicles, temporal: temporalRes, ...(note.trim() ? { note: note.trim() } : {}) },
      parseProblems,
    };
  }, [geom, polyText, temporal, openEnded, periodsText, veh, kg, confirmClosure, quote, note]);

  const check = checkApproval(c, source, resolution.r, reviewer, CURATED_GEOMETRIES, new Date());
  const blockers = [...resolution.parseProblems, ...check.problems];
  const canApprove = blockers.length === 0 && check.unresolved.length === 0 && state !== "APPROVED" && state !== "REJECTED";
  const unknownFields = Object.entries(c.fields).filter(([, f]) => (f as { state: string }).state === "UNKNOWN").map(([k]) => k);
  const fr = ing.freshness[c.sourceId];
  const st = ing.states.find((s) => s.sourceId === c.sourceId);

  const act = async (a: Parameters<typeof ing.review>[0]) => {
    const res = await ing.review(a);
    setResult(res.ok ? [res.changed ? "Registado." : "Sem alterações (já registado)."] : res.problems);
  };

  return (
    <div className="space-y-2 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-soft)]/40 p-2 text-[11px]" data-testid="candidate-review">
      <p className="font-bold">Revisão humana {source?.synthetic && <span className="ml-1 rounded bg-[var(--prov-demo-soft)] px-1 text-[var(--prov-demo)]">TESTE SINTÉTICO</span>}</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[10px]">
        <dt className="font-semibold">Fonte</dt>
        <dd>{source?.name ?? c.sourceId} · nível {source?.trustTier} · {source?.authority}</dd>
        <dt className="font-semibold">URL / identificador</dt>
        <dd>
          <a className="underline" href={source?.landingUrl} target="_blank" rel="noreferrer">{source?.landingUrl}</a> · registo {c.externalId}
        </dd>
        <dt className="font-semibold">Obtido / publicado</dt>
        <dd>snapshot {c.snapshotId} · última obtenção {st?.lastSuccessAt ?? "—"} · publicação declarada {st?.publishedAt ?? "não declarada"}</dd>
        <dt className="font-semibold">Frescura</dt>
        <dd>{fr ? `${fr.state} — ${fr.reason}` : "desconhecida"}</dd>
        <dt className="font-semibold">Geometria da fonte</dt>
        <dd>{c.fields.geometry.value?.kind ?? "nenhuma"} · proveniência {c.fields.geometry.provenance}</dd>
        <dt className="font-semibold">Porque não foi ativado</dt>
        <dd>{c.gate.reasons.join(" · ")}</dd>
        <dt className="font-semibold">Factos por resolver</dt>
        <dd>{unknownFields.join(", ") || "—"}</dd>
      </dl>
      <p className="text-[10px]">
        <span className="font-semibold">Texto da fonte (literal):</span> <q>{c.fields.description.value ?? "—"}</q>
      </p>

      {record && (
        <div className="rounded bg-white/70 p-1.5 text-[10px]" data-testid="review-history">
          <p className="font-semibold">Estado da revisão: {state} · {ing.ingested.reviewStatus[c.id] ?? ""}</p>
          <ul className="list-disc pl-4">
            {record.history.map((e, i) => (
              <li key={i}>
                {e.at} · {e.action} por {e.reviewer}
                {e.reason ? ` — ${e.reason}` : ""}
                {e.provenance ? ` · proveniência: ${Object.entries(e.provenance).map(([k, p]) => `${k}=${p}`).join(", ")}` : ""}
                {e.datasetVersion ? ` · conjunto ${e.datasetVersion}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state !== "APPROVED" && state !== "REJECTED" && (
        <div className="space-y-1.5">
          <label className="block">
            Revisor <input className={inputCls} value={reviewer} onChange={(e) => setReviewer(e.target.value)} name="reviewer" />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={confirmClosure} onChange={(e) => setConfirmClosure(e.target.checked)} name="confirmClosure" />
            Confirmo que o texto da fonte descreve um corte (proibição de passagem)
          </label>
          <label className="block">
            Excerto literal da fonte que suporta a decisão
            <textarea className={inputCls} rows={2} value={quote} onChange={(e) => setQuote(e.target.value)} name="evidenceQuote" />
          </label>
          <label className="block">
            Geometria operacional
            <select className={inputCls} value={geom} onChange={(e) => setGeom(e.target.value as GeomChoice)} name="geometry">
              <option value="">— por resolver —</option>
              {c.fields.geometry.value?.kind === "lines" && <option value="source_lines">Linhas fornecidas pela fonte</option>}
              <option value="reviewer_lines">Polilinha indicada pelo revisor</option>
              {CURATED_GEOMETRIES.map((g) => (
                <option key={g.id} value={`curated:${g.id}`}>Geometria curada: {g.label}</option>
              ))}
            </select>
          </label>
          {geom === "reviewer_lines" && (
            <textarea className={`${inputCls} font-mono`} rows={4} placeholder={"41.1234, -8.6123\n41.1240, -8.6100"} value={polyText} onChange={(e) => setPolyText(e.target.value)} name="polyline" />
          )}
          <label className="block">
            Veículos abrangidos
            <select className={inputCls} value={veh} onChange={(e) => setVeh(e.target.value as typeof veh)} name="vehicles">
              <option value="">— por resolver —</option>
              <option value="all_traffic">Todo o trânsito</option>
              <option value="gross_weight_over_kg">Peso bruto superior a…</option>
            </select>
          </label>
          {veh === "gross_weight_over_kg" && <input className={inputCls} value={kg} onChange={(e) => setKg(e.target.value)} name="kg" />}
          <label className="block">
            Vigência
            <select className={inputCls} value={temporal} onChange={(e) => setTemporal(e.target.value as typeof temporal)} name="temporal">
              <option value="">— por resolver —</option>
              <option value="source_validity">Validade indicada pela fonte</option>
              <option value="periods">Períodos indicados pelo revisor (hora de Lisboa)</option>
            </select>
          </label>
          {temporal === "source_validity" && !c.fields.validity.value?.end && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} name="openEnded" />
              A fonte não indica fim — confirmo vigência em aberto até nova informação
            </label>
          )}
          {temporal === "periods" && (
            <textarea className={`${inputCls} font-mono`} rows={2} placeholder="2026-10-01T21:00 -> 2026-10-02T05:00" value={periodsText} onChange={(e) => setPeriodsText(e.target.value)} name="periods" />
          )}
          <label className="block">
            Nota / justificação
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} name="note" />
          </label>

          {(blockers.length > 0 || check.unresolved.length > 0) && (
            <ul className="list-disc pl-4 text-[10px] text-[var(--danger)]" data-testid="approval-blockers">
              {check.unresolved.map((u) => (
                <li key={u}>Por resolver: {u}</li>
              ))}
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canApprove}
              onClick={() => void act({ kind: "approve", candidateId: c.id, reviewer, resolution: resolution.r, datasetVersion: dataset.version })}
              className="rounded-md bg-[var(--accent)] px-2 py-1 font-semibold text-white disabled:opacity-40"
            >
              Aprovar e ativar
            </button>
            <input className={`${inputCls} max-w-xs`} placeholder="Motivo da rejeição" value={reason} onChange={(e) => setReason(e.target.value)} name="rejectReason" />
            <button type="button" onClick={() => void act({ kind: "reject", candidateId: c.id, reviewer, reason })} className="rounded-md bg-[var(--danger-soft)] px-2 py-1 font-semibold text-[var(--danger)]">
              Rejeitar
            </button>
          </div>
        </div>
      )}
      {state === "APPROVED" && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} max-w-[10rem]`} placeholder="Revisor" value={reviewer} onChange={(e) => setReviewer(e.target.value)} name="revokeReviewer" />
          <input className={`${inputCls} max-w-xs`} placeholder="Motivo da revogação" value={reason} onChange={(e) => setReason(e.target.value)} name="revokeReason" />
          <button type="button" onClick={() => void act({ kind: "revoke", candidateId: c.id, reviewer, reason })} className="rounded-md bg-[var(--neutral-soft)] px-2 py-1 font-semibold">
            Revogar aprovação
          </button>
        </div>
      )}
      {result && (
        <ul className="list-disc pl-4 text-[10px]" data-testid="review-result">
          {result.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
