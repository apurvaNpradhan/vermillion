import { useExercise, useSwapCandidates } from "../../detail/use-exercise";
import { SwapRow } from "../../detail/components/swap-row";

/**
 * "Swap for" in pick mode: the exercises that work the same muscle, those the gym has first, as
 * cards above the list. Tapping one selects it like a row would.
 */
export function PickSwapSuggestions({
  exerciseId,
  gymId,
  selected,
  onToggle,
}: {
  exerciseId: string;
  /** The Session's gym; none is the gym trained at. */
  gymId?: string | null;
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  const state = useExercise(exerciseId);
  const swaps = useSwapCandidates(state.status === "ready" ? state.exercise : null, gymId);
  return (
    <SwapRow
      candidates={swaps.rows}
      hasEquipment={swaps.hasEquipment}
      onOpen={onToggle}
      selectedIds={selected}
      bleed
    />
  );
}
