import { W } from "./world/active";
import { Row } from "./types";

export const SEV = { BLOCKER: "Bloqueio", ACTION_REQUIRED: "Ação necessária", RISK: "Risco", INFORMATION: "Info" } as const;

/* ─── Attention ─────────────────────────────────────────────────────────── */

export function AttentionStack({ onOpen, jobs }: { onOpen: (jobId: string) => void; jobs: Row[] }) {
  // An item disappears once the office has resolved what its transport needed.
  const solved = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    return !!j && Object.keys(j.edit).length > 0 && (j.tone === "ok" || j.tone === "idle");
  };
  const open = W().attention.filter((a) => a.severity !== "INFORMATION" && !solved(a.jobId));
  const done = new Set(W().attention.filter((a) => solved(a.jobId)).map((a) => a.jobId)).size;
  const items = open.slice(0, 4);
  return (
    <aside className="attention" aria-label="Precisa de atenção">
      <span className="eyebrow">
        Precisa de atenção{done > 0 && <em className="att-done"> · {done} resolvido{done > 1 ? "s" : ""}</em>}
      </span>
      {!items.length && <p className="att-clear">Tudo resolvido por agora.</p>}
      {items.map((a, i) => (
        <button key={a.id} className="att" data-sev={a.severity} onClick={() => onOpen(a.jobId)} style={{ animationDelay: `${200 + i * 70}ms` }}>
          <span className="att-sev">
            {SEV[a.severity]} · {a.subject}
          </span>
          <b>{a.what}</b>
          <span className="att-next">{a.next} →</span>
        </button>
      ))}
    </aside>
  );
}
