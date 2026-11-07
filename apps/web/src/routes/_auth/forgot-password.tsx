import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/forgot-password")({
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("auth__forgot_title"),
      description: "",
      path: "/forgot-password",
      noindex: true,
    }),
  component: ForgotPasswordForm,
});
