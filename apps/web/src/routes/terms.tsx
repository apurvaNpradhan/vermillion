import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "../components/legal-page.tsx";
import { terms } from "../content/legal.ts";
import { site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/terms")({
  head: () => pageHead("/terms", `${terms.title} | ${site.name}`, terms.intro),
  component: () => <LegalPage document={terms} />,
});
