import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { VerifyCodeForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/verify-code")({
  validateSearch: z.object({ email: z.string().optional(), redirect: z.string().optional() }),
  // The address comes from the email screen; without it there is nothing to verify.
  beforeLoad: ({ search }) => {
    if (!search.email) {
      throw redirect({
        to: "/login",
        search: search.redirect ? { redirect: search.redirect } : {},
      });
    }
  },
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("auth__code_title"),
      description: "",
      path: "/verify-code",
      noindex: true,
    }),
  component: VerifyCode,
});

function VerifyCode() {
  const { email, redirect } = Route.useSearch();
  return <VerifyCodeForm email={email ?? ""} redirect={redirect} />;
}
