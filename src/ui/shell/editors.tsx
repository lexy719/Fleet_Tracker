import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { JobFormModal } from "../../components/jobs/JobFormModal";
import { TruckFormModal } from "../../components/fleet/TruckFormModal";
import { TrailerFormModal } from "../../components/fleet/TrailerFormModal";
import { DriverFormModal } from "../../components/drivers/DriverFormModal";
import { useJobs } from "../../context/JobsContext";
import { useFleetData } from "../../context/FleetDataContext";
import { paths } from "../../lib/appLinks";

/*
 * Global create / edit drawers, reachable from anywhere (quick create, rows, detail pages)
 * without leaving the current workspace.
 */

type Editor =
  | { kind: "job"; id?: string }
  | { kind: "truck"; id?: string }
  | { kind: "trailer"; id?: string }
  | { kind: "driver"; id?: string };

type Ctx = {
  openJob: (id?: string) => void;
  openTruck: (id?: string) => void;
  openTrailer: (id?: string) => void;
  openDriver: (id?: string) => void;
};

const EditorsContext = createContext<Ctx | null>(null);

export function EditorsProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const close = useCallback(() => setEditor(null), []);
  const value = useMemo<Ctx>(
    () => ({
      openJob: (id) => setEditor({ kind: "job", id }),
      openTruck: (id) => setEditor({ kind: "truck", id }),
      openTrailer: (id) => setEditor({ kind: "trailer", id }),
      openDriver: (id) => setEditor({ kind: "driver", id }),
    }),
    [],
  );
  return (
    <EditorsContext.Provider value={value}>
      {children}
      {editor ? <EditorHost editor={editor} onClose={close} /> : null}
    </EditorsContext.Provider>
  );
}

function EditorHost({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { getJob } = useJobs();
  const { getTruck, getTrailer, getDriver } = useFleetData();
  const navigate = useNavigate();
  switch (editor.kind) {
    case "job": {
      const job = editor.id ? getJob(editor.id) : undefined;
      return <JobFormModal job={job} onClose={onClose} onSaved={(j) => (!job ? navigate(paths.workJob(j.id)) : undefined)} />;
    }
    case "truck":
      return <TruckFormModal truck={editor.id ? getTruck(editor.id) : undefined} onClose={onClose} onSaved={(t) => navigate(paths.truck(t.id))} />;
    case "trailer":
      return <TrailerFormModal trailer={editor.id ? getTrailer(editor.id) : undefined} onClose={onClose} onSaved={(t) => navigate(paths.trailer(t.id))} />;
    case "driver":
      return <DriverFormModal driver={editor.id ? getDriver(editor.id) : undefined} onClose={onClose} onSaved={(d) => navigate(paths.driver(d.id))} />;
  }
}

export function useEditors(): Ctx {
  const c = useContext(EditorsContext);
  if (!c) throw new Error("useEditors outside EditorsProvider");
  return c;
}
