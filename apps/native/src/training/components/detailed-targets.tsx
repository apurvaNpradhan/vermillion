import { type ExerciseType, type PlannedSet, type SetKind } from "@workspace/shared";
import { useState } from "react";
import { View } from "react-native";

import { useTranslation } from "@/platform/i18n";

import { chipTexts, removeSetAt, replaceSet, supportsWarmups, withKind } from "../set-editing";
import { useTrainingPreferences } from "../use-training-preferences";
import { AddSetButton } from "./add-set-button";
import { EffortSheet } from "./effort-sheet";
import { SetTable } from "./set-table";
import { SetTypeSheet } from "./set-type-sheet";

/** Shared by the inline row and the detailed screen: custom sets have identical behavior. */
export function DetailedTargets({
  sets,
  type,
  onSets,
}: {
  sets: readonly PlannedSet[];
  type: ExerciseType;
  onSets: (sets: PlannedSet[]) => void;
}) {
  const { t } = useTranslation();
  const preferences = useTrainingPreferences();
  const [kindFor, setKindFor] = useState<number | null>(null);
  const [effortFor, setEffortFor] = useState<number | null>(null);
  const letters = {
    working: "",
    warmup: t("training__chip_warmup"),
    drop: t("training__chip_drop"),
    failure: t("training__chip_failure"),
  } satisfies Record<SetKind, string>;
  const effortSet = effortFor === null ? undefined : sets[effortFor];
  return (
    <View className="gap-3">
      <SetTable
        type={type}
        sets={sets}
        chips={chipTexts(sets, letters)}
        weightUnit={preferences.weightUnit}
        effortScale={preferences.effortScale}
        onChange={(index, change) => {
          const set = sets[index];
          if (set) onSets(replaceSet(sets, index, { ...set, ...change }));
        }}
        onRemove={(index) => onSets(removeSetAt(sets, index))}
        onKind={setKindFor}
        onEffort={setEffortFor}
      />
      <AddSetButton sets={sets} type={type} onSets={onSets} />
      <SetTypeSheet
        isOpen={kindFor !== null}
        onOpenChange={(open) => {
          if (!open) setKindFor(null);
        }}
        value={kindFor === null ? "working" : (sets[kindFor]?.kind ?? "working")}
        warmupsAllowed={supportsWarmups(type)}
        onSelect={(kind) => {
          const index = kindFor;
          const set = index === null ? undefined : sets[index];
          if (index !== null && set) onSets(replaceSet(sets, index, withKind(set, kind)));
        }}
      />
      <EffortSheet
        isOpen={effortFor !== null}
        onOpenChange={(open) => {
          if (!open) setEffortFor(null);
        }}
        title={t("training__field_effort", {
          scale: t(
            preferences.effortScale === "rpe" ? "training__effort_rpe" : "training__effort_rir",
          ),
        })}
        scale={preferences.effortScale}
        value={
          effortSet?.effort_min !== undefined && effortSet.effort_max !== undefined
            ? { min: effortSet.effort_min, max: effortSet.effort_max }
            : null
        }
        onChange={(range) => {
          const index = effortFor;
          if (index !== null && effortSet)
            onSets(
              replaceSet(sets, index, {
                ...effortSet,
                effort_min: range?.min,
                effort_max: range?.max,
              }),
            );
        }}
      />
    </View>
  );
}
