import { blocksOf, firstUnfinished, highlightOf, type BlockExercise } from "./blocks";

/**
 * The exercise being worked on, for the Resume bar: the one the accordion would open (the highlighted
 * set of the first block with a set left), else the last exercise when everything is ticked,
 * else null for a Session with no exercises.
 */
export function currentExercise<E extends BlockExercise>(exercises: readonly E[]): E | null {
  const blocks = blocksOf(exercises);
  const block = firstUnfinished(blocks);
  const highlight = block ? highlightOf(block) : null;
  const current = highlight ? exercises.find((entry) => entry.id === highlight.exerciseId) : null;
  return current ?? exercises.at(-1) ?? null;
}
