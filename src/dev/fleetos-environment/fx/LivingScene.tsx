import {
  cloneElement,
  Profiler,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ProfilerOnRenderCallback,
  type RefAttributes,
} from "react";
import type { ObjectSnapshot } from "./sceneSnapshot";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  "data-scene-key": string;
  "data-visible": boolean | string;
  "data-guided-zone": string;
  "data-rep"?: string;
};
export type SceneSurface = ReactElement<SurfaceProps>;

/** Object hosts survive a recipe change. Inactive hosts retain their last read
 * model and scroll, and cannot receive input. The synthetic world bounds this
 * session-local catalog; reset starts a fresh catalog.
 */
export function LivingScene({
  surfaces,
  revision,
  viewport,
  before,
  reduced,
  onRender,
}: {
  surfaces: SceneSurface[];
  revision: number;
  viewport: string;
  before: ObjectSnapshot | null;
  reduced: boolean;
  onRender: ProfilerOnRenderCallback;
}) {
  const stamp = `${revision}/${viewport}`;
  const [catalog, setCatalog] = useState({ stamp, surfaces });
  if (catalog.stamp !== stamp) {
    const current = new Map(
      surfaces.map((surface) => [surface.props["data-scene-key"], surface]),
    );
    const retained = catalog.surfaces.map(
      (surface) => current.get(surface.props["data-scene-key"]) ?? surface,
    );
    const keys = new Set(
      retained.map((surface) => surface.props["data-scene-key"]),
    );
    setCatalog({
      stamp,
      surfaces: [
        ...retained,
        ...surfaces.filter(
          (surface) => !keys.has(surface.props["data-scene-key"]),
        ),
      ],
    });
  }
  const current = new Map(
    surfaces.map((surface) => [surface.props["data-scene-key"], surface]),
  );
  return catalog.surfaces.map((cached) => {
    const key = cached.props["data-scene-key"];
    const surface = current.get(key) ?? cached;
    const visible =
      current.has(key) &&
      (surface.props["data-visible"] === true ||
        surface.props["data-visible"] === "true");
    return (
      <LivingSurface
        key={key}
        surface={surface}
        visible={visible}
        origin={before?.objects.get(key)?.rect ?? before?.lead ?? null}
        reduced={reduced}
        onRender={onRender}
      />
    );
  });
}

function LivingSurface({
  surface,
  visible,
  origin,
  reduced,
  onRender,
}: {
  surface: SceneSurface;
  visible: boolean;
  origin: CSSProperties | null;
  reduced: boolean;
  onRender: ProfilerOnRenderCallback;
}) {
  // Returning objects unfold from their current relationship in the outgoing
  // workspace. Visible objects retarget directly from their actual geometry.
  const [entry, setEntry] = useState<CSSProperties | null>(() =>
    visible && !reduced ? origin : null,
  );
  const wasVisible = useRef(visible);
  useLayoutEffect(() => {
    if (visible && !wasVisible.current && !reduced && origin) setEntry(origin);
    wasVisible.current = visible;
  }, [visible, reduced, origin]);
  const scrollHost = useRef<HTMLDivElement>(null);
  const representation = surface.props["data-rep"];
  const previousRepresentation = useRef(representation);
  useLayoutEffect(() => {
    // A newly asked question begins at its answer. Parent frame restoration runs
    // afterwards and reinstates the captured scroll when returning with Esc.
    if (
      visible &&
      previousRepresentation.current !== representation &&
      scrollHost.current
    )
      scrollHost.current.scrollTop = 0;
    previousRepresentation.current = representation;
  }, [representation, visible]);
  useLayoutEffect(() => {
    if (!entry) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntry(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [entry]);
  const content = surface.props.children as ReactElement<
    HTMLAttributes<HTMLDivElement> &
      RefAttributes<HTMLDivElement> & { "data-guided-scroll": string }
  >;
  return cloneElement(surface, {
    className: `${surface.props.className ?? ""} fx-living-surface`,
    "data-visible": visible && !entry,
    "aria-hidden": !visible,
    inert: !visible,
    style: { ...surface.props.style, ...(entry ?? {}) },
    children: (
      <Profiler id={surface.props["data-scene-key"]} onRender={onRender}>
        {cloneElement(content, {
          ref: scrollHost,
          "data-guided-scroll": surface.props["data-scene-key"],
        })}
      </Profiler>
    ),
  });
}
