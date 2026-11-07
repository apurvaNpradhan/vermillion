import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";
import { NotesPage } from "@/notes";

export const Route = createFileRoute("/_app/notes/")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("notes__title"),
      description: "",
      path: "/notes",
      noindex: true,
    }),
  component: NotesPage,
});
