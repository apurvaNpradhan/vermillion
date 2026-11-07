import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SignUpForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("nav__sign_up"),
      description: "",
      path: "/sign-up",
      noindex: true,
    }),
  component: SignUp,
});

function SignUp() {
  const { redirect } = Route.useSearch();
  return <SignUpForm redirect={redirect} />;
}
