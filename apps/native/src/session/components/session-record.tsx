import type { RecordKey } from "@workspace/shared";
import { Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
// Safety: fixed translation keys retain their literal types.
const KEYS = {
  heaviest_weight: "exercise__metric_heaviest",
  estimated_one_rep_max: "exercise__metric_one_rm",
  set_volume: "exercise__metric_set_volume",
  session_volume: "exercise__metric_session_volume",
  longest_duration: "exercise__metric_duration",
  longest_distance: "exercise__metric_distance",
  best_pace: "exercise__metric_pace",
} as const satisfies Partial<Record<RecordKey, string>>;
function hasLabel(key: RecordKey): key is keyof typeof KEYS {
  return key in KEYS;
}
export function SessionRecord({
  exercise,
  records,
}: {
  exercise: string;
  records: readonly RecordKey[];
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1 rounded-xl bg-surface p-3">
      <Text className="text-label text-foreground">{exercise}</Text>
      {records.map((key) => (
        <Text key={key} className="text-caption text-muted">
          {hasLabel(key)
            ? t(KEYS[key])
            : t("exercise__record_reps", { count: Number(key.slice(5)) })}
        </Text>
      ))}
    </View>
  );
}
