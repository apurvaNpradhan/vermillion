import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";

import type { UnmatchedExercise } from "../use-history-import";

/** One exercise name from the file that is not in the library, with what will happen to it. */
export function UnmatchedExerciseRow({
  item,
  onPress,
}: {
  item: UnmatchedExercise;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const value =
    item.resolution.kind === "mapped"
      ? item.resolution.target.title
      : item.resolution.kind === "skip"
        ? t("import__status_skip")
        : t("import__status_create");
  return (
    <ListRow
      title={item.name}
      description={t("import__usage", { sets: item.sets, workouts: item.sessions })}
      value={value}
      onPress={onPress}
    />
  );
}
