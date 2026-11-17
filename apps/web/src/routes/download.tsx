import { createFileRoute } from "@tanstack/react-router";

import { DownloadPage } from "@/marketing";

export const Route = createFileRoute("/download")({ component: DownloadPage });
