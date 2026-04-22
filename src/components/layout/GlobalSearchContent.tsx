import { Search, Truck, User, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { drivers, jobs, trucks } from "../../data/mockData";
import { driversUrl, jobsUrl, mapUrl } from "../../lib/appLinks";

type Hit =
  | { kind: "job"; id: string; label: string; sub: string; to: string }
  | { kind: "truck"; id: string; label: string; sub: string; to: string }
  | { kind: "driver"; id: string; label: string; sub: string; to: string };

function match(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function GlobalSearchContent({ onPick }: { onPick: () => void }) {
  const [q, setQ] = useState("");

  const hits = useMemo((): Hit[] => {
    const needle = q.trim();
    if (needle.length < 2) return [];

    const out: Hit[] = [];

    for (const j of jobs) {
      if (
        match(j.id, needle) ||
        match(j.client, needle) ||
        j.stops.some((s) => match(s.city, needle) || match(s.clientName, needle))
      ) {
        const to =
          j.assignedTruckId != null
            ? mapUrl({ truck: j.assignedTruckId, job: j.id })
            : jobsUrl(j.id);
        out.push({
          kind: "job",
          id: j.id,
          label: j.id,
          sub: `${j.client} · ${j.status}`,
          to,
        });
      }
    }

    for (const t of trucks) {
      if (match(t.id, needle) || match(t.plate, needle) || match(t.name, needle)) {
        out.push({
          kind: "truck",
          id: t.id,
          label: t.plate,
          sub: t.name,
          to: mapUrl({ truck: t.id }),
        });
      }
    }

    for (const d of drivers) {
      if (match(d.id, needle) || match(d.name, needle) || match(d.homeTerminal, needle)) {
        out.push({
          kind: "driver",
          id: d.id,
          label: d.name,
          sub: d.homeTerminal,
          to: driversUrl(d.id),
        });
      }
    }

    return out.slice(0, 24);
  }, [q]);

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
      >
        <Search className="h-4 w-4 shrink-0 opacity-60" style={{ color: "var(--app-muted)" }} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Matrícula, trabalho, motorista, cidade… (mín. 2 caracteres)"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: "var(--app-fg)" }}
        />
      </div>

      {q.trim().length < 2 ? (
        <p className="text-sm" style={{ color: "var(--app-muted)" }}>
          Escreva pelo menos dois caracteres para pesquisar nos dados de demonstração.
        </p>
      ) : hits.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--app-muted)" }}>
          Sem resultados. Experimente matrícula (ex. <span className="font-mono">00-AA-00</span>) ou código de trabalho.
        </p>
      ) : (
        <ul className="max-h-[min(60vh,420px)] space-y-1 overflow-y-auto scroll-thin pr-1">
          {hits.map((h) => {
            const Icon = h.kind === "job" ? Package : h.kind === "truck" ? Truck : User;
            return (
              <li key={`${h.kind}-${h.id}`}>
                <Link
                  to={h.to}
                  onClick={() => onPick()}
                  className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] px-3 py-2.5 transition hover:bg-black/[0.03]"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#2D5F4E]" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold" style={{ color: "var(--app-fg)" }}>
                      {h.label}
                    </div>
                    <div className="text-xs" style={{ color: "var(--app-muted)" }}>
                      {h.kind === "job" ? "Trabalho" : h.kind === "truck" ? "Viatura" : "Motorista"} · {h.sub}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <Link
          to="/app/map"
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D5F4E] hover:underline"
          onClick={onPick}
        >
          Mapa da frota
        </Link>
        <Link to="/app/jobs" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D5F4E] hover:underline" onClick={onPick}>
          Trabalhos
        </Link>
        <Link
          to="/app/dispatch"
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D5F4E] hover:underline"
          onClick={onPick}
        >
          Dispatch
        </Link>
      </div>
    </div>
  );
}
