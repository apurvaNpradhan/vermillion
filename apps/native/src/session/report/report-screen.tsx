import { MuscleDistribution } from "@/training";
import { useRouter } from "expo-router";
import { ArrowDown, ArrowUp, Export, Medal, Minus } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { FadeIn } from "@/platform/ui/fade-in";
import { ScrollPage } from "@/platform/ui/page";

import type { ReportPeriod } from "./report-period";
import { reportKey } from "./report-period";
import type { PeriodReport } from "./period-report";
import { buildReportView, type ReportLabels, type StatView } from "./report-view";
import { usePeriodReport } from "./use-period-report";
import { useReportLabels } from "./use-report-labels";
import { usePrepareReportShare } from "./use-report-share-snapshot";

function Change({ change }: { change: NonNullable<StatView["change"]> }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const Icon =
    change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus;
  return (
    <View
      accessible
      accessibilityLabel={t(`report__change_${change.direction}`, { value: change.text })}
      className="flex-row items-center gap-1"
    >
      <Icon size={14} weight="bold" color={subtle} />
      <Text
        className="font-normal text-caption text-muted"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {change.text}
      </Text>
    </View>
  );
}

function Stat({ stat }: { stat: StatView }) {
  return (
    <View className="min-w-[44%] flex-1 gap-1">
      <Text className="font-normal text-caption text-muted">{stat.label}</Text>
      <View className="flex-row items-baseline gap-1">
        <Text
          className="font-medium text-numeric-md text-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {stat.value}
        </Text>
        {stat.unit ? <Text className="font-normal text-body text-muted">{stat.unit}</Text> : null}
      </View>
      {stat.change ? <Change change={stat.change} /> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function TopList({ rows }: { rows: { id: string; title: string; value: string }[] }) {
  return (
    <View className="gap-2">
      {rows.map((row, index) => (
        <View key={row.id} className="flex-row items-baseline gap-3">
          <Text
            className="font-normal w-5 text-caption text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {index + 1}
          </Text>
          <Text className="font-normal flex-1 text-body text-foreground" numberOfLines={1}>
            {row.title}
          </Text>
          <Text
            className="font-normal text-body text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportBody({ report, labels }: { report: PeriodReport; labels: ReportLabels }) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const view = buildReportView(report, labels);
  return (
    <FadeIn className="gap-6">
      <View className="gap-4 rounded-2xl bg-surface p-4">
        <View className="flex-row flex-wrap gap-x-4 gap-y-5">
          {view.stats.map((stat) => (
            <Stat key={stat.id} stat={stat} />
          ))}
        </View>
        {view.versus ? (
          <Text className="font-normal text-caption text-muted">{view.versus}</Text>
        ) : null}
      </View>
      {view.records || view.streak ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          {view.records ? (
            <View className="flex-row items-center gap-3">
              <Medal size={20} weight="fill" color={subtle} />
              <Text className="font-normal flex-1 text-body text-foreground">{view.records}</Text>
            </View>
          ) : null}
          {view.streak ? (
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="font-normal text-body text-muted">{t("report__streak")}</Text>
              <Text className="font-normal text-body text-foreground">{view.streak}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {view.topBySets.length > 0 ? (
        <Section title={t("report__top_sets")}>
          <TopList rows={view.topBySets} />
        </Section>
      ) : null}
      {view.topByVolume.length > 0 ? (
        <Section title={t("report__top_volume")}>
          <TopList rows={view.topByVolume} />
        </Section>
      ) : null}
      {report.shares.groups.length > 0 ? (
        <Section title={t("report__muscles")}>
          <MuscleDistribution shares={report.shares} compact />
        </Section>
      ) : null}
    </FadeIn>
  );
}

/**
 * The report of one month or year (route `history/report/[key]`): the figures against the period
 * before, the Records and goal streak, the top exercises and the muscle split. "Share" makes the
 * card. Everything is read from the device.
 */
export function ReportScreen({ period }: { period: ReportPeriod }) {
  const { t } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const state = usePeriodReport(period);
  const { labels, title, kicker } = useReportLabels(period);
  const key = reportKey(period);
  const prepareShare = usePrepareReportShare();
  const share = () => {
    if (state.status !== "ready") return;
    const snapshot = prepareShare(state.report);
    router.push({
      pathname: "/share/[kind]/[id]",
      params: { kind: "report", id: key, snapshot },
    });
  };
  return (
    <ScrollPage
      title={title}
      overline={kicker}
      back
      backFallback="/history"
      actions={
        state.status === "ready" && state.report.stats.workouts > 0 ? (
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("report__share")}
            onPress={share}
          >
            <Export size={24} weight="regular" color={subtle} />
          </Button>
        ) : undefined
      }
    >
      {state.status === "error" ? (
        <Button variant="secondary" onPress={state.retry}>
          <Button.Label>{t("training__retry")}</Button.Label>
        </Button>
      ) : state.status === "loading" ? null : state.report.stats.workouts === 0 ? (
        <Text className="font-normal text-center text-body text-muted">{t("report__empty")}</Text>
      ) : (
        <ReportBody report={state.report} labels={labels} />
      )}
    </ScrollPage>
  );
}
