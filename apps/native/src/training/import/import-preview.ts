import type { ExerciseMatch, ImportExercisePreview } from "@workspace/sync";
import type { ShareSnapshot } from "@workspace/shared";

/** What the preview says about a snapshot, before anything is added. */
export type ImportSummary = {
  kind: "program" | "workout";
  workouts: number;
  exercises: number;
  /** Exercises that will be created as Custom exercises on this device. */
  newExercises: number;
};

export function summariseImport(
  snapshot: ShareSnapshot,
  matches: readonly ImportExercisePreview[],
): ImportSummary {
  const isNew = (match: ExerciseMatch) => match.kind === "new";
  const workouts =
    snapshot.format === "sigil.program/v1" ? snapshot.program.workouts : [snapshot.workout];
  return {
    kind: snapshot.format === "sigil.program/v1" ? "program" : "workout",
    workouts: workouts.length,
    exercises: matches.length,
    newExercises: matches.filter((item) => isNew(item.match)).length,
  };
}
