import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { PreferencesPage } from "@/preferences";

export const Route = createFileRoute("/_app/settings/preferences")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("settings__nav_preferences"),
      description: "",
      path: "/settings/preferences",
      noindex: true,
    }),
  component: PreferencesPage,
});
