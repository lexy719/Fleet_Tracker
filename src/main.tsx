import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
import { IngestionProvider } from "./context/IngestionContext";
import { OperationsProvider } from "./context/OperationsContext";
import { RoadEventsProvider } from "./context/RoadEventsContext";
import { SettingsProvider } from "./context/SettingsContext";
import { ThemeProvider } from "./context/ThemeContext";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SettingsProvider>
          <OperationsProvider>
            <IngestionProvider>
              <RoadEventsProvider>
                  <AppErrorBoundary>
                    <App />
                  </AppErrorBoundary>
              </RoadEventsProvider>
            </IngestionProvider>
          </OperationsProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
