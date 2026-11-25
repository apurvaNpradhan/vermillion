import { createI18n } from "@workspace/i18n";
import { latestAdjustment } from "@workspace/shared";
import {
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  createGym,
  parseSessionDetail,
  readGymLoadInputs,
  setExerciseSetting,
  setGymExerciseSetting,
  setSessionGym,
  startSession,
  updateSet,
  updateWorkoutExercise,
} from "@workspace/sync";
import {
  pushWorkout,
  setupSessions,
  SQUAT,
} from "@workspace/sync/training/sessions/session-fixtures";
import { expect, it } from "vitest";

import { buildGymLoads } from "../../gym/gym-loads";
import { logWorkoutLiveSet, workoutLiveGhosts } from "./workout-live-logging";
import { workoutLiveState } from "./workout-live-state";

it.each([
  { unit: "kg", override: null, display: "60 kg", weightKg: 60 },
  { unit: "lb", override: null, display: "132 lb", weightKg: 59.874 },
  { unit: "kg", override: "lb", display: "132 lb", weightKg: 59.874 },
  { unit: "lb", override: "kg", display: "60 kg", weightKg: 60 },
] as const)(
  "shows and logs the gym cap for $unit with override $override",
  async ({ unit, override, display, weightKg }) => {
    const fixture = await setupSessions();
    const { training, installId, one } = fixture;
    const { workoutId, squat } = await pushWorkout(fixture);
    await updateWorkoutExercise(training, squat, {
      sets: [{ kind: "working", weight_kg: 80, reps_min: 8, reps_max: 8 }],
    });
    await createGym(training, { name: "Default", copyKitFrom: null }, installId);
    const garage = await createGym(training, { name: "Garage", copyKitFrom: null }, installId);
    const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
    await setSessionGym(training, id, garage, installId);
    await setGymExerciseSetting(
      training,
      { gymId: garage, exerciseId: SQUAT },
      { load_ranges: [{ min: 0, max: 60, step: null }] },
      installId,
    );
    if (override !== null) await setExerciseSetting(training, SQUAT, { unit: override }, installId);
    const session = parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
    if (!session) throw new Error("Session missing");
    const { sessionGymId, ...loadInputs } = await readGymLoadInputs(training, id);
    const gym = buildGymLoads({ ...loadInputs, unit });
    const options: Parameters<typeof workoutLiveState>[0]["options"] = {
      weightUnit: unit,
      previousSource: "same_workout",
      bodyweightKg: null,
      weightIncrementKg: null,
      lighterWeeks: [],
      soundOn: false,
      vibrate: true,
    };
    const ghosts = await workoutLiveGhosts(training, session, options, gym, sessionGymId);
    const state = workoutLiveState({
      session,
      ghostsFor: (setId) => ghosts.get(setId) ?? {},
      now: Date.now(),
      unit,
      url: `sigil:///session/${id}`,
      options,
      t: createI18n("en").t,
    });
    expect(state.text).toContain(display);
    expect(state.canLog).toBe(true);
    expect(
      await logWorkoutLiveSet(training, session, ghosts, installId, state.setId),
    ).toMatchObject({ ok: true, wrote: true, values: { weight_kg: weightKg, reps: 8 } });
    expect(one("session_set", state.setId ?? "")).toMatchObject({
      weight_kg: weightKg,
      completed_at: expect.any(String),
    });
  },
);

it("lowers the unticked sets when Done logs a set that was typed short", async () => {
  const fixture = await setupSessions();
  const { training, installId } = fixture;
  const { workoutId, squat } = await pushWorkout(fixture);
  const working = { kind: "working", weight_kg: 80, reps_min: 8, reps_max: 8 } as const;
  await updateWorkoutExercise(training, squat, { sets: [working, working, working] });
  const id = await startSession(training, { workoutId, derivedTitle: "Legs" });
  const read = async () => {
    const session = parseSessionDetail(
      await training.getAll(SESSION_DETAIL_SQL, [id]),
      await training.getAll(SESSION_LAST_NOTES_SQL, [id]),
    );
    if (!session) throw new Error("Session missing");
    return session;
  };
  const gym = buildGymLoads({ unit: "kg", kit: [], settings: [], gymId: null });
  const options: Parameters<typeof workoutLiveState>[0]["options"] = {
    weightUnit: "kg",
    previousSource: "same_workout",
    bodyweightKg: null,
    weightIncrementKg: null,
    lighterWeeks: [],
    soundOn: false,
    vibrate: true,
  };
  await workoutLiveGhosts(training, await read(), options, gym, null, installId);
  const [first, second, third] = (await read()).exercises[0]?.sets ?? [];
  if (!first || !second || !third) throw new Error("Expected three sets");
  await updateSet(training, first.id, { reps: 5 });
  const session = await read();
  const ghosts = await workoutLiveGhosts(training, session, options, gym, null);
  expect(
    await logWorkoutLiveSet(training, session, ghosts, installId, first.id, options, gym),
  ).toMatchObject({ ok: true, wrote: true });
  const prescription = (await read()).exercises[0]?.prescription;
  expect(latestAdjustment(prescription)).toMatchObject({ setId: first.id, reason: "reps_short" });
  const weights = prescription?.sets.map((set) => set.ghosts.weight);
  expect(weights?.[0]).toBe(80);
  expect(weights?.[1]).toBeLessThan(80);
  expect(weights?.[2]).toBe(weights?.[1]);
});
