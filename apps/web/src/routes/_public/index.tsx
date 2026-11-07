import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { pageHead } from "@/lib/seo";
import { HomePage } from "@/site";

export const Route = createFileRoute("/_public/")({
  validateSearch: z.object({ account: z.literal("deleted").optional() }),
  head: ({ match }) =>
    pageHead({ description: match.context.i18n.t("site__home_body"), path: "/" }),
  component: Home,
});

function Home() {
  const { account } = Route.useSearch();
  return <HomePage accountDeleted={account === "deleted"} />;
}
