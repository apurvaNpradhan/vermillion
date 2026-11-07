import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/site";

export const Route = createFileRoute("/_public/privacy")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("legal__privacy_title"),
      description: match.context.i18n.t("legal__privacy_collect"),
      path: "/privacy",
    }),
  component: () => <LegalPage kind="privacy" />,
});
