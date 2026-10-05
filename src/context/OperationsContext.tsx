import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { OperationsService, type OpsState } from "../application/operations";
import { buildDemoSeed, legacyDemoJobs } from "../data/mockData";
import { MemoryOperationalStore, IdbOperationalStore, type OperationalStore } from "../repositories/operationalStore";
import { migrateInvoiceCounter, reanchorDemoStore, seedDemoRecords, type LegacyInvoiceSettings } from "../repositories/upkeep";
import { bootstrapOperationalStore, LEGACY_IMPORTED_MARKER, LEGACY_JOBS_KEY, type BootstrapReport } from "../repositories/bootstrap";

/*
 * Operational runtime for the browser: opens IndexedDB "fleetos-operations", runs the
 * one-time bootstrap (legacy import + demo seed) and exposes the OperationsService.
 * The app renders operational screens only once the store is loaded.
 */

type Runtime = { service: OperationsService; persistent: boolean; bootstrap: BootstrapReport | null; error: string | null };

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Invoice series as Settings stored it before Phase 5.6B (read-only source). */
function readLegacyInvoiceSettings(): LegacyInvoiceSettings {
  const raw = readLocal("fleet-settings-v1");
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { invoicePrefix?: unknown; invoiceNextSeq?: unknown };
    return typeof s.invoicePrefix === "string" && typeof s.invoiceNextSeq === "number" ? { invoicePrefix: s.invoicePrefix, invoiceNextSeq: s.invoiceNextSeq } : null;
  } catch {
    return null;
  }
}

async function createRuntime(): Promise<Runtime> {
  let store: OperationalStore;
  let persistent = true;
  let error: string | null = null;
  try {
    store = await IdbOperationalStore.open();
  } catch (e) {
    // Never pretend: the UI shows that changes will not survive a reload.
    store = new MemoryOperationalStore();
    persistent = false;
    error = `IndexedDB indisponível — os dados não serão guardados (${e instanceof Error ? e.message : String(e)})`;
  }
  const service = new OperationsService(store);
  let bootstrap: BootstrapReport | null = null;
  try {
    const now = new Date();
    const seed = buildDemoSeed();
    bootstrap = await bootstrapOperationalStore({
      store,
      seed,
      legacySeedJobs: legacyDemoJobs,
      legacyRaw: readLocal(LEGACY_JOBS_KEY),
      legacyMarker: readLocal(LEGACY_IMPORTED_MARKER) !== null,
      now,
    });
    await seedDemoRecords(store, seed, now);
    await migrateInvoiceCounter(store, readLegacyInvoiceSettings(), now);
    await reanchorDemoStore(store, now);
    if (bootstrap.legacy) {
      try {
        localStorage.setItem(LEGACY_IMPORTED_MARKER, bootstrap.legacy.at);
      } catch {
        /* marker is a secondary guard; the store meta is authoritative */
      }
    }
  } catch (e) {
    error = `Falha na inicialização dos dados operacionais: ${e instanceof Error ? e.message : String(e)}`;
  }
  await service.load();
  await service.refreshSla();
  return { service, persistent, bootstrap, error };
}

let runtimePromise: Promise<Runtime> | null = null;
function getRuntime(): Promise<Runtime> {
  runtimePromise ??= createRuntime();
  return runtimePromise;
}

type Ctx = { service: OperationsService; persistent: boolean; bootstrap: BootstrapReport | null; error: string | null };
const OperationsContext = createContext<Ctx | null>(null);

export function OperationsProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [rt, setRt] = useState<Runtime | null>(null);
  useEffect(() => {
    let alive = true;
    void getRuntime().then((r) => alive && setRt(r));
    return () => {
      alive = false;
    };
  }, []);
  if (!rt) return <>{fallback ?? <OpsLoading />}</>;
  return <OperationsContext.Provider value={rt}>{children}</OperationsContext.Provider>;
}

/** Test/embedding helper: provide an already-built service. */
export function OperationsServiceProvider({ service, children }: { service: OperationsService; children: ReactNode }) {
  const value = useMemo(() => ({ service, persistent: false, bootstrap: null, error: null }), [service]);
  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

/** Shell-shaped placeholder while the store opens (no flash of empty content). */
function OpsLoading() {
  return (
    <div className="flex h-dvh bg-[var(--bg)]" aria-busy="true" aria-label="A carregar dados operacionais">
      <div className="w-[var(--sidebar-w)] shrink-0 border-r border-[var(--border)] bg-[var(--surface)]" />
      <div className="flex flex-1 flex-col">
        <div className="h-[var(--topbar-h)] border-b border-[var(--border)] bg-[var(--surface)]" />
        <div className="flex-1 space-y-3 bg-[var(--surface)] px-8 py-6">
          <div className="ui-skeleton h-4 w-40" />
          <div className="ui-skeleton h-3 w-80" />
          <div className="ui-skeleton h-3 w-72" />
        </div>
      </div>
    </div>
  );
}

export function useOperationsRuntime(): Ctx {
  const ctx = useContext(OperationsContext);
  if (!ctx) throw new Error("useOperations must be used inside <OperationsProvider>");
  return ctx;
}

export function useOperations(): { state: OpsState; service: OperationsService } {
  const { service } = useOperationsRuntime();
  const state = useSyncExternalStore(service.subscribe, service.getState);
  return { state, service };
}
