import { createFileRoute } from "@tanstack/react-router";

import { appleAssociationResponse } from "@/lib/app-association";
import { env } from "@/platform/env";

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: { handlers: { GET: () => appleAssociationResponse(env.VITE_APPLE_TEAM_ID) } },
});
