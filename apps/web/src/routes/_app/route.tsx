import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/auth";
import { applyAccountLocale } from "@/preferences";
import { AppLayout } from "@/shell";

// The signed-in app is a client-side app: no server render, guarded by the cached session.
export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async (args) => {
    const { session } = await requireSession(args);
    await applyAccountLocale(args.context);
    return { session };
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
