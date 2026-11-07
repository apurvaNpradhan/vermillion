import { Outlet, createFileRoute } from "@tanstack/react-router";

import { applyAccountLocale } from "@/preferences";
import { AppLayout } from "@/shell";
import { SyncBanner, SyncProvider, requireDeviceOwner } from "@/sync";

// The signed-in app is a client-side app: no server render, guarded by the Device owner so a cold
// start offline or with an expired session still opens the owner's local data (ADR 0021).
export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async (args) => {
    const { session } = await requireDeviceOwner(args);
    // The saved language comes from the server. Without a session, or when the server does not
    // answer promptly (offline), the device language stands and the app opens anyway.
    if (session) {
      await Promise.race([
        applyAccountLocale(args.context).catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    return { session };
  },
  component: () => (
    <SyncProvider>
      <AppLayout>
        <SyncBanner />
        <Outlet />
      </AppLayout>
    </SyncProvider>
  ),
});
