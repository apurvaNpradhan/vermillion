import { errorMessageKey } from "@workspace/client/orpc-error";
import { semverSchema } from "@workspace/shared";
import { useState } from "react";

import { FieldRow, formatDate, PageTitle } from "@/admin";
import { useT } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";

import { useReleaseSettings } from "../use-releases";

/** The latest release (from GitHub) and the Minimum supported version, which the admin sets. */
export function ReleasesPage() {
  const t = useT();
  const { status, setMinimum, saving } = useReleaseSettings();
  const [version, setVersion] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <>
      <PageTitle title={t("admin__nav_releases")} />
      <section className="flex max-w-lg flex-col gap-2 rounded-xl bg-surface p-4">
        <h2 className="font-semibold text-text-primary">{t("releases__latest")}</h2>
        {status?.latest ? (
          <p className="text-text-secondary">
            {t("releases__latest_value", {
              version: status.latest.version,
              date: formatDate(status.latest.publishedAt),
            })}{" "}
            <a className="underline" href={status.latest.url}>
              {t("releases__apk")}
            </a>
          </p>
        ) : (
          <p className="text-text-muted">{t("releases__none")}</p>
        )}
      </section>
      <form
        className="flex max-w-lg flex-col gap-3 rounded-xl bg-surface p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setFailure(null);
          if (!semverSchema.safeParse(version).success) {
            setFailure(t("releases__invalid"));
            return;
          }
          try {
            await setMinimum(version.trim());
            setVersion("");
          } catch (error) {
            setFailure(t(errorMessageKey(error instanceof Error ? error : null)));
          }
        }}
      >
        <h2 className="font-semibold text-text-primary">{t("releases__minimum")}</h2>
        <p className="text-sm text-text-secondary">
          {t("releases__minimum_current", { version: status?.minimumVersion ?? "—" })}
        </p>
        <FieldRow label={t("releases__minimum_new")} htmlFor="minimum-version" error={failure}>
          <Input
            id="minimum-version"
            placeholder="1.2.0"
            value={version}
            onChange={(e) => setVersion(e.currentTarget.value)}
          />
        </FieldRow>
        <p className="text-sm text-text-muted">{t("releases__minimum_hint")}</p>
        <Button type="submit" loading={saving}>
          {t("releases__save")}
        </Button>
      </form>
    </>
  );
}
