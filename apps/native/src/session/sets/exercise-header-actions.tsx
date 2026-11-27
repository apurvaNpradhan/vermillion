import type { SupersetPlace } from "@workspace/shared";
import { NotePencil } from "phosphor-react-native";
import { memo } from "react";
import { Pressable } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { RestPicker } from "@/training";

/**
 * The rest timer and note buttons of an open exercise, small icons beside its menu. Rest shows the
 * time; it is the superset's to set, so a first or middle member has none. Note adds a note; once
 * the exercise has one, the note is shown in its body and the button goes.
 */
export const ExerciseHeaderActions = memo(function ExerciseHeaderActions({
  id,
  restSeconds,
  place,
  hasNote,
  onRest,
  onAddNote,
}: {
  id: string;
  restSeconds: number | null;
  place: SupersetPlace;
  hasNote: boolean;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  onAddNote: () => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const showsRest = place !== "first" && place !== "middle";
  return (
    <>
      {showsRest ? (
        <RestPicker
          compact
          value={restSeconds}
          group={place === "last"}
          onChange={(next) => onRest(id, next)}
        />
      ) : null}
      {hasNote ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__add_note")}
          onPress={() => {
            haptic.tick();
            onAddNote();
          }}
          hitSlop={4}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
        >
          <NotePencil size={20} color={subtle} />
        </Pressable>
      )}
    </>
  );
});
