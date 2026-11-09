/**
 * The numbered steps of an exercise's instructions. The catalog stores them as lines, usually
 * already numbered ("1. Grab the bar"); the number is dropped here and re-drawn by the screen.
 * Blank lines are skipped; an empty or missing text gives no steps.
 */
export function instructionSteps(instructions: string | null): string[] {
  if (instructions === null) return [];
  return instructions
    .split(/\r?\n/u)
    .values()
    .map((line) =>
      line
        .trim()
        .replace(/^(?:step\s*)?\d+\s*[.):-]\s*/iu, "")
        .trim(),
    )
    .filter((line) => line !== "")
    .toArray();
}
