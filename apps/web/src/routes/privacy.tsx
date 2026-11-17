import { createFileRoute } from "@tanstack/react-router";

import { PRIVACY, LegalPage } from "@/marketing";
import { t } from "@/platform/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: t("privacy__title") }] }),
  component: () => <LegalPage title="privacy__title" intro="privacy__intro" sections={PRIVACY} />,
});
