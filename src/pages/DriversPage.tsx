import {
  AlertCircle,
  BookOpen,
  CalendarX2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Phone,
  Search,
  Shield,
  Truck,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { SlideOver } from "../components/ui/SlideOver";
import { drivers, getTruckById } from "../data/mockData";
import type { Driver } from "../data/types";
import { dispatchUrl, fleetUrl, mapUrl } from "../lib/appLinks";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function driverStatusBadge(d: Driver) {
  if (d.status === "violation") return <Badge variant="danger">Horas excedidas</Badge>;
  if (d.status === "driving") return <Badge variant="ok">A conduzir</Badge>;
  if (d.status === "on_duty") return <Badge variant="brand">Em serviço</Badge>;
  return <Badge variant="muted">Fora de serviço</Badge>;
}

function availabilityLabel(a: Driver["availability"]): string {
  if (a === "available") return "Disponível";
  if (a === "assigned") return "Em trabalho";
  return "Ausente / férias";
}

type FilterTab = "all" | "alerts" | "driving" | "available";

function hasAlerts(d: Driver): boolean {
  return d.status === "violation" || d.complianceAlerts.length > 0;
}

/* ─── Document expiry helpers ─────────────────────────── */
function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function expiryBadge(label: string, dateStr: string | undefined) {
  const days = daysUntil(dateStr);
  if (days === null) return null;

  let color: string;
  let icon: React.ReactNode;
  let text: string;

  if (days < 0) {
    color = "border-[#A84432]/30 bg-[#F6E3DE] text-[#A84432]";
    icon = <CalendarX2 className="h-3.5 w-3.5 shrink-0" />;
    text = `${label} — VENCIDA (há ${Math.abs(days)} dias)`;
  } else if (days <= 30) {
    color = "border-[#A84432]/30 bg-[#F6E3DE] text-[#A84432]";
    icon = <CalendarX2 className="h-3.5 w-3.5 shrink-0" />;
    text = `${label} — expira em ${days} dias`;
  } else if (days <= 90) {
    color = "border-[#C4A882]/30 bg-[#F2EBE0] text-[#8B6F47]";
    icon = <AlertCircle className="h-3.5 w-3.5 shrink-0" />;
    text = `${label} — expira em ${days} dias`;
  } else {
    color = "border-[var(--app-border)] bg-[var(--app-elevated)] text-[var(--app-fg)]";
    icon = <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#2D5F4E]" />;
    text = `${label} — ${new Date(dateStr!).toLocaleDateString("pt-PT")}`;
  }

  return (
    <li key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${color}`}>
      {icon}
      <span>{text}</span>
    </li>
  );
}

export function DriversPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");

  const selected = useMemo(() => drivers.find((d) => d.id === selectedId) ?? null, [selectedId]);

  const stats = useMemo(() => {
    const roster = drivers.length;
    const alerts = drivers.filter(hasAlerts).length;
    const driving = drivers.filter((d) => d.status === "driving").length;
    const available = drivers.filter((d) => d.availability === "available").length;
    return { roster, alerts, driving, available };
  }, []);

  const filteredDrivers = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...drivers];

    if (filter === "alerts") list = list.filter(hasAlerts);
    else if (filter === "driving") list = list.filter((d) => d.status === "driving");
    else if (filter === "available") list = list.filter((d) => d.availability === "available");

    if (q) {
      list = list.filter((d) => {
        const truck = d.truckId ? getTruckById(d.truckId) : null;
        const hay = [
          d.name,
          d.license,
          d.homeTerminal,
          d.phone,
          truck?.plate ?? "",
          truck?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    list.sort((a, b) => {
      const aA = hasAlerts(a) ? 0 : 1;
      const bA = hasAlerts(b) ? 0 : 1;
      if (aA !== bA) return aA - bA;
      const aPct = a.hoursWeek / a.hoursLimit;
      const bPct = b.hoursWeek / b.hoursLimit;
      if (Math.abs(aPct - bPct) > 0.02) return bPct - aPct;
      return a.name.localeCompare(b.name, "pt");
    });

    return list;
  }, [query, filter]);

  useEffect(() => {
    const d = searchParams.get("driver");
    if (d && drivers.some((x) => x.id === d)) setSelectedId(d);
  }, [searchParams]);

  useEffect(() => {
    const d = searchParams.get("driver");
    if (!d) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`driver-card-${d}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchParams]);

  const openDriver = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("driver", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeDriver = useCallback(() => {
    setSelectedId(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("driver");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const highlightedDriver = searchParams.get("driver");

  const filterTabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: "all", label: "Todos", count: stats.roster },
    { id: "alerts", label: "Alertas", count: stats.alerts },
    { id: "driving", label: "A conduzir", count: stats.driving },
    { id: "available", label: "Disponíveis", count: stats.available },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <PageHeader
        eyebrow="Recursos · Frota"
        title="Motoristas"
        subtitle="Horas de condução, alertas e disponibilidade — filtre por estado ou pesquise por nome, matrícula ou terminal."
        stats={[
          { label: "Roster", value: String(stats.roster) },
          { label: "Com alertas", value: String(stats.alerts) },
          { label: "A conduzir", value: String(stats.driving) },
        ]}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/map"
              className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--app-fg)] transition hover:bg-black/[0.04]"
            >
              Mapa ao vivo
            </Link>
            <Link
              to="/app/dispatch"
              className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--app-fg)] transition hover:bg-black/[0.04]"
            >
              Expedição
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 px-0 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex min-h-[42px] max-w-md flex-1 items-center gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: "var(--app-border)", background: "var(--app-elevated)" }}
        >
          <Search className="h-4 w-4 shrink-0 opacity-50" style={{ color: "var(--app-muted)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, matrícula, terminal…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--app-fg)" }}
            aria-label="Pesquisar motoristas"
          />
        </div>
        <p className="text-xs tabular-nums" style={{ color: "var(--app-muted)" }}>
          {filteredDrivers.length} de {drivers.length} visíveis
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterTabs.map((t) => {
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-[#2D5F4E] bg-[#E8F0EC] text-[#2D5F4E]"
                  : "border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-muted)] hover:border-[#2D5F4E]/40",
              )}
            >
              {t.label}
              {t.count != null ? (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-white/80 text-[#2D5F4E]" : "bg-black/[0.06] text-[var(--app-fg)]",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {filteredDrivers.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm font-medium" style={{ color: "var(--app-fg)" }}>
            Nenhum motorista corresponde aos filtros.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--app-muted)" }}>
            Limpe a pesquisa ou escolha outro separador.
          </p>
          <button
            type="button"
            className="mt-4 text-xs font-semibold text-[#2D5F4E] hover:underline"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Repor filtros
          </button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDrivers.map((d) => {
            const truck = d.truckId ? getTruckById(d.truckId) : null;
            const hoursPct = (d.hoursWeek / d.hoursLimit) * 100;
            const risk = hasAlerts(d);
            return (
              <Card
                key={d.id}
                id={`driver-card-${d.id}`}
                className={clsx(
                  "cursor-pointer transition hover:ring-2 hover:ring-[#2D5F4E]/20",
                  highlightedDriver === d.id && "ring-2 ring-[#2D5F4E]",
                  risk && "border-l-4 border-l-[#8B6F47]",
                )}
                onClick={() => openDriver(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDriver(d.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${d.name}, ${availabilityLabel(d.availability)}`}
              >
                <div className="flex gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                    style={{ background: "#E8F0EC", color: "#2D5F4E" }}
                  >
                    {initials(d.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold">{d.name}</div>
                        <div className="text-xs text-[var(--app-muted)]">{d.homeTerminal} · {availabilityLabel(d.availability)}</div>
                      </div>
                      {driverStatusBadge(d)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-[var(--app-muted)]">Viatura</div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-medium">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--app-muted)]" />
                      <span className="truncate">{truck ? truck.plate : "—"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--app-muted)]">Horas (semana)</div>
                    <div className="mt-0.5 font-semibold tabular-nums">
                      {d.hoursWeek} / {d.hoursLimit} h
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, hoursPct)}%`,
                      background: hoursPct >= 90 ? "#A84432" : hoursPct > 75 ? "#8B6F47" : "#2D5F4E",
                    }}
                  />
                </div>
                {d.complianceAlerts.length > 0 ? (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#C4A882]/30 bg-[#F2EBE0] px-2 py-1.5 text-xs text-[#6B4E2A]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{d.complianceAlerts[0]}</span>
                  </div>
                ) : null}
                {d.truckId ? (
                  <div className="mt-3 border-t border-[var(--app-border)] pt-3">
                    <Link
                      to={mapUrl({ truck: d.truckId })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#2D5F4E] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Ver no mapa
                    </Link>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <SlideOver
        open={!!selected}
        onClose={closeDriver}
        title={selected?.name ?? "Motorista"}
        subtitle={selected?.license}
        widthClassName="max-w-lg"
      >
        {selected ? (
          <div className="space-y-6 text-sm">
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
                style={{ background: "#E8F0EC", color: "#2D5F4E" }}
              >
                {initials(selected.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--app-muted)]">Carta · licenças</p>
                <p className="font-mono text-xs leading-snug text-[var(--app-fg)]">{selected.license}</p>
              </div>
            </div>

            {selected.truckId ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  to={mapUrl({ truck: selected.truckId })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 text-xs font-semibold text-[#2D5F4E] transition hover:bg-black/[0.04]"
                >
                  <MapPin className="h-4 w-4" />
                  Mapa ao vivo
                </Link>
                <Link
                  to={fleetUrl(selected.truckId)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 text-xs font-semibold text-[var(--app-fg)] transition hover:bg-black/[0.04]"
                >
                  <ExternalLink className="h-4 w-4 opacity-70" />
                  Frota / ITP
                </Link>
                <Link
                  to={dispatchUrl(selected.truckId)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2.5 text-xs font-semibold text-[var(--app-fg)] transition hover:bg-black/[0.04] sm:col-span-2"
                >
                  Expedir (esta viatura)
                </Link>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed px-3 py-2 text-xs" style={{ borderColor: "var(--app-border)", color: "var(--app-muted)" }}>
                Sem viatura atribuída — ligue no dispatch quando atribuir um trabalho.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {driverStatusBadge(selected)}
              <Badge variant="muted" className="capitalize">
                {availabilityLabel(selected.availability)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)" }}>
                <div className="text-xs text-[var(--app-muted)]">Pontuação de segurança</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{selected.safetyScore}</div>
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)" }}>
                <div className="text-xs text-[var(--app-muted)]">Entregas a tempo</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{selected.onTimePct}%</div>
              </div>
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">Horas</h3>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--app-muted)]">Hoje</span>
                  <span className="font-mono tabular-nums">{selected.hoursToday} h</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--app-muted)]">Semana corrente</span>
                  <span className="font-mono tabular-nums">
                    {selected.hoursWeek} / {selected.hoursLimit} h
                  </span>
                </div>
              </div>
            </section>

            <section className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: "var(--app-border)" }}>
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-muted)]" />
              <div className="min-w-0">
                <div className="text-xs text-[var(--app-muted)]">Contacto</div>
                <a href={`tel:${selected.phone.replace(/\s/g, "")}`} className="font-medium text-[#2D5F4E] hover:underline">
                  {selected.phone}
                </a>
              </div>
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
                <Shield className="h-4 w-4" />
                Alertas de condução
              </h3>
              {selected.complianceAlerts.length === 0 ? (
                <p className="text-[var(--app-muted)]">Sem alertas abertos.</p>
              ) : (
                <ul className="space-y-2">
                  {selected.complianceAlerts.map((a) => (
                    <li key={a} className="rounded-lg border border-[#C4A882]/30 bg-[#F2EBE0] px-3 py-2 text-xs">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── EU Documents ── */}
            {(selected.licenseExpiry || selected.cpcExpiry || selected.adrExpiry || selected.tachoCalExpiry) && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
                  <BookOpen className="h-4 w-4" />
                  Documentos EU
                </h3>
                <ul className="space-y-2">
                  {expiryBadge("Carta de condução (C+E)", selected.licenseExpiry)}
                  {expiryBadge("CPC — Formação periódica", selected.cpcExpiry)}
                  {expiryBadge("Certificado ADR", selected.adrExpiry)}
                  {expiryBadge("Calibração tacógrafo", selected.tachoCalExpiry)}
                </ul>
              </section>
            )}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
