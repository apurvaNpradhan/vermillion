import { createFileRoute } from "@tanstack/react-router";

import { DELETION, LegalPage } from "@/marketing";
import { t } from "@/platform/i18n";

export const Route = createFileRoute("/delete-account")({
  head: () => ({ meta: [{ title: t("deletion__title") }] }),
  component: () => (
    <LegalPage title="deletion__title" intro="deletion__intro" sections={DELETION} />
  ),
});
