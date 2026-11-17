import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { UsersPage } from "@/users";

export const Route = createFileRoute("/admin/users")({
  validateSearch: z.object({
    search: z.string().max(200).optional().catch(undefined),
    banned: z.boolean().optional().catch(undefined),
    page: z.number().int().min(1).catch(1).default(1),
    open: z.string().max(64).optional().catch(undefined),
  }),
  component: function Users() {
    const { open, ...search } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <UsersPage
        search={search}
        onSearch={(next) => void navigate({ search: next })}
        open={open ?? null}
        onOpen={(id) => void navigate({ search: { ...search, open: id ?? undefined } })}
      />
    );
  },
});
