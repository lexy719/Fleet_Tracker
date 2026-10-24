// Mapa: the map alone, full screen, with the sidebar on the left. Each category switched on adds its things
// to the map (they add up): drivers are pings where they are; routes draw the roads and put the drivers on
// them; fuel adds the pings where they will stop to refuel. Below, the palcos (full pages, one primary
// category each) and what needs the office. The bar is open while the map is empty and folds into a rail
// once the map has things on it (hovering opens it again, over the map).
import { useEffect, type ReactNode } from "react";
import { allDrivers, allTrucks } from "./model";
import type { Row } from "./types";
import { W } from "./world/active";

export type LayerState = { drivers: boolean; routes: boolean; fuel: boolean; trucks: boolean; cargo: boolean };
export const NO_LAYERS: LayerState = { drivers: false, routes: false, fuel: false, trucks: false, cargo: false };
export type PalcoKey = "viagens" | "garagem" | "combustivel" | "clientes" | "atencao";

/** Where the tapped sidebar row (or map thing) was, so the palco can open out of it. */
export const palcoFlight: { from: DOMRect | null } = { from: null };

const ICON: Record<string, ReactNode> = {
  drivers: (
    <svg viewBox="0 0 20 20">
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.8 17c.7-3.3 3.2-5.2 6.2-5.2s5.5 1.9 6.2 5.2" />
    </svg>
  ),
  routes: (
    <svg viewBox="0 0 20 20">
      <circle cx="4.5" cy="15.5" r="2" />
      <circle cx="15.5" cy="4.5" r="2" />
      <path d="M6.5 15.5h6a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6h6" />
    </svg>
  ),
  fuel: (
    <svg viewBox="0 0 20 20">
      <path d="M4 17V4.5A1.5 1.5 0 0 1 5.5 3h5A1.5 1.5 0 0 1 12 4.5V17M3 17h10M4 8h8" />
      <path d="M12 7l3 2.5V14a1.2 1.2 0 0 0 2.4 0V8L15 5.5" />
    </svg>
  ),
  viagens: (
    <svg viewBox="0 0 20 20">
      <path d="M2.5 14h15M4 14V10M8 14V7M12 14v-4.5M16 14V8.5" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 20 20">
      <path d="M3 17V7l7-4 7 4v10" />
      <path d="M7.5 17v-5h5v5" />
    </svg>
  ),
  garagem: (
    <svg viewBox="0 0 20 20">
      <rect x="2.5" y="6" width="15" height="8" rx="2" />
      <path d="M6 10h3M11 10h3" />
    </svg>
  ),
};

const KEYS: [keyof LayerState, string][] = [
  ["drivers", "M"],
  ["routes", "R"],
  ["fuel", "C"],
];

export function Sidebar({
  layers,
  jobs,
  rail,
  onToggle,
  onPalco,
}: {
  layers: LayerState;
  /** Today's transports (live), for the counts. */
  jobs: Row[];
  /** The map has things on it: fold into a rail. */
  rail: boolean;
  onToggle: (k: keyof LayerState, from: DOMRect) => void;
  onPalco: (k: PalcoKey, from: DOMRect) => void;
}) {
  // Keyboard: M, R, C switch the categories (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as Element | null)?.closest?.("input, textarea, select")) return;
      const k = KEYS.find((x) => x[1].toLowerCase() === e.key.toLowerCase())?.[0];
      if (!k) return;
      const row = document.querySelector<HTMLElement>(`.sb-row[data-k="${k}"]`);
      onToggle(k, row?.getBoundingClientRect() ?? new DOMRect());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);

  const drivers = allDrivers();
  const free = drivers.filter((d) => !d.holder).length;
  const onRoad = jobs.filter((j) => j.status === "in_transit" || j.status === "loading").length;
  const refuels = jobs.flatMap((j) => j.fuel?.refuels ?? []);
  const litres = Math.round(refuels.reduce((a, r) => a + r.litres, 0));
  const trucks = allTrucks();
  const shop = trucks.filter((t) => t.availability !== "AVAILABLE").length;
  const attention = W().attention;

  const layerRows: [keyof LayerState, string, string, string][] = [
    ["drivers", "Motoristas", `${drivers.length - free} a trabalhar · ${free} livres`, String(drivers.length)],
    ["routes", "Rotas", `${jobs.length} transportes · ${onRoad} na estrada`, String(jobs.length)],
    ["fuel", "Combustível", refuels.length ? `${refuels.length} ${refuels.length === 1 ? "paragem" : "paragens"} hoje · ${litres} L` : "sem paragens hoje", String(refuels.length)],
  ];
  const palcoRows: [PalcoKey, string, ReactNode | string, string][] = [
    ["viagens", "Viagens", `o dia · ${jobs.length} transportes`, String(jobs.length)],
    [
      "garagem",
      "Garagem",
      <>
        {trucks.length} camiões{shop > 0 && <i> · {shop} na oficina</i>}
      </>,
      String(trucks.length),
    ],
    ["clientes", "Clientes", `${new Set(jobs.map((j) => j.client)).size} clientes · ${jobs.length} transportes`, String(new Set(jobs.map((j) => j.client)).size)],
    ["combustivel", "Combustível", refuels.length ? `${refuels.length} ${refuels.length === 1 ? "paragem" : "paragens"} · ${Math.round(refuels.reduce((a, r) => a + r.litres * r.pricePerL, 0))} €` : "depósitos e preços", String(refuels.length)],
  ];
  return (
    <nav className="sb" data-rail={rail || undefined} aria-label="Mapa e palcos">
      <div className="sb-eye">
        No mapa <em>soma ao ligar</em>
      </div>
      {layerRows.map(([k, label, sub, n]) => (
        <button key={k} className="sb-row" data-k={k} aria-pressed={layers[k]} onClick={(e) => onToggle(k, e.currentTarget.getBoundingClientRect())}>
          <span className="sb-ico" aria-hidden>
            {ICON[k]}
          </span>
          <span className="sb-txt">
            <b>{label}</b>
            <small>{sub}</small>
          </span>
          <kbd>{KEYS.find((x) => x[0] === k)![1]}</kbd>
          <span className="sb-n">{n}</span>
        </button>
      ))}
      <p className="sb-hint">
        <span aria-hidden>
          <i />
          <i />
        </span>
        duas ligadas abrem as Viagens
      </p>
      <div className="sb-sep" />
      <div className="sb-eye">Palcos</div>
      {palcoRows.map(([k, label, sub, n]) => (
        <button key={k} className="sb-row" data-k={k} onClick={(e) => onPalco(k, e.currentTarget.getBoundingClientRect())}>
          <span className="sb-ico" aria-hidden>
            {ICON[k === "combustivel" ? "fuel" : k]}
          </span>
          <span className="sb-txt">
            <b>{label}</b>
            <small>{sub}</small>
          </span>
          <span className="sb-go" aria-hidden>
            ↗
          </span>
          <span className="sb-n">{n}</span>
        </button>
      ))}
      {attention.length > 0 && (
        <button className="sb-att" onClick={(e) => onPalco("atencao", e.currentTarget.getBoundingClientRect())}>
          <span className="sb-dot">{attention.length}</span>
          <span className="sb-txt">
            <b>Precisa de mim</b>
            <small>{attention[0].what}</small>
          </span>
          <span className="sb-go" aria-hidden>
            ↗
          </span>
        </button>
      )}
    </nav>
  );
}
