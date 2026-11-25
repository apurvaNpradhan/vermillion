import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";

export const set = (id: string, overrides: Partial<SessionSetDetail> = {}): SessionSetDetail => ({
  id,
  position: id,
  kind: "working",
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: null,
  completedAt: null,
  timerStartedAt: null,
  target: null,
  generatedWarmup: false,
  ...overrides,
});

export const exercise = (
  id: string,
  sets: SessionSetDetail[],
  overrides: Partial<SessionExerciseDetail> = {},
): SessionExerciseDetail => ({
  id,
  exerciseId: `lib-${id}`,
  title: id,
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: id,
  restSeconds: null,
  note: null,
  pinnedNote: null,
  lastNote: null,
  supersetGroup: null,
  logEffort: false,
  progressionPerSet: false,
  autoWarmups: false,
  warmupKey: null,
  repeated: false,
  barId: null,
  exercise: null,
  sets,
  ...overrides,
});

export const session = (exercises: SessionExerciseDetail[]): SessionDetail => ({
  id: "s1",
  workoutId: null,
  workoutStructure: null,
  programId: null,
  runId: null,
  slotId: null,
  phase: null,
  phaseModifiers: null,
  cycle: null,
  title: "Upper",
  titleDerived: false,
  note: null,
  workoutNote: null,
  startedAt: "2026-11-21T10:00:00.000Z",
  finishedAt: null,
  durationS: null,
  deviceId: "d1",
  rest: null,
  pausedAt: null,
  pausedMs: 0,
  exercises,
});

/** Two exercises of two and three sets, nothing logged. */
export const twoExercises = () =>
  session([
    exercise("a", [set("a1", { weightKg: 60 }), set("a2", { weightKg: 60 })]),
    exercise("b", [set("b1"), set("b2"), set("b3")]),
  ]);
