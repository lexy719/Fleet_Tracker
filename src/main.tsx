import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
import { FuelProvider } from "./context/FuelContext";
import { IngestionProvider } from "./context/IngestionContext";
import { OperationsProvider } from "./context/OperationsContext";
import { RoadEventsProvider } from "./context/RoadEventsContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ThemeProvider } from "./context/ThemeContext";
import App from "./App";
import "./index.css";

// FleetOS Studio is the app. The previous UI stays reachable under /classic while each of its
// areas is rebuilt in the Studio design language (docs/fleetos-platform-plan.md, Phase 0).
const path = window.location.pathname.replace(/\/$/, "");
const CLASSIC = path === "/classic" || path.startsWith("/classic/");
const DevLab =
  import.meta.env.DEV && path === "/__dev/fleetos-workspace" ? lazy(() => import("./dev/fleetos-workspace")) : null;
const StudioApp = lazy(() => import("./studio"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {!CLASSIC ? (
      <Suspense fallback={<div style={{ height: "100dvh", background: "#ebe5d8" }} />}>
        {DevLab ? <DevLab /> : <StudioApp />}
      </Suspense>
    ) : (
      <BrowserRouter basename="/classic">
        <ThemeProvider>
          <SettingsProvider>
            <OperationsProvider>
              <IngestionProvider>
              <FuelProvider>
                <RoadEventsProvider>
                  <AppErrorBoundary>
                    <App />
                  </AppErrorBoundary>
                </RoadEventsProvider>
              </FuelProvider>
              </IngestionProvider>
            </OperationsProvider>
          </SettingsProvider>
        </ThemeProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);
