import { OperationsService } from "../../../application/operations";
import { buildDemoSeed } from "../../../data/mockData";
import {
  IdbOperationalStore,
  MemoryOperationalStore,
  type OperationalStore,
} from "../../../repositories/operationalStore";
import { fail, type Result } from "../../../domain/events";
import type { Job, JobStatus } from "../../../data/types";

export const ENVIRONMENT_DEMO_DB = "fleetos-environment-operations-v1";
export type ConnectedRuntime = {
  service: OperationsService;
  source: "saved" | "demo";
  persistent: boolean;
  error: string | null;
  commands: ReturnType<typeof environmentCommands>;
};

/** Expected revision is checked after reloading, then the service's atomic commit checks it again. */
export function environmentCommands(service: OperationsService) {
  let queue: Promise<unknown> = Promise.resolve();
  const command = (
    id: string,
    revision: number,
    write: () => Promise<Result<Job>>,
  ) => {
    const run = async () => {
      await service.load();
      if (service.getState().error) return fail(service.getState().error!);
      const job = service.getState().jobs.find((j) => j.id === id);
      if (!job || job.revision !== revision)
        return fail(
          "Este transporte mudou desde que abriu a edição. Reveja os dados e volte a editar.",
        );
      return write();
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    notes: (id: string, revision: number, text: string) =>
      command(id, revision, () => service.updateNotes(id, text)),
    stop: (id: string, revision: number, stopId: string, completed: boolean) =>
      command(id, revision, () =>
        service.setStopCompleted(id, stopId, completed),
      ),
    transition: (id: string, revision: number, to: JobStatus) =>
      command(id, revision, () => service.transition(id, to)),
  };
}

const runtimes = new Map<string, Promise<ConnectedRuntime>>();
export function connectedRuntime(
  source: "auto" | "saved" | "demo" = "auto",
): Promise<ConnectedRuntime> {
  let promise = runtimes.get(source);
  if (!promise) {
    promise = openRuntime(source);
    runtimes.set(source, promise);
    promise.catch(() => runtimes.delete(source));
  }
  return promise;
}
async function openRuntime(
  source: "auto" | "saved" | "demo",
): Promise<ConnectedRuntime> {
  if (source !== "demo") {
    const savedStore = await IdbOperationalStore.open();
    const saved = new OperationsService(savedStore);
    await saved.load();
    if (saved.getState().error) {
      savedStore.close();
      throw new Error(saved.getState().error!);
    }
    if (source === "saved" || saved.getState().jobs.length)
      return {
        service: saved,
        source: "saved",
        persistent: true,
        error: null,
        commands: environmentCommands(saved),
      };
    savedStore.close();
  }
  if (source === "auto") return connectedRuntime("demo");
  let store: OperationalStore;
  let persistent = true;
  let error: string | null = null;
  try {
    store = await IdbOperationalStore.open(ENVIRONMENT_DEMO_DB);
  } catch {
    store = new MemoryOperationalStore();
    persistent = false;
    error = "As alterações desta sessão não serão guardadas neste dispositivo.";
  }
  if (!(await store.getMeta("environmentSeed"))) {
    const seed = buildDemoSeed();
    const existing = await store.loadAll();
    if (!existing.jobs.length)
      await store.commit({
        put: seed,
        meta: { environmentSeed: new Date().toISOString() },
        expectJobRevisions: Object.fromEntries(
          seed.jobs.map((j) => [j.id, null]),
        ),
      });
  }
  const service = new OperationsService(store);
  await service.load();
  if (service.getState().error) throw new Error(service.getState().error!);
  return {
    service,
    source: "demo",
    persistent,
    error,
    commands: environmentCommands(service),
  };
}
