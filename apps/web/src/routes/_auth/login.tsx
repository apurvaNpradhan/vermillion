import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { EmailForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    error: z.string().max(200).optional(),
  }),
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("nav__sign_in"),
      description: "",
      path: "/login",
      noindex: true,
    }),
  component: Login,
});

function Login() {
  const { redirect, error } = Route.useSearch();
  return <EmailForm redirect={redirect} providerError={error} />;
}
