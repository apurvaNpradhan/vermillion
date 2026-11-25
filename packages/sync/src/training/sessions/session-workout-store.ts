import { v7 as uuidv7 } from "uuid";
import {
  diffSessionAgainstWorkout,
  loggedTargetWeight,
  matchPlannedSets,
  reconciledTargetWeights,
  plannedSetsSchema,
  workoutStructureKey,
  workoutSetKinds,
  workoutUpdateEntries,
  withoutGeneratedWarmups,
  sessionDurationSeconds,
  sessionInput,
  sessionStartAllowed,
  sessionTimesConsistent,
  type PlannedSet,
} from "@workspace/shared";
import { asc, eq } from "drizzle-orm";
import { keysAfterLast } from "../position";
import { requireSession } from "./session-common";
import {
  changedFields,
  assertRoom,
  liveWorkouts,
  nowIso,
  ownerOf,
  write,
  type TrainingDatabase,
} from "../store-common";
import { session, sessionExercise, sessionSet, workout, workoutExercise } from "../tables";
import type { SessionDetail } from "./session-watch";
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
    const pausedMs = current.paused_ms ?? 0;
    const duration =
      input.durationSeconds ??
      sessionDurationSeconds(
        {
          durationS: current.duration_s,
          startedAt: current.started_at,
          finishedAt: current.finished_at,
          pausedMs,
        },
        0,
      );
    const parsed = sessionInput.parse({
      workout_id: current.workout_id,
      program_id: current.program_id,
      run_id: current.run_id,
      slot_id: current.slot_id,
      gym_id: current.gym_id,
      cycle: current.cycle,
      device_id: current.device_id,
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
      paused_at: null,
      paused_ms: pausedMs,
      title: input.title ?? current.title,
      title_derived: input.title === undefined ? current.title_derived : false,
      note: input.note === undefined ? current.note : input.note,
      started_at: start,
      duration_s: duration,
      // The paused time is part of the span between start and finish, not of the duration.
      finished_at: new Date(Date.parse(start) + duration * 1000 + pausedMs).toISOString(),
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

type WorkoutUpdateOptions = {
  structure: boolean;
  targets: boolean;
  saveNew: boolean;
  draft?: {
    session: Pick<SessionDetail, "id" | "exercises">;
    completeStructure: boolean;
  };
};

/** Re-read the source inside the scoped transaction; all selected plan changes commit together. */
export function applySessionWorkout(
  database: TrainingDatabase,
  id: string,
  options: WorkoutUpdateOptions,
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
          .orderBy(asc(workoutExercise.position), asc(workoutExercise.id))
      : [];
    const plan = planned.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exercise_id,
      sets: entry.sets,
    }));
    const draft = source && options.draft?.session.id === id ? options.draft : undefined;
    const snapshotTrusted = current.workout_structure === workoutStructureKey(plan);
    const completeStructure = draft?.completeStructure === true && snapshotTrusted;
    const entries = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, id))
      .orderBy(asc(sessionExercise.position), asc(sessionExercise.id));
    const stored = [];
    for (const entry of entries) {
      const sets = await tx
        .select()
        .from(sessionSet)
        .where(eq(sessionSet.session_exercise_id, entry.id))
        .orderBy(asc(sessionSet.position), asc(sessionSet.id));
      stored.push({
        exerciseId: entry.exercise_id,
        sourceWorkoutExerciseId: entry.source_workout_exercise_id,
        workoutSwapFragment: entry.workout_swap_fragment === true,
        restSeconds: entry.rest_seconds,
        note: entry.note,
        supersetGroup: entry.superset_group,
        type: entry.exercise_type,
        sets: sets.map((set) => ({
          id: set.id,
          position: set.position,
          kind: set.kind,
          weightKg: set.weight_kg,
          completedAt: set.completed_at,
          target: set.target,
          generatedWarmup: set.generated_warmup,
        })),
      });
    }
    const savedSets = new Map(stored.flatMap((entry) => entry.sets.map((set) => [set.id, set])));
    const sessionEntries = draft
      ? draft.session.exercises.map((entry) => ({
          ...entry,
          sets: entry.sets.map((set) => savedSets.get(set.id) ?? { ...set, completedAt: null }),
        }))
      : stored;
    // Untouched generated warm-ups are not the user's structure: neither compared nor written.
    const realEntries = sessionEntries.map((entry) => ({
      ...entry,
      sets: withoutGeneratedWarmups(
        entry.sets,
        planned.find((item) => item.id === entry.sourceWorkoutExerciseId)?.sets ?? [],
      ),
    }));
    const diff = diffSessionAgainstWorkout(
      { exercises: realEntries, workoutStructure: current.workout_structure },
      { exercises: plan },
      completeStructure,
    );
    if (options.structure || !source) {
      const logged = workoutUpdateEntries(
        source ? realEntries.filter((entry) => !entry.workoutSwapFragment) : realEntries,
        completeStructure,
      );
      const retained = planned.filter(
        (old) =>
          !completeStructure && !logged.some((entry) => entry.sourceWorkoutExerciseId === old.id),
      );
      assertRoom(0, logged.length + retained.length, "exercisesPerWorkout");
      const ordered: (
        | { entry: (typeof logged)[number] }
        | { retained: (typeof planned)[number] }
      )[] = logged.map((entry) => ({ entry }));
      for (const old of retained) ordered.splice(planned.indexOf(old), 0, { retained: old });
      const keys = keysAfterLast([], ordered.length);
      const keep = new Set<string>();
      for (const [index, item] of ordered.entries()) {
        const position = keys[index] ?? "a0";
        if ("retained" in item) {
          keep.add(item.retained.id);
          if (item.retained.position !== position)
            await tx
              .update(workoutExercise)
              .set({ position })
              .where(eq(workoutExercise.id, item.retained.id));
          continue;
        }
        const { entry } = item;
        const old = planned.find((candidate) => candidate.id === entry.sourceWorkoutExerciseId);
        const same = old?.exercise_id === entry.exerciseId ? old : undefined;
        const sets = same ? entry.sets : entry.sets.filter((set) => set.completedAt !== null);
        const kinds = workoutSetKinds(same?.sets ?? [], sets, completeStructure || !same);
        const weights = sets.map((set) => ({
          kind: set.kind,
          weightKg: set.completedAt === null ? null : set.weightKg,
        }));
        const originalPositions = keysAfterLast([], same?.sets.length ?? 0);
        const reconciled = same ? reconciledTargetWeights(same.sets, sets, snapshotTrusted) : [];
        const claimed = new Set(
          same
            ? matchPlannedSets(same.sets, sets, snapshotTrusted).flatMap(({ row }) =>
                row ? [row] : [],
              )
            : [],
        );
        const extra = sets.filter((set) => set.completedAt !== null && !claimed.has(set));
        const targets: PlannedSet[] = kinds.map((kind, i) => {
          const ordinal = kinds.slice(0, i).filter((prior) => prior === kind).length;
          const targetWeight =
            completeStructure || !same
              ? loggedTargetWeight(weights, kind, ordinal)
              : i < same.sets.length
                ? kind === "warmup"
                  ? null
                  : (reconciled[i] ?? null)
                : kind === "warmup"
                  ? null
                  : (extra.filter((set) => set.kind === kind)[
                      kinds.slice(same.sets.length, i).filter((prior) => prior === kind).length
                    ]?.weightKg ?? null);
          const loggedSet = sets.filter((set) => set.kind === kind)[ordinal];
          const original =
            completeStructure && loggedSet?.target
              ? same?.sets[originalPositions.indexOf(loggedSet.position)]
              : undefined;
          const base =
            original && original.kind === loggedSet?.target?.kind
              ? original
              : (same?.sets.filter((target) => target.kind === kind)[ordinal] ?? loggedSet?.target);
          return {
            ...base,
            kind,
            ...((options.targets || !source) && targetWeight !== null
              ? { weight_kg: targetWeight }
              : {}),
          };
        });
        const values = {
          exercise_id: entry.exerciseId,
          position,
          rest_seconds: same ? same.rest_seconds : entry.restSeconds,
          note: same ? same.note : entry.note,
          superset_group: entry.supersetGroup,
          sets: plannedSetsSchema(entry.type).parse(targets),
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
              sets: (() => {
                let index = 0;
                return old.sets.map((set) => {
                  if (set.kind === "warmup") return set;
                  const weight = change.after[index++];
                  return weight == null ? set : { ...set, weight_kg: weight };
                });
              })(),
            })
            .where(eq(workoutExercise.id, old.id));
      }
    }
    return workoutId;
  });
}
