import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
import { FleetDataProvider } from "./context/FleetDataContext";
import { JobsProvider } from "./context/JobsContext";
import { RouteSessionProvider } from "./context/RouteSessionContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ThemeProvider } from "./context/ThemeContext";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SettingsProvider>
          <JobsProvider>
            <FleetDataProvider>
              <RouteSessionProvider>
                <AppErrorBoundary>
                  <App />
                </AppErrorBoundary>
              </RouteSessionProvider>
            </FleetDataProvider>
          </JobsProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
