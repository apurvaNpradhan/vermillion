import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicLayout } from "@/shell";

// Server-rendered in the signed-out state; the navbar's session slot fills in on the client.
export const Route = createFileRoute("/_public")({
  component: () => (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  ),
});
