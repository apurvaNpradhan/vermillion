import {
  KG_PER_LB,
  parseWeight,
  phaseFor,
  phaseLoadOf,
  suggestionContext,
  type PhasePlan,
  type PlannedSet,
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
  savePreferences,
  finishSession,
  parseFinishedSessions,
  parseSessionDetail,
  parseWorkoutDetail,
  startSession,
  setStallDeload,
  setRunPaused,
  readRuns,
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
  { unit: "kg", weight: 20, expected: 23, plannedDeload: false, microplates: true },
  { unit: "lb", weight: 45, expected: 50, plannedDeload: false, microplates: true },
  { unit: "kg", weight: 12.5, expected: 12.5, plannedDeload: true, tolerance: true },
  { unit: "lb", weight: 25, expected: 25, plannedDeload: true, tolerance: true },
  { unit: "kg", weight: 100, expected: 90, plannedDeload: false, resumed: true },
  { unit: "lb", weight: 220, expected: 200, plannedDeload: false, resumed: true },
  { unit: "kg", weight: 100, expected: 105, plannedDeload: false, testWeek: true },
  { unit: "lb", weight: 225, expected: 235, plannedDeload: false, testWeek: true },
  { unit: "kg", weight: 60, expected: 67.5, plannedDeload: false, fixed: true },
  { unit: "lb", weight: 135, expected: 150, plannedDeload: false, fixed: true },
] as const)("agrees in $unit with planned deload $plannedDeload", async (scenario) => {
  const { unit, weight, expected, plannedDeload } = scenario;
  const effort = "effort" in scenario;
  const resumed = "resumed" in scenario;
  const testWeek = "testWeek" in scenario;
  const fixed = "fixed" in scenario;
  const progressing = "progressing" in scenario || "microplates" in scenario || resumed;
  const fixture = await setupSessions();
  const { training } = fixture;
  await savePreferences(
    training,
    { ui: { weightUnit: unit } },
    {
      owner: "owner",
      installId: fixture.installId,
    },
  );
  const phasePlan: PhasePlan = {
    pattern: testWeek ? ["test"] : resumed ? ["build", "test", "deload"] : ["deload"],
    modifiers: { deload: { load: "tolerance" in scenario ? 0.9 : 0.75 } },
    overrides: [],
    test_top: "single",
  };
  const programId =
    plannedDeload || resumed || testWeek
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
  const kilograms = unit === "kg" ? weight : weight * KG_PER_LB;
  const target: PlannedSet = {
    kind: "working",
    reps_min: 5,
    reps_max: fixed ? 5 : 8,
    ...("tolerance" in scenario ? { weight_kg: kilograms } : {}),
    ...(effort ? { effort_min: 7, effort_max: 7 } : {}),
  } as const;
  await updateWorkoutExercise(training, squat, { sets: [target, target] });
  const readSession = async (id: string) =>
    parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
  for (let index = 0; index < 4; index += 1) {
    const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
    const sets = (await readSession(id))?.exercises[0]?.sets;
    if (!sets) throw new Error("Expected squat sets");
    for (const set of sets)
      await tickSet(training, set.id, {
        weight: kilograms,
        reps: testWeek || fixed ? 5 : progressing ? 5 + index : 8,
        rpe: effort ? 7 : undefined,
      });
    await finishSession(training, id);
  }
  if (fixed) {
    const alternate = await createWorkout(training, { title: "Second day", program_id: null });
    const [second] = await addExercises(training, alternate, [SQUAT]);
    if (!second) throw new Error("Expected a second Workout entry");
    await updateWorkoutExercise(training, second, { sets: [target, target] });
    const previousId = await startSession(training, { workoutId: alternate, derivedTitle: "Legs" });
    const previous = await readSession(previousId);
    const laterLoad = expected - (unit === "kg" ? 2.5 : 5);
    for (const set of previous?.exercises[0]?.sets ?? []) {
      await tickSet(training, set.id, { weight: parseWeight(String(laterLoad), unit), reps: 5 });
    }
    await finishSession(training, previousId);
  }
  if (programId !== null) {
    await addSlot(training, programId, workoutId);
    const runId = await activateProgram(training, programId);
    if (resumed) {
      const now = Date.now();
      const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
      const sessions = parseFinishedSessions(
        await training.getAll(EXERCISE_HISTORY_SQL, [SQUAT, SQUAT]),
      );
      const move = fixture.sqlite.prepare(
        "UPDATE training_session SET run_id = ?, started_at = ?, finished_at = ? WHERE id = ?",
      );
      sessions.forEach((session, index) =>
        move.run(runId, at(21 + index), at(21 + index), session.id),
      );
      fixture.sqlite
        .prepare("UPDATE program_run SET started_at = ? WHERE id = ?")
        .run(at(21), runId);
      await setRunPaused(training, runId, true, fixture.installId, at(16));
      await setRunPaused(training, runId, false, fixture.installId, at(2));
    }
  }
  const id = await startSession(training, { workoutId, derivedTitle: "Legs", timeZone: "UTC" });
  const applied = !plannedDeload && !effort && !progressing && !testWeek && !fixed;
  if (applied) {
    const row = (await readSession(id))?.exercises[0];
    if (!row) throw new Error("Expected a Session exercise");
    expect(await setStallDeload(training, row.id, true)).toBe(true);
  }
  const session = await readSession(id);
  const exercise = session?.exercises[0];
  const set = exercise?.sets[0];
  const plan = parseWorkoutDetail(await training.getAll(WORKOUT_DETAIL_SQL, [workoutId]));
  const entry = plan?.exercises[0];
  if (!session || !exercise || !set || !entry || !plan) throw new Error("Expected the squat plan");

  const history = parseFinishedSessions(
    await training.getAll(EXERCISE_HISTORY_SQL, [SQUAT, SQUAT]),
  );
  const kit =
    "microplates" in scenario
      ? ([
          {
            id: "bar",
            kind: "bar",
            unit,
            weightKg: kilograms,
            label: null,
            count: null,
            enabled: true,
          },
          {
            id: "plate",
            kind: "plate",
            unit,
            weightKg: unit === "kg" ? 0.5 : 1.25 * KG_PER_LB,
            label: null,
            count: null,
            enabled: true,
          },
        ] as const)
      : [];
  const gym = buildGymLoads({ unit, kit, settings: [], gymId: null });
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
    phase: session.phase,
    testEntryId: session.phaseModifiers?.test_entry_id,
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
  const run = (await readRuns(training))[0];
  const week = run
    ? phaseFor(
        phasePlan,
        run,
        now,
        "UTC",
        history.map((item) => item.started_at),
      )
    : null;
  if ("tolerance" in scenario) expect(session.phaseModifiers?.load_cuts).toEqual([0, 0]);
  expect(session.phase).toBe(
    testWeek ? "test" : plannedDeload ? "deload" : resumed ? "build" : null,
  );
  const prepared = prepareWorkoutEntry(
    plan,
    entry,
    history,
    { grid: gym.gridFor(SQUAT, "barbell"), gymId: null },
    inputs,
    week,
  );
  const next = nextExerciseSuggestion(plan, SQUAT, history, gym, inputs, week, now);
  expect(prepared.entry.sets).toHaveLength(plannedDeload || testWeek ? 1 : 2);
  if (!applied) expect(next?.suggestion).toEqual(view?.suggestion);
  expect(
    nextWorkoutCandidates([{ id: "upcoming", workoutId: "upcoming" }], new Set(), history),
  ).toEqual(fixed ? ["upcoming", history[0]?.workoutId, workoutId] : ["upcoming", workoutId]);

  if (progressing) expect(view?.stall).toBeNull();
  const preview = previewProgression(prepared.entry, history, prepared.context.settings, now);

  expect(view?.suggestion?.outcomes[0]).toMatchObject({
    reason: testWeek
      ? "test_single"
      : resumed
        ? "after_break"
        : effort || progressing || fixed
          ? "add_weight"
          : "deload",
  });
  if (!effort && !progressing && !testWeek && !fixed)
    expect(view?.suggestion?.outcomes[0]?.loadFactor).toBeCloseTo(expected / weight, 4);
  expect(live.get(set.id)).toEqual(view?.rows.get(set.id)?.ghosts);
  if (applied) {
    expect(view?.rows.get(set.id)?.ghosts.weight).toBeCloseTo(
      unit === "kg" ? expected : expected * KG_PER_LB,
      2,
    );
    await tickSet(training, set.id, live.get(set.id) ?? {});
    await finishSession(training, id);
    const nextId = await startSession(training, { workoutId, derivedTitle: "Legs" });
    const nextSession = await readSession(nextId);
    const nextHistory = parseFinishedSessions(
      await training.getAll(EXERCISE_HISTORY_SQL, [SQUAT, SQUAT]),
    );
    expect(nextHistory[0]?.sets[0]?.stall_deload).toBe(true);
    const upcoming = nextExerciseSuggestion(plan, SQUAT, nextHistory, gym, inputs, week, now);
    expect(upcoming?.suggestion?.reason).not.toBe("deload");
    expect(nextSession?.exercises[0]?.stallDeload).toBe(false);
  } else {
    expect(preview?.suggestion).toEqual(view?.suggestion);
    expect(preview?.changes[0]?.today).toEqual({
      weight: String(expected),
      reps: testWeek ? 1 : 5,
    });
  }
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
