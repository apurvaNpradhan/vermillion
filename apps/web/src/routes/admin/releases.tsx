import { createFileRoute } from "@tanstack/react-router";

import { ReleasesPage } from "@/releases";

export const Route = createFileRoute("/admin/releases")({ component: ReleasesPage });
