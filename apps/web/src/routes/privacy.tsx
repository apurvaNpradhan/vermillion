import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "../components/legal-page.tsx";
import { privacy } from "../content/legal.ts";
import { site } from "../content/site.ts";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: `Privacy policy | ${site.name}` }] }),
  component: () => <LegalPage document={privacy} />,
});
