import clsx from "clsx";
import { Building2, LogOut, Settings, Sparkles, Truck } from "lucide-react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navConfig";

const groups: { title: string; keys: (typeof NAV_ITEMS)[number]["group"][] }[] = [
  { title: "Hoje", keys: ["monitor"] },
  { title: "Operações", keys: ["network"] },
  { title: "Recursos", keys: ["resources"] },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside
      className="shell-sidebar flex h-full w-[252px] shrink-0 flex-col border-r"
      style={{
        background: "var(--shell-sidebar-bg)",
        borderColor: "var(--shell-sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-2 border-b px-4"
        style={{ borderColor: "var(--shell-sidebar-border)" }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: "#2846B8", boxShadow: "0 6px 16px rgba(40,70,184,0.35)" }}
        >
          <Truck className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="min-w-0 leading-tight">
          <div
            className="truncate text-[13px] font-bold tracking-tight"
            style={{ color: "var(--shell-sidebar-fg)" }}
          >
            FleetOS Iberia
          </div>
          <div
            className="text-[10px] font-medium uppercase tracking-[0.14em]"
            style={{ color: "var(--shell-sidebar-muted)" }}
          >
            Dispatch · PT / ES
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-4">
        <div
          className="mb-4 rounded-xl border px-3 py-2.5"
          style={{ borderColor: "var(--shell-sidebar-border)", background: "var(--app-elevated)" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--shell-sidebar-muted)" }}>
            Modo da equipa
          </p>
          <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--shell-sidebar-fg)" }}>
            Operação em tempo real
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mb-5">
            <div
              className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "var(--shell-sidebar-muted)" }}
            >
              {g.title}
            </div>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((item) => g.keys.includes(item.group)).map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => onNavigate?.()}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                      isActive ? "shadow-sm" : "",
                    )
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: "var(--shell-nav-active-bg)",
                          color: "var(--shell-nav-active-fg)",
                          fontWeight: 600,
                        }
                      : {
                          color: "var(--shell-sidebar-fg)",
                          // hover handled via CSS below
                        }
                  }
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    if (!el.getAttribute("aria-current")) {
                      el.style.background = "var(--shell-nav-hover-bg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    if (!el.getAttribute("aria-current")) {
                      el.style.background = "";
                    }
                  }}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t" style={{ borderColor: "var(--shell-sidebar-border)" }}>
        {/* User profile card */}
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold"
            style={{
              borderColor: "rgba(40,70,184,0.35)",
              background: "rgba(40,70,184,0.10)",
              color: "#2846B8",
            }}
          >
            FM
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[12px] font-semibold leading-tight"
              style={{ color: "var(--shell-sidebar-fg)" }}
            >
              Fernando M.
            </p>
            <p
              className="truncate text-[10px] leading-tight"
              style={{ color: "var(--shell-sidebar-muted)" }}
            >
              Dispatcher · Workspace demo
            </p>
          </div>
          <button
            type="button"
            title="Definições"
            className="shrink-0 rounded-lg p-1.5 transition hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: "var(--shell-sidebar-muted)" }}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom links */}
        <div
          className="flex items-center justify-between border-t px-3 py-2.5"
          style={{ borderColor: "var(--shell-sidebar-border)" }}
        >
          <a
            href="/"
            onClick={() => onNavigate?.()}
            className="flex items-center gap-1.5 text-[10px] font-medium transition hover:opacity-80"
            style={{ color: "var(--shell-sidebar-muted)" }}
          >
            <Sparkles className="h-3 w-3" />
            Landing
          </a>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{ borderColor: "var(--shell-sidebar-border)", color: "var(--shell-sidebar-muted)" }}
          >
            <Building2 className="h-3 w-3" />
            Demo
          </span>
          <button
            type="button"
            title="Terminar sessão"
            className="flex items-center gap-1 text-[10px] font-medium transition hover:opacity-80"
            style={{ color: "var(--shell-sidebar-muted)" }}
          >
            <LogOut className="h-3 w-3" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
