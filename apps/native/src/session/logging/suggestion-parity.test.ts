import {
  KG_PER_LB,
  parseWeight,
  phaseFor,
  phaseLoadOf,
  suggestionContext,
  type PhasePlan,
} from "@workspace/shared";
import {
  EXERCISE_HISTORY_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  WORKOUT_DETAIL_SQL,
  addExercises,
  activateProgram,
  addSlot,
  createProgram,
  createWorkout,
  readBodyweightsOnDates,
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
  { unit: "kg", weight: 100, expected: 90, plannedDeload: false },
  { unit: "lb", weight: 220, expected: 200, plannedDeload: false },
  { unit: "kg", weight: 100, expected: 102.5, plannedDeload: false, effort: true },
  { unit: "lb", weight: 220, expected: 225, plannedDeload: false, effort: true },
  { unit: "kg", weight: 100, expected: 75, plannedDeload: true },
  { unit: "lb", weight: 200, expected: 150, plannedDeload: true },
  { unit: "kg", weight: 60, expected: 62.5, plannedDeload: false, progressing: true },
  { unit: "lb", weight: 135, expected: 140, plannedDeload: false, progressing: true },
] as const)("agrees in $unit with planned deload $plannedDeload", async (scenario) => {
  const { unit, weight, expected, plannedDeload } = scenario;
  const effort = "effort" in scenario;
  const progressing = "progressing" in scenario;
  const fixture = await setupSessions();
  const { training } = fixture;
  const phasePlan: PhasePlan = {
    pattern: ["deload"],
    modifiers: { deload: { load: 0.75 } },
    overrides: [],
    test_top: "single",
  };
  const programId = plannedDeload
    ? await createProgram(training, {
        title: "Strength",
        description: null,
        planned_weeks: null,
        phase_plan: phasePlan,
      })
    : null;
  const workoutId = await createWorkout(training, { title: "Legs", program_id: programId });
  const [squat] = await addExercises(training, workoutId, [SQUAT]);
  if (!squat) throw new Error("Expected squat in Workout");
  const target = {
    kind: "working",
    reps_min: 5,
    reps_max: 8,
    ...(effort ? { effort_min: 7, effort_max: 7 } : {}),
  } as const;
  await updateWorkoutExercise(training, squat, { sets: [target, target] });
  const readSession = async (id: string) =>
    parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
  const kilograms = unit === "kg" ? weight : weight * KG_PER_LB;
  for (let index = 0; index < 4; index += 1) {
    const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
    const sets = (await readSession(id))?.exercises[0]?.sets;
    if (!sets) throw new Error("Expected squat sets");
    for (const set of sets)
      await tickSet(training, set.id, {
        weight: kilograms,
        reps: progressing ? 5 + index : 8,
        rpe: effort ? 7 : undefined,
      });
    await finishSession(training, id);
  }
  if (programId !== null) {
    await addSlot(training, programId, workoutId);
    await activateProgram(training, programId);
  }
  const id = await startSession(training, { workoutId, derivedTitle: "Legs", timeZone: "UTC" });
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
    phaseLoad: phaseLoadOf(session.phase, session.phaseModifiers),
    bodyweightKg: null,
    stallVersion: 0,
    stallMemory: () => ({ applied: !plannedDeload && !effort, dismissed: false }),
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
  const week = plannedDeload
    ? phaseFor(phasePlan, { started_at: session.startedAt, inserted_deloads: [] }, now, "UTC")
    : null;
  expect(session.phase).toBe(plannedDeload ? "deload" : null);
  const prepared = prepareWorkoutEntry(
    plan,
    entry,
    history,
    { grid: null, gymId: null },
    inputs,
    week,
  );
  const next = nextExerciseSuggestion(plan, SQUAT, history, gym, inputs, week, now);
  expect(prepared.entry.sets).toHaveLength(plannedDeload ? 1 : 2);
  expect(next?.suggestion).toEqual(view?.suggestion);
  expect(
    nextWorkoutCandidates([{ id: "upcoming", workoutId: "upcoming" }], new Set(), history),
  ).toEqual(["upcoming", workoutId]);

  if (progressing) expect(view?.stall).toBeNull();
  const preview = previewProgression(prepared.entry, history, prepared.context.settings, now);

  expect(view?.suggestion?.outcomes[0]).toMatchObject({
    reason: effort || progressing ? "add_weight" : "deload",
  });
  if (!effort && !progressing)
    expect(view?.suggestion?.outcomes[0]?.loadFactor).toBeCloseTo(expected / weight, 4);
  expect(live.get(set.id)).toEqual(view?.rows.get(set.id)?.ghosts);
  expect(preview?.suggestion).toEqual(view?.suggestion);
  expect(preview?.changes[0]?.today).toEqual({ weight: String(expected), reps: 5 });
});

it.each([
  { unit: "kg", first: 100, second: 70 },
  { unit: "lb", first: 225, second: 155 },
] as const)(
  "returns only the matching Session row for duplicate $unit entries",
  async ({ unit, first, second }) => {
    const fixture = await setupSessions();
    const { training } = fixture;
    const { workoutId, squat } = await pushWorkout(fixture);
    const [duplicate] = await addExercises(training, workoutId, [SQUAT]);
    if (!duplicate) throw new Error("Expected duplicate squat");
    const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
    const session = parseSessionDetail(await training.getAll(SESSION_DETAIL_SQL, [id]));
    const firstSet = session?.exercises
      .find((row) => row.sourceWorkoutExerciseId === squat)
      ?.sets.find((set) => set.kind === "working");
    const secondSet = session?.exercises.find((row) => row.sourceWorkoutExerciseId === duplicate)
      ?.sets[0];
    if (!firstSet || !secondSet) throw new Error("Expected both squat rows");
    await tickSet(training, firstSet.id, {
      weight: parseWeight(String(first), unit) ?? 0,
      reps: 5,
    });
    await tickSet(training, secondSet.id, {
      weight: parseWeight(String(second), unit) ?? 0,
      reps: 10,
    });
    await finishSession(training, id);
    const history = parseFinishedSessions(
      await training.getAll(EXERCISE_HISTORY_SQL, [SQUAT, SQUAT]),
    );
    const account = {
      unit,
      previousSource: "same_workout",
      weightIncrementKg: null,
      bodyweightKg: null,
      lighterWeeks: [],
      stallMemory: () => ({ applied: false, dismissed: false }),
    } as const;
    const place = {
      exerciseId: SQUAT,
      sourceWorkoutExerciseId: duplicate,
      exerciseOrdinal: 1,
      type: "weight_reps",
      equipment: "barbell",
      workoutId,
      gymId: null,
      grid: null,
      stalls: true,
    } as const;
    const context = suggestionContext(history, place, account);
    expect(context.history[0]?.sets).toMatchObject([{ id: secondSet.id, reps: 10 }]);
    const previouslySingle = context.history;
    const replaced = { ...place, sourceWorkoutExerciseId: "new-row", exerciseOrdinal: 0 };
    expect(suggestionContext(previouslySingle, replaced, account).history[0]?.sets[0]?.id).toBe(
      secondSet.id,
    );
    expect(
      suggestionContext(previouslySingle, { ...replaced, duplicateEntry: true }, account).history,
    ).toEqual([]);
  },
);

it("reads the same daily average for the notification's weighted bodyweight history", async () => {
  const { training, sqlite } = await setupSessions();
  const insert = sqlite.prepare(`INSERT INTO body_measurement
    (id, user_id, metric, value, measured_at, local_date, source, created_at)
    VALUES (?, 'owner', 'weight', ?, ?, ?, 'manual', ?)`);
  for (const [id, kg, date] of [
    ["w1", 78, "2026-11-10"],
    ["w2", 82, "2026-11-10"],
    ["w3", 77, "2026-11-15"],
  ] as const) {
    insert.run(id, kg, date, date, date);
  }
  expect(
    await readBodyweightsOnDates(training, ["2026-11-01", "2026-11-12", "2026-11-16"]),
  ).toEqual(
    new Map([
      ["2026-11-01", 80],
      ["2026-11-12", 80],
      ["2026-11-16", 77],
    ]),
  );
});
