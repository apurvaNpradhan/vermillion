import { createFileRoute } from "@tanstack/react-router";

import { TERMS, LegalPage } from "@/marketing";
import { t } from "@/platform/i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: t("terms__title") }] }),
  component: () => <LegalPage title="terms__title" intro="terms__intro" sections={TERMS} />,
});
