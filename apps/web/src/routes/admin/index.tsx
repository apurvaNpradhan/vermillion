import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "@/admin";

export const Route = createFileRoute("/admin/")({ component: OverviewPage });
