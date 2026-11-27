import type { SetKind } from "@workspace/shared";

/**
 * The number a working set's row shows ("1", "2"…) and how many working sets the exercise has.
 * Warm-ups and the other kinds show a letter, not a number, so they have none (null).
 */
export function workingPosition(
  kinds: readonly SetKind[],
  index: number,
): { number: number; total: number } | null {
  if (kinds[index] !== "working") return null;
  const total = kinds.filter((kind) => kind === "working").length;
  return { number: kinds.slice(0, index + 1).filter((kind) => kind === "working").length, total };
}
