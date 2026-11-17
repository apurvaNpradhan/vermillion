import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { InvitePage } from "@/marketing";

export const Route = createFileRoute("/invite")({
  validateSearch: z.object({ token: z.string().max(128).optional() }),
  // The token is read in the browser; the prerendered page knows none.
  ssr: false,
  component: function Invite() {
    const { token } = Route.useSearch();
    return <InvitePage token={token} />;
  },
});
