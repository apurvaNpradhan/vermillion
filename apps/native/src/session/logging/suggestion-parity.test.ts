import { KG_PER_LB } from "@workspace/shared";
import {
  EXERCISE_HISTORY_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  WORKOUT_DETAIL_SQL,
  finishSession,
  parseFinishedSessions,
  parseSessionDetail,
  parseWorkoutDetail,
  startSession,
  tickSet,
  updateWorkoutExercise,
} from "@workspace/sync";
import {
  pushWorkout,
  setupSessions,
  SQUAT,
} from "@workspace/sync/training/sessions/session-fixtures";
import { expect, it } from "vitest";

import { buildGymLoads } from "../../gym/gym-loads";
import { workoutLiveGhosts } from "../notifications/workout-live-logging";
import { deriveExercises, type DeriveInputs } from "../store/derive";
import { previewProgression } from "./preview-progression";
import { prepareWorkoutEntry } from "../../platform/training/workout-suggestion";
import {
  nextExerciseSuggestion,
  nextWorkoutCandidates,
} from "../../exercise/detail/next-exercise-suggestion";

it.each([
  { unit: "kg", weight: 100, expected: 90 },
  { unit: "lb", weight: 220, expected: 200 },
] as const)("agrees on a stalled-lift deload in $unit", async ({ unit, weight, expected }) => {
  const fixture = await setupSessions();
  const { training } = fixture;
  const { workoutId, squat } = await pushWorkout(fixture);
  await updateWorkoutExercise(training, squat, {
    sets: [{ kind: "working", reps_min: 5, reps_max: 8 }],
  });
  const readSession = async (id: string) =>
    parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
  const kilograms = unit === "kg" ? weight : weight * KG_PER_LB;
  for (let index = 0; index < 4; index += 1) {
    const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
    const set = (await readSession(id))?.exercises[0]?.sets[0];
    if (!set) throw new Error("Expected a squat set");
    await tickSet(training, set.id, { weight: kilograms, reps: 8 });
    await finishSession(training, id);
  }
  const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
  const session = await readSession(id);
  const exercise = session?.exercises[0];
  const set = exercise?.sets[0];
  const plan = parseWorkoutDetail(await training.getAll(WORKOUT_DETAIL_SQL, [workoutId]));
  const entry = plan?.exercises[0];
  if (!session || !exercise || !set || !entry || !plan) throw new Error("Expected the squat plan");

  const history = parseFinishedSessions(
    await training.getAll(EXERCISE_HISTORY_SQL, [SQUAT, SQUAT]),
  );
  const gym = buildGymLoads({ unit, kit: [], settings: [], gymId: null });
  const inputs: DeriveInputs = {
    previous: new Map([[SQUAT, history]]),
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
    bodyweightKg: null,
    stallVersion: 0,
    stallMemory: () => ({ applied: true, dismissed: false }),
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
  const { context } = prepareWorkoutEntry(
    plan,
    entry,
    history,
    { grid: null, gymId: null },
    inputs,
    null,
  );
  const next = nextExerciseSuggestion(plan, SQUAT, history, gym, inputs, null, new Date());
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(
    nextWorkoutCandidates([{ id: "upcoming", workoutId: "upcoming" }], new Set(), history),
  ).toEqual(["upcoming", workoutId]);

  const preview = previewProgression(entry, history, context.settings);

  expect(view?.suggestion?.outcomes[0]).toMatchObject({ reason: "deload" });
  expect(view?.suggestion?.outcomes[0]?.loadFactor).toBeCloseTo(expected / weight, 4);
  expect(live.get(set.id)).toEqual(view?.rows.get(set.id)?.ghosts);
  expect(preview?.suggestion).toEqual(view?.suggestion);
  expect(preview?.changes[0]?.today).toEqual({ weight: String(expected), reps: 5 });
});
