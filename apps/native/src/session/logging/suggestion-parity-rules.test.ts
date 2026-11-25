import { parseWeight, type PlannedSet, type RuleConfig } from "@workspace/shared";
import {
  EXERCISE_HISTORY_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  WORKOUT_DETAIL_SQL,
  addExercises,
  createWorkout,
  finishSession,
  parseFinishedSessions,
  parseSessionDetail,
  parseWorkoutDetail,
  savePreferences,
  setExerciseSetting,
  startSession,
  tickSet,
  updateWorkoutExercise,
} from "@workspace/sync";
import {
  DIP,
  PLANK,
  SQUAT,
  setupSessions,
} from "@workspace/sync/training/sessions/session-fixtures";
import { expect, it } from "vitest";

import { buildGymLoads } from "../../gym/gym-loads";
import { nextExerciseSuggestion } from "../../exercise/detail/next-exercise-suggestion";
import { prepareWorkoutEntry } from "../../platform/training/workout-suggestion";
import { workoutLiveGhosts } from "../notifications/workout-live-logging";
import { deriveExercises, type DeriveInputs } from "../store/derive";

type Done = { weight?: number; reps?: number; duration?: number };

/**
 * One exercise, a rule and a past: what the Session screen, the live notification, the Workout
 * preview and the exercise page each say it is asked for next.
 */
async function everySurface(options: {
  unit: "kg" | "lb";
  exerciseId: string;
  equipment: "barbell" | "machine" | "none";
  sets: readonly PlannedSet[];
  rule?: RuleConfig;
  past: readonly (readonly Done[])[];
}) {
  const { unit, exerciseId } = options;
  const fixture = await setupSessions();
  const { training } = fixture;
  await savePreferences(
    training,
    { ui: { weightUnit: unit } },
    { owner: "owner", installId: fixture.installId },
  );
  const workoutId = await createWorkout(training, { title: "Day", program_id: null });
  const [entry] = await addExercises(training, workoutId, [exerciseId]);
  if (!entry) throw new Error("Expected a Workout entry");
  await updateWorkoutExercise(training, entry, { sets: [...options.sets] });
  if (options.rule) {
    await setExerciseSetting(training, exerciseId, { progression_rule: options.rule });
  }
  const read = async (id: string) =>
    parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
  const kilograms = (value: number) => parseWeight(String(value), unit) ?? 0;
  for (const done of options.past) {
    const id = await startSession(training, { workoutId, derivedTitle: "Day" });
    const sets = (await read(id))?.exercises[0]?.sets ?? [];
    for (const [index, set] of sets.entries()) {
      const values = done[index] ?? done.at(-1) ?? {};
      await tickSet(training, set.id, {
        ...(values.weight === undefined ? {} : { weight: kilograms(values.weight) }),
        ...(values.reps === undefined ? {} : { reps: values.reps }),
        ...(values.duration === undefined ? {} : { duration: values.duration }),
      });
    }
    await finishSession(training, id);
  }
  const id = await startSession(training, { workoutId, derivedTitle: "Day" });
  const session = await read(id);
  const exercise = session?.exercises[0];
  const plan = parseWorkoutDetail(await training.getAll(WORKOUT_DETAIL_SQL, [workoutId]));
  const planned = plan?.exercises[0];
  if (!session || !exercise || !plan || !planned) throw new Error("Expected the Session");
  const history = parseFinishedSessions(
    await training.getAll(EXERCISE_HISTORY_SQL, [exerciseId, exerciseId]),
  );
  const gym = buildGymLoads({ unit, kit: [], settings: [], gymId: null });
  const inputs: DeriveInputs = {
    previous: new Map([[exerciseId, history]]),
    historyFailed: false,
    previousSource: "same_workout",
    unit,
    unitNames: { kg: "kg", lb: "lb" },
    display: { distanceUnit: "km", durationFormat: "seconds" },
    weightIncrementKg: null,
    gym,
    lighterWeeks: [],
    lighter: false,
    phaseLoad: 1,
    phase: session.phase,
    bodyweightKg: null,
    stallVersion: 0,
    stallMemory: () => ({ dismissed: false }),
    chipTexts: () => [],
  };
  const view = deriveExercises(
    session.exercises,
    inputs,
    { finished: false, workoutId },
    new Map(),
  ).get(exercise.id)?.view;
  const live = await workoutLiveGhosts(
    training,
    session,
    { ...inputs, weightUnit: unit },
    gym,
    null,
  );
  const now = new Date();
  const prepared = prepareWorkoutEntry(
    plan,
    planned,
    history,
    { grid: gym.gridFor(exerciseId, options.equipment), gymId: null },
    inputs,
    null,
    now,
  );
  const next = nextExerciseSuggestion(plan, exerciseId, history, gym, inputs, null, now);
  return { view, live, prepared, next, exercise, kilograms };
}

const units = ["kg", "lb"] as const;

it.each(units)("agrees on a maintained lift in %s", async (unit) => {
  const load = unit === "kg" ? 100 : 225;
  const set: PlannedSet = { kind: "working", reps_min: 5, reps_max: 5 };
  const { view, live, prepared, next, exercise } = await everySurface({
    unit,
    exerciseId: SQUAT,
    equipment: "barbell",
    sets: [set, set],
    rule: { id: "maintain" },
    past: [[{ weight: load, reps: 5 }], [{ weight: load, reps: 5 }]],
  });
  expect(exercise.rule).toEqual({ id: "maintain" });
  // Double would add load here; Maintain asks for last time.
  expect(view?.suggestion?.reason).toBe("same_as_last");
  expect(view?.suggestion?.sets[0]).toMatchObject({ reps: 5 });
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(prepared.prescribed.progression).toEqual(view?.suggestion);
  const first = exercise.sets[0];
  expect(live.get(first?.id ?? "")).toEqual(view?.rows.get(first?.id ?? "")?.ghosts);
  expect(view?.stall).toBeNull();
});

it.each(units)("agrees on a top set with back-offs in %s", async (unit) => {
  const top = unit === "kg" ? 100 : 225;
  const back = unit === "kg" ? 85 : 190;
  const plan: PlannedSet[] = [
    { kind: "top", reps_min: 3, reps_max: 5 },
    { kind: "backoff", reps_min: 5, reps_max: 8 },
    { kind: "backoff", reps_min: 5, reps_max: 8 },
  ];
  const { view, live, prepared, next, exercise } = await everySurface({
    unit,
    exerciseId: SQUAT,
    equipment: "barbell",
    sets: plan,
    rule: { id: "top_backoff" },
    past: [
      [
        { weight: top, reps: 3 },
        { weight: back, reps: 5 },
        { weight: back, reps: 5 },
      ],
    ],
  });
  expect(view?.suggestion?.outcomes[1]?.reason).toBe("backoff_share");
  expect(view?.suggestion?.outcomes[2]?.reason).toBe("backoff_share");
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(prepared.prescribed.progression).toEqual(view?.suggestion);
  for (const set of exercise.sets) {
    expect(live.get(set.id) ?? view?.rows.get(set.id)?.ghosts).toEqual(
      view?.rows.get(set.id)?.ghosts,
    );
  }
  expect(live.get(exercise.sets[0]?.id ?? "")).toEqual(
    view?.rows.get(exercise.sets[0]?.id ?? "")?.ghosts,
  );
  const [topGhost, firstBack] = exercise.sets.map(
    (set) => view?.rows.get(set.id)?.ghosts.weight ?? 0,
  );
  expect(firstBack).toBeLessThan(topGhost ?? 0);
});

it("agrees on a plank held for five seconds more", async () => {
  const hold: PlannedSet = { kind: "working", duration_s: 30 };
  const { view, live, prepared, next, exercise } = await everySurface({
    unit: "kg",
    exerciseId: PLANK,
    equipment: "none",
    sets: [hold, hold],
    past: [[{ duration: 30 }], [{ duration: 30 }]],
  });
  expect(view?.suggestion?.reason).toBe("add_time");
  const first = exercise.sets[0];
  expect(view?.rows.get(first?.id ?? "")?.ghosts.duration).toBe(35);
  expect(live.get(first?.id ?? "")).toEqual(view?.rows.get(first?.id ?? "")?.ghosts);
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(prepared.prescribed.progression).toEqual(view?.suggestion);
});

it.each(units)("agrees on an assisted lift that needs less help in %s", async (unit) => {
  const assist = unit === "kg" ? 30 : 70;
  const set: PlannedSet = { kind: "working", reps_min: 6, reps_max: 8 };
  const { view, live, prepared, next, exercise, kilograms } = await everySurface({
    unit,
    exerciseId: DIP,
    equipment: "machine",
    sets: [set, set],
    past: [[{ weight: assist, reps: 8 }], [{ weight: assist, reps: 8 }]],
  });
  expect(view?.suggestion?.reason).toBe("less_assist");
  const first = exercise.sets[0];
  const ghost = view?.rows.get(first?.id ?? "")?.ghosts;
  expect(ghost?.weight).toBeLessThan(kilograms(assist));
  expect(ghost?.reps).toBe(6);
  expect(live.get(first?.id ?? "")).toEqual(ghost);
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(prepared.prescribed.progression).toEqual(view?.suggestion);
});
