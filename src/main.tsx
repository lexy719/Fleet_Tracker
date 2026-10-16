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

// A direct DEV entry, intentionally outside every operational/data provider.
// Existing application routes and navigation retain their original root tree.
const EnvironmentLab =
  import.meta.env.DEV &&
  window.location.pathname.replace(/\/$/, "") === "/__dev/fleetos-environment"
    ? lazy(() => import("./dev/fleetos-environment"))
    : import.meta.env.DEV &&
        window.location.pathname.replace(/\/$/, "") === "/__dev/fleetos-workspace"
      ? lazy(() => import("./dev/fleetos-workspace"))
      : import.meta.env.DEV &&
          window.location.pathname.replace(/\/$/, "") === "/__dev/fleetos-studio"
        ? lazy(() => import("./dev/fleetos-studio"))
        : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {EnvironmentLab ? (
      <Suspense
        fallback={<div style={{ height: "100dvh", background: "#f6f7f4" }} />}
      >
        <EnvironmentLab />
      </Suspense>
    ) : (
      <BrowserRouter>
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
