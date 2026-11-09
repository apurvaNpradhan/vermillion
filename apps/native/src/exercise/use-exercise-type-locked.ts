/**
 * Whether the exercise's type is locked: once a logged set uses an exercise, changing its type
 * would change what those sets mean (ADR 0034). The server already refuses the change
 * (`EXERCISE_TYPE_LOCKED`) once training exists; until then no set can reference an exercise, so
 * nothing is locked and this returns false. The form builds its locked state from this hook.
 */
export function useExerciseTypeLocked(id: string | null): boolean {
  void id;
  return false;
}
