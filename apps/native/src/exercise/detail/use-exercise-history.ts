/** What the user's own sessions say about an exercise; filled in when training exists. */
export type ExerciseHistory = {
  /** Sessions that logged the exercise. */
  sessions: number;
};

/**
 * The user's history with an exercise, for the "Your numbers" block at the top of the detail
 * screen. Training does not exist yet, so there is none: the screen then shows the catalog view
 * (4:3 video, form open) and no numbers block.
 */
export function useExerciseHistory(exerciseId: string): ExerciseHistory | null {
  void exerciseId;
  return null;
}
