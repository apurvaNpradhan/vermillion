import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SignInForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    reset: z.literal("done").optional(),
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
  const { redirect, reset, error } = Route.useSearch();
  return <SignInForm redirect={redirect} resetDone={reset === "done"} providerError={error} />;
}
