import type { SupersetPlace } from "@workspace/shared";
import { NotePencil } from "phosphor-react-native";
import { memo } from "react";
import { Pressable } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { RestPicker } from "@/training";

/**
 * The timer and note buttons of an open exercise. Superset rest is set on its last member.
 * The Note button opens or focuses the inline field.
 */
export const ExerciseHeaderActions = memo(function ExerciseHeaderActions({
  id,
  restSeconds,
  place,
  hasNote,
  reviewBeforeLeaving,
  onRest,
  onNotePress,
}: {
  id: string;
  restSeconds: number | null;
  place: SupersetPlace;
  hasNote: boolean;
  reviewBeforeLeaving: (proceed: () => void) => void;
  onRest: (exerciseId: string, restSeconds: number | null) => void;
  onNotePress: () => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const showsRest = place !== "first" && place !== "middle";
  return (
    <>
      {showsRest ? (
        <RestPicker
          compact
          beforeOpen={reviewBeforeLeaving}
          value={restSeconds}
          group={place === "last"}
          onChange={(next) => onRest(id, next)}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(hasNote ? "session__change_note" : "session__add_note")}
        onPress={() => {
          haptic.tick();
          onNotePress();
        }}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
      >
        <NotePencil size={20} color={subtle} />
      </Pressable>
    </>
  );
});
