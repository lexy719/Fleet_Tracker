import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";

type Stat = { label: string; value: string };

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  stats,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats?: Stat[];
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--app-border)] bg-[var(--app-card)]/90 px-4 py-4 backdrop-blur-sm md:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">{eyebrow}</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--app-fg)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--app-muted)]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats?.map((stat) => (
            <Badge key={stat.label} variant="muted" className="px-3 py-1.5">
              <span className="mr-2 text-[var(--app-muted)]">{stat.label}</span>
              <span className="text-[var(--app-fg)]">{stat.value}</span>
            </Badge>
          ))}
          {action}
        </div>
      </div>
    </header>
  );
}
