import { useTranslation } from "@/platform/i18n";

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = useTranslation();
  const copy =
    kind === "privacy"
      ? {
          title: t("legal__privacy_title"),
          sections: [t("legal__privacy_collect"), t("legal__privacy_rights")],
        }
      : {
          title: t("legal__terms_title"),
          sections: [t("legal__terms_use"), t("legal__terms_liability")],
        };
  return (
    <article className="flex max-w-prose flex-col gap-4">
      <h1 className="text-title-xl">{copy.title}</h1>
      <p className="text-body text-muted-foreground">{t("legal__placeholder_notice")}</p>
      {copy.sections.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </article>
  );
}
