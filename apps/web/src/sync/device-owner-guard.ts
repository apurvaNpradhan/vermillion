import { readDeviceOwner } from "@workspace/sync";
import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { openLocalData } from "@/platform/powersync";
import { sessionQueryOptions } from "@/auth";

/** How long an app start waits for the network to confirm a session when the device has an owner. */
const SESSION_WAIT_MS = 2500;

const timeout = (ms: number) =>
  new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

/**
 * `beforeLoad` guard of the signed-in app (ADR 0021, D7). The local database decides, so a
 * cold start offline or with an expired session still opens the owner's data:
 *
 * - a Device owner exists: enter. The session is looked up for freshness but never waited on for
 *   long and never required.
 * - no owner: a session is required (first sign-in needs the network), else go to sign-in.
 */
export async function requireDeviceOwner(args: {
  context: { queryClient: QueryClient };
  location: { href: string };
}) {
  const { queryClient } = args.context;
  const lookup = queryClient.ensureQueryData(sessionQueryOptions()).catch(() => undefined);

  const local = await openLocalData();
  const owner = local.status === "ready" ? await readDeviceOwner(local.database) : null;

  const answer = owner ? await Promise.race([lookup, timeout(SESSION_WAIT_MS)]) : await lookup;
  const session = answer === "timeout" ? undefined : answer;
  if (!owner && !session) {
    throw redirect({ to: "/login", search: { redirect: args.location.href } });
  }
  return { session: session ?? null };
}
