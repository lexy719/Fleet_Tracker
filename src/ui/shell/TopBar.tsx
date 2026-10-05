import clsx from "clsx";
import { Bell, Briefcase, Building2, Container, FileText, MapPin, Plus, Search, Truck, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOpsAlerts } from "../../context/FleetDataContext";
import { useOperations } from "../../context/OperationsContext";
import type { OpsAlert } from "../../data/types";
import { alertHref } from "../../lib/appLinks";
import { fmtClock, fmtLongDate } from "../format";
import { Button, MenuItem, Popover, ProvenanceTag } from "../kit";
import { ALERT_GROUP, ALERT_ORDER, toneVars } from "../status";
import { buildSearchIndex, searchAll, type SearchHit } from "../search/globalSearch";
import { useEditors } from "./editors";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

type Hit = SearchHit;

function GlobalSearch() {
  const { state } = useOperations();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const { jobs, trucks, trailers, drivers, customers, sites, documents } = state;
  const index = useMemo(() => buildSearchIndex({ jobs, trucks, trailers, drivers, customers, sites, documents }), [jobs, trucks, trailers, drivers, customers, sites, documents]);
  const hits = useMemo<Hit[]>(() => searchAll(index, q), [index, q]);

  const go = (h: Hit) => {
    navigate(h.to);
    setOpen(false);
    setQ("");
    input.current?.blur();
  };
  const ICON = { job: Briefcase, truck: Truck, trailer: Container, driver: User, document: FileText, customer: Building2, place: MapPin } as const;
  const KIND = { job: "Trabalho", truck: "Viatura", trailer: "Reboque", driver: "Motorista", document: "Documento", customer: "Cliente", place: "Local" } as const;

  return (
    <div ref={anchor} className="relative w-[340px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && hits[cursor]) {
            go(hits[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          }
        }}
        placeholder="Trabalho, cliente, cidade, matrícula, motorista, documento…"
        aria-label="Pesquisa global"
        className="ui-input h-8 bg-[var(--surface-2)] pl-8 pr-8"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] px-1 text-[10px] text-[var(--text-3)]">/</kbd>
      <Popover open={open && q.trim().length >= 2} onClose={() => setOpen(false)} anchor={anchor} width={420}>
        {hits.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-[var(--text-3)]">Sem resultados para «{q}».</p>
        ) : (
          <ul role="listbox" className="py-1">
            {hits.map((h, i) => {
              const Icon = ICON[h.kind];
              return (
                <li key={h.key} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(h)}
                    className={clsx("flex h-9 w-full items-center gap-2.5 px-3 text-left", i === cursor && "bg-[var(--surface-2)]")}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                    <span className="num shrink-0 text-[13px] font-medium text-[var(--text)]">{h.title}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-3)]">{h.sub}</span>
                    <span className="text-[11px] text-[var(--text-3)]">{KIND[h.kind]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
    </div>
  );
}


function AlertsButton() {
  const alerts = useOpsAlerts();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const critical = alerts.filter((a) => a.severity === "BLOCKER" || a.severity === "ACTION_REQUIRED").length;
  const grouped = ALERT_ORDER.map((s) => ({ s, items: alerts.filter((a) => a.severity === s) })).filter((g) => g.items.length);
  const go = (a: OpsAlert) => {
    setOpen(false);
    navigate(alertHref(a));
  };
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alertas: ${alerts.length}`}
        aria-expanded={open}
        className="relative inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[13px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <Bell className="h-4 w-4" strokeWidth={1.8} />
        {alerts.length > 0 ? (
          <span className="num rounded-[var(--r-sm)] px-1 text-[11px] font-semibold" style={critical ? { background: "var(--danger-soft)", color: "var(--danger)" } : { background: "var(--surface-sunken)", color: "var(--text-2)" }}>
            {alerts.length}
          </span>
        ) : null}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} width={420} align="right">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <span className="text-[13px] font-semibold text-[var(--text)]">Alertas</span>
        </div>
        {grouped.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-[var(--text-3)]">Sem alertas. Prazos, rotas e qualificações estão em ordem.</p>
        ) : (
          grouped.map(({ s, items }) => (
            <section key={s} className="py-1">
              <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: toneVars(ALERT_GROUP[s].tone).fg }}>
                {ALERT_GROUP[s].label} · {items.length}
              </h3>
              <ul>
                {items.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => go(a)} className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]" data-testid="alert-item">
                      <span className="block truncate text-[13px] text-[var(--text)]">{a.title}</span>
                      <span className="block truncate text-[12px] text-[var(--text-3)]">{a.detail}</span>
                    </button>
                  </li>
                ))}
                {items.length > 12 ? <li className="px-3 py-1 text-[11px] text-[var(--text-3)]">+ {items.length - 12} mais</li> : null}
              </ul>
            </section>
          ))
        )}
      </Popover>
    </>
  );
}

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const ed = useEditors();
  const pick = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div ref={anchor} className="flex">
      <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => ed.openJob()} className="rounded-r-none">
        Novo trabalho
      </Button>
      <button
        type="button"
        aria-label="Criar outro registo"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-7 items-center justify-center rounded-r-[var(--r-md)] border-l border-white/20 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} width={220} align="right">
        <div className="py-1">
          <MenuItem icon={<Briefcase className="h-3.5 w-3.5" />} label="Trabalho" hint="N" onClick={pick(() => ed.openJob())} />
          <MenuItem icon={<Truck className="h-3.5 w-3.5" />} label="Viatura" onClick={pick(() => ed.openTruck())} />
          <MenuItem icon={<Container className="h-3.5 w-3.5" />} label="Reboque" onClick={pick(() => ed.openTrailer())} />
          <MenuItem icon={<User className="h-3.5 w-3.5" />} label="Motorista" onClick={pick(() => ed.openDriver())} />
        </div>
      </Popover>
    </div>
  );
}

export function TopBar() {
  const now = useNow();
  const { state } = useOperations();
  const { jobs, trucks } = state;
  const ed = useEditors();
  const hasDemo = useMemo(() => jobs.some((j) => j.isDemo) || trucks.some((t) => t.isDemo), [jobs, trucks]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        ed.openJob();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ed]);

  return (
    <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-3">
        {hasDemo ? <ProvenanceTag kind="DEMO" detail="dados de demonstração incluídos" /> : null}
        <span className="num hidden text-[12px] text-[var(--text-3)] xl:inline">
          {fmtLongDate(now)} · {fmtClock(now.toISOString())} Lisboa
        </span>
        <AlertsButton />
        <CreateMenu />
      </div>
    </div>
  );
}
