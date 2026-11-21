import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "../components/legal-page.tsx";
import { privacy } from "../content/legal.ts";
import { site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead("/privacy", `${privacy.title} | ${site.name}`, privacy.intro),
  component: () => <LegalPage document={privacy} />,
});
