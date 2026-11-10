import type { FinishedSession } from "@workspace/sync";
import { KG_PER_LB, type WeightUnit } from "@workspace/shared";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

/** Ticked warm-ups remain visible here; they never contribute to the numbers above. */
export function RecentSessions({
  sessions,
  unit,
  timezone,
  onSeeAll,
  showHeading = true,
}: {
  sessions: readonly FinishedSession[];
  unit: WeightUnit;
  timezone: string | null;
  onSeeAll?: () => void;
  showHeading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: timezone ?? undefined,
  });
  return (
    <View className="gap-3">
      {showHeading ? (
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {t("exercise__recent")}
          </Text>
          {onSeeAll ? (
            <Button variant="tertiary" size="sm" onPress={onSeeAll}>
              <Button.Label>{t("exercise__see_all")}</Button.Label>
            </Button>
          ) : null}
        </View>
      ) : null}
      {sessions.map((session) => (
        <View key={session.id} className="gap-2 rounded-xl bg-surface p-3">
          <Text className="text-body font-semibold text-foreground">{session.title}</Text>
          <Text className="text-caption text-muted">
            {date.format(new Date(session.started_at))}
          </Text>
          {session.sets.map((set, index) => (
            <View key={set.id} className="flex-row gap-3">
              <Text className="text-caption text-muted">
                {t(
                  set.kind === "warmup"
                    ? "exercise__history_warmup"
                    : set.kind === "drop"
                      ? "exercise__history_drop"
                      : set.kind === "failure"
                        ? "exercise__history_failure"
                        : "exercise__history_set",
                  {
                    number: session.sets
                      .slice(0, index + 1)
                      .reduce((count, row) => count + (row.kind === "warmup" ? 0 : 1), 0),
                  },
                )}
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-2">
                {set.weight_kg != null ? (
                  <Text
                    className="text-body text-foreground"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {t("exercise__value_weight", {
                      value: number.format(
                        unit === "lb" ? set.weight_kg / KG_PER_LB : set.weight_kg,
                      ),
                      unit,
                    })}
                  </Text>
                ) : null}
                {(["reps", "duration_s", "distance_m", "floors", "steps"] as const).map((field) =>
                  set[field] != null ? (
                    <Text
                      key={field}
                      className="text-body text-foreground"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {t(
                        field === "reps"
                          ? "exercise__value_reps"
                          : field === "duration_s"
                            ? "exercise__value_seconds"
                            : field === "distance_m"
                              ? "exercise__value_metres"
                              : field === "floors"
                                ? "exercise__value_floors"
                                : "exercise__value_steps",
                        { value: number.format(set[field] ?? 0) },
                      )}
                    </Text>
                  ) : null,
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
