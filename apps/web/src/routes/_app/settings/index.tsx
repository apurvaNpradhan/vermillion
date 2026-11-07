import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { orpc } from "@/platform/orpc";
import { ProfilePage } from "@/settings";

export const Route = createFileRoute("/_app/settings/")({
  // The form starts from the saved name, so it must be loaded before it renders.
  loader: ({ context }) => context.queryClient.ensureQueryData(orpc.account.me.queryOptions()),
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("settings__nav_profile"),
      description: "",
      path: "/settings",
      noindex: true,
    }),
  component: ProfilePage,
});
