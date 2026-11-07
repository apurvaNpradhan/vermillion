import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { orpc } from "@/platform/orpc";

/** `beforeLoad` guard: only administrators get through (the server enforces it too). */
export async function requireAdmin({ context }: { context: { queryClient: QueryClient } }) {
  try {
    await context.queryClient.ensureQueryData(orpc.admin.access.queryOptions());
  } catch {
    throw redirect({ to: "/app" });
  }
}
