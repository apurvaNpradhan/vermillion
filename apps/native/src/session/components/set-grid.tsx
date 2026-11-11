import { SET_FIELDS, type EffortScale, type SetField, type WeightUnit } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { Plus } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { SwipeGroup } from "@/platform/ui/swipe-row";
import { chipTexts } from "@/training";

import type { useLoggingState } from "../use-logging-state";
import { SetRow } from "./set-row";

type Logging = ReturnType<typeof useLoggingState>;

/**
 * The sets of one exercise: a header over the columns, then a row for each set, then "+ Add set".
 * All state lives in the logging hook; a row gets only what it draws.
 */
export function SetGrid({
  exercise,
  logging,
  unit,
  effortScale,
  readOnly,
  onKind,
  onEffort,
  onRemoveSet,
  registerRow,
}: {
  exercise: SessionExerciseDetail;
  logging: Logging;
  unit: WeightUnit;
  effortScale: EffortScale;
  readOnly: boolean;
  onKind: (setId: string) => void;
  onEffort: (setId: string) => void;
  onRemoveSet: (setId: string) => void;
  /** Lets the screen scroll a row into view above the keypad. */
  registerRow: (setId: string) => (node: View | null) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const fields: readonly SetField[] = SET_FIELDS[exercise.type];
  const unitName = t(unit === "kg" ? "training__unit_kg" : "training__unit_lb");
  const showsEffort = exercise.logEffort && fields.includes("reps");
  const badges = chipTexts(
    exercise.sets.map((set) => ({ kind: set.kind })),
    {
      working: "",
      warmup: t("training__chip_warmup"),
      drop: t("training__chip_drop"),
      failure: t("training__chip_failure"),
    },
  );
  const header = (field: SetField): string => {
    switch (field) {
      case "weight":
        return t("training__field_weight", { unit: unitName });
      case "reps":
        return t("training__field_reps");
      case "duration":
        return t("training__field_duration");
      case "distance":
        return t("training__col_distance", { unit: t("training__unit_m") });
      case "floors":
        return t("training__field_floors");
      case "steps":
        return t("training__field_steps");
    }
  };

  return (
    <SwipeGroup>
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5 px-1">
          <Text className="w-10 text-center text-caption text-muted">{t("training__col_set")}</Text>
          <Text className="min-w-0 flex-[1.3] text-center text-caption text-muted">
            {t("session__col_previous")}
          </Text>
          {fields.map((field) => (
            <Text
              key={field}
              numberOfLines={1}
              className={`min-w-0 text-center text-caption text-muted ${field === "reps" ? "flex-[1.2]" : "flex-1"}`}
            >
              {header(field)}
            </Text>
          ))}
          {showsEffort ? (
            <Text numberOfLines={1} className="w-11 text-center text-caption text-muted">
              {t(effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir")}
            </Text>
          ) : null}
          <View className="w-11" />
        </View>
        {exercise.sets.map((set, index) => (
          <View key={set.id} ref={registerRow(set.id)} collapsable={false}>
            <SetRow
              editingFinished={logging.editingFinished}
              set={set}
              type={exercise.type}
              badge={badges[index] ?? String(index + 1)}
              number={index + 1}
              logEffort={exercise.logEffort}
              historyReady={logging.historyReadyFor(exercise.exerciseId)}
              previous={logging.previousOf(set.id)}
              ghosts={logging.ghostsFor(set.id)}
              unit={unit}
              effortScale={effortScale}
              entry={logging.entry?.cell.setId === set.id ? logging.entry : null}
              refusal={logging.refusal?.setId === set.id ? logging.refusal : null}
              highlighted={logging.highlights.get(set.id) === exercise.id}
              readOnly={readOnly}
              canRemove={exercise.sets.length > 1}
              onCell={logging.openCell}
              onTick={logging.onTick}
              onKind={onKind}
              onEffort={onEffort}
              onPrevious={logging.onPrevious}
              onRemove={onRemoveSet}
              onTimer={logging.onTimer}
            />
          </View>
        ))}
      </View>
      {readOnly ? null : (
        <Button variant="secondary" onPress={() => void logging.addSet(exercise.id)}>
          <Plus size={16} color={subtle} weight="bold" />
          <Button.Label>{t("session__add_set")}</Button.Label>
        </Button>
      )}
    </SwipeGroup>
  );
}
