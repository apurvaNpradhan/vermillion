import {
  resolveExerciseUnit,
  type WeightUnit,
  type Equipment,
  type ExerciseType,
  type PlannedSet,
  type SetKind,
  incrementInUnit,
} from "@workspace/shared";
import { Trash } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { useGymLoads } from "@/gym";
import { useTranslation } from "@/platform/i18n";

import {
  chipTexts,
  newSetIds,
  reconcileSetIds,
  removeSetAt,
  replaceSet,
  supportsWarmups,
  withKind,
} from "./set-editing";
import { useTrainingPreferences } from "@/training/shared/use-training-preferences";
import { AddSetButton } from "./add-set-button";
import { EffortSheet } from "@/training/targets/effort-sheet";
import { SetTable } from "./set-table";
import { SetTypeSheet } from "./set-type-sheet";

/** Shared by the inline row and the detailed screen: custom sets have identical behavior. */
export function DetailedTargets({
  sets,
  exerciseId,
  type,
  equipment = null,
  unit,
  animateRows = true,
  onSets,
}: {
  sets: readonly PlannedSet[];
  exerciseId: string;
  type: ExerciseType;
  /** The exercise's equipment, for the keypad's step. */
  equipment?: Equipment | null;
  unit?: WeightUnit | null;
  animateRows?: boolean;
  onSets: (sets: PlannedSet[]) => void;
}) {
  const { t } = useTranslation();
  const preferences = useTrainingPreferences();
  const gym = useGymLoads();
  const [kindFor, setKindFor] = useState<number | null>(null);
  const [effortFor, setEffortFor] = useState<number | null>(null);
  // Draft ids follow the rows through edits, adds and removals, so row state stays with its set.
  const [tracked, setTracked] = useState(() => ({ sets, ids: newSetIds(sets) }));
  let ids = tracked.ids;
  if (tracked.sets !== sets) {
    ids = reconcileSetIds(tracked.sets, tracked.ids, sets);
    setTracked({ sets, ids });
  }
  const letters = {
    working: "",
    warmup: t("training__chip_warmup"),
    drop: t("training__chip_drop"),
    failure: t("training__chip_failure"),
    top: t("training__chip_top"),
    backoff: t("training__chip_backoff"),
    myo: t("training__chip_myo"),
  } satisfies Record<SetKind, string>;
  const effortSet = effortFor === null ? undefined : sets[effortFor];
  return (
    <View className="gap-3">
      <SetTable
        type={type}
        sets={sets}
        ids={ids}
        chips={chipTexts(sets, letters)}
        weightUnit={resolveExerciseUnit(preferences.weightUnit, unit)}
        weightIncrementKg={incrementInUnit(
          preferences.weightIncrementKg,
          preferences.weightIncrementUnit ?? preferences.weightUnit,
          resolveExerciseUnit(preferences.weightUnit, unit),
        )}
        equipment={equipment}
        grid={gym.gridFor(exerciseId, equipment ?? "other", unit)}
        animateRows={animateRows}
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
        extras={
          kindFor !== null && sets.length > 1
            ? [
                {
                  key: "remove",
                  label: t("training__remove"),
                  icon: Trash,
                  tone: "danger",
                  onPress: () => onSets(removeSetAt(sets, kindFor)),
                },
              ]
            : undefined
        }
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
