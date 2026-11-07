import { createFileRoute } from "@tanstack/react-router";

import { DiagnosticsPage } from "@/diagnostics";
import { pageHead } from "@/lib/seo";

// Client-only: it reads this browser's local database, which the server cannot see.
export const Route = createFileRoute("/diagnostics")({
  ssr: false,
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("diagnostics__title"),
      description: "",
      path: "/diagnostics",
      noindex: true,
    }),
  component: DiagnosticsPage,
});
