import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/admin";
import { AdminSignIn, EnrolTwoFactor, useAdminAccess, VerifyTwoFactor } from "@/auth";
import { NotFoundPage } from "@/marketing";
import { t } from "@/platform/i18n";

/** Everything under /admin renders in the browser only, behind the gate. */
export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: t("admin__nav_overview") }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { gate, email, refresh, signOut } = useAdminAccess();
  switch (gate) {
    case "loading":
      return null;
    case "sign-in":
      return <AdminSignIn onSignedIn={() => void refresh()} />;
    case "not-found":
      return <NotFoundPage />;
    case "enrol":
      return <EnrolTwoFactor onDone={() => void refresh()} />;
    case "verify":
      return <VerifyTwoFactor onDone={() => void refresh()} onSignOut={() => void signOut()} />;
    case "ready":
      return (
        <AdminShell email={email} onSignOut={() => void signOut()}>
          <Outlet />
        </AdminShell>
      );
  }
}
