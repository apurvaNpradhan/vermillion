import {
  readProgramShareSource,
  readSessionShareSource,
  readWorkoutShareSource,
  type TrainingDatabase,
} from "@workspace/sync";
import {
  serializeProgram,
  serializeWorkout,
  type ShareLinkKind,
  type ShareSnapshot,
} from "@workspace/shared";

/** What to share. A finished Session shares as a Workout template. */
export type ShareTarget =
  | { kind: "program"; id: string }
  | { kind: "workout"; id: string }
  | { kind: "session"; id: string };

/** The kind of link a target makes: a Session becomes a Workout link. */
export function linkKindOf(target: ShareTarget): ShareLinkKind {
  return target.kind === "program" ? "program" : "workout";
}

/**
 * The snapshot for a target, read from the local database. `weights` keeps the planned weights;
 * off, only reps and effort are shared. Null when the target is gone or has nothing to share.
 */
export async function readSnapshot(
  database: TrainingDatabase,
  target: ShareTarget,
  weights: boolean,
): Promise<ShareSnapshot | null> {
  if (target.kind === "program") {
    const source = await readProgramShareSource(database, target.id);
    return source ? serializeProgram(source, { weights }) : null;
  }
  const source =
    target.kind === "workout"
      ? await readWorkoutShareSource(database, target.id)
      : await readSessionShareSource(database, target.id);
  return source && source.exercises.length > 0 ? serializeWorkout(source, { weights }) : null;
}
