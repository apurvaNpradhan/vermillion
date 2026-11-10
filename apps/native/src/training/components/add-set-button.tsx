import { TRAINING_LIMITS, type ExerciseType, type PlannedSet } from "@workspace/shared";
import { CaretDown, Plus } from "phosphor-react-native";
import { useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { MAX_WARMUPS, appendSetOfKind, supportsWarmups } from "../set-editing";
import { SET_TONES } from "../set-tones";
import { SetTypeSheet } from "./set-type-sheet";

const LABELS = {
  working: "training__add_set",
  warmup: "training__add_warmup",
  drop: "training__add_drop",
  failure: "training__add_failure",
} as const;

/**
 * One split button for adding sets. The main part adds a set of the chosen type; the caret part
 * only changes that type (Working, Warm-up, Drop, Failure) and the choice sticks, so adding three
 * drop sets in a row is three taps.
 */
export function AddSetButton({
  sets,
  type,
  onSets,
}: {
  sets: readonly PlannedSet[];
  type: ExerciseType;
  onSets: (sets: PlannedSet[]) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const [kind, setKind] = useState<PlannedSet["kind"]>("working");
  const [open, setOpen] = useState(false);
  const warmups = sets.filter((set) => set.kind === "warmup").length;
  const warmupsAllowed = supportsWarmups(type) && warmups < MAX_WARMUPS;
  // A warm-up can stop being allowed (the limit, or the exercise changed): fall back to working.
  const active = kind === "warmup" && !warmupsAllowed ? "working" : kind;
  const full = sets.length >= TRAINING_LIMITS.setsPerExercise;
  const tone = SET_TONES[active];
  return (
    <>
      <View
        className={`h-11 flex-row overflow-hidden rounded-xl border border-border bg-default ${full ? "opacity-50" : ""}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(LABELS[active])}
          disabled={full}
          onPress={() => {
            Keyboard.dismiss();
            haptic.tick();
            onSets(appendSetOfKind(sets, type, active));
          }}
          className="flex-1 flex-row items-center justify-center gap-2 active:bg-surface"
        >
          <Plus size={16} color={subtle} weight="bold" />
          <Text className={`text-body font-medium ${tone.text}`}>{t(LABELS[active])}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("training__set_kind_title")}
          disabled={full}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
          className="w-11 items-center justify-center border-l border-border active:bg-surface"
        >
          <CaretDown size={16} color={subtle} weight="bold" />
        </Pressable>
      </View>
      <SetTypeSheet
        isOpen={open}
        onOpenChange={setOpen}
        value={active}
        warmupsAllowed={warmupsAllowed}
        onSelect={setKind}
      />
    </>
  );
}
