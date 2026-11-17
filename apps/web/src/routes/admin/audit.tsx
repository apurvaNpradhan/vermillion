import { createFileRoute } from "@tanstack/react-router";
import { auditActionSchema, auditTargetTypeSchema } from "@workspace/shared";
import { z } from "zod";

import { AuditPage } from "@/admin";

export const Route = createFileRoute("/admin/audit")({
  validateSearch: z.object({
    action: auditActionSchema.optional().catch(undefined),
    targetType: auditTargetTypeSchema.optional().catch(undefined),
    targetId: z.string().max(64).optional().catch(undefined),
    page: z.number().int().min(1).catch(1).default(1),
  }),
  component: function Audit() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return <AuditPage filters={search} onFilters={(next) => void navigate({ search: next })} />;
  },
});
