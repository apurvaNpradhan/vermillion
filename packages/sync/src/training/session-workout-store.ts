import { v7 as uuidv7 } from "uuid";
import {
  diffSessionAgainstWorkout,
  plannedSetsSchema,
  sessionInput,
  sessionStartAllowed,
  sessionTimesConsistent,
  type PlannedSet,
} from "@workspace/shared";
import { asc, eq } from "drizzle-orm";
import { keysAfterLast } from "./position";
import { requireSession } from "./session-common";
import {
  changedFields,
  assertRoom,
  liveWorkouts,
  nowIso,
  ownerOf,
  write,
  type TrainingDatabase,
} from "./store-common";
import { session, sessionExercise, sessionSet, workout, workoutExercise } from "./tables";
import type { FinishInput } from "./session-store";

/** Finished-session metadata edits keep the end derived from the chosen duration. */
export function editFinishedSession(
  database: TrainingDatabase,
  id: string,
  input: FinishInput,
  scope?: string,
) {
  return write(database, scope, async (tx) => {
    const current = await requireSession(tx, id);
    if (current.finished_at === null) throw new Error("Session is not finished");
    const start = input.startedAt ?? current.started_at;
    if (!sessionStartAllowed(start)) throw new Error("Start outside backfill window");
    const duration =
      input.durationSeconds ??
      current.duration_s ??
      Math.max(0, (Date.parse(current.finished_at) - Date.parse(current.started_at)) / 1000);
    const parsed = sessionInput.parse({
      workout_id: current.workout_id,
      program_id: current.program_id,
      run_id: current.run_id,
      slot_id: current.slot_id,
      cycle: current.cycle,
      device_id: current.device_id,
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
      title: input.title ?? current.title,
      title_derived: input.title === undefined ? current.title_derived : false,
      note: input.note === undefined ? current.note : input.note,
      started_at: start,
      duration_s: duration,
      finished_at: new Date(Date.parse(start) + duration * 1000).toISOString(),
    });
    if (!sessionTimesConsistent(parsed)) throw new Error("Invalid times");
    const entries = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, id));
    for (const entry of entries) {
      const sets = await tx
        .select()
        .from(sessionSet)
        .where(eq(sessionSet.session_exercise_id, entry.id));
      for (const set of sets)
        if (set.completed_at === null) await tx.delete(sessionSet).where(eq(sessionSet.id, set.id));
      if (!sets.some((set) => set.completed_at !== null))
        await tx.delete(sessionExercise).where(eq(sessionExercise.id, entry.id));
    }
    const changes = changedFields(current, parsed);
    if (Object.keys(changes).length)
      await tx.update(session).set(changes).where(eq(session.id, id));
    return true;
  });
}

/** Re-read the source inside the scoped transaction; all selected plan changes commit together. */
export function applySessionWorkout(
  database: TrainingDatabase,
  id: string,
  options: { structure: boolean; targets: boolean; saveNew: boolean },
  scope?: string,
) {
  return write(database, scope, async (tx) => {
    const current = await requireSession(tx, id);
    const [source] =
      !options.saveNew && current.workout_id
        ? await tx.select().from(workout).where(eq(workout.id, current.workout_id)).limit(1)
        : [];
    if (!source && !options.saveNew) return null;
    const userId = await ownerOf(tx);
    const workoutId = source?.id ?? uuidv7();
    if (!source) {
      assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
      await tx.insert(workout).values({
        id: workoutId,
        user_id: userId,
        title: current.title,
        note: current.note,
        program_id: null,
        created_at: nowIso(),
      });
    }
    const planned = source
      ? await tx
          .select()
          .from(workoutExercise)
          .where(eq(workoutExercise.workout_id, workoutId))
          .orderBy(asc(workoutExercise.position))
      : [];
    const entries = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, id))
      .orderBy(asc(sessionExercise.position));
    const logged = [];
    for (const entry of entries) {
      const sets = await tx
        .select()
        .from(sessionSet)
        .where(eq(sessionSet.session_exercise_id, entry.id))
        .orderBy(asc(sessionSet.position));
      const done = sets.filter((set) => set.completed_at !== null);
      if (done.length) logged.push({ entry, sets: done });
    }
    const diff = diffSessionAgainstWorkout(
      {
        exercises: logged.map(({ entry, sets }) => ({
          exerciseId: entry.exercise_id,
          sourceWorkoutExerciseId: entry.source_workout_exercise_id,
          sets: sets.map((set) => ({
            kind: set.kind,
            weightKg: set.weight_kg,
            completedAt: set.completed_at,
            target: set.target,
          })),
        })),
      },
      {
        exercises: planned.map((entry) => ({
          id: entry.id,
          exerciseId: entry.exercise_id,
          sets: entry.sets,
        })),
      },
    );
    if (options.structure || !source) {
      assertRoom(0, logged.length, "exercisesPerWorkout");
      const keys = keysAfterLast([], logged.length);
      const keep = new Set<string>();
      for (const [index, { entry, sets }] of logged.entries()) {
        const old = planned.find(
          (item) =>
            item.id === entry.source_workout_exercise_id && item.exercise_id === entry.exercise_id,
        );
        const targetWeight = [...sets].reverse().find((set) => set.kind === "working")?.weight_kg;
        const targets: PlannedSet[] = sets.map((set, i) => ({
          ...(old?.sets.filter((target) => target.kind === set.kind)[
            sets.slice(0, i).filter((prior) => prior.kind === set.kind).length
          ] ?? set.target),
          kind: set.kind,
          ...((options.targets || !source) && targetWeight != null && set.kind !== "warmup"
            ? { weight_kg: targetWeight }
            : {}),
        }));
        const values = {
          exercise_id: entry.exercise_id,
          position: keys[index] ?? "a0",
          rest_seconds: entry.rest_seconds,
          note: entry.note,
          superset_group: entry.superset_group,
          sets: plannedSetsSchema(entry.exercise_type).parse(targets),
        };
        const entryId = old?.id ?? uuidv7();
        keep.add(entryId);
        if (old)
          await tx.update(workoutExercise).set(values).where(eq(workoutExercise.id, entryId));
        else
          await tx.insert(workoutExercise).values({
            id: entryId,
            user_id: userId,
            workout_id: workoutId,
            created_at: nowIso(),
            ...values,
          });
      }
      for (const old of planned)
        if (!keep.has(old.id))
          await tx.delete(workoutExercise).where(eq(workoutExercise.id, old.id));
    } else if (options.targets) {
      for (const change of diff.targets) {
        const old = planned.find((entry) => entry.id === change.workoutExerciseId);
        if (old)
          await tx
            .update(workoutExercise)
            .set({
              sets: old.sets.map((set) =>
                set.kind === "warmup" ? set : { ...set, weight_kg: change.after },
              ),
            })
            .where(eq(workoutExercise.id, old.id));
      }
    }
    return workoutId;
  });
}
