import { Bell, Command, Menu, Search, Settings, Signal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { opsAlerts } from "../../data/mockData";
import type { OpsAlert } from "../../data/types";
import { Badge } from "../ui/Badge";
import { SlideOver } from "../ui/SlideOver";
import { GlobalSearchContent } from "./GlobalSearchContent";
import { NAV_ITEMS } from "./navConfig";

function alertHref(a: OpsAlert): string {
  switch (a.entityType) {
    case "route":
      return "/app/dispatch";
    case "driver":
      return "/app/drivers";
    case "cargo":
      return "/app/dispatch";
    case "fuel":
      return "/app/reports";
    case "job":
      return "/app/jobs";
    case "maintenance":
      return "/app/fleet";
    default:
      return "/app/map";
  }
}

export function AppTopBar() {
  const [mobileNav, setMobileNav] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const critical = opsAlerts.filter((a) => a.severity === "critical").length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const trigger = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!trigger) return;
      event.preventDefault();
      setSearchOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header
        className="shell-topbar sticky top-0 z-[90] flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur-lg md:px-6"
        style={{
          borderColor: "var(--shell-top-border)",
          background: "var(--shell-top-bg)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            className="flex rounded-lg p-2 lg:hidden"
            style={{ color: "var(--shell-top-fg)" }}
            aria-label="Menu"
            onClick={() => setMobileNav((v) => !v)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex rounded-lg p-2 lg:hidden"
            style={{ color: "var(--shell-top-muted)" }}
            aria-label="Open global search"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden max-w-xl flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-left transition hover:border-brand-500/40 lg:flex"
            style={{ borderColor: "var(--shell-top-border)", background: "var(--shell-search-bg)" }}
            aria-label="Open global search"
          >
            <Search className="h-4 w-4 shrink-0 opacity-50" style={{ color: "var(--shell-top-muted)" }} />
            <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--shell-top-muted)" }}>
              Pesquisar viaturas, trabalhos, motoristas e alertas...
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ borderColor: "var(--shell-top-border)", color: "var(--shell-top-muted)" }}
            >
              <Command className="h-3 w-3" />
              K
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div
            className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:flex"
            style={{ borderColor: "var(--shell-top-border)", color: "#2846B8" }}
          >
            <Signal className="h-4 w-4" />
            Live
          </div>
          {critical > 0 ? (
            <Badge variant="danger" className="hidden sm:inline-flex">
              {critical}
            </Badge>
          ) : null}
          <button
            type="button"
            className="relative rounded-lg p-2 opacity-80 transition hover:bg-black/[0.04] hover:opacity-100"
            style={{ color: "var(--shell-top-muted)" }}
            aria-label="Alerts"
            aria-expanded={alertsOpen}
            onClick={() => setAlertsOpen(true)}
          >
            <Bell className="h-[18px] w-[18px]" />
            {opsAlerts.length > 0 ? (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-[var(--app-card)]"
                style={{ background: "#2846B8" }}
              />
            ) : null}
          </button>
          <button
            type="button"
            className="hidden rounded-lg p-2 opacity-80 transition hover:bg-black/[0.04] hover:opacity-100 sm:block"
            style={{ color: "var(--shell-top-muted)" }}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <div
            className="hidden h-9 w-9 items-center justify-center rounded-full border-2 text-[11px] font-bold sm:flex"
            style={{ borderColor: "rgba(40,70,184,0.35)", background: "rgba(40,70,184,0.10)", color: "#2846B8" }}
            title="Operator"
          >
            FM
          </div>
        </div>

        {mobileNav ? (
          <div
            className="absolute left-0 right-0 top-full z-[95] border-b p-4 shadow-xl lg:hidden"
            style={{ background: "var(--shell-top-bg)", borderColor: "var(--shell-top-border)" }}
          >
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileNav(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
                  style={({ isActive }) =>
                    isActive
                      ? { background: "#E8EDFA", color: "#2846B8", fontWeight: 600 }
                      : { color: "var(--shell-top-fg)" }
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null}
      </header>

      <SlideOver
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Pesquisa"
        subtitle="Dados de demonstração — viaturas, trabalhos e motoristas."
        widthClassName="max-w-lg"
      >
        <GlobalSearchContent onPick={() => setSearchOpen(false)} />
      </SlideOver>

      <SlideOver
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="Alertas operacionais"
        subtitle={`${opsAlerts.length} alerta${opsAlerts.length !== 1 ? "s" : ""} ativo${opsAlerts.length !== 1 ? "s" : ""} · itens críticos em destaque`}
        widthClassName="max-w-lg"
      >
        {opsAlerts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-muted)" }}>
            Sem alertas ativos.
          </p>
        ) : (
          <ul className="space-y-3">
            {opsAlerts.map((a) => {
              const entityLabels: Record<string, string> = {
                route: "rota", truck: "viatura", driver: "motorista",
                cargo: "carga", fuel: "combustível", job: "trabalho", maintenance: "manutenção",
              };
              return (
                <li key={a.id}>
                  <Link
                    to={alertHref(a)}
                    onClick={() => setAlertsOpen(false)}
                    className="block rounded-xl border border-[var(--app-border)] p-3 transition hover:bg-black/[0.03]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold" style={{ color: "var(--app-fg)" }}>
                        {a.title}
                      </span>
                      <Badge variant={a.severity === "critical" ? "danger" : "warn"}>
                        {a.severity === "critical" ? "crítico" : a.severity === "warning" ? "aviso" : "info"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--app-muted)" }}>
                      {a.detail}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--app-muted)" }}>
                      Ver {entityLabels[a.entityType] ?? a.entityType} →
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          to="/app"
          className="mt-4 inline-block text-sm font-semibold hover:underline"
          style={{ color: "#2846B8" }}
          onClick={() => setAlertsOpen(false)}
        >
          Ver todas as exceções →
        </Link>
      </SlideOver>

      <SlideOver
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Configurações rápidas"
        subtitle="Atalhos e informação do workspace."
        widthClassName="max-w-md"
      >
        <div className="space-y-4">
          {/* Quick links */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
              Acesso rápido
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Definições da empresa", to: "/app/settings", desc: "NIF, IBAN, prefixo faturas" },
                { label: "Relatórios", to: "/app/reports", desc: "P&L, SLA, combustível" },
                { label: "Motoristas EU", to: "/app/drivers", desc: "Documentos e HOS" },
                { label: "Frota / Manutenção", to: "/app/fleet", desc: "ITP, tacógrafo, pneus" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setSettingsOpen(false)}
                  className="flex flex-col gap-0.5 rounded-xl border p-3 transition hover:opacity-80"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
                >
                  <span className="text-[12px] font-semibold" style={{ color: "var(--app-fg)" }}>{item.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--app-muted)" }}>{item.desc}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* System status */}
          <section className="rounded-xl border border-[var(--app-border)] p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-muted)" }}>
              Estado do sistema
            </p>
            <div className="space-y-2 text-[12px]">
              {[
                { label: "Telemática ao vivo", status: "online" },
                { label: "Geocodificação Nominatim", status: "online" },
                { label: "Cálculo de rotas TomTom", status: "online" },
                { label: "Backend / API", status: "demo" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span style={{ color: "var(--app-fg)" }}>{row.label}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: row.status === "online" ? "#E8EDFA" : "#FFF6E7",
                      color: row.status === "online" ? "#2846B8" : "#A86B00",
                    }}
                  >
                    {row.status === "online" ? "Online" : "Demo"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] p-3 text-[11px]" style={{ color: "var(--app-muted)" }}>
            <p className="font-semibold text-[var(--app-fg)]">Peninsula Fleet OS</p>
            <p className="mt-0.5">TMS de demonstração · Regulamento CE 561/2006 · ADR 2023</p>
            <p className="mt-1">
              Faturas sem validade fiscal — certificação AT obrigatória em produção.
            </p>
          </section>
        </div>
      </SlideOver>
    </>
  );
}
