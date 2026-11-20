import { roundsOf, type Block, type BlockExercise } from "./blocks";
import type { EntryField } from "@/platform/ui/keypad-entry";

/** A cell the keypad can address. */
export type CellRef = { setId: string; field: EntryField };

/**
 * The order Next walks through a block's cells: the logging order (`roundsOf`, shared with the
 * guide, the highlight and the rest), each set's fields in turn. A lone exercise: weight → reps →
 * the next set's weight. A superset goes by rounds, warm-up rounds first (A1, B1, A2, B2 …).
 */
export function cellOrder<E extends BlockExercise>(
  block: Block<E>,
  fieldsOf: (exercise: E) => readonly EntryField[],
): CellRef[] {
  return roundsOf(block).flatMap((round) =>
    round.flatMap(({ exercise, set }) =>
      fieldsOf(exercise).map((field) => ({ setId: set.id, field })),
    ),
  );
}

/** The cell after `current`, or null at the end (Next then has nowhere to go). */
export function nextCell(cells: readonly CellRef[], current: CellRef): CellRef | null {
  const at = cells.findIndex(
    (cell) => cell.setId === current.setId && cell.field === current.field,
  );
  return at < 0 ? null : (cells[at + 1] ?? null);
}
