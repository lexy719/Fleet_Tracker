import type { ReactNode } from "react";
import { Button, Drawer, Field as KitField, Notice, SectionTitle } from "../../ui/kit";

/* Resource forms (trucks, trailers, drivers): one drawer + field language from the UI kit. */

export const inputCls = "ui-input";

export function FormDrawer({
  title,
  eyebrow,
  onClose,
  onSubmit,
  busy,
  errors,
  submitLabel,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  errors: string[];
  submitLabel: string;
  children: ReactNode;
}) {
  const formId = `form-${title.replace(/\W+/g, "-")}`;
  return (
    <Drawer
      title={title}
      subtitle={eyebrow}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>{busy ? "A gravar…" : submitLabel}</Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-6 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {errors.length > 0 ? (
          <Notice title="Não foi possível gravar — corrija os campos indicados">
            <ul className="list-disc pl-4">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
          </Notice>
        ) : null}
      </form>
    </Drawer>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section>
      <SectionTitle className="mb-1">{title}</SectionTitle>
      {hint ? <p className="mb-2.5 text-[12px] text-[var(--text-3)]">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <KitField label={label}>{children}</KitField>;
}

/** "" → undefined; otherwise a number (NaN is kept so validation reports it). */
export function optNum(s: string): number | undefined {
  const t = s.trim();
  return t === "" ? undefined : Number(t.replace(",", "."));
}
export const numStr = (n: number | undefined) => (n === undefined ? "" : String(n));
