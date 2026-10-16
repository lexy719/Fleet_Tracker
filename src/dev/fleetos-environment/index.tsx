import { lazy, Suspense } from "react";
import GuidedEnvironment from "./GuidedEnvironment";
const WorldEnvironment = lazy(() => import("./fx/World"));
const ConnectedEnvironment = lazy(() => import("./backend/ConnectedEnvironment"));

/** Preserve the authored environment; the connected experiment is explicitly opt-in. */
export default function FleetOSEnvironment() {
  const params = new URLSearchParams(window.location.search);
  return <Suspense fallback={<div style={{ height: "100dvh", background: "#f3f2ec" }} />}>
  {params.has("world") ? (
    <WorldEnvironment />
  ) : params.has("connected") ? (
    <ConnectedEnvironment />
  ) : (
    <GuidedEnvironment />
  )}</Suspense>;
}
