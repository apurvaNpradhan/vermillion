import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "../components/legal-page.tsx";
import { terms } from "../content/legal.ts";
import { site } from "../content/site.ts";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: `Terms of use | ${site.name}` }] }),
  component: () => <LegalPage document={terms} />,
});
