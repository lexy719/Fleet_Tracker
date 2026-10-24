// New transport, on the application's own rules: the form builds a JobDraft, validates it with
// validateJobDraft (the same checks as FleetOS' job form) and commits it with
// OperationsService.createJob — one atomic write with its history event. Addresses come from
// the customer's saved sites first, then TomTom search (same provider as the app).
import { useEffect, useRef, useState } from "react";
import { validateJobDraft, type JobDraft, type StopDraft } from "../domain/jobs/jobDraft";
import { searchAutocomplete } from "../tomtom/searchAutocomplete";
import { getTomTomKey } from "../tomtom/config";
import type { CargoType, JobPriority, Site } from "../data/types";
import { W } from "./world/active";

type Place = { label: string; city: string; lat: number; lng: number; siteId?: string; clientName?: string };
type StopForm = { type: "pickup" | "stop" | "delivery"; place: Place | null; date: string; from: string; to: string };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const tomorrow = () => new Date(Date.now() + 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

/** "2026-10-16" + "08:00" as a Lisbon-local ISO instant with the right offset (WET/WEST). */
export function lisbonIso(date: string, time: string): string | undefined {
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !/^\d\d:\d\d$/.test(time)) return undefined;
  const guess = new Date(`${date}T${time}:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d+)?/.exec(off ?? "GMT");
  const h = Number(m?.[1] ?? 0);
  const sign = h < 0 ? "-" : "+";
  return `${date}T${time}:00${sign}${String(Math.abs(h)).padStart(2, "0")}:00`;
}

const CARGO: [CargoType, string][] = [
  ["dry", "Carga seca"],
  ["refrigerated", "Frio"],
  ["hazmat", "ADR"],
  ["bulk", "Granel"],
  ["automotive", "Automóvel"],
];
const PRIORITY: [JobPriority, string][] = [
  ["normal", "Normal"],
  ["urgent", "Urgente"],
  ["critical", "Crítica"],
];

export type DraftPreview = { points: { at: [number, number]; label: string; type: string }[] };

export function NewJobPanel({ onCancel, onCreated, onPreview }: { onCancel: () => void; onCreated: (displayId: string) => void; onPreview: (p: DraftPreview) => void }) {
  const ops = W().ops;
  const [client, setClient] = useState("");
  const [reference, setReference] = useState("");
  const [priority, setPriority] = useState<JobPriority>("normal");
  const [cargoType, setCargoType] = useState<CargoType>("dry");
  const [rate, setRate] = useState("");
  const [stops, setStops] = useState<StopForm[]>([
    { type: "pickup", place: null, date: tomorrow(), from: "08:00", to: "10:00" },
    { type: "delivery", place: null, date: tomorrow(), from: "14:00", to: "17:00" },
  ]);
  const [cargo, setCargo] = useState({ description: "", pallets: "", weightKg: "", adrClass: "", unNumber: "", tMin: "2", tMax: "8" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const customer = ops?.customers.find((c) => c.name.toLowerCase() === client.trim().toLowerCase());

  const draft: JobDraft = (() => {
    const ss: StopDraft[] = stops.map((s) => ({
      type: s.type,
      clientName: s.place?.clientName ?? s.place?.label.split(",")[0] ?? "",
      address: s.place?.label ?? "",
      city: s.place?.city ?? "",
      lat: s.place?.lat ?? Number.NaN,
      lng: s.place?.lng ?? Number.NaN,
      ...(s.place?.siteId ? { siteId: s.place.siteId } : {}),
      windowStartAt: lisbonIso(s.date, s.from),
      windowEndAt: lisbonIso(s.date, s.to),
    }));
    const pallets = Number(cargo.pallets) || 0;
    return {
      ...(customer ? { customerId: customer.id } : {}),
      client: client.trim(),
      reference: reference.trim(),
      priority,
      cargoType,
      rateEur: Number(rate.replace(",", ".")) || 0,
      stops: ss,
      cargo: [
        {
          description: cargo.description.trim(),
          quantity: pallets || 1,
          unit: pallets ? "pallet" : "unit",
          weightKg: Number(cargo.weightKg) || 0,
          ...(pallets ? { pallets } : {}),
          ...(cargoType === "hazmat" && cargo.adrClass ? { dangerousGoods: { adrClass: cargo.adrClass, ...(cargo.unNumber ? { unNumber: cargo.unNumber } : {}) } } : {}),
        },
      ],
      ...(cargoType === "hazmat" && cargo.adrClass ? { adrClass: cargo.adrClass, ...(cargo.unNumber ? { adrUnNumber: cargo.unNumber } : {}) } : {}),
      ...(cargoType === "refrigerated" ? { tempTargetC: { min: Number(cargo.tMin), max: Number(cargo.tMax) } } : {}),
      plannedDepartureAt: lisbonIso(stops[0].date, stops[0].from),
    };
  })();

  const errors = validateJobDraft(draft);

  useEffect(() => {
    onPreview({ points: stops.flatMap((s, i) => (s.place ? [{ at: [s.place.lng, s.place.lat] as [number, number], label: s.place.city || s.place.label, type: i === 0 ? "pickup" : s.type }] : [])) });
  }, [stops, onPreview]);

  const setStop = (i: number, patch: Partial<StopForm>) => setStops((xs) => xs.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const create = async () => {
    setTouched(true);
    if (errors.length || !ops) return;
    setSaving(true);
    setError(null);
    const r = await ops.service.createJob(draft);
    setSaving(false);
    if (!r.ok) setError(r.errors.join(" · "));
    else onCreated(r.value.jobNumber || r.value.id);
  };

  return (
    <aside className="panel newjob" aria-label="Novo transporte">
      <span className="panel-bg" data-flip="bg-new" data-flip-mode="box" />
      <div className="panel-head">
        <button className="back" onClick={onCancel} aria-label="Cancelar (Esc)">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="panel-title">
          <span className="ref ref-big" data-flip="new-title">
            Novo transporte
          </span>
          <span className="panel-client">{ops?.persistent ? "Fica gravado nos dados operacionais" : "Sessão sem armazenamento persistente"}</span>
        </div>
      </div>

      <div className="panel-scroll">
        <section className="nj-sec" data-flip-enter="120">
          <span className="eyebrow">Cliente</span>
          <input className="nj-in" list="nj-customers" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nome do cliente" />
          <datalist id="nj-customers">
            {ops?.customers.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
          <div className="nj-row">
            <input className="nj-in" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referência do cliente (opcional)" />
            <input className="nj-in nj-num" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Frete €" inputMode="decimal" />
          </div>
          <div className="nj-chips">
            {PRIORITY.map(([k, l]) => (
              <button key={k} className="chip" aria-selected={priority === k} onClick={() => setPriority(k)}>
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="nj-sec" data-flip-enter="160">
          <span className="eyebrow">Paragens</span>
          <ol className="metro nj-metro">
            {stops.map((s, i) => (
              <li key={i} data-done={undefined}>
                <span className="m-node" />
                <span className="nj-stop">
                  <span className="nj-stop-head">
                    <b>{s.type === "pickup" ? "Recolha" : s.type === "delivery" ? "Entrega" : "Paragem"}</b>
                    {s.type === "stop" && (
                      <button className="nj-x" onClick={() => setStops((xs) => xs.filter((_, k) => k !== i))} aria-label="Remover paragem">
                        ×
                      </button>
                    )}
                  </span>
                  <PlaceField value={s.place} sites={ops?.sites.filter((x) => !customer || !x.customerId || x.customerId === customer.id) ?? []} onChange={(place) => setStop(i, { place })} />
                  <span className="nj-row nj-when">
                    <input className="nj-in" type="date" value={s.date} min={today()} onChange={(e) => setStop(i, { date: e.target.value })} />
                    <input className="nj-in" type="time" value={s.from} onChange={(e) => setStop(i, { from: e.target.value })} aria-label="Janela desde" />
                    <span className="nj-dash">–</span>
                    <input className="nj-in" type="time" value={s.to} onChange={(e) => setStop(i, { to: e.target.value })} aria-label="Janela até" />
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <button
            className="nj-add"
            onClick={() =>
              setStops((xs) => [...xs.slice(0, -1), { type: "stop", place: null, date: xs.at(-1)!.date, from: "11:00", to: "13:00" }, xs.at(-1)!])
            }
          >
            + Paragem intermédia
          </button>
        </section>

        <section className="nj-sec" data-flip-enter="200">
          <span className="eyebrow">Carga</span>
          <div className="nj-chips">
            {CARGO.map(([k, l]) => (
              <button key={k} className="chip" aria-selected={cargoType === k} onClick={() => setCargoType(k)}>
                {l}
              </button>
            ))}
          </div>
          <input className="nj-in" value={cargo.description} onChange={(e) => setCargo({ ...cargo, description: e.target.value })} placeholder="Descrição da carga" />
          <div className="nj-row">
            <input className="nj-in nj-num" value={cargo.pallets} onChange={(e) => setCargo({ ...cargo, pallets: e.target.value })} placeholder="Paletes" inputMode="numeric" />
            <input className="nj-in nj-num" value={cargo.weightKg} onChange={(e) => setCargo({ ...cargo, weightKg: e.target.value })} placeholder="Peso kg" inputMode="numeric" />
          </div>
          {cargoType === "hazmat" && (
            <div className="nj-row">
              <input className="nj-in" value={cargo.adrClass} onChange={(e) => setCargo({ ...cargo, adrClass: e.target.value })} placeholder="Classe ADR (ex.: 3)" />
              <input className="nj-in" value={cargo.unNumber} onChange={(e) => setCargo({ ...cargo, unNumber: e.target.value })} placeholder="N.º ONU (ex.: UN1203)" />
            </div>
          )}
          {cargoType === "refrigerated" && (
            <div className="nj-row">
              <input className="nj-in nj-num" value={cargo.tMin} onChange={(e) => setCargo({ ...cargo, tMin: e.target.value })} placeholder="Temp. mín °C" />
              <input className="nj-in nj-num" value={cargo.tMax} onChange={(e) => setCargo({ ...cargo, tMax: e.target.value })} placeholder="Temp. máx °C" />
            </div>
          )}
        </section>

        {(touched || error) && (errors.length > 0 || error) && (
          <section className="nj-errors" role="alert">
            {error && <p>{error}</p>}
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </section>
        )}
      </div>

      <div className="commit" role="region" aria-label="Criar transporte">
        <span className="commit-txt">
          <b>{client.trim() || "Novo transporte"}</b>
          <span>
            {stops[0].place?.city || "recolha"} → {stops.at(-1)!.place?.city || "entrega"} · {errors.length ? `${errors.length} campo${errors.length > 1 ? "s" : ""} por preencher` : "pronto a criar"}
          </span>
        </span>
        <button className="ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" onClick={create} disabled={saving || !ops} aria-disabled={errors.length > 0}>
          {saving ? "A criar…" : "Criar transporte"}
        </button>
      </div>
    </aside>
  );
}

/** Address picker: the customer's saved sites first, then TomTom search (debounced, cancellable). */
function PlaceField({ value, sites, onChange }: { value: Place | null; sites: Site[]; onChange: (p: Place | null) => void }) {
  const [q, setQ] = useState(value?.label ?? "");
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const key = getTomTomKey();

  useEffect(() => {
    if (!open) return;
    const term = q.trim().toLowerCase();
    const local: Place[] = sites
      .filter((s) => !term || s.name.toLowerCase().includes(term) || (s.locality ?? "").toLowerCase().includes(term) || s.address.toLowerCase().includes(term))
      .slice(0, 5)
      .map((s) => ({ label: `${s.name}, ${s.address}`, city: s.locality ?? "", lat: s.lat, lng: s.lng, siteId: s.id, clientName: s.name }));
    setHits(local);
    if (!key || term.length < 3) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setBusy(true);
      try {
        const r = await searchAutocomplete(key, q, { limit: 6, signal: ctrl.current.signal });
        setHits([
          ...local,
          ...r.map((h) => ({ label: h.label, city: h.secondaryLine?.split(",")[0]?.trim() || h.label.split(",").at(-2)?.trim() || "", lat: h.lat, lng: h.lng })),
        ]);
      } catch {
        /* aborted or offline: keep site matches */
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open, sites, key]);

  return (
    <span className="nj-place">
      <input
        className="nj-in"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Local guardado ou morada"
        data-ok={value ? "" : undefined}
      />
      {open && (hits.length > 0 || busy) && (
        <span className="nj-hits" role="listbox">
          {hits.map((h, i) => (
            <button
              key={`${h.label}-${i}`}
              role="option"
              className="nj-hit"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(h);
                setQ(h.label);
                setOpen(false);
              }}
            >
              <b>{h.siteId ? "★ " : ""}{h.label.split(",")[0]}</b>
              <span>{h.label.split(",").slice(1).join(",").trim() || h.city}</span>
            </button>
          ))}
          {busy && <span className="nj-busy">A procurar…</span>}
        </span>
      )}
    </span>
  );
}
