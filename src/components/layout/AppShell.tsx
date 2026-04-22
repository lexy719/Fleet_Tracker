import clsx from "clsx";
import { Outlet, useLocation } from "react-router-dom";
import { AlertStrip } from "./AlertStrip";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

export function AppShell() {
  const { pathname } = useLocation();
  const isMap = pathname === "/app/map";
  const isDispatch = pathname === "/app/dispatch";
  const isToday = pathname === "/app";
  const isJobs = pathname === "/app/jobs";

  const fullHeightRoute = isMap || isDispatch || isToday || isJobs;

  return (
    <div
      className={clsx(
        "premium-grid flex flex-col",
        fullHeightRoute ? "h-dvh min-h-0 overflow-hidden" : "min-h-screen",
      )}
      style={{ background: "var(--workspace-bg)" }}
    >
      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
          <AppSidebar />
        </div>
        <div className={clsx("flex min-h-0 min-w-0 flex-1 flex-col", fullHeightRoute && "h-full")}>
          <AppTopBar />
          <AlertStrip />
          <main
            className={clsx(
              "flex min-h-0 flex-1 flex-col",
              fullHeightRoute
                ? isToday
                  ? "h-full overflow-y-auto overflow-x-hidden p-0"
                  : "h-full overflow-hidden p-0"
                : "overflow-auto px-4 py-6 md:px-6 lg:px-8",
            )}
            style={!isMap && !isDispatch && !isToday ? { background: "var(--workspace-bg)" } : undefined}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
