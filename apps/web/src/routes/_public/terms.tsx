import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { LegalPage } from "@/site";

export const Route = createFileRoute("/_public/terms")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("legal__terms_title"),
      description: match.context.i18n.t("legal__terms_use"),
      path: "/terms",
    }),
  component: () => <LegalPage kind="terms" />,
});
