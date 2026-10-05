import { LocateFixed } from "lucide-react";
import { useState } from "react";
import { useOperations } from "../../context/OperationsContext";
import type { Customer, Site } from "../../data/types";
import { recordDeleteBlockers, siteCoordinatesCurrent, type CustomerDraft, type SiteDraft } from "../../domain/records/records";
import { resolveStopCoordinates } from "../../lib/jobStopGeocode";
import { Button, Drawer, Field, Notice } from "../kit";

/*
 * Customer / Site editors. Shared by Definições → Registos and by the job form (inline
 * create). All writes go through the OperationsService.
 */

function Text({ label, value, onChange, help, autoFocus, type = "text" }: { label: string; value: string | undefined; onChange: (v: string) => void; help?: string; autoFocus?: boolean; type?: string }) {
  return (
    <Field label={label} help={help}>
      <input className="ui-input" type={type} autoFocus={autoFocus} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function RecordFooter({ archived, onArchive, onDelete, deleteBlocked, onClose, onSave, saving }: { archived: boolean; onArchive?: () => void; onDelete?: () => void; deleteBlocked?: string; onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <>
      {onArchive ? <Button variant="ghost" className="mr-auto" onClick={onArchive}>{archived ? "Restaurar" : "Arquivar"}</Button> : null}
      {onDelete ? <Button variant="ghost" disabled={!!deleteBlocked} title={deleteBlocked} onClick={onDelete}>Eliminar</Button> : null}
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={saving} onClick={onSave}>Guardar</Button>
    </>
  );
}

export function CustomerEditor({ customer, initialName, onClose, onSaved }: { customer?: Customer; initialName?: string; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const { state, service } = useOperations();
  const [d, setD] = useState<CustomerDraft>(() => (customer ? { name: customer.name, nif: customer.nif, billingAddress: customer.billingAddress, contactName: customer.contactName, phone: customer.phone, email: customer.email, notes: customer.notes } : { name: initialName ?? "" }));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CustomerDraft>(k: K, v: CustomerDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const blockers = customer ? recordDeleteBlockers("customer", customer.id, state.jobs, state.documents, state.sites) : [];
  const done = (r: { ok: true } | { ok: false; errors: string[] }) => (r.ok ? onClose() : setErrors(r.errors));
  return (
    <Drawer
      width={520}
      title={customer ? customer.name : "Novo cliente"}
      subtitle={customer?.archivedAt ? "Arquivado" : customer?.isDemo ? "Registo demo" : undefined}
      onClose={onClose}
      footer={
        <RecordFooter
          archived={!!customer?.archivedAt}
          onArchive={customer ? async () => done(await service.setArchived("customer", customer.id, !customer.archivedAt)) : undefined}
          onDelete={customer ? async () => done(await service.deleteResource("customer", customer.id)) : undefined}
          deleteBlocked={blockers[0]}
          onClose={onClose}
          saving={saving}
          onSave={async () => {
            setSaving(true);
            const r = await service.saveCustomer(customer?.id ?? null, d);
            setSaving(false);
            if (!r.ok) return setErrors(r.errors);
            onSaved?.(r.value);
            onClose();
          }}
        />
      }
    >
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <div className="col-span-2"><Text label="Nome" autoFocus value={d.name} onChange={(v) => set("name", v)} /></div>
        <Text label="NIF" help="Usado na fatura" value={d.nif} onChange={(v) => set("nif", v)} />
        <Text label="Contacto" value={d.contactName} onChange={(v) => set("contactName", v)} />
        <div className="col-span-2"><Text label="Morada de faturação" value={d.billingAddress} onChange={(v) => set("billingAddress", v)} /></div>
        <Text label="Telefone" type="tel" value={d.phone} onChange={(v) => set("phone", v)} />
        <Text label="Email" type="email" value={d.email} onChange={(v) => set("email", v)} />
        <div className="col-span-2">
          <Field label="Notas"><textarea className="ui-input" rows={3} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        {errors.length ? <Notice className="col-span-2" title="Não foi possível guardar">{errors.join(" ")}</Notice> : null}
        {customer ? <p className="col-span-2 text-[12px] text-[var(--text-3)]">Os trabalhos e documentos já emitidos mantêm os dados do cliente do momento em que foram criados.</p> : null}
      </div>
    </Drawer>
  );
}

type SiteForm = Omit<SiteDraft, "lat" | "lng"> & { coords: string };

const parseCoords = (s: string): { lat: number; lng: number } | null => {
  const m = s.split(",").map((x) => Number(x.trim()));
  return m.length === 2 && m.every(Number.isFinite) ? { lat: m[0], lng: m[1] } : null;
};

export function SiteEditor({ site, initial, onClose, onSaved }: { site?: Site; initial?: Partial<SiteDraft>; onClose: () => void; onSaved?: (s: Site) => void }) {
  const { state, service } = useOperations();
  const src = site ?? initial;
  const [f, setF] = useState<SiteForm>(() => ({
    customerId: src?.customerId,
    name: src?.name ?? "",
    address: src?.address ?? "",
    locality: src?.locality,
    postalCode: src?.postalCode,
    country: src?.country ?? "PT",
    geocodedAddress: src?.geocodedAddress,
    openingHours: src?.openingHours,
    contactName: src?.contactName,
    phone: src?.phone,
    accessNotes: src?.accessNotes,
    coords: src && Number.isFinite(src.lat) && Number.isFinite(src.lng) ? `${src.lat!.toFixed(5)}, ${src.lng!.toFixed(5)}` : "",
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof SiteForm>(k: K, v: SiteForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const stale = !!f.coords && !siteCoordinatesCurrent({ address: f.address, geocodedAddress: f.geocodedAddress });
  const blockers = site ? recordDeleteBlockers("site", site.id, state.jobs, state.documents, state.sites) : [];
  const done = (r: { ok: true } | { ok: false; errors: string[] }) => (r.ok ? onClose() : setErrors(r.errors));
  const locate = async () => {
    setLocating(true);
    const q = [f.address, f.postalCode, f.locality].filter(Boolean).join(", ");
    const ll = await resolveStopCoordinates(q, undefined, f.name);
    setLocating(false);
    if (!ll) return setErrors([`Não foi possível localizar «${q}». Indique as coordenadas manualmente.`]);
    setErrors([]);
    setF((p) => ({ ...p, coords: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, geocodedAddress: p.address }));
  };
  const customers = state.customers.filter((c) => !c.archivedAt || c.id === f.customerId).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return (
    <Drawer
      width={560}
      title={site ? site.name : "Novo local"}
      subtitle={site?.archivedAt ? "Arquivado" : site?.isDemo ? "Registo demo" : undefined}
      onClose={onClose}
      footer={
        <RecordFooter
          archived={!!site?.archivedAt}
          onArchive={site ? async () => done(await service.setArchived("site", site.id, !site.archivedAt)) : undefined}
          onDelete={site ? async () => done(await service.deleteResource("site", site.id)) : undefined}
          deleteBlocked={blockers[0]}
          onClose={onClose}
          saving={saving}
          onSave={async () => {
            const ll = parseCoords(f.coords);
            const { coords: _c, ...rest } = f;
            void _c;
            setSaving(true);
            const r = await service.saveSite(site?.id ?? null, { ...rest, lat: ll?.lat ?? NaN, lng: ll?.lng ?? NaN });
            setSaving(false);
            if (!r.ok) return setErrors(r.errors);
            onSaved?.(r.value);
            onClose();
          }}
        />
      }
    >
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <div className="col-span-2"><Text label="Nome do local" autoFocus value={f.name} onChange={(v) => set("name", v)} help="ex.: Armazém Sonae Azambuja" /></div>
        <div className="col-span-2">
          <Field label="Cliente">
            <select className="ui-input" value={f.customerId ?? ""} onChange={(e) => set("customerId", e.target.value || undefined)}>
              <option value="">— sem cliente associado —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="col-span-2"><Text label="Morada" value={f.address} onChange={(v) => set("address", v)} /></div>
        <Text label="Localidade" value={f.locality} onChange={(v) => set("locality", v)} />
        <Text label="Código postal" value={f.postalCode} onChange={(v) => set("postalCode", v)} />
        <div className="col-span-2">
          <Field label="Coordenadas (lat, lng)" help={stale ? undefined : "Reutilizadas em todos os trabalhos — não se volta a geolocalizar."} error={stale ? "A morada mudou depois de as coordenadas serem localizadas — localize de novo ou confirme." : undefined}>
            <div className="flex gap-2">
              <input className="ui-input num" value={f.coords} onChange={(e) => setF((p) => ({ ...p, coords: e.target.value, geocodedAddress: p.address }))} placeholder="41.18, -8.69" />
              <Button icon={<LocateFixed className="h-3.5 w-3.5" />} disabled={locating || !f.address.trim()} onClick={locate}>{locating ? "A localizar…" : "Localizar"}</Button>
            </div>
          </Field>
        </div>
        <Text label="Horário" value={f.openingHours} onChange={(v) => set("openingHours", v)} help="ex.: dias úteis 07:00–18:00" />
        <Text label="Contacto no local" value={f.contactName} onChange={(v) => set("contactName", v)} />
        <Text label="Telefone" type="tel" value={f.phone} onChange={(v) => set("phone", v)} />
        <div className="col-span-2">
          <Field label="Notas de acesso"><textarea className="ui-input" rows={2} value={f.accessNotes ?? ""} onChange={(e) => set("accessNotes", e.target.value)} /></Field>
        </div>
        {errors.length ? <Notice className="col-span-2" title="Não foi possível guardar">{errors.join(" ")}</Notice> : null}
        {site ? <p className="col-span-2 text-[12px] text-[var(--text-3)]">Os trabalhos existentes mantêm a morada copiada quando a paragem foi criada.</p> : null}
      </div>
    </Drawer>
  );
}
