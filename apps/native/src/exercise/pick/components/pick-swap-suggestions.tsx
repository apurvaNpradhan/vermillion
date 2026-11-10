import { useExercise, useSwapCandidates } from "../../detail/use-exercise";
import { SwapRow } from "../../detail/components/swap-row";

/**
 * "Swap for" in pick mode: the exercises that work the same muscle with other equipment, as
 * cards above the list. Tapping one selects it like a row would.
 */
export function PickSwapSuggestions({
  exerciseId,
  selected,
  onToggle,
}: {
  exerciseId: string;
  selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  const state = useExercise(exerciseId);
  const candidates = useSwapCandidates(state.status === "ready" ? state.exercise : null);
  return <SwapRow candidates={candidates} onOpen={onToggle} selectedIds={selected} bleed />;
}
