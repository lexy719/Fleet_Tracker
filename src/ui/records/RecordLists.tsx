import { Plus, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useOperations } from "../../context/OperationsContext";
import type { Customer, Site } from "../../data/types";
import { siteCoordinatesCurrent } from "../../domain/records/records";
import { Button, EmptyState, Pill, Segmented } from "../kit";
import { CustomerEditor, SiteEditor } from "./RecordEditors";

/** Accent/case-insensitive match used by every record search. */
export const fold = (s: string | undefined) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type Scope = "active" | "archived";

function Toolbar({ q, setQ, scope, setScope, placeholder, onNew, newLabel }: { q: string; setQ: (v: string) => void; scope: Scope; setScope: (s: Scope) => void; placeholder: string; onNew: () => void; newLabel: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
        <input className="ui-input pl-8" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      <Segmented label="Estado" value={scope} onChange={setScope} items={[{ value: "active", label: "Ativos" }, { value: "archived", label: "Arquivados" }]} />
      <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onNew}>{newLabel}</Button>
    </div>
  );
}

export function CustomersList() {
  const { state } = useOperations();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const dq = fold(useDeferredValue(q));
  const usage = useMemo(() => {
    const m = new Map<string, { jobs: number; sites: number }>();
    for (const j of state.jobs) if (j.customerId) m.set(j.customerId, { jobs: (m.get(j.customerId)?.jobs ?? 0) + 1, sites: m.get(j.customerId)?.sites ?? 0 });
    for (const s of state.sites) if (s.customerId && !s.archivedAt) m.set(s.customerId, { jobs: m.get(s.customerId)?.jobs ?? 0, sites: (m.get(s.customerId)?.sites ?? 0) + 1 });
    return m;
  }, [state.jobs, state.sites]);
  const rows = state.customers
    .filter((c) => (scope === "active" ? !c.archivedAt : !!c.archivedAt))
    .filter((c) => !dq || fold(`${c.name} ${c.nif ?? ""} ${c.contactName ?? ""} ${c.email ?? ""}`).includes(dq))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return (
    <div>
      <Toolbar q={q} setQ={setQ} scope={scope} setScope={setScope} placeholder="Procurar por nome, NIF, contacto…" onNew={() => setEdit("new")} newLabel="Novo cliente" />
      {rows.length ? (
        <table className="ui-table">
          <thead><tr><th>Cliente</th><th>NIF</th><th>Contacto</th><th className="r">Locais</th><th className="r">Trabalhos</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-[var(--surface-2)]" onClick={() => setEdit(c)}>
                <td className="font-medium">{c.name}{c.isDemo ? <Pill className="ml-2">Demo</Pill> : null}</td>
                <td className="num text-[var(--text-2)]">{c.nif ?? "—"}</td>
                <td className="text-[var(--text-2)]">{[c.contactName, c.phone ?? c.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="num r">{usage.get(c.id)?.sites ?? 0}</td>
                <td className="num r">{usage.get(c.id)?.jobs ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={q ? "Nenhum cliente corresponde à pesquisa" : scope === "archived" ? "Sem clientes arquivados" : "Ainda sem clientes"} />
      )}
      {edit ? <CustomerEditor customer={edit === "new" ? undefined : edit} initialName={edit === "new" ? q : undefined} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

export function SitesList() {
  const { state } = useOperations();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [edit, setEdit] = useState<Site | "new" | null>(null);
  const dq = fold(useDeferredValue(q));
  const customerName = useMemo(() => new Map(state.customers.map((c) => [c.id, c.name])), [state.customers]);
  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of state.jobs) for (const s of new Set(j.stops.map((x) => x.siteId).filter(Boolean) as string[])) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  }, [state.jobs]);
  const rows = state.sites
    .filter((s) => (scope === "active" ? !s.archivedAt : !!s.archivedAt))
    .filter((s) => !dq || fold(`${s.name} ${s.address} ${s.locality ?? ""} ${s.postalCode ?? ""} ${customerName.get(s.customerId ?? "") ?? ""}`).includes(dq))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return (
    <div>
      <Toolbar q={q} setQ={setQ} scope={scope} setScope={setScope} placeholder="Procurar por nome, morada, localidade, cliente…" onNew={() => setEdit("new")} newLabel="Novo local" />
      {rows.length ? (
        <table className="ui-table">
          <thead><tr><th>Local</th><th>Localidade</th><th>Cliente</th><th>Coordenadas</th><th className="r">Trabalhos</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-[var(--surface-2)]" onClick={() => setEdit(s)}>
                <td><span className="block font-medium">{s.name}{s.isDemo ? <Pill className="ml-2">Demo</Pill> : null}</span><span className="block truncate text-[12px] text-[var(--text-3)]">{s.address}</span></td>
                <td className="text-[var(--text-2)]">{s.locality ?? "—"}</td>
                <td className="text-[var(--text-2)]">{customerName.get(s.customerId ?? "") ?? "—"}</td>
                <td>{siteCoordinatesCurrent(s) ? <span className="num text-[12px] text-[var(--text-2)]">{s.lat.toFixed(3)}, {s.lng.toFixed(3)}</span> : <Pill tone="warn">Rever coordenadas</Pill>}</td>
                <td className="num r">{uses.get(s.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={q ? "Nenhum local corresponde à pesquisa" : scope === "archived" ? "Sem locais arquivados" : "Ainda sem locais"} />
      )}
      {edit ? <SiteEditor site={edit === "new" ? undefined : edit} initial={edit === "new" ? { name: q } : undefined} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
