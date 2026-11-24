/** How one exercise's new target weights read in the Update workout sheet. */
export type TargetSummary =
  /** Every planned set gets the same weight: "80 kg, 3 sets". */
  | { kind: "same"; weight: string; count: number }
  /** The weights differ by set: "60, 70, 80 kg". A set with no target shows as a dash. */
  | { kind: "each"; weights: string };

/**
 * The weights the Workout will hold for the sets that change (`before` and `after` are aligned,
 * one per planned set but warm-ups). Sets that keep their target stay out of the sentence: a
 * Session that ticked one of three sets must not read as "No target, No target to 80, ..." for
 * all three.
 */
export function summarizeTargets(
  before: readonly (number | null)[],
  after: readonly (number | null)[],
  format: (weight: number) => string,
): TargetSummary {
  const changed = after.filter((weight, index) => weight !== (before[index] ?? null));
  const [first] = changed;
  if (first !== null && first !== undefined && changed.every((weight) => weight === first))
    return { kind: "same", weight: format(first), count: changed.length };
  return {
    kind: "each",
    weights: changed.map((weight) => (weight === null ? "–" : format(weight))).join(", "),
  };
}
