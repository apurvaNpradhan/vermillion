import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CheckInbox } from "@/auth";
import { pageHead } from "@/lib/seo";
import { safeReturnLocation } from "@/platform/navigation";

export const Route = createFileRoute("/_auth/verify-email")({
  validateSearch: z.object({ email: z.string().optional(), redirect: z.string().optional() }),
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("auth__verify_title"),
      description: "",
      path: "/verify-email",
      noindex: true,
    }),
  component: VerifyEmail,
});

function VerifyEmail() {
  const { email, redirect } = Route.useSearch();
  return <CheckInbox email={email ?? ""} callbackURL={safeReturnLocation(redirect)} />;
}
