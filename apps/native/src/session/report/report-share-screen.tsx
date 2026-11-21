import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ShareComposer, type ShareTemplate, type ShareToggle } from "@/share";

import type { PeriodReport } from "./period-report";
import { ReportMusclesCard, ReportSummaryCard, type ReportToggleId } from "./report-cards";
import { parseReportKey, type ReportPeriod } from "./report-period";
import { buildReportView } from "./report-view";
import { usePeriodReport } from "./use-period-report";
import { useReportLabels } from "./use-report-labels";
import { useReportShareSnapshot } from "./use-report-share-snapshot";

function Status({
  loading,
  onClose,
  retry,
}: {
  loading: boolean;
  onClose: () => void;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  if (loading) return <View className="flex-1 bg-background" />;
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="font-normal text-center text-body text-muted">
        {t("session__load_failed")}
      </Text>
      {retry ? (
        <Button variant="secondary" onPress={retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : null}
      <Button variant="secondary" onPress={onClose}>
        <Button.Label>{t("share__close")}</Button.Label>
      </Button>
    </View>
  );
}

function ReportShare({ report }: { report: PeriodReport }) {
  const { t } = useTranslation();
  const { labels, title, kicker } = useReportLabels(report.period);
  const data = {
    kicker,
    title,
    view: buildReportView(report, labels),
    shares: report.shares,
  };
  const templates: ShareTemplate<ReportToggleId>[] = [
    {
      id: "summary",
      label: t("share__template_summary"),
      supportsTransparent: false,
      render: (context) => <ReportSummaryCard data={data} context={context} />,
    },
    ...(report.shares.groups.length > 0
      ? [
          {
            id: "muscles",
            label: t("share__template_muscles"),
            supportsTransparent: false,
            render: (context) => <ReportMusclesCard data={data} context={context} />,
          } satisfies ShareTemplate<ReportToggleId>,
        ]
      : []),
  ];
  const toggles: ShareToggle<ReportToggleId>[] = [
    { id: "weights", label: t("share__toggle_weights"), defaultOn: true, remember: true },
  ];
  return (
    <ShareComposer
      kind="report"
      title={t("share__title_report")}
      templates={templates}
      toggles={toggles}
    />
  );
}

function LoadReportShare({ period, onClose }: { period: ReportPeriod; onClose: () => void }) {
  const state = usePeriodReport(period);
  if (state.status === "ready") return <ReportShare report={state.report} />;
  return (
    <Status
      loading={state.status === "loading"}
      retry={state.status === "error" ? state.retry : undefined}
      onClose={onClose}
    />
  );
}

/** The Share composer for a month or year report (route `share/report/[id]`, id like `2026-10`). */
export function ReportShareScreen({
  id,
  snapshot,
  onClose,
}: {
  id: string;
  snapshot?: string;
  onClose: () => void;
}) {
  const { pending, report } = useReportShareSnapshot(id, snapshot);
  if (report) return <ReportShare report={report} />;
  const period = parseReportKey(id);
  if (pending || !period) return <Status loading={pending} onClose={onClose} />;
  return <LoadReportShare period={period} onClose={onClose} />;
}
