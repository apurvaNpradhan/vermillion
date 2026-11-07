import { Outlet, createFileRoute } from "@tanstack/react-router";

import { redirectIfSignedIn } from "@/auth";

// Client-only: the session cookie is checked in the browser against the cached session query.
export const Route = createFileRoute("/_auth")({
  ssr: false,
  beforeLoad: redirectIfSignedIn,
  component: Outlet,
});
