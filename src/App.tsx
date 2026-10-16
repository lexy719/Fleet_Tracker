import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AppShell } from "./ui/shell/AppShell";
import { SkeletonRows } from "./ui/kit";
import { legacyTarget } from "./lib/legacyRoutes";

const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const OverviewPage = page(() => import("./pages/OverviewPage"), "OverviewPage");
const WorkPage = page(() => import("./pages/WorkPage"), "WorkPage");
const JobWorkspacePage = page(() => import("./pages/JobWorkspacePage"), "JobWorkspacePage");
const DispatchPage = page(() => import("./pages/DispatchPage"), "DispatchPage");
const FleetPage = page(() => import("./pages/FleetPage"), "FleetPage");
const TruckPage = page(() => import("./pages/TruckPage"), "TruckPage");
const TrailerPage = page(() => import("./pages/TrailerPage"), "TrailerPage");
const DriversPage = page(() => import("./pages/DriversPage"), "DriversPage");
const DriverPage = page(() => import("./pages/DriverPage"), "DriverPage");
const RoadIntelligencePage = page(() => import("./pages/RoadIntelligencePage"), "RoadIntelligencePage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const DocumentsPage = page(() => import("./pages/DocumentsPage"), "DocumentsPage");
const CompliancePage = page(() => import("./pages/CompliancePage"), "CompliancePage");
const RoutingAcceptancePage = import.meta.env.DEV ? page(() => import("./pages/RoutingAcceptancePage"), "RoutingAcceptancePage") : null;

const OperationalPlanningAcceptancePage = import.meta.env.DEV ? page(() => import("./pages/OperationalPlanningAcceptancePage"), "OperationalPlanningAcceptancePage") : null;

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SkeletonRows className="bg-[var(--surface)]" />}>{children}</Suspense>;
}

/** Old /app/* URLs (Phase ≤5) keep working. */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={legacyTarget(pathname, search)} replace />;
}

function JobRoute() {
  const { jobId } = useParams();
  return <JobWorkspacePage key={jobId} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<S><OverviewPage /></S>} />
        <Route path="work" element={<S><WorkPage /></S>} />
        <Route path="work/:jobId" element={<S><JobRoute /></S>} />
        <Route path="dispatch" element={<S><DispatchPage /></S>} />
        <Route path="fleet" element={<S><FleetPage /></S>} />
        <Route path="fleet/trailers" element={<S><FleetPage /></S>} />
        <Route path="fleet/trucks/:truckId" element={<S><TruckPage /></S>} />
        <Route path="fleet/trailers/:trailerId" element={<S><TrailerPage /></S>} />
        <Route path="drivers" element={<S><DriversPage /></S>} />
        <Route path="drivers/:driverId" element={<S><DriverPage /></S>} />
        <Route path="documents" element={<S><DocumentsPage /></S>} />
        <Route path="compliance" element={<S><CompliancePage /></S>} />
        <Route path="intelligence" element={<S><RoadIntelligencePage /></S>} />
        <Route path="settings" element={<S><SettingsPage /></S>} />
        {OperationalPlanningAcceptancePage ? <Route path="__dev/operational-planning" element={<S><OperationalPlanningAcceptancePage /></S>} /> : null}
        {RoutingAcceptancePage ? <Route path="__dev/routing-acceptance" element={<S><RoutingAcceptancePage /></S>} /> : null}
      </Route>
      <Route path="app/*" element={<LegacyRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
