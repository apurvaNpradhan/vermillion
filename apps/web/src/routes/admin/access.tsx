import { createFileRoute } from "@tanstack/react-router";
import { inviteStateSchema } from "@workspace/shared";
import { z } from "zod";

import { AccessPage } from "@/access";

export const Route = createFileRoute("/admin/access")({
  validateSearch: z.object({
    state: inviteStateSchema.optional().catch(undefined),
    search: z.string().max(200).optional().catch(undefined),
    page: z.number().int().min(1).catch(1).default(1),
  }),
  component: function Access() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <AccessPage search={search} onSearch={(next) => void navigate({ search: next })} />;
  },
});
