import type { Evidence, ExerciseType, WeightUnit } from "@workspace/shared";
import { useMemo } from "react";
import { Text, View } from "react-native";

import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useTranslation } from "@/platform/i18n";

import { evidenceLines } from "./evidence-text";
import { distanceText, durationText } from "./work-text";

/**
 * The quiet lines under a reason: the Session the suggestion was read from and what was done in
 * it, then the factor, snapping or cap that moved the load. Nothing renders without evidence (a
 * Session from before it was kept).
 */
export function EvidenceLines({
  evidence,
  type,
  unit,
}: {
  evidence: Evidence | undefined;
  type: ExerciseType;
  unit: WeightUnit;
}) {
  const { t, i18n } = useTranslation();
  const timeZone = useDeviceTimeZone();
  const lines = useMemo(() => {
    const date = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone,
    });
    return evidenceLines(evidence, {
      type,
      unit,
      formatDate: (iso) => date.format(new Date(iso)),
      formats: {
        sets: (weight, unitName, reps) => t("progress__best", { weight, unit: unitName, reps }),
        assisted: (weight, unitName, reps) =>
          t("progress__evidence_assisted", { weight, unit: unitName, reps }),
        duration: (seconds) => durationText(t, seconds),
        distance: (metres) => distanceText(t, metres),
      },
    });
  }, [evidence, type, unit, i18n.language, timeZone, t]);
  if (lines.length === 0) return null;
  return (
    <View className="gap-1">
      {lines.map((line) => (
        <Text key={line.key} className="font-normal text-caption text-muted">
          {/* The key and its parameters travel together, so each pair is checked as a unit. */}
          {t(line.key, line.params)}
        </Text>
      ))}
    </View>
  );
}
