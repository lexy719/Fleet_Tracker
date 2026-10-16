// DEV-only workspace state. Reads the lab's synthetic world (never production state)
// and keeps the office user's changes in a local, resettable store.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ATTENTION,
  DRIVER_POOL,
  NOW,
  ROUTES,
  STATUS_LABEL,
  TRAILERS,
  WORLD_JOBS,
  driverWorld,
  truckWorld,
  type AttentionItem,
  type JobStatus,
  type WorldJob,
} from "../fleetos-environment/world";

export type View = "hoje" | "inbox" | "operacao" | "dia" | "quadro" | "tabela" | "planeamento";
export type Job = WorldJob & { routeKm: number };
type Saved = {
  jobs: Record<string, Partial<Pick<WorldJob, "driverId" | "truckId" | "trailerId" | "status">>>;
  done: string[];
  checks: Record<string, boolean>;
  notes: string[];
};
const KEY = "fleetos-workspace-v1";
const empty: Saved = { jobs: {}, done: [], checks: {}, notes: [] };
function load(): Saved {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return empty;
  }
}

export const driverName = (id: string) => (id ? driverWorld(id).name : "");
export const truckPlate = (id: string) => (id ? truckWorld(id).plate : "");
export const statusLabel = (s: JobStatus) => STATUS_LABEL[s];
export const routeLabel = (j: WorldJob) => `${j.stops[0].city} → ${j.stops.at(-1)!.city}`;
export const DRIVERS = DRIVER_POOL.map((d) => ({ ...d, name: driverName(d.id) }));
export const FREE_TRAILERS = Object.values(TRAILERS).filter((t) => t.location);

export type Level = "bad" | "warn" | "ok";
export function levelOf(j: WorldJob, open: AttentionItem[]): Level {
  const a = open.filter((x) => x.jobId === j.id);
  if (a.some((x) => x.severity === "BLOCKER" || x.severity === "ACTION_REQUIRED")) return "bad";
  if (a.length || j.sla === "at_risk") return "warn";
  return "ok";
}

type Ctx = {
  jobs: Job[];
  job: (id: string) => Job;
  attention: AttentionItem[];
  checks: Record<string, boolean>;
  view: View;
  setView: (v: View) => void;
  openJob: string | null;
  setOpenJob: (id: string | null) => void;
  wizard: string | null;
  setWizard: (id: string | null) => void;
  assignDriver: (jobId: string, driverId: string) => void;
  assignTrailer: (jobId: string, trailerId: string) => void;
  setStatus: (jobId: string, s: JobStatus) => void;
  resolve: (attentionId: string, message: string) => void;
  toggleCheck: (key: string) => void;
  toast: string | null;
  say: (m: string) => void;
  log: string[];
  reset: () => void;
};
const C = createContext<Ctx | null>(null);
export const useWs = () => useContext(C)!;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [view, setView] = useState<View>("hoje");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* private mode: keep in memory only */
    }
  }, [saved]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const jobs = useMemo<Job[]>(
    () => WORLD_JOBS.map((j) => ({ ...j, ...saved.jobs[j.id], routeKm: ROUTES[j.routeId]?.km ?? j.stops.at(-1)!.km })),
    [saved.jobs],
  );
  const attention = useMemo(() => ATTENTION.filter((a) => !saved.done.includes(a.id)), [saved.done]);
  const say = useCallback((m: string) => setToast(m), []);
  const patchJob = (id: string, p: Saved["jobs"][string], note: string) =>
    setSaved((s) => ({ ...s, jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...p } }, notes: [`${NOW.clock} · ${note}`, ...s.notes].slice(0, 30) }));

  const value: Ctx = {
    jobs,
    job: (id) => jobs.find((j) => j.id === id)!,
    attention,
    checks: saved.checks,
    view,
    setView: (v) => {
      setOpenJob(null);
      setView(v);
    },
    openJob,
    setOpenJob,
    wizard,
    setWizard,
    assignDriver: (jobId, driverId) => {
      patchJob(jobId, { driverId }, `${jobId}: motorista ${driverName(driverId)}`);
      setToast(`${driverName(driverId)} atribuído ao ${jobId}`);
    },
    assignTrailer: (jobId, trailerId) => {
      patchJob(jobId, { trailerId, ...(jobs.find((j) => j.id === jobId)?.status === "backlog" ? { status: "assigned" as const } : {}) }, `${jobId}: reboque ${TRAILERS[trailerId]?.plate ?? trailerId}`);
      const a = ATTENTION.find((x) => x.jobId === jobId && x.lead === "Trucks");
      if (a) setSaved((s) => ({ ...s, done: [...new Set([...s.done, a.id])] }));
      setToast(`Reboque ${TRAILERS[trailerId]?.plate ?? trailerId} atribuído ao ${jobId}`);
    },
    setStatus: (jobId, status) => {
      patchJob(jobId, { status }, `${jobId}: ${STATUS_LABEL[status]}`);
      setToast(`${jobId} → ${STATUS_LABEL[status]}`);
    },
    resolve: (id, message) => {
      setSaved((s) => ({ ...s, done: [...new Set([...s.done, id])], notes: [`${NOW.clock} · ${message}`, ...s.notes].slice(0, 30) }));
      setToast(message);
    },
    toggleCheck: (key) => setSaved((s) => ({ ...s, checks: { ...s.checks, [key]: !s.checks[key] } })),
    toast,
    say,
    log: saved.notes,
    reset: () => {
      setSaved(empty);
      setToast("Dados de demonstração repostos");
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
