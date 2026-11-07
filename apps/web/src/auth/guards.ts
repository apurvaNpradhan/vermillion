import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";

import { safeReturnLocation } from "@/platform/navigation";

import { sessionQueryOptions } from "./session";

const redirectSearch = z.object({ redirect: z.string().optional() });

/** `beforeLoad` guard for auth routes: a signed-in user is sent on to where they were headed. */
export async function redirectIfSignedIn(args: {
  context: { queryClient: QueryClient };
  location: { search: unknown; pathname: string };
}) {
  // A reset token must be redeemable even while an older session is still active.
  if (args.location.pathname === "/reset-password") return;
  const session = await args.context.queryClient.ensureQueryData(sessionQueryOptions());
  if (!session) return;
  const search = redirectSearch.safeParse(args.location.search);
  throw redirect({ href: safeReturnLocation(search.success ? search.data.redirect : undefined) });
}
