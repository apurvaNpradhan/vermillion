import { createFileRoute } from "@tanstack/react-router";

import { buildRobots, siteOrigin } from "@/lib/seo";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildRobots(siteOrigin()), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
