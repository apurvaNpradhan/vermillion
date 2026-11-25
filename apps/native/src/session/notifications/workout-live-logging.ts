import { historyForWorkout, type Ghosts, type PreviousSource } from "@workspace/shared";
import {
  EXERCISE_HISTORY_SQL,
  parseFinishedSessions,
  tickSet,
  type SessionDetail,
  type TrainingDatabase,
} from "@workspace/sync";
import type { GymLoads } from "@/gym";
import { blocksOf } from "../logging/blocks";
import { currentAction, orderedSets } from "../logging/current-action";
import { loggingGhosts, type SuggestionSettings } from "../logging/logging-ghosts";
import { restAfterTick } from "../rest/rest-rules";

/** Only the current set can be shown or logged, so only its exercise needs history. */
export async function workoutLiveGhosts(
  db: TrainingDatabase,
  session: SessionDetail,
  options: Pick<SuggestionSettings, "weightUnit" | "weightIncrementKg" | "lighterWeeks"> & {
    previousSource: PreviousSource;
  },
  gym: GymLoads,
  sessionGymId: string | null,
) {
  const ghosts = new Map<string, Ghosts>();
  const first = orderedSets(session.exercises).find((item) => item.set.completedAt === null);
  if (!first) return ghosts;
  const { exercise } = first;
  const history = parseFinishedSessions(
    await db.getAll(EXERCISE_HISTORY_SQL, [exercise.exerciseId, exercise.exerciseId]),
  );
  const settings: SuggestionSettings = {
    ...options,
    gymId: sessionGymId,
    baselineHistory: historyForWorkout(
      history,
      options.previousSource === "same_workout" ? session.workoutId : null,
    ),
    grid: gym.gridFor(exercise.exerciseId, exercise.exercise?.equipment ?? "other"),
  };
  ghosts.set(first.set.id, loggingGhosts(exercise, first.index, history, settings));
  return ghosts;
}

/** Complete the same set that was offered by Done, if it is still current. */
export async function logWorkoutLiveSet(
  db: TrainingDatabase,
  session: SessionDetail,
  ghosts: ReadonlyMap<string, Ghosts>,
  installId: string,
  requestedSetId: string | null,
) {
  const next = currentAction({
    session,
    ghostsFor: (id) => ghosts.get(id) ?? {},
    now: Date.now(),
  }).current;
  if (!next || next.setId !== requestedSetId) return;
  const block = blocksOf(session.exercises).find((item) =>
    item.members.some((exercise) => exercise.id === next.exerciseRowId),
  );
  return tickSet(
    db,
    next.setId,
    ghosts.get(next.setId) ?? {},
    installId,
    block ? restAfterTick(block, next.exerciseRowId, next.setId) : null,
  );
}
