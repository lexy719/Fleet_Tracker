import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { PageLoading } from "./components/ui/PageLoading";

const MarketingPage = lazy(async () => {
  const m = await import("./pages/MarketingPage");
  return { default: m.MarketingPage };
});
const TodayPage = lazy(async () => {
  const m = await import("./pages/TodayPage");
  return { default: m.TodayPage };
});
const JobsPage = lazy(async () => {
  const m = await import("./pages/JobsPage");
  return { default: m.JobsPage };
});
const DispatchPage = lazy(async () => {
  const m = await import("./pages/DispatchPage");
  return { default: m.DispatchPage };
});
const FleetMapPage = lazy(async () => {
  const m = await import("./pages/FleetMapPage");
  return { default: m.FleetMapPage };
});
const DriversPage = lazy(async () => {
  const m = await import("./pages/DriversPage");
  return { default: m.DriversPage };
});
const FleetPage = lazy(async () => {
  const m = await import("./pages/FleetPage");
  return { default: m.FleetPage };
});
const ReportsPage = lazy(async () => {
  const m = await import("./pages/ReportsPage");
  return { default: m.ReportsPage };
});
const SettingsPage = lazy(async () => {
  const m = await import("./pages/SettingsPage");
  return { default: m.SettingsPage };
});

export default function App() {
  return (
    <Routes>
      <Route
        index
        element={
          <Suspense fallback={<PageLoading label="A carregar…" />}>
            <MarketingPage />
          </Suspense>
        }
      />
      <Route path="app" element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoading />}>
              <TodayPage />
            </Suspense>
          }
        />
        <Route
          path="jobs"
          element={
            <Suspense fallback={<PageLoading />}>
              <JobsPage />
            </Suspense>
          }
        />
        <Route
          path="dispatch"
          element={
            <Suspense fallback={<PageLoading />}>
              <DispatchPage />
            </Suspense>
          }
        />
        <Route
          path="map"
          element={
            <Suspense fallback={<PageLoading />}>
              <FleetMapPage />
            </Suspense>
          }
        />
        <Route
          path="drivers"
          element={
            <Suspense fallback={<PageLoading />}>
              <DriversPage />
            </Suspense>
          }
        />
        <Route
          path="fleet"
          element={
            <Suspense fallback={<PageLoading />}>
              <FleetPage />
            </Suspense>
          }
        />
        <Route
          path="reports"
          element={
            <Suspense fallback={<PageLoading />}>
              <ReportsPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoading />}>
              <SettingsPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="map" element={<Navigate to="/app/map" replace />} />
      <Route path="routes" element={<Navigate to="/app/dispatch" replace />} />
      <Route path="cargo" element={<Navigate to="/app/dispatch" replace />} />
      <Route path="drivers" element={<Navigate to="/app/drivers" replace />} />
      <Route path="fuel" element={<Navigate to="/app/reports" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
