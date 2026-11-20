import { v7 as uuidv7 } from "uuid";

import {
  defaultPlannedSets,
  plannedSetsSchema,
  type ExerciseType,
  type PlannedSet,
} from "@workspace/shared";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";

import { replaceWorkoutExerciseIn } from "../plans/exercise-store";
import { keysBetween } from "../position";
import {
  DEFAULT_PREFERENCES,
  nowIso,
  ownerOf,
  write,
  type TrainingDatabase,
  type TrainingPreferences,
  type Tx,
} from "../store-common";
import { session, sessionExercise, sessionSet, workout, workoutExercise } from "../tables";
import {
  assertSessionRoom,
  exerciseInfoOf,
  exercisesInSession,
  rebalanceSessionExercises,
  repairSessionSupersets,
  requireSessionExercise,
  sessionExerciseListOf,
  type SessionExerciseRow,
} from "./session-common";
import { insertDefaultSets, restFor } from "./session-content-store";
import { plannedFromLogged } from "./session-again-store";

/** What a swap left behind: the Session exercise that now holds the new exercise. */
export type SessionSwap = {
  /** The Session exercise with the new exercise: the original's id when swapped in place. */
  id: string;
  /** True when the original kept its completed sets and the new exercise got its own row. */
  split: boolean;
};

function withoutLoad(set: PlannedSet): PlannedSet {
  const copy = { ...set };
  delete copy.weight_kg;
  return copy;
}

/**
 * The targets of the sets that move to the swapped-in exercise, one per unticked set. A load
 * (weight) never carries over from the exercise swapped out. Where the new exercise has history,
 * its own working sets in order (the last one repeating) seed the targets, so a set's reps and
 * load are comparable with what the user did before; with none the same type keeps the old reps
 * and leaves the load empty, and another type starts from that type's defaults. Warm-ups carry
 * over only between exercises of one type.
 *
 * `baseline` is the new exercise's latest finished Session, as targets (warm-ups are skipped).
 */
export function swapTargets(input: {
  old: readonly PlannedSet[];
  sameType: boolean;
  type: ExerciseType;
  baseline: readonly PlannedSet[];
}): PlannedSet[] {
  const { old, sameType, type } = input;
  const working = input.baseline.filter((set) => set.kind !== "warmup");
  const fallback = defaultPlannedSets(type);
  const targets: PlannedSet[] = [];
  let workingIndex = 0;
  for (const set of old) {
    if (set.kind === "warmup") {
      if (sameType) {
        targets.push(withoutLoad(set));
      }
      continue;
    }
    const seed = working[Math.min(workingIndex, working.length - 1)];
    workingIndex += 1;
    if (seed) {
      targets.push(sameType ? { ...seed, kind: set.kind } : seed);
    } else if (sameType) {
      targets.push(withoutLoad(set));
    } else {
      targets.push(fallback[0] ?? { kind: "working" });
    }
  }
  const valid = plannedSetsSchema(type).safeParse(targets);
  return valid.success && valid.data.length > 0 ? valid.data : fallback;
}

async function requireWorkoutSource(tx: Tx, entry: SessionExerciseRow) {
  const [source] = await tx
    .select({ id: workoutExercise.id, exercise_id: workoutExercise.exercise_id })
    .from(workoutExercise)
    .innerJoin(workout, eq(workout.id, workoutExercise.workout_id))
    .innerJoin(session, eq(session.workout_id, workout.id))
    .where(
      and(
        eq(session.id, entry.session_id),
        eq(workoutExercise.id, entry.source_workout_exercise_id ?? ""),
      ),
    )
    .limit(1);
  if (!source) throw new Error("The source workout exercise is gone");
  return source;
}

/**
 * Swaps the exercise of a Session exercise. With no completed set it changes the row in place:
 * the same type keeps its sets, rest and note; another type drops the sets for that type's
 * defaults and takes its default rest. With completed sets they stay on the original exercise
 * (their history is what was done) and the unticked ones move to a new Session exercise inserted
 * right after, in the same superset: see {@link swapTargets} for its targets. Null if it is the
 * same exercise.
 */
export function replaceSessionExercise(
  database: TrainingDatabase,
  id: string,
  exerciseId: string,
  preferences: TrainingPreferences = DEFAULT_PREFERENCES,
  expectedInstallId?: string,
  scope: "session" | "workout" = "session",
): Promise<SessionSwap | null> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const current = await requireSessionExercise(tx, id);
    if (current.exercise_id === exerciseId) return null;
    const source = scope === "workout" ? await requireWorkoutSource(tx, current) : null;
    const after = await exerciseInfoOf(tx, exerciseId);
    const kept = current.exercise_type === after.exercise_type;
    const sets = await tx
      .select()
      .from(sessionSet)
      .where(eq(sessionSet.session_exercise_id, id))
      .orderBy(asc(sessionSet.position), asc(sessionSet.id));
    const todo = sets.filter((set) => set.completed_at === null);

    if (todo.length === sets.length) {
      await tx
        .update(sessionExercise)
        .set({
          exercise_id: exerciseId,
          exercise_title: after.title,
          exercise_type: after.exercise_type,
          ...(kept ? {} : { rest_seconds: restFor(after, preferences) }),
        })
        .where(eq(sessionExercise.id, id));
      if (!kept) {
        await tx.delete(sessionSet).where(eq(sessionSet.session_exercise_id, id));
        await insertDefaultSets(tx, userId, id, defaultPlannedSets(after.exercise_type));
      }
      if (source) await replaceWorkoutExerciseIn(tx, source, exerciseId, preferences);
      return { id, split: false };
    }

    assertSessionRoom(await exercisesInSession(tx, current.session_id), 1, "exercisesPerSession");
    const items = await rebalanceSessionExercises(
      tx,
      await sessionExerciseListOf(tx, current.session_id),
    );
    const at = items.findIndex((item) => item.id === id);
    const [position] = keysBetween(items[at]?.position ?? null, items[at + 1]?.position ?? null, 1);
    const [latest] = await tx
      .select({ id: sessionExercise.id })
      .from(sessionExercise)
      .innerJoin(session, eq(session.id, sessionExercise.session_id))
      .innerJoin(sessionSet, eq(sessionSet.session_exercise_id, sessionExercise.id))
      .where(
        and(
          eq(sessionExercise.exercise_id, exerciseId),
          isNotNull(session.finished_at),
          isNotNull(sessionSet.completed_at),
          ne(sessionSet.kind, "warmup"),
        ),
      )
      .orderBy(
        desc(session.started_at),
        desc(session.id),
        asc(sessionExercise.position),
        asc(sessionExercise.id),
      )
      .limit(1);
    const baseline = latest
      ? (
          await tx
            .select()
            .from(sessionSet)
            .where(
              and(
                eq(sessionSet.session_exercise_id, latest.id),
                isNotNull(sessionSet.completed_at),
              ),
            )
            .orderBy(asc(sessionSet.position), asc(sessionSet.id))
        ).map(plannedFromLogged)
      : [];
    const targets =
      todo.length === 0
        ? defaultPlannedSets(after.exercise_type)
        : swapTargets({
            old: todo.map((set) => ({ ...set.target, kind: set.kind })),
            sameType: kept,
            type: after.exercise_type,
            baseline,
          });

    const grouped = current.superset_group !== null;
    const newId = uuidv7();
    await tx.insert(sessionExercise).values({
      id: newId,
      user_id: userId,
      session_id: current.session_id,
      exercise_id: exerciseId,
      exercise_title: after.title,
      exercise_type: after.exercise_type,
      source_workout_exercise_id: source?.id ?? null,
      position: position ?? current.position,
      // In a superset only the last member rests, and the new one is now after the original.
      rest_seconds: grouped || kept ? current.rest_seconds : restFor(after, preferences),
      note: null,
      superset_group: current.superset_group,
      log_effort: current.log_effort,
      created_at: nowIso(),
    });
    if (grouped || source) {
      await tx
        .update(sessionExercise)
        .set({
          ...(grouped ? { rest_seconds: null } : {}),
          ...(source ? { source_workout_exercise_id: null, workout_swap_fragment: true } : {}),
        })
        .where(eq(sessionExercise.id, id));
    }
    for (const set of todo) await tx.delete(sessionSet).where(eq(sessionSet.id, set.id));
    await insertDefaultSets(tx, userId, newId, targets);
    await repairSessionSupersets(tx, current.session_id);
    if (source) await replaceWorkoutExerciseIn(tx, source, exerciseId, preferences);
    return { id: newId, split: true };
  });
}
