import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("auth__reset_title"),
      description: "",
      path: "/reset-password",
      noindex: true,
    }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token, error } = Route.useSearch();
  return <ResetPasswordForm token={token} error={error} />;
}
