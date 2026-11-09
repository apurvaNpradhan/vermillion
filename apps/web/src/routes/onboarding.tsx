import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { pageHead } from "@/lib/seo";
import { OnboardingPage, requireOnboarding } from "@/onboarding";

// Client-only like the app: it reads the session in the browser.
export const Route = createFileRoute("/onboarding")({
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: requireOnboarding,
  head: ({ match }) =>
    pageHead({
      title: match.context.i18n.t("onboarding__name_title"),
      description: "",
      path: "/onboarding",
      noindex: true,
    }),
  component: Onboarding,
});

function Onboarding() {
  const { redirect } = Route.useSearch();
  return <OnboardingPage redirect={redirect} />;
}
