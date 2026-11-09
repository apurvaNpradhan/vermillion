import { createFileRoute } from "@tanstack/react-router";

import { assetLinksResponse } from "@/lib/app-association";
import { env } from "@/platform/env";

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: { handlers: { GET: () => assetLinksResponse(env.VITE_ANDROID_CERT_SHA256) } },
});
