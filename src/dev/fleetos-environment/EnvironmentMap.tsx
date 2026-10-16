import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from "react";
import {
  AttributionControl,
  Map as LibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  INITIAL_CAMERA,
  type MapPlacement,
  type Easing,
  type MapScene,
  type Domain,
  type CameraTarget,
  type MapMode,
} from "./mapTypes";
import { REFERENCE_POINTS, type EnvironmentMapApi } from "./mapApi";
import { environmentTomTomStyle, TOMTOM_ATTRIBUTION } from "./tomtomStyle";
import { readCamera, createCameraChoreography } from "./cameraChoreography";
import { mapRepresentation } from "./mapRepresentation";
import { quietMapStyle } from "./mapQuiet";
import {
  SYNTHETIC_DRIVER,
  SYNTHETIC_FUEL,
  SYNTHETIC_ROUTE,
  SYNTHETIC_SEGMENT,
} from "./mapMotion";

let instanceSequence = 0;
const REFERENCE_LINE = "environment-reference-line";

/** One renderer per mounted workspace. Composition changes never become keys or camera resets. */
export function EnvironmentMap({
  placement,
  compositionId,
  reducedMotion,
  showReference,
  ref,
  focus,
  mode,
  children,
  sceneData,
  onSceneSelect,
  onUserCamera,
}: {
  placement: MapPlacement;
  compositionId: number;
  reducedMotion: boolean;
  showReference: boolean;
  ref?: Ref<EnvironmentMapApi>;
  focus: Domain | null;
  mode?: MapMode;
  children?: ReactNode;
  sceneData?: MapScene;
  onSceneSelect?: (
    kind: "stop" | "restriction" | "resource",
    id: string,
  ) => void;
  /** The operator moved the camera by hand (pan/zoom), so «fit» has something to do. */
  onUserCamera?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLElement>(null);
  const map = useRef<LibreMap | null>(null),
    markers = useRef<Marker[]>([]);
  const reduced = useRef(reducedMotion),
    referenceVisible = useRef(showReference);
  const target = useRef(placement),
    resizeNow = useRef(() => {});
  const scene = useRef(focus),
    updateScene = useRef(() => {});
  const mapMode = useRef(mode);
  const sceneGeometry = useRef(sceneData);
  const sceneSelect = useRef(onSceneSelect);
  const userCamera = useRef(onUserCamera);
  useLayoutEffect(() => {
    sceneSelect.current = onSceneSelect;
    userCamera.current = onUserCamera;
  }, [onSceneSelect, onUserCamera]);
  const cameraMotion = useRef<ReturnType<
    typeof createCameraChoreography
  > | null>(null);
  const pendingCamera = useRef<{
    target: CameraTarget;
    duration: number;
    easing?: Easing;
  } | null>(null);
  const [tiles, setTiles] = useState<"loading" | "ready">("loading");
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unconfigured"
  >("loading");

  useImperativeHandle(
    ref,
    () => ({
      fitBounds: (bounds, options) => {
        cameraMotion.current?.stop();
        map.current?.fitBounds(bounds, {
          ...options,
          duration: reduced.current ? 0 : (options?.duration ?? 280),
        });
      },
      setCamera: (options) => {
        cameraMotion.current?.stop();
        map.current?.easeTo({
          ...options,
          duration: reduced.current ? 0 : (options.duration ?? 280),
        });
      },
      panBy: (offset) => {
        map.current?.panBy(offset, { duration: reduced.current ? 0 : 180 });
      },
      zoomTo: (zoom) => {
        map.current?.zoomTo(zoom, { duration: reduced.current ? 0 : 180 });
      },
      getCamera: () => {
        const instance = map.current;
        if (!instance) return null;
        return readCamera(instance);
      },
      resize: () => resizeNow.current(),
      transitionCamera: (target, duration, easing) => {
        const command = {
          target,
          duration: reduced.current ? 0 : duration,
          easing,
        };
        if (cameraMotion.current)
          cameraMotion.current.run(
            command.target,
            command.duration,
            command.easing,
          );
        else pendingCamera.current = command;
      },
    }),
    [],
  );

  // DOM diagnostics are DEV-only. No globals, storage or application service.
  function checkSettled() {
    const element = surface.current;
    if (!element) return;
    const rect = element.getBoundingClientRect(),
      goal = target.current;
    const opacity = Number(getComputedStyle(element).opacity);
    const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius);
    element.dataset.layoutMoving = String(
      Math.abs(rect.x - goal.x) > 1 ||
        Math.abs(rect.y - goal.y) > 1 ||
        Math.abs(rect.width - goal.width) > 1 ||
        Math.abs(rect.height - goal.height) > 1 ||
        Math.abs(opacity - goal.opacity) > 0.01 ||
        Math.abs(radius - goal.radius) > 1,
    );
  }

  useLayoutEffect(() => {
    target.current = placement;
    reduced.current = reducedMotion;
    if (reducedMotion) cameraMotion.current?.finish();
    referenceVisible.current = showReference;
    scene.current = focus;
    mapMode.current = mode;
    sceneGeometry.current = sceneData;
    checkSettled();
    const frame = requestAnimationFrame(checkSettled);
    return () => cancelAnimationFrame(frame);
  }, [placement, reducedMotion, showReference, focus, mode, sceneData]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const style = environmentTomTomStyle();
    if (!style) {
      setStatus("unconfigured");
      return;
    }
    let instance: LibreMap;
    let resizeCount = 0,
      lastWidth = -1,
      lastHeight = -1;
    let disposed = false;
    let sceneMarkers: Marker[] = [];
    function diagnostics() {
      if (disposed) return;
      element!.dataset.mapCamera = JSON.stringify(readCamera(instance));
      element!.dataset.referenceScreen = JSON.stringify(
        REFERENCE_POINTS.map((point) => {
          const projected = instance.project(point);
          return [projected.x, projected.y];
        }),
      );
      element!.dataset.stopScreens = JSON.stringify(
        (sceneGeometry.current?.stops ?? []).map((stop) => {
          const point = instance.project(stop.point);
          return { id: stop.id, x: point.x, y: point.y };
        }),
      );
    }
    const resize = () => {
      if (disposed || !instance) return;
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height || (width === lastWidth && height === lastHeight))
        return;
      lastWidth = width;
      lastHeight = height;
      // ResizeObserver runs once per layout frame, before paint. Public redraw()
      // synchronously draws after resize, avoiding the cleared WebGL buffer flash.
      // Disable MapLibre's own 50ms observer to avoid duplicate unsynchronised work.
      instance.resize();
      instance.redraw();
      element.dataset.mapResizeCount = String(++resizeCount);
      diagnostics();
    };
    try {
      instance = new LibreMap({
        container: element,
        style,
        center: INITIAL_CAMERA.center,
        zoom: INITIAL_CAMERA.zoom,
        bearing: INITIAL_CAMERA.bearing,
        pitch: INITIAL_CAMERA.pitch,
        attributionControl: false,
        trackResize: false,
        renderWorldCopies: false,
        minZoom: 2,
        maxZoom: 18,
        // Geometry supplies motion; tile cross-fades would obscure resize stability.
        fadeDuration: 0,
      });
      map.current = instance;
      element.dataset.mapInstance = String(++instanceSequence);
      element.dataset.mapProvider = "TomTom";
      element.dataset.cameraMoving = "false";
      element.dataset.mapErrorCount = "0";
      cameraMotion.current = createCameraChoreography(instance, element);
      instance.on("dragstart", () => {
        cameraMotion.current?.stop();
        userCamera.current?.();
      });
      instance.on("zoomstart", (event) => {
        if (event.originalEvent) {
          cameraMotion.current?.stop();
          userCamera.current?.();
        }
      });
      instance.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: TOMTOM_ATTRIBUTION,
        }),
        "bottom-right",
      );
      instance.addControl(
        new NavigationControl({ visualizePitch: true }),
        "top-right",
      );
      const compass = instance
        .getContainer()
        .querySelector<HTMLButtonElement>(".maplibregl-ctrl-compass");
      if (compass) {
        compass.setAttribute("aria-label", "Norte para cima");
        compass.title = "Norte para cima";
        compass.dataset.ix = "spatial";
      }
      instance.on("load", () => {
        if (disposed) return;
        quietMapStyle(instance);
        instance.addSource("environment-reference", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: REFERENCE_POINTS },
          },
        });
        instance.addLayer({
          id: REFERENCE_LINE,
          type: "line",
          source: "environment-reference",
          layout: { visibility: referenceVisible.current ? "visible" : "none" },
          paint: {
            "line-color": "#1d5c58",
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.75,
          },
        });
        element.dataset.referenceLayerReady = "true";
        markers.current = REFERENCE_POINTS.map((point, index) => {
          const pin = document.createElement("div");
          pin.className = "environment-reference-pin";
          pin.setAttribute(
            "aria-label",
            `Referência geométrica ${index === 0 ? "A" : "B"} — DEV`,
          );
          pin.style.visibility = referenceVisible.current
            ? "visible"
            : "hidden";
          const marker = new Marker({ element: pin })
            .setLngLat(point)
            .addTo(instance);
          pin.setAttribute("role", "img");
          pin.tabIndex = -1;
          return marker;
        });
        instance.addSource("environment-route-done", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "environment-route-done",
          type: "line",
          source: "environment-route-done",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#8c9a93",
            "line-width": 3,
            "line-opacity": 0.9,
          },
        });
        instance.addSource("environment-synthetic-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: SYNTHETIC_ROUTE },
          },
        });
        instance.addLayer({
          id: "environment-synthetic-route",
          type: "line",
          source: "environment-synthetic-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#1f4d45",
            "line-width": 4,
            "line-opacity": 0.92,
          },
        });
        instance.addSource("environment-synthetic-segment", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: SYNTHETIC_SEGMENT },
          },
        });
        instance.addLayer({
          id: "environment-synthetic-segment",
          type: "line",
          source: "environment-synthetic-segment",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#c2561f",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
        instance.addSource("environment-alt", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer(
          {
            id: "environment-alt",
            type: "line",
            source: "environment-alt",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#1f4d45",
              "line-width": 3,
              "line-dasharray": [2.2, 1.8],
              "line-opacity": 0.85,
            },
          },
          "environment-synthetic-segment",
        );
        instance.addSource("environment-fleet", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "environment-fleet-ring",
          type: "circle",
          source: "environment-fleet",
          paint: {
            "circle-radius": 9,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#1f4d45",
            "circle-stroke-width": 1.2,
            "circle-stroke-opacity": 0.55,
          },
        });
        instance.addLayer({
          id: "environment-fleet",
          type: "circle",
          source: "environment-fleet",
          paint: {
            "circle-radius": 4.5,
            "circle-color": "#1f4d45",
            "circle-stroke-color": "#f7f6f1",
            "circle-stroke-width": 1.5,
          },
        });
        const pins = [
          { name: "Vehicle", point: SYNTHETIC_DRIVER, label: "V" },
          { name: "Fuel stop", point: SYNTHETIC_FUEL, label: "F" },
        ];
        instance.addSource("environment-candidate-stops", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "environment-candidate-stops",
          type: "circle",
          source: "environment-candidate-stops",
          paint: {
            "circle-radius": 6,
            "circle-color": "#f7f6f1",
            "circle-stroke-color": "#1f4d45",
            "circle-stroke-width": 2,
          },
        });
        instance.on("click", "environment-candidate-stops", (event) => {
          const id = event.features?.[0]?.properties.id;
          if (typeof id === "string") sceneSelect.current?.("stop", id);
        });
        instance.on("click", "environment-synthetic-segment", (event) => {
          const id = event.features?.[0]?.properties.id;
          if (typeof id === "string") sceneSelect.current?.("restriction", id);
        });
        sceneMarkers = pins.map((pin) => {
          const el = document.createElement("div");
          el.className = "environment-synthetic-pin";
          el.dataset.ix = "spatial";
          el.textContent = pin.label;
          el.dataset.syntheticKind = pin.name;
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", `DEV · ${pin.name} sintético`);
          if (pin.name === "Vehicle") {
            el.setAttribute("role", "button");
            el.tabIndex = 0;
            el.addEventListener("click", () =>
              sceneSelect.current?.("resource", "vehicle"),
            );
          }
          if (pin.name === "Fuel stop") {
            el.setAttribute("role", "button");
            el.tabIndex = 0;
            const select = () => {
              const geometry = sceneGeometry.current;
              const stop = geometry?.stops?.find(
                (candidate) =>
                  candidate.point[0] === geometry.fuel?.[0] &&
                  candidate.point[1] === geometry.fuel?.[1],
              );
              if (geometry?.selectedStop || stop?.id)
                sceneSelect.current?.(
                  "stop",
                  geometry?.selectedStop ?? stop!.id,
                );
              else sceneSelect.current?.("resource", "fuel");
            };
            el.addEventListener("click", select);
            el.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select();
              }
            });
          }
          return new Marker({ element: el })
            .setLngLat(pin.point)
            .addTo(instance);
        });
        const labels = (instance.getStyle().layers ?? [])
          .filter(
            (layer) =>
              layer.type === "symbol" && Boolean(layer.layout?.["text-field"]),
          )
          .map((layer) => ({
            id: layer.id,
            min: layer.minzoom ?? 0,
            max: layer.maxzoom ?? 24,
          }));
        updateScene.current = () => {
          const geometry = sceneGeometry.current;
          if (geometry) {
            (
              instance.getSource("environment-synthetic-route") as GeoJSONSource
            ).setData({
              type: "FeatureCollection",
              features: geometry.routes.map((coordinates, index) => ({
                type: "Feature" as const,
                properties: {
                  id: geometry.routeIds?.[index] ?? "",
                  emphasized:
                    geometry.emphasis?.kind === "job" &&
                    !!geometry.routeIds &&
                    geometry.emphasis.id === geometry.routeIds[index],
                },
                geometry: { type: "LineString" as const, coordinates },
              })),
            });
            (
              instance.getSource("environment-route-done") as GeoJSONSource
            ).setData({
              type: "FeatureCollection",
              features: geometry.done
                ? [
                    {
                      type: "Feature" as const,
                      properties: {},
                      geometry: {
                        type: "LineString" as const,
                        coordinates: geometry.done,
                      },
                    },
                  ]
                : [],
            });
            (instance.getSource("environment-alt") as GeoJSONSource).setData({
              type: "FeatureCollection",
              features: (geometry.alt ?? []).map((coordinates) => ({
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates },
              })),
            });
            (instance.getSource("environment-fleet") as GeoJSONSource).setData({
              type: "FeatureCollection",
              features: (geometry.fleet ?? []).map((f) => ({
                type: "Feature" as const,
                properties: { id: f.id, source: f.source },
                geometry: { type: "Point" as const, coordinates: f.point },
              })),
            });
            sceneMarkers[0].getElement().dataset.source =
              geometry.driverSource ?? "SIMULATED";
            (
              instance.getSource(
                "environment-synthetic-segment",
              ) as GeoJSONSource
            ).setData({
              type: "FeatureCollection",
              features: (geometry.segments ?? [geometry.segment])
                .filter((points) => points.length >= 2)
                .map((coordinates, index) => ({
                  type: "Feature" as const,
                  properties: {
                    id: geometry.segmentIds?.[index] ?? "",
                    emphasized:
                      geometry.emphasis?.kind === "restriction" &&
                      geometry.emphasis.id === geometry.segmentIds?.[index],
                  },
                  geometry: { type: "LineString" as const, coordinates },
                })),
            });
            (
              instance.getSource("environment-candidate-stops") as GeoJSONSource
            ).setData({
              type: "FeatureCollection",
              features: [
                ...(geometry.stops ?? []),
                ...(geometry.emphasis?.kind === "stop" &&
                geometry.emphasis.point &&
                !geometry.stops?.some((s) => s.id === geometry.emphasis?.id)
                  ? [
                      {
                        id: geometry.emphasis.id ?? "",
                        point: geometry.emphasis.point,
                      },
                    ]
                  : []),
              ].map((stop) => ({
                type: "Feature" as const,
                properties: {
                  id: stop.id,
                  highlighted:
                    geometry.emphasis?.id === stop.id &&
                    geometry.emphasis?.kind === "stop",
                  selected: stop.id === geometry.selectedStop,
                },
                geometry: { type: "Point" as const, coordinates: stop.point },
              })),
            });
            instance.setPaintProperty(
              "environment-candidate-stops",
              "circle-radius",
              ["case", ["get", "highlighted"], 8, ["get", "selected"], 7, 5],
            );
            instance.setPaintProperty(
              "environment-candidate-stops",
              "circle-color",
              [
                "case",
                ["get", "highlighted"],
                "#1f4d45",
                ["get", "selected"],
                "#16302b",
                "#f7f6f1",
              ],
            );
            instance.setPaintProperty(
              "environment-synthetic-route",
              "line-width",
              geometry.routeIds
                ? ["case", ["get", "emphasized"], 5.5, 2.5]
                : geometry.emphasis?.kind === "job"
                  ? 7
                  : 4,
            );
            instance.setPaintProperty(
              "environment-synthetic-segment",
              "line-color",
              ["case", ["get", "emphasized"], "#a8401a", "#c2561f"],
            );
            sceneMarkers[0].getElement().dataset.emphasized = String(
              geometry.emphasis?.kind === "resource",
            );
            sceneMarkers[1].getElement().dataset.emphasized = String(
              geometry.emphasis?.kind === "stop",
            );
            element.dataset.mapEmphasis = JSON.stringify(
              geometry.emphasis ?? null,
            );
            if (geometry.driver) sceneMarkers[0].setLngLat(geometry.driver);
            if (geometry.fuel) sceneMarkers[1].setLngLat(geometry.fuel);
          }
          const current = scene.current,
            profile = mapMode.current
              ? mapRepresentation(mapMode.current)
              : null,
            route = profile
              ? profile.route
              : current === "Jobs" ||
                current === "Fuel" ||
                current === "Restrictions";
          instance.setLayoutProperty(
            "environment-synthetic-route",
            "visibility",
            route ? "visible" : "none",
          );
          instance.setLayoutProperty(
            "environment-route-done",
            "visibility",
            route ? "visible" : "none",
          );
          instance.setLayoutProperty(
            "environment-synthetic-segment",
            "visibility",
            geometry?.showSegment ||
              (profile ? profile.segment : current === "Restrictions")
              ? "visible"
              : "none",
          );
          sceneMarkers[0].getElement().style.visibility = (
            geometry && !geometry.driver
              ? false
              : profile
                ? profile.vehicle
                : current && current !== "Documents"
          )
            ? "visible"
            : "hidden";
          sceneMarkers[1].getElement().style.visibility = (
            geometry
              ? Boolean(geometry.fuel) && mapMode.current !== "HIDDEN"
              : profile
                ? profile.fuel
                : current === "Fuel"
          )
            ? "visible"
            : "hidden";
          if (profile) {
            for (const label of labels)
              instance.setLayerZoomRange(
                label.id,
                Math.min(label.max - 0.01, label.min + profile.labelZoomOffset),
                label.max,
              );
            instance.setPaintProperty(
              "environment-synthetic-route",
              "line-width-transition",
              {
                duration:
                  parseFloat(
                    getComputedStyle(element).getPropertyValue(
                      "--environment-motion-compose",
                    ),
                  ) || 0,
              },
            );
            const fleet = Boolean(sceneGeometry.current?.routeIds);
            instance.setPaintProperty(
              "environment-synthetic-route",
              "line-width",
              fleet
                ? ["case", ["get", "emphasized"], 5.5, profile.lineWidth]
                : profile.lineWidth,
            );
            instance.setPaintProperty(
              "environment-synthetic-route",
              "line-opacity",
              fleet
                ? [
                    "case",
                    ["get", "emphasized"],
                    1,
                    sceneGeometry.current?.emphasis?.kind === "job"
                      ? 0.22
                      : profile.routeOpacity,
                  ]
                : profile.routeOpacity,
            );
            sceneMarkers.forEach((marker) =>
              marker
                .getElement()
                .style.setProperty(
                  "--marker-scale",
                  String(profile.markerScale),
                ),
            );
            element.dataset.mapRepresentation = mapMode.current;
            element.dataset.mapLabelOffset = String(profile.labelZoomOffset);
          }
          element.dataset.syntheticScene = current ?? "none";
          instance.redraw();
        };
        updateScene.current();
        if (pendingCamera.current) {
          cameraMotion.current?.run(
            pendingCamera.current.target,
            pendingCamera.current.duration,
            pendingCamera.current.easing,
          );
          pendingCamera.current = null;
        }
        setStatus("ready");
        instance.redraw();
        diagnostics();
      });
      // Provider URLs contain the browser API credential: never log them.
      instance.on("error", () => {
        if (!disposed) {
          element.dataset.mapErrorCount = String(
            Number(element.dataset.mapErrorCount) + 1,
          );
          setStatus("error");
        }
      });
      instance.on("dataloading", () => {
        if (!disposed) setTiles("loading");
      });
      instance.on("idle", () => {
        if (!disposed) setTiles("ready");
        if (!disposed && instance.isStyleLoaded()) setStatus("ready");
        diagnostics();
      });
      instance.on("move", diagnostics);
      instance.on("render", () => {
        if (disposed) return;
        element.dataset.mapRenderReady = String(
          instance.isStyleLoaded() && instance.areTilesLoaded(),
        );
        if (instance.getLayer("environment-synthetic-route")) {
          element.dataset.syntheticLayers = JSON.stringify({
            route: instance.getLayoutProperty(
              "environment-synthetic-route",
              "visibility",
            ),
            segment: instance.getLayoutProperty(
              "environment-synthetic-segment",
              "visibility",
            ),
            routeFeatures: instance.queryRenderedFeatures({
              layers: ["environment-synthetic-route"],
            }).length,
            segmentFeatures: instance.queryRenderedFeatures({
              layers: ["environment-synthetic-segment"],
            }).length,
            points: (
              sceneGeometry.current?.routes.flat() ?? SYNTHETIC_ROUTE
            ).map((point) => {
              const p = instance.project(point);
              return [p.x, p.y];
            }),
          });
        }
      });
      instance.on("movestart", () => {
        element.dataset.cameraMoving = "true";
      });
      instance.on("moveend", () => {
        element.dataset.cameraMoving = "false";
      });
    } catch {
      map.current?.remove();
      map.current = null;
      setStatus("error");
      return;
    }
    resizeNow.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      disposed = true;
      observer.disconnect();
      resizeNow.current = () => {};
      cameraMotion.current?.stop();
      cameraMotion.current = null;
      updateScene.current = () => {};
      sceneMarkers.forEach((marker) => marker.remove());
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (instance?.getLayer(REFERENCE_LINE))
      instance.setLayoutProperty(
        REFERENCE_LINE,
        "visibility",
        showReference ? "visible" : "none",
      );
    markers.current.forEach((marker) => {
      marker.getElement().style.visibility = showReference
        ? "visible"
        : "hidden";
    });
  }, [showReference]);
  useEffect(() => {
    updateScene.current();
  }, [focus, mode, sceneData]);

  return (
    <section
      ref={surface}
      className="environment-map-surface"
      aria-label="Mapa TomTom — laboratório"
      aria-busy={status === "loading"}
      aria-hidden={!placement.visible}
      inert={!placement.visible}
      data-testid="environment-map-surface"
      data-map-status={status}
      data-composition-id={compositionId}
      data-visible={placement.visible}
      data-map-mode={mode}
      data-controls={mode ? mapRepresentation(mode).controls : true}
      data-target-width={placement.width}
      data-target-height={placement.height}
      onTransitionEnd={checkSettled}
      onTransitionCancel={checkSettled}
      style={{
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
        borderRadius: placement.radius,
        opacity: placement.opacity,
      }}
    >
      <div
        ref={container}
        className="environment-map"
        data-testid="environment-map"
      />
      {children}
      {placement.visible &&
        tiles === "loading" &&
        status !== "error" &&
        status !== "unconfigured" && (
          <span className="environment-map-loading" role="status">
            A carregar mapa…
          </span>
        )}
      {status === "error" || status === "unconfigured" ? (
        <p className="environment-map-error" role="status">
          {status === "unconfigured"
            ? "Configure a chave TomTom no ambiente DEV para carregar o mapa."
            : "Não foi possível carregar o mapa TomTom. Verifique a ligação e a configuração do mapa."}
        </p>
      ) : null}
    </section>
  );
}
