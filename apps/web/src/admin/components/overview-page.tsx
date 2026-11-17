import { useT } from "@/platform/i18n";

import { useOverview } from "../use-admin";
import { formatDate, PageTitle } from "./fields";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="numeric font-semibold text-2xl text-text-primary">{value}</p>
      {detail ? <p className="text-text-muted text-xs">{detail}</p> : null}
    </div>
  );
}

/** The state of the app at a glance (story 9). */
export function OverviewPage() {
  const t = useT();
  const { overview } = useOverview();
  const dash = "—";
  return (
    <>
      <PageTitle title={t("admin__nav_overview")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("admin__stat_accounts")} value={String(overview?.accounts ?? dash)} />
        <Stat label={t("admin__stat_requests")} value={String(overview?.pendingRequests ?? dash)} />
        <Stat
          label={t("admin__stat_catalog")}
          value={String(overview?.catalog.live ?? dash)}
          detail={
            overview ? t("admin__stat_retired", { count: overview.catalog.retired }) : undefined
          }
        />
        <Stat
          label={t("admin__stat_latest")}
          value={overview?.latestRelease?.version ?? dash}
          detail={
            overview?.latestRelease ? formatDate(overview.latestRelease.publishedAt) : undefined
          }
        />
        <Stat label={t("admin__stat_minimum")} value={overview?.minimumVersion ?? dash} />
      </div>
    </>
  );
}
