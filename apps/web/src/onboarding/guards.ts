import { redirect } from "@tanstack/react-router";
import { pendingOnboardingSteps } from "@workspace/shared";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { sessionQueryOptions } from "@/auth";
import { safeReturnLocation } from "@/platform/navigation";

/**
 * `beforeLoad` guard of the signed-in app: a person with a pending required step goes to
 * onboarding first. Without a session (a device opened offline by its owner) there is nothing to
 * derive steps from, so the app opens.
 */
export function requireOnboarded(args: {
  session: { user: { name?: string | null | undefined } } | null;
  location: { href: string };
}) {
  if (args.session && pendingOnboardingSteps(args.session.user).length > 0) {
    throw redirect({
      to: "/onboarding",
      search: { redirect: safeReturnLocation(args.location.href) },
    });
  }
}

const redirectSearch = z.object({ redirect: z.string().optional() });

/** `beforeLoad` guard of `/onboarding`: sign in first, and leave once nothing is pending. */
export async function requireOnboarding(args: {
  context: { queryClient: QueryClient };
  location: { search: unknown; href: string };
}) {
  const session = await args.context.queryClient.ensureQueryData(sessionQueryOptions());
  if (!session) throw redirect({ to: "/login", search: { redirect: args.location.href } });
  if (pendingOnboardingSteps(session.user).length === 0) {
    const search = redirectSearch.safeParse(args.location.search);
    throw redirect({ href: safeReturnLocation(search.success ? search.data.redirect : undefined) });
  }
}
