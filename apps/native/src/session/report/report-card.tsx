import { useRouter } from "expo-router";
import { X } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";

import type { ReportPeriod } from "./report-period";
import { useReportCard } from "./use-report-card";
import { useReportLabels } from "./use-report-labels";

/**
 * The top of History: "Your October report" (or "Your 2026 in review" in January): shown for the first days of
 * a month, opens that report, and can be dismissed for good on this device.
 */
export function ReportCard() {
  const card = useReportCard();
  if (card === null) return null;
  return <Card {...card} />;
}

function Card({
  period,
  reportId,
  dismiss,
}: {
  period: ReportPeriod;
  reportId: string;
  dismiss: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const { format } = useReportLabels(period);
  const name = period.kind === "year" ? format.year(period.start) : format.longMonth(period.start);
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-4">
      <View className="flex-1 gap-1">
        <Text accessibilityRole="header" className="font-semibold text-title-md text-foreground">
          {t(period.kind === "year" ? "report__card_year" : "report__card_month", { period: name })}
        </Text>
        <Text className="text-caption text-muted">{t("report__card_body")}</Text>
      </View>
      <Button
        variant="secondary"
        size="sm"
        onPress={() =>
          router.push({ pathname: "/history/report/[key]", params: { key: reportId } })
        }
      >
        <Button.Label>{t("report__card_open")}</Button.Label>
      </Button>
      <Button
        isIconOnly
        variant="ghost"
        accessibilityLabel={t("report__card_dismiss")}
        onPress={dismiss}
      >
        <X size={20} color={subtle} />
      </Button>
    </View>
  );
}
