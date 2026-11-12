import type { RecordKey } from "@workspace/shared";
import { Medal } from "phosphor-react-native";
import { Text, View } from "react-native";
import { useSubtleColor } from "@/platform/theme";
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
/** One exercise's records as a plain line: a medal, the exercise, then what was beaten. */
export function SessionRecord({
  exercise,
  records,
}: {
  exercise: string;
  records: readonly RecordKey[];
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  return (
    <View className="flex-row items-start gap-3 py-2">
      <Medal size={18} color={subtle} weight="fill" />
      <View className="flex-1 gap-0.5">
        <Text className="text-body text-foreground">{exercise}</Text>
        <Text className="text-caption text-muted">
          {records
            .map((key) =>
              hasLabel(key)
                ? t(KEYS[key])
                : t("exercise__record_reps", { count: Number(key.slice(5)) }),
            )
            .join(", ")}
        </Text>
      </View>
    </View>
  );
}
