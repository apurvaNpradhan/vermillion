import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";

import { postSignInTarget } from "./post-sign-in";
import { sessionQueryOptions } from "./session";

const redirectSearch = z.object({ redirect: z.string().optional() });

/** `beforeLoad` guard for auth routes: a signed-in user is sent on to where they were headed. */
export async function redirectIfSignedIn(args: {
  context: { queryClient: QueryClient };
  location: { search: unknown };
}) {
  const session = await args.context.queryClient.ensureQueryData(sessionQueryOptions());
  if (!session) return;
  const search = redirectSearch.safeParse(args.location.search);
  throw redirect(postSignInTarget(session.user, search.success ? search.data.redirect : undefined));
}
