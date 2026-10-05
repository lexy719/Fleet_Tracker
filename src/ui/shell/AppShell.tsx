import clsx from "clsx";
import { Briefcase, FileText, Gauge, Radar, Route, Settings, ShieldCheck, Truck, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { paths } from "../../lib/appLinks";
import { EditorsProvider } from "./editors";
import { TopBar } from "./TopBar";

const NAV: { to: string; label: string; icon: typeof Gauge; end?: boolean }[] = [
  { to: paths.overview(), label: "Visão geral", icon: Gauge, end: true },
  { to: paths.work(), label: "Trabalhos", icon: Briefcase },
  { to: paths.dispatch(), label: "Expedição", icon: Route },
  { to: paths.trucks(), label: "Frota", icon: Truck },
  { to: paths.drivers(), label: "Motoristas", icon: Users },
  { to: paths.documents(), label: "Documentos", icon: FileText },
  { to: paths.compliance(), label: "Conformidade", icon: ShieldCheck },
];

function NavItem({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "group relative flex h-8 items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-[13px] transition-colors duration-150",
          isActive ? "bg-[var(--surface-sunken)] font-medium text-[var(--text)]" : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span aria-hidden className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[var(--accent)]" /> : null}
          <Icon className={clsx("h-4 w-4 shrink-0", isActive ? "text-[var(--accent)]" : "text-[var(--text-3)] group-hover:text-[var(--text-2)]")} strokeWidth={1.8} />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Application shell: narrow sidebar + compact top bar + workspace. */
export function AppShell() {
  return (
    <EditorsProvider>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-[var(--bg)]">
        <aside className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]" aria-label="Navegação principal">
          <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-4">
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--accent)] text-[11px] font-bold tracking-tight text-white">F</span>
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">FleetOS</span>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-2">
            {NAV.map((n) => <NavItem key={n.to} {...n} />)}
            <div className="mx-1 my-3 h-px bg-[var(--border)]" />
            <NavItem to={paths.intelligence()} label="Inteligência" icon={Radar} />
          </nav>
          <div className="border-t border-[var(--border)] px-3 py-2">
            <NavItem to={paths.settings()} label="Definições" icon={Settings} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </EditorsProvider>
  );
}
