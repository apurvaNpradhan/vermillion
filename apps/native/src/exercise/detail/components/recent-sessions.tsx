import type { FinishedSession } from "@workspace/sync";
import { KG_PER_LB, SET_KIND_KEYS, type SetKind, type WeightUnit } from "@workspace/shared";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";

import { formatClock, workingSetNumber } from "../numbers";
import { useHumanUnits } from "../use-human-units";

/** Each kind in its data colour; working sets stay muted and numbered. */
const KIND_TEXT = {
  working: "text-muted",
  warmup: "text-set-warmup",
  drop: "text-set-drop",
  failure: "text-set-failure",
  top: "text-set-top",
  backoff: "text-set-backoff",
  myo: "text-set-myo",
} as const satisfies Record<SetKind, string>;

/** Every set of each session, for the full history. Ticked warm-ups show; they never count. */
export function RecentSessions({
  sessions,
  unit,
  timezone,
}: {
  sessions: readonly FinishedSession[];
  unit: WeightUnit;
  timezone: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { distance } = useHumanUnits();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeZone: timezone ?? undefined,
  });
  return (
    <View className="gap-3">
      {sessions.map((session) => (
        <View key={session.id} className="gap-2 pb-3 pt-1">
          <Text className="text-body font-semibold text-foreground">{session.title}</Text>
          <Text className="font-normal text-caption text-muted">
            {date.format(new Date(session.started_at))}
          </Text>
          {session.sets.map((set, index) => (
            <View key={set.id} className="flex-row gap-3">
              <Text className={`font-normal text-caption ${KIND_TEXT[set.kind]}`}>
                {set.kind === "working"
                  ? t("exercise__history_set", { number: workingSetNumber(session.sets, index) })
                  : t(SET_KIND_KEYS[set.kind])}
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-2">
                {set.weight_kg != null ? (
                  <Text
                    className="font-normal text-body text-foreground"
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
                      className="font-normal text-body text-foreground"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {field === "duration_s"
                        ? formatClock(set[field] ?? 0)
                        : field === "distance_m"
                          ? distance(set[field] ?? 0)
                          : t(
                              field === "reps"
                                ? "exercise__value_reps"
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
