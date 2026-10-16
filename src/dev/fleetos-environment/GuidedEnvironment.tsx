import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EnvironmentMap } from "./EnvironmentMap";
import type { EnvironmentMapApi } from "./mapApi";
import {
  DOMAINS,
  INITIAL_CAMERA,
  type CameraTarget,
  type MapScene,
} from "./mapTypes";
import { demoContext, jobById } from "./guidedContent";
import {
  changeGuidedState,
  guidedCamera,
  guidedLayout,
  guidedMapScene,
  initialGuidedState,
  type GuidedAction,
  type GuidedFrame,
  type GuidedLayout,
  type GuidedState,
  type Zone,
} from "./guidedWorkspace";
import { StationDetail, FutureSurface } from "./GuidedSurfaces";
import "./guided.css";
import "./environment.css";
import "./product.css";
import "./fx/fleetos.css";
import "./fx/fidelity.css";
import "./fx/living.css";
import "./fx/entity.css";
import { ContextCard, SpatialInspector } from "./fx/Spatial";
import { EntityRegion } from "./fx/EntityRegions";
import { SharedWorkInstrument } from "./fx/SharedWork";
import { sharedWork, usesSharedWork } from "./sharedComposition";
import "./fx/sharedWork.css";
import { anchorJob, mainLens, type GuidedLens } from "./guidedWorkspace";
import { hasTransportGeometry, spatialLabel } from "./spatialQuestions";
import {
  AnchorStrip,
  DevDrawer,
  MapCaption,
  PendingBar,
  Rail,
  entityTitle,
} from "./fx/Chrome";
import { AttentionBase, JobsCollection } from "./fx/Attention";
import { RouteInstrument } from "./fx/RouteInstrument";
import { DossierInstrument } from "./fx/DossierInstrument";
import { RestrictionInstrument } from "./fx/RestrictionInstrument";
import { TransportOverview } from "./fx/TransportOverview";
import { ConsequenceLines, FactColumn } from "./fx/Supports";
import { HonestySpecimen } from "./fx/HonestySpecimen";
import {
  DocumentRegister,
  DriversRoster,
  FleetRoster,
  JourneysOverview,
  RestrictionsOverview,
} from "./fx/Collections";
import { snapshotObjects } from "./fx/sceneSnapshot";
import { LivingScene, type SceneSurface } from "./fx/LivingScene";
import { sceneIdentity } from "./sceneIdentity";
import { labWorld } from "./fx/model";
import "./fx/morph.css";
import { WorkspaceTabs } from "./fx/WorkspaceTabs";
import { PersistentObjects } from "./fx/PersistentObjects";
import {
  navigateWorkspace,
  mergeWorkspace,
  separateWorkspace,
  workspaceKey,
  withCurrentWorld,
  type WorkspaceTab,
} from "./workspaceTabs";
import { MORPH_DURATION } from "./motion";
import { INTERACTION_GRAPH, transitionKey } from "./interactionGraph";
import {
  InteractionDiagnostics,
  type Coverage,
} from "./InteractionDiagnostics";
const FONT_ID = "fleetos-lab-fonts";
const COLLECTION_TITLE: Record<string, string> = {
  Jobs: "Transportes",
  Drivers: "Motoristas",
  Trucks: "Frota",
  Fuel: "Viagens",
  Restrictions: "Restrições",
  Documents: "Documentos",
};
const workspaceTitle = (s: ReturnType<typeof initialGuidedState>) => {
  if (sharedWork(s))
    return [
      sharedWork(s)!.title,
      ...(s.anchor.kind === "jobs" ? [] : [entityTitle(s)]),
    ].join(" · ");
  const base =
    s.anchor.kind === "jobs"
      ? (COLLECTION_TITLE[mainLens(s) ?? ""] ?? "Operação")
      : entityTitle(s);
  const added = s.active.filter((domain) => domain !== mainLens(s));
  return [
    base,
    ...added.map((domain) => COLLECTION_TITLE[domain] ?? domain),
  ].join(" + ");
};
export default function GuidedEnvironment() {
  const canvas = useRef<HTMLElement>(null),
    mapApi = useRef<EnvironmentMapApi>(null);
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [state, setState] = useState(initialGuidedState),
    [history, setHistory] = useState<GuidedFrame[]>([]);
  const [activeTab, setActiveTab] = useState(() =>
    workspaceKey(initialGuidedState()),
  );
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => [
    {
      id: workspaceKey(state),
      title: workspaceTitle(state),
      history: [],
      frame: {
        state: structuredClone(state),
        layout: guidedLayout(state, size.width, size.height),
        camera: INITIAL_CAMERA,
        scroll: {},
      },
    },
  ]);
  const [sceneSession, setSceneSession] = useState(0);
  const [restored, setRestored] = useState<GuidedLayout | null>(null),
    [revision, setRevision] = useState(0);
  const [cameraCommand, setCameraCommand] = useState<CameraTarget | null>(null);
  // «Fit» only acts after the operator moved the camera by hand; every new composition frames itself.
  const [userMoved, setUserMoved] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const pendingScroll = useRef<Record<string, number> | null>(null);
  const pendingReturn = useRef<GuidedFrame | null>(null);
  const [continuity, setContinuity] = useState<ReturnType<
    typeof snapshotObjects
  > | null>(null);
  const [coverage, setCoverage] = useState<Coverage>({});
  const [showGraph, setShowGraph] = useState(false);
  const [showSpecimen, setShowSpecimen] = useState(false);
  // DEV-only slow motion for transition review (like DevTools animation slowdown).
  const [slow, setSlow] = useState(1);
  const layout = useMemo(
    () =>
      restored &&
      restored.viewport.width === size.width &&
      restored.viewport.height === size.height
        ? restored
        : guidedLayout(state, size.width, size.height),
    [state, size, restored],
  );
  const [emphasis, setEmphasis] = useState<MapScene["emphasis"]>();
  const identityWorld = useMemo(() => labWorld(state), [state]);
  const scene = useMemo(() => {
    const scene = guidedMapScene(state);
    const ctx = demoContext(
      jobById(anchorJob(state.anchor) ?? "J-4217"),
      state.assignment,
    );
    return {
      ...scene,
      emphasis:
        emphasis?.kind === "stop"
          ? {
              ...emphasis,
              point: ctx.stops.find((s) => s.id === emphasis.id)?.point,
            }
          : emphasis,
    };
  }, [state, emphasis]);
  const highlight = (target: EventTarget | null) => {
    const el =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-map-entity]")
        : null;
    const next = el
      ? {
          kind: el.dataset.mapEntity as NonNullable<
            MapScene["emphasis"]
          >["kind"],
          id: el.dataset.entityId,
        }
      : undefined;
    setEmphasis((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  };
  useEffect(() => {
    const resize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(query.matches);
    query.addEventListener("change", motion);
    return () => {
      window.removeEventListener("resize", resize);
      query.removeEventListener("change", motion);
    };
  }, []);
  useEffect(() => {
    // DEV lab only: the display grotesk is loaded here, never in the production shell.
    if (document.getElementById(FONT_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
  function captureScroll() {
    return Object.fromEntries(
      Array.from(
        canvas.current?.querySelectorAll<HTMLElement>("[data-guided-scroll]") ??
          [],
      )
        .filter((el) => el.closest('[data-visible="true"]'))
        .map((el) => [el.dataset.guidedScroll!, el.scrollTop]),
    );
  }
  function captureFrame(): GuidedFrame {
    return {
      workspaceId: activeTab,
      state: structuredClone(state),
      layout: structuredClone(layout),
      camera: mapApi.current?.getCamera() ?? INITIAL_CAMERA,
      scroll: captureScroll(),
    };
  }
  function rememberCurrent() {
    const frame = captureFrame();
    return tabs.map((tab) =>
      tab.id === activeTab
        ? { ...tab, frame, history: structuredClone(history) }
        : tab,
    );
  }
  function restoreTab(tab: WorkspaceTab, remembered: WorkspaceTab[]) {
    const frame = withCurrentWorld(tab.frame, state);
    setTabs(remembered);
    setActiveTab(tab.id);
    setContinuity(snapshotObjects(canvas.current));
    setState(frame.state);
    setRestored(frame.layout);
    setHistory(tab.history.map((item) => withCurrentWorld(item, state)));
    setCameraCommand({ kind: "restore", camera: frame.camera });
    pendingScroll.current = frame.scroll;
    setUserMoved(false);
    setRevision((r) => r + 1);
  }
  function selectTab(id: string) {
    if (id === activeTab) return;
    const remembered = rememberCurrent();
    const target = remembered.find((tab) => tab.id === id);
    if (target) restoreTab(target, remembered);
  }
  function returnToWorkspace(frame: GuidedFrame): boolean {
    if (!frame.workspaceId || frame.workspaceId === activeTab) return false;
    const remembered = rememberCurrent();
    const target = remembered.find((tab) => tab.id === frame.workspaceId) ?? {
      id: frame.workspaceId,
      title: workspaceTitle(frame.state),
      frame,
      history: [],
    };
    restoreTab(
      target,
      remembered.some((tab) => tab.id === target.id)
        ? remembered
        : [...remembered, target],
    );
    return true;
  }
  function closeTab(id: string) {
    if (tabs.length <= 1) return;
    const remembered = rememberCurrent().filter((tab) => tab.id !== id);
    if (id !== activeTab) {
      setTabs(remembered);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    restoreTab(remembered[Math.max(0, index - 1)], remembered);
  }
  function openWorkspace(
    requested: typeof state,
    composition = true,
    carryAction = false,
  ) {
    const next = composition
      ? carryAction
        ? structuredClone(requested)
        : { ...structuredClone(requested), pending: null, edit: null }
      : separateWorkspace(requested);
    const id = workspaceKey(next);
    if (id === activeTab) return;
    const remembered = rememberCurrent();
    const existing = remembered.find((tab) => tab.id === id);
    if (existing && !carryAction) {
      // Following a relationship has a fresh source even when its destination
      // already has a tab. Content removal still restores that composition's
      // own captured history rather than making a back-navigation cycle.
      const followsAnchor =
        JSON.stringify(next.anchor) !== JSON.stringify(state.anchor);
      restoreTab(
        followsAnchor
          ? { ...existing, history: [...existing.history, captureFrame()] }
          : existing,
        remembered,
      );
      return;
    }
    const destination = guidedLayout(next, size.width, size.height);
    const previous = captureFrame();
    const destinationHistory =
      carryAction && existing ? [...existing.history, previous] : [previous];
    const frame: GuidedFrame = {
      workspaceId: id,
      state: structuredClone(next),
      layout: destination,
      camera: previous.camera,
      scroll: {},
    };
    setTabs([
      ...remembered.filter((tab) => tab.id !== id),
      { id, title: workspaceTitle(next), frame, history: destinationHistory },
    ]);
    setActiveTab(id);
    setContinuity(snapshotObjects(canvas.current));
    setState(next);
    setRestored(null);
    setHistory(destinationHistory);
    setCameraCommand(guidedCamera(next, destination));
    pendingScroll.current = {};
    setUserMoved(false);
    setRevision((r) => r + 1);
  }
  function openPerspective(domain: GuidedLens) {
    openWorkspace(navigateWorkspace(state, domain), false);
  }
  function act(action: GuidedAction) {
    if (action.type === "work-return") {
      const source =
        history
          .map((frame, index) =>
            usesSharedWork(frame.state) &&
            JSON.stringify(frame.state.anchor) ===
              JSON.stringify(state.anchor) &&
            JSON.stringify([...frame.state.active].sort()) ===
              JSON.stringify([...state.active].sort()) &&
            JSON.stringify(frame.state.pending) ===
              JSON.stringify(state.pending)
              ? index
              : -1,
          )
          .filter((index) => index >= 0)
          .at(-1) ?? -1;
      if (source >= 0) {
        backTo(source);
        return;
      }
    }
    if (action.type === "content") {
      const next = mergeWorkspace(state, action.domain);
      if (next !== state) openWorkspace(next, true);
      return;
    }
    // Fit only moves the camera: it is not a workspace change and never enters history,
    // so one Esc/back always leaves the current composition.
    if (action.type === "map" && action.intent === "fit") {
      setCameraCommand({ ...guidedCamera(state, layout) });
      setUserMoved(false);
      return;
    }
    setUserMoved(false);
    // An edit is one excursion in history. Cancel returns to the exact frame
    // before the editor opened (one Esc further is the composition before it);
    // Confirm collapses the excursion and carries the committed facts into the
    // earlier frames, so Esc never silently undoes a confirmed fact.
    let start = history.length - 1;
    while (
      start >= 0 &&
      (history[start].state.edit || history[start].state.pending)
    )
      start--;
    if (
      (action.type === "discard" || action.type === "edit-close") &&
      (state.edit || state.pending) &&
      start >= 0
    ) {
      const frame = history[start];
      setContinuity(snapshotObjects(canvas.current));
      setState(structuredClone(frame.state));
      setRestored(structuredClone(frame.layout));
      setCameraCommand({ kind: "restore", camera: frame.camera });
      pendingScroll.current = frame.scroll;
      setHistory(history.slice(0, start));
      setRevision((r) => r + 1);
      return;
    }
    if (action.type === "commit" && state.pending && start >= 0) {
      const next = changeGuidedState(state, action);
      setContinuity(snapshotObjects(canvas.current));
      setHistory(
        history.slice(0, start + 1).map((f) => ({
          ...f,
          state: {
            ...f.state,
            overrides: next.overrides,
            planned: next.planned,
          },
        })),
      );
      setState(next);
      setRestored(null);
      setRevision((r) => r + 1);
      setCameraCommand(
        guidedCamera(next, guidedLayout(next, size.width, size.height)),
      );
      return;
    }
    const next = changeGuidedState(state, action);
    if (
      ([
        "entity",
        "job",
        "enter",
        "attention",
        "follow",
        "fuel",
        "scope-day",
        "job-action",
      ].includes(action.type) ||
        (action.type === "facet" && !state.active.includes(action.domain))) &&
      workspaceKey(next) !== workspaceKey(state)
    ) {
      openWorkspace(next, true, action.type === "job-action");
      return;
    }
    if (
      JSON.stringify(next) === JSON.stringify(state) &&
      !(action.type === "map" && action.intent === "fit")
    )
      return;
    const key =
      action.type === "toggle" || action.type === "expand"
        ? transitionKey(
            state.lead ?? (state.anchor.kind === "job" ? "Jobs" : null),
            action.domain,
          )
        : undefined;
    const edge = INTERACTION_GRAPH.some((e) => `${e.from}>${e.to}` === key);
    if (key && edge)
      setCoverage((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] ?? {
            support: 0,
            lead: 0,
            screenshot: null,
            returned: false,
          }),
          [action.type === "expand" ? "lead" : "support"]:
            (previous[key]?.[action.type === "expand" ? "lead" : "support"] ??
              0) + 1,
        },
      }));
    setContinuity(snapshotObjects(canvas.current));
    setHistory([
      ...history,
      {
        workspaceId: activeTab,
        state: structuredClone(state),
        layout: structuredClone(layout),
        camera: mapApi.current?.getCamera() ?? INITIAL_CAMERA,
        scroll: captureScroll(),
        transitionKey: edge ? key : undefined,
      },
    ]);
    setState(next);
    setRestored(null);
    setRevision((r) => r + 1);
    const preserveCamera =
      action.type === "toggle" &&
      JSON.stringify(next.spatial) === JSON.stringify(state.spatial);
    setCameraCommand(
      preserveCamera
        ? {
            kind: "restore",
            camera: mapApi.current?.getCamera() ?? INITIAL_CAMERA,
          }
        : guidedCamera(next, guidedLayout(next, size.width, size.height)),
    );
    if (
      action.type === "job" ||
      action.type === "expand" ||
      action.type === "inspect"
    )
      pendingScroll.current = Object.fromEntries(
        ["jobs", "fuel", "resources", "assurance"].map((z) => [z, 0]),
      );
  }
  /** Return exactly to an earlier frame of the history (a crumb), dropping the frames after it. */
  function backTo(index: number) {
    const frame = history[index];
    if (!frame) return;
    if (returnToWorkspace(frame)) return;
    setContinuity(snapshotObjects(canvas.current));
    setState(structuredClone(frame.state));
    setRestored(structuredClone(frame.layout));
    setCameraCommand({ kind: "restore", camera: frame.camera });
    pendingScroll.current = frame.scroll;
    setHistory(history.slice(0, index));
    setRevision((r) => r + 1);
  }
  // Crumbs: one per object visited (consecutive frames on the same object collapse to the latest).
  const crumbs = (() => {
    const key = (s: typeof state) =>
      JSON.stringify([s.anchor.kind, "id" in s.anchor ? s.anchor.id : ""]);
    const out: { key: string; label: string; index: number }[] = [];
    history.forEach((f, i) => {
      const k = key(f.state);
      if (out.length && out[out.length - 1].key === k)
        out[out.length - 1].index = i;
      else out.push({ key: k, label: entityTitle(f.state), index: i });
    });
    const here = key(state);
    while (out.length && out[out.length - 1].key === here) out.pop();
    return out
      .slice(-4)
      .map((c) => ({ label: c.label, go: () => backTo(c.index) }));
  })();
  function back() {
    const frame = history.at(-1);
    if (!frame) return;
    if (returnToWorkspace(frame)) return;
    setContinuity(snapshotObjects(canvas.current));
    setState(structuredClone(frame.state));
    setRestored(structuredClone(frame.layout));
    setCameraCommand({ kind: "restore", camera: frame.camera });
    pendingScroll.current = frame.scroll;
    pendingReturn.current = frame;
    setHistory(history.slice(0, -1));
    setRevision((r) => r + 1);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showSpecimen) {
        event.preventDefault();
        setShowSpecimen(false);
        return;
      }
      if (event.key === "Escape" && showGraph) {
        event.preventDefault();
        setShowGraph(false);
        return;
      }
      if (event.key === "Escape" && !event.defaultPrevented && history.length) {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });
  useLayoutEffect(() => {
    if (!pendingScroll.current) return;
    const values = pendingScroll.current;
    const root = canvas.current;
    if (!root) return;
    root.dataset.scrollRestoring = "true";
    let frame = 0;
    let settledFrames = 0;
    // Container queries and animated heights can temporarily clamp scrollTop.
    // Keep the captured position until the restored geometry has actually landed.
    const restore = () => {
      let settled = true;
      root
        .querySelectorAll<HTMLElement>("[data-guided-zone]")
        .forEach((zone) => {
          if (zone.dataset.visible !== "true") {
            if (zone.getAttribute("aria-hidden") === "false") settled = false;
            return;
          }
          const bounds = zone.getBoundingClientRect();
          settled &&= ["left", "top", "width", "height"].every(
            (property) =>
              Math.abs(
                bounds[property as "left" | "top" | "width" | "height"] -
                  Number.parseFloat(zone.style.getPropertyValue(property)),
              ) < 0.5,
          );
          const el = zone.querySelector<HTMLElement>("[data-guided-scroll]");
          if (el) el.scrollTop = values[el.dataset.guidedScroll!] ?? 0;
        });
      settledFrames = settled ? settledFrames + 1 : 0;
      if (settledFrames >= 2) {
        pendingScroll.current = null;
        root.dataset.scrollRestoring = "false";
      } else frame = requestAnimationFrame(restore);
    };
    restore();
    return () => {
      cancelAnimationFrame(frame);
      root.dataset.scrollRestoring = "false";
    };
  }, [revision, layout]);
  useEffect(() => {
    const frame = pendingReturn.current;
    if (!frame?.transitionKey) return;
    let raf = 0;
    const compare = () => {
      const root = canvas.current;
      if (
        root?.dataset.scrollRestoring === "true" ||
        root?.querySelector<HTMLElement>(
          "[data-layout-moving='true'], [data-camera-moving='true'], [data-camera-choreography='true']",
        )
      ) {
        raf = requestAnimationFrame(compare);
        return;
      }
      const camera = mapApi.current?.getCamera();
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
      const correctCamera =
        camera &&
        camera.center.every((v, i) => near(v, frame.camera.center[i])) &&
        ["zoom", "pitch", "bearing"].every((k) =>
          near(camera[k as "zoom"], frame.camera[k as "zoom"]),
        ) &&
        JSON.stringify(camera.padding) === JSON.stringify(frame.camera.padding);
      const exact =
        JSON.stringify(state) === JSON.stringify(frame.state) &&
        JSON.stringify(layout) === JSON.stringify(frame.layout) &&
        JSON.stringify(captureScroll()) === JSON.stringify(frame.scroll) &&
        correctCamera;
      if (exact)
        setCoverage((previous) => ({
          ...previous,
          [frame.transitionKey!]: {
            ...previous[frame.transitionKey!],
            returned: true,
          },
        }));
      pendingReturn.current = null;
    };
    raf = requestAnimationFrame(compare);
    return () => cancelAnimationFrame(raf);
  }, [revision, state, layout]);
  useEffect(() => {
    if (layout.map.visible)
      mapApi.current?.transitionCamera(
        cameraCommand ?? guidedCamera(state, layout),
        reduced ? 0 : MORPH_DURATION * slow,
        "controlled",
      );
    else if (cameraCommand?.kind === "restore")
      mapApi.current?.transitionCamera(cameraCommand, 0, "controlled");
  }, [cameraCommand, revision, size, reduced, layout, state, slow]);
  function loadScene(
    scene: GuidedState = initialGuidedState(),
    fixture = false,
  ) {
    setSceneSession((session) => session + 1);
    setContinuity(null);
    const base = structuredClone(scene);
    setState(base);
    const id = workspaceKey(base);
    setActiveTab(id);
    setTabs([
      {
        id,
        title: workspaceTitle(base),
        history: [],
        frame: {
          state: base,
          layout: guidedLayout(base, size.width, size.height),
          camera: INITIAL_CAMERA,
          scroll: {},
        },
      },
    ]);
    setHistory([]);
    setRestored(null);
    setCameraCommand(
      fixture
        ? guidedCamera(base, guidedLayout(base, size.width, size.height))
        : { kind: "restore", camera: INITIAL_CAMERA },
    );
    setRevision((r) => r + 1);
    pendingScroll.current = { jobs: 0, fuel: 0, resources: 0, assurance: 0 };
  }
  function reset() {
    loadScene();
  }
  // DEV review hook for scripted scene capture (no production exposure: lab is DEV-only).
  const actRef = useRef(act);
  actRef.current = act;
  const sceneAct = useCallback(
    (action: GuidedAction) => actRef.current(action),
    [],
  );
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const sceneRef = useRef(loadScene);
  sceneRef.current = loadScene;
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__fleetosLab = {
      act: (a: GuidedAction) => actRef.current(a),
      reset: () => resetRef.current(),
      // Reproducible DEV fixtures; actual controls are still exercised natively.
      loadScene: (scene: GuidedState) => sceneRef.current(scene, true),
      camera: () => mapApi.current?.getCamera() ?? null,
      specimen: (open: boolean) => setShowSpecimen(open),
      slow: (factor: number) => setSlow(factor),
      settled: (timeout = 9000) =>
        new Promise<boolean>((resolve) => {
          const start = performance.now();
          let calm = 0;
          const tick = () => {
            const root = canvas.current;
            const host = root?.querySelector<HTMLElement>(
              "[data-map-instance]",
            );
            const surface = root?.querySelector<HTMLElement>(
              '[data-testid="environment-map-surface"]',
            );
            const mapOk =
              host?.dataset.cameraChoreography !== "true" &&
              (surface?.dataset.visible !== "true" ||
                (host?.dataset.mapRenderReady === "true" &&
                  host?.dataset.cameraMoving !== "true" &&
                  surface?.dataset.layoutMoving !== "true"));
            const origin = root?.getBoundingClientRect();
            const sceneOk =
              root &&
              origin &&
              Array.from(
                root.querySelectorAll<HTMLElement>(
                  '.fx-living-surface[aria-hidden="false"]',
                ),
              ).every((el) => {
                if (el.dataset.visible !== "true") return false;
                if (el.getAnimations().some((a) => a.playState === "running"))
                  return false;
                const b = el.getBoundingClientRect();
                return (
                  Math.abs(
                    b.left - origin.left - Number.parseFloat(el.style.left),
                  ) < 0.5 &&
                  Math.abs(
                    b.top - origin.top - Number.parseFloat(el.style.top),
                  ) < 0.5 &&
                  Math.abs(b.width - Number.parseFloat(el.style.width)) < 0.5 &&
                  Math.abs(b.height - Number.parseFloat(el.style.height)) < 0.5
                );
              });
            calm =
              mapOk && sceneOk && root?.dataset.scrollRestoring !== "true"
                ? calm + 1
                : 0;
            if (calm > 12 || performance.now() - start > timeout)
              resolve(calm > 12);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
    };
    return () => {
      delete w.__fleetosLab;
    };
  }, []);
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const start = performance.now();
    const host = root.querySelector<HTMLElement>("[data-map-instance]");
    const before = Number(host?.dataset.mapResizeCount ?? 0);
    let frame = 0,
      samples = 0,
      changes = 0,
      previous = "";
    const sample = () => {
      const region = root.querySelector<HTMLElement>(
        '[data-testid="environment-map-surface"]',
      );
      const rect = region?.getBoundingClientRect();
      const key = rect
        ? [rect.x, rect.y, rect.width, rect.height]
            .map((v) => v.toFixed(1))
            .join(",")
        : "";
      if (previous && key !== previous) changes++;
      previous = key;
      samples++;
      const elapsed = performance.now() - start;
      if (
        elapsed < (reduced ? 0 : MORPH_DURATION * slow) ||
        (elapsed < 5000 &&
          (region?.dataset.layoutMoving === "true" ||
            host?.dataset.cameraMoving === "true"))
      ) {
        frame = requestAnimationFrame(sample);
        return;
      }
      root.dataset.motionMeasurement = JSON.stringify({
        revision,
        nominalMs: reduced ? 0 : MORPH_DURATION * slow,
        settledMs: Math.round(elapsed),
        samples,
        geometryChanges: changes,
        mapResizes: Number(host?.dataset.mapResizeCount ?? 0) - before,
        instance: host?.dataset.mapInstance,
      });
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [revision, reduced, slow]);
  const zone = (id: Zone, children: ReactNode): SceneSurface => {
    const b = layout.zones[id];
    const source =
      layout.zones.jobs ??
      layout.zones.fuel ??
      layout.zones.resources ??
      layout.zones.assurance ??
      layout.map;
    // An integrated brief grows into its authored working area. Hidden hosts have
    // a real start geometry, without creating a floating fallback or remounting.
    const geometry = b ?? {
      x: source.x,
      y: source.y + Math.max(0, source.height - 100),
      width: source.width,
      height: 100,
    };
    return (
      <section
        key={id}
        data-scene-key={
          isValidElement<{ region: { rep: string } }>(children) &&
          children.type === EntityRegion
            ? sceneIdentity(children.props.region.rep, state, identityWorld)
            : `zone:${id}:${state.anchor.kind === "jobs" ? (state.lead ?? "attention") : anchorJob(state.anchor)}`
        }
        className={`gw-zone gw-zone-${id}`}
        data-guided-zone={id}
        data-group={
          id === "jobs" ? "operation" : id === "fuel" ? "journey" : id
        }
        data-promoted={Object.values(layout.composition.participation).some(
          (p) =>
            p.promoted &&
            p.group ===
              (id === "jobs" ? "operation" : id === "fuel" ? "journey" : id),
        )}
        data-form={
          id === "jobs" &&
          layout.composition.family === "SPATIAL_DOMINANT" &&
          state.anchor.kind === "job"
            ? "SUPPORT"
            : layout.composition.primaryZone === id
              ? (layout.composition.participation[layout.composition.primary!]
                  ?.form ?? "MEDIUM")
              : "SUPPORT"
        }
        data-visible={Boolean(b)}
        data-lead={layout.composition.primaryZone === id && Boolean(state.lead)}
        aria-label={
          id === "jobs"
            ? "Jobs workspace"
            : id === "fuel"
              ? "Fuel workspace"
              : id === "resources"
                ? "Driver + Truck workspace"
                : "Documents + Restrictions workspace"
        }
        aria-hidden={!b}
        inert={!b}
        style={{
          left: geometry.x,
          top: geometry.y,
          width: geometry.width,
          height: geometry.height,
        }}
      >
        <div className="gw-zone-content" data-guided-scroll={id}>
          {children}
          {layout.composition.primaryZone === id &&
            state.lead &&
            !state.takeover &&
            !state.mapFull &&
            !state.edit &&
            state.anchor.kind === "job" && (
              <ConsequenceLines
                state={state}
                act={act}
                exclude={[
                  ...(layout.zones.fuel
                    ? (["Fuel", "Restrictions"] as const)
                    : []),
                  ...(layout.zones.assurance ? (["Documents"] as const) : []),
                ]}
              />
            )}
        </div>
      </section>
    );
  };
  // A lens is the main question when expanded, or when it is the composition's
  // primary lens without an explicit lead (e.g. the only lens switched on).
  const isMain = (domain: string) =>
    !state.takeover &&
    (state.lead === domain ||
      (!state.lead && layout.composition.primary === domain));
  const operation = state.anchor.kind === "jobs";
  // Spatial mode: the lead compresses into a lens-shaped inspector, the other
  // active lenses into context cards. Same state, same instruments' questions.
  const spatial = state.mapFull && !state.takeover && !operation;
  const groupLenses = (
    g: "operation" | "resources" | "journey" | "assurance",
  ) =>
    (layout.composition.groups[g] ?? []).filter(
      (l): l is GuidedLens => l !== "Pricing DEV" && l !== "Compliance DEV",
    );
  const spatialZone = (
    g: "resources" | "journey" | "assurance",
    leads: GuidedLens[],
  ) =>
    leads.includes(state.lead as GuidedLens) ? (
      <SpatialInspector state={state} act={act} lens={state.lead} />
    ) : (
      <ContextCard state={state} act={act} lenses={groupLenses(g)} />
    );
  return (
    <main
      ref={canvas}
      className="fleetos-environment guided-workspace fx"
      aria-label="FleetOS — guided workspace DEV"
      onPointerOver={(e) => highlight(e.target)}
      onPointerLeave={() => setEmphasis(undefined)}
      onFocusCapture={(e) => highlight(e.target)}
      data-emphasis={
        emphasis ? `${emphasis.kind}:${emphasis.id ?? "current"}` : "none"
      }
      data-reduced-motion={reduced}
      data-family={layout.composition.family}
      data-density={layout.composition.density}
      data-takeover={state.takeover?.kind ?? "none"}
      data-map-full={state.mapFull}
      data-editing={state.edit?.kind ?? "none"}
      data-pending={state.pending?.kind ?? "none"}
      data-spatial-question={state.spatial.question}
      data-interaction-coverage={JSON.stringify(coverage)}
      data-guided-model={JSON.stringify({
        state,
        layout,
        history: history.length,
        previous: history.at(-1),
        revision,
        tabs: tabs.map((tab) => ({ id: tab.id, title: tab.title })),
        activeTab,
      })}
      data-recipe={layout.recipe}
      style={
        {
          "--environment-motion-compose": reduced
            ? "0ms"
            : `${MORPH_DURATION * slow}ms`,
        } as CSSProperties
      }
    >
      <EnvironmentMap
        ref={mapApi}
        placement={layout.map}
        compositionId={revision}
        reducedMotion={reduced}
        showReference={false}
        focus={
          layout.composition.shared
            ? null
            : (DOMAINS.find((d) => d === state.lead) ?? null)
        }
        mode={layout.mode}
        sceneData={scene}
        onUserCamera={() => setUserMoved(true)}
        onSceneSelect={(kind, id) => {
          // Every map object opens what it is: a stop, a restriction, the vehicle or the fuel question.
          const job = anchorJob(state.anchor);
          if (kind === "stop")
            act(
              job
                ? { type: "follow", object: { kind: "stop", id } }
                : { type: "enter", jobId: "J-4217", lead: "Fuel" },
            );
          else if (kind === "restriction")
            act(
              job
                ? { type: "follow", object: { kind: "restriction", id } }
                : {
                    type: "enter",
                    jobId: "J-4217",
                    lead: "Restrictions",
                    restriction: id,
                  },
            );
          else if (id === "fuel")
            act(
              job
                ? { type: "follow", object: { kind: "fuel" } }
                : { type: "enter", jobId: "J-4217", lead: "Fuel" },
            );
          else if (!job)
            act({ type: "enter", jobId: "J-4217", lead: "Trucks" });
          else
            act({
              type: "follow",
              object: {
                kind: "truck",
                id: demoContext(jobById(job), state.assignment).truckId,
              },
            });
        }}
      />
      <AnchorStrip
        state={state}
        left={size.width < 800 ? 76 : 104}
        right={size.width >= 1700 ? 32 : 22}
        top={size.width >= 1700 ? 20 : 12}
        back={back}
        crumbs={state.anchor.kind === "jobs" ? undefined : crumbs}
        takeoverText={
          state.takeover
            ? state.takeover.kind === "map" || state.takeover.kind === "segment"
              ? `Mapa ampliado · ${spatialLabel(state).title}`
              : "Inspeção temporária"
            : undefined
        }
      />
      {layout.map.visible && (
        <MapCaption
          state={state}
          act={act}
          map={layout.map}
          canFit={userMoved}
        />
      )}
      <WorkspaceTabs
        tabs={tabs}
        selected={activeTab}
        select={selectTab}
        close={closeTab}
      />
      <Rail
        state={state}
        act={act}
        navigate={openPerspective}
        collection={(domain) => openWorkspace({
          ...initialGuidedState(), overrides: state.overrides, planned: state.planned,
          active: [domain], lead: domain === "Jobs" ? null : domain,
        }, true)}
        back={back}
        canBack={history.length > 0}
      />
      <DevDrawer
        state={state}
        act={act}
        openGraph={() => setShowGraph(true)}
        openSpecimen={() => setShowSpecimen(true)}
        reset={reset}
      />
      {showSpecimen && <HonestySpecimen close={() => setShowSpecimen(false)} />}
      {showGraph && (
        <InteractionDiagnostics
          state={state}
          act={act}
          coverage={coverage}
          close={() => setShowGraph(false)}
          record={(key, file) =>
            setCoverage((previous) => ({
              ...previous,
              [key]: { ...previous[key], screenshot: file },
            }))
          }
        />
      )}
      {!layout.map.visible &&
        !state.takeover &&
        state.active.length > 0 &&
        hasTransportGeometry(state) && (
          <button
            className="gw-map-request fx-map-request"
            data-ix="spatial"
            aria-label="Abrir mapa do contexto"
            onClick={() => act({ type: "map", intent: "open" })}
          >
            Abrir mapa
          </button>
        )}
      {layout.regions &&
        !layout.composition.shared &&
        state.active.length > 1 && (
          <p
            className="fx-merge-question"
            style={{
              left: size.width < 800 ? 76 : 104,
              top: size.width >= 1700 ? 82 : 72,
            }}
          >
            {layout.composition.explanation}
          </p>
        )}
      <div
        id="fleetos-active-workspace"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${tabs.findIndex((tab) => tab.id === activeTab)}`}
        style={{ display: "contents" }}
      >
        <PersistentObjects revision={revision} before={continuity} reduced={reduced} root={canvas}>
        <LivingScene
          key={sceneSession}
          revision={revision}
          viewport={`${size.width}/${size.height}`}
          before={continuity}
          reduced={reduced}
          onRender={(id, phase, actualDuration) => {
            const root = canvas.current;
            if (!root) return;
            const measurements = JSON.parse(
              root.dataset.renderMeasurement ?? "{}",
            );
            const last = measurements[id] ?? {
              commits: 0,
              maxMs: 0,
              totalMs: 0,
            };
            measurements[id] = {
              commits: last.commits + 1,
              maxMs: Math.max(last.maxMs, actualDuration),
              totalMs: last.totalMs + actualDuration,
              lastMs: actualDuration,
              phase,
            };
            root.dataset.renderMeasurement = JSON.stringify(measurements);
          }}
          surfaces={
            layout.regions
              ? layout.regions.map((r) => (
                  <section
                    key={r.id}
                    className="gw-zone fx-region"
                    data-scene-key={sceneIdentity(r.rep, state, identityWorld)}
                    data-guided-zone={`region-${r.id}`}
                    data-region={r.id}
                    data-rep={
                      r.rep === "shared-work"
                        ? `shared-${layout.composition.shared?.variant}`
                        : r.rep
                    }
                    data-role={r.role}
                    data-visible="true"
                    aria-label={`${r.id} workspace`}
                    style={{
                      left: r.rect.x,
                      top: r.rect.y,
                      width: r.rect.width,
                      height: r.rect.height,
                    }}
                  >
                    <div
                      className="gw-zone-content"
                      data-guided-scroll={`region-${r.id}`}
                    >
                      {r.rep === "shared-work" ? (
                        <SharedWorkInstrument state={state} act={sceneAct} />
                      ) : (
                        <EntityRegion region={r} state={state} act={sceneAct} />
                      )}
                    </div>
                  </section>
                ))
              : [
                  zone(
                    "jobs",
                    spatial ? (
                      <SpatialInspector state={state} act={act} lens={null} />
                    ) : state.anchor.kind === "jobs" ? (
                      state.active.includes("Jobs") ? (
                        <JobsCollection state={state} act={act} />
                      ) : (
                        <AttentionBase state={state} act={act} />
                      )
                    ) : layout.composition.primary === "Pricing DEV" ? (
                      <FutureSurface state={state} act={act} />
                    ) : (
                      <TransportOverview
                        state={state}
                        act={act}
                        deep={state.lead === "Jobs"}
                      />
                    ),
                  ),
                  zone(
                    "fuel",
                    spatial ? (
                      spatialZone("journey", ["Fuel", "Restrictions"])
                    ) : state.takeover?.kind === "station" ? (
                      <StationDetail state={state} act={act} />
                    ) : isMain("Fuel") ? (
                      operation ? (
                        <JourneysOverview state={state} act={act} />
                      ) : (
                        <RouteInstrument state={state} act={act} />
                      )
                    ) : isMain("Restrictions") ? (
                      operation ? (
                        <RestrictionsOverview state={state} act={act} />
                      ) : (
                        <RestrictionInstrument state={state} act={act} />
                      )
                    ) : (
                      <FactColumn state={state} act={act} zone="fuel" />
                    ),
                  ),
                  zone(
                    "resources",
                    spatial ? (
                      spatialZone("resources", ["Drivers", "Trucks"])
                    ) : operation && isMain("Drivers") ? (
                      <DriversRoster state={state} act={act} />
                    ) : operation && isMain("Trucks") ? (
                      <FleetRoster state={state} act={act} />
                    ) : isMain("Drivers") ||
                      (state.takeover?.kind === "resource" &&
                        state.takeover.domain !== "Trucks") ? (
                      <EntityRegion
                        region={{
                          id: "driver",
                          rep: "driver-day",
                          role: "lead",
                          rect: layout.zones.resources!,
                        }}
                        state={state}
                        act={act}
                      />
                    ) : isMain("Trucks") ||
                      (state.takeover?.kind === "resource" &&
                        state.takeover.domain === "Trucks") ? (
                      <EntityRegion
                        region={{
                          id: "vehicle",
                          rep: "vehicle-object",
                          role: "lead",
                          rect: layout.zones.resources!,
                        }}
                        state={state}
                        act={act}
                      />
                    ) : (
                      <FactColumn state={state} act={act} zone="resources" />
                    ),
                  ),
                  zone(
                    "assurance",
                    spatial ? (
                      spatialZone("assurance", ["Documents"])
                    ) : layout.composition.primary === "Compliance DEV" ? (
                      <FutureSurface state={state} act={act} />
                    ) : operation && isMain("Documents") ? (
                      <DocumentRegister state={state} act={act} />
                    ) : isMain("Documents") ||
                      state.takeover?.kind === "document" ? (
                      <DossierInstrument
                        state={state}
                        act={act}
                        detail={state.takeover?.kind === "document"}
                      />
                    ) : (
                      <FactColumn state={state} act={act} zone="assurance" />
                    ),
                  ),
                ]
          }
        />
        </PersistentObjects>
      </div>
      <PendingBar
        key={state.pending ? state.pending.kind + state.pending.id : "none"}
        state={state}
        act={act}
      />
      <span className="gw-sr-only" role="status">
        {state.anchor.kind === "job"
          ? `Âncora ${state.anchor.id}`
          : "Operação · atenção"}{" "}
        · {state.lead ? `${state.lead} principal` : "Estado normal"} ·{" "}
        {state.active.length} lentes ativas
      </span>
    </main>
  );
}
