import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";

export function ImportOmissions({
  omittedSets,
  omittedExercises,
  oversized,
}: {
  omittedSets: number;
  omittedExercises: number;
  oversized: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      {oversized > 0 ? (
        <Text className="text-caption text-danger">
          {t("import__oversized", { count: oversized })}
        </Text>
      ) : null}
      {omittedSets > 0 ? (
        <Text className="text-caption text-muted">
          {t("import__omitted_sets", { count: omittedSets })}
        </Text>
      ) : null}
      {omittedExercises > 0 ? (
        <Text className="text-caption text-muted">
          {t("import__omitted_exercises", { count: omittedExercises })}
        </Text>
      ) : null}
    </>
  );
}
