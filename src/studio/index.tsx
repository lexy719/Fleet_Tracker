// FleetOS Studio — DEV. One continuous operations stage: the map persists, the
// transport you pick becomes its own working panel, and every change is previewed
// on the plan and the map before it is confirmed. Source: ?source=ops (application
// store) or the lab world (default).
import { useEffect, useState } from "react";
import { setWorld } from "./world/active";
import { labWorld } from "./world/lab";
import { Studio } from "./Studio";
import { OperationsServiceProvider } from "../context/OperationsContext";
import { IngestionProvider } from "../context/IngestionContext";
import { FuelProvider } from "../context/FuelContext";
import { RoadEventsProvider } from "../context/RoadEventsContext";
import { W } from "./world/active";
import { fetchRoad } from "./world/roads";
import "./studio.css";
import "./palcos.css";

/** The application's operational store by default; ?source=lab opens the demonstration world. */
const SOURCE = new URLSearchParams(window.location.search).get("source") === "lab" ? "lab" : "ops";

export default function StudioRoot() {
  // Bumped whenever the operational store changes (a command was committed here or in another tab).
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ ready: boolean; error: string | null }>(() => {
    if (SOURCE === "lab") {
      setWorld(labWorld());
      return { ready: true, error: null };
    }
    return { ready: false, error: null };
  });
  useEffect(() => {
    if (SOURCE !== "ops") return;
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        const [{ connectedRuntime }, { opsWorld }] = await Promise.all([
          import("../application/connectedRuntime"),
          import("./world/ops"),
        ]);
        const rt = await connectedRuntime("auto");
        const label =
          rt.source === "saved" ? "Dados operacionais · armazenamento da aplicação" : "Dados operacionais · cópia de demonstração";
        const build = () => {
          const st = rt.service.getState();
          setWorld(opsWorld(st, new Date(), label, { service: rt.service, customers: st.customers, sites: st.sites, persistent: rt.persistent }));
        };
        // Straight lines become roads as TomTom answers (3 at a time), without blocking the page.
        let fetching = false;
        const fetchRoads = async () => {
          if (fetching) return;
          fetching = true;
          try {
            for (let round = 0; round < 40; round++) {
              const todo = (W().roadsToFetch ?? []).slice(0, 3);
              if (!todo.length || !alive) break;
              await Promise.all(todo.map((t) => fetchRoad(t.key, t.stops)));
              if (!alive) break;
              build();
              setVersion((v) => v + 1);
            }
          } finally {
            fetching = false;
          }
        };
        build();
        unsubscribe = rt.service.subscribe(() => {
          build();
          if (alive) setVersion((v) => v + 1);
          void fetchRoads();
        });
        void fetchRoads();
        if (alive) setState({ ready: true, error: rt.error });
      } catch (e) {
        if (alive) setState({ ready: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);
  if (!state.ready)
    return (
      <div className="studio studio-loading">
        <span className="brand">
          <span className="brand-mark" aria-hidden />
          {state.error ? `Não foi possível abrir os dados: ${state.error}` : "A abrir os dados operacionais…"}
        </span>
      </div>
    );
  const ops = W().ops;
  if (!ops) return <Studio version={version} />;
  // Operational source: the same providers as the application, so planning runs the app's
  // own session (Road Intelligence, fuel intelligence, road events) on this service.
  return (
    <OperationsServiceProvider service={ops.service}>
      <IngestionProvider>
        <FuelProvider>
          <RoadEventsProvider>
            <Studio version={version} />
          </RoadEventsProvider>
        </FuelProvider>
      </IngestionProvider>
    </OperationsServiceProvider>
  );
}
