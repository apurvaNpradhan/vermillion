import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/app")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("nav__dashboard"),
      description: "",
      path: "/app",
      noindex: true,
    }),
  component: DashboardPage,
});
