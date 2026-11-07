import { createFileRoute } from "@tanstack/react-router";

import { AdminUsersPage, requireAdmin } from "@/admin";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/admin/users")({
  beforeLoad: requireAdmin,
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("admin__users_title"),
      description: "",
      path: "/admin/users",
      noindex: true,
    }),
  component: AdminUsersPage,
});
