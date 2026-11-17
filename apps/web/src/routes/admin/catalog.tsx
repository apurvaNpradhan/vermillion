import { createFileRoute } from "@tanstack/react-router";
import { EQUIPMENT, EXERCISE_TYPES, MUSCLE_GROUPS } from "@workspace/shared";
import { z } from "zod";

import { CatalogPage } from "@/catalog";

export const Route = createFileRoute("/admin/catalog")({
  validateSearch: z.object({
    search: z.string().max(200).optional().catch(undefined),
    primaryMuscle: z.enum(MUSCLE_GROUPS).optional().catch(undefined),
    equipment: z.enum(EQUIPMENT).optional().catch(undefined),
    exerciseType: z.enum(EXERCISE_TYPES).optional().catch(undefined),
    retired: z.enum(["live", "retired", "all"]).catch("live").default("live"),
    page: z.number().int().min(1).catch(1).default(1),
    edit: z.string().max(64).optional().catch(undefined),
  }),
  component: function Catalog() {
    const { edit, ...search } = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CatalogPage
        search={search}
        onSearch={(next) => void navigate({ search: next })}
        editing={edit ?? null}
        onEdit={(id) => void navigate({ search: { ...search, edit: id ?? undefined } })}
      />
    );
  },
});
