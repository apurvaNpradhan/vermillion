import { expect, it } from "vitest";
import type { SessionDetail } from "@workspace/sync";
import { sessionAsText } from "./session-as-text";
it("shares snapshot titles, warmups, notes and effort, omitting unticked sets", () => {
  const set = {
    id: "set",
    position: "a0",
    kind: "warmup",
    weightKg: 60,
    reps: 8,
    durationS: null,
    distanceM: null,
    floors: null,
    steps: null,
    rpe: 8,
    completedAt: "now",
    timerStartedAt: null,
    target: null,
  } as const;
  const session: SessionDetail = {
    id: "id",
    title: "Push",
    note: "Note",
    workoutId: null,
    programId: null,
    runId: null,
    slotId: null,
    cycle: null,
    titleDerived: false,
    startedAt: "now",
    finishedAt: "later",
    durationS: 60,
    deviceId: "device",
    rest: null,
    exercises: [
      {
        id: "entry",
        exerciseId: "bench",
        title: "Bench",
        type: "weight_reps",
        sourceWorkoutExerciseId: null,
        position: "a0",
        restSeconds: null,
        note: "Pause",
        supersetGroup: null,
        logEffort: true,
        exercise: null,
        sets: [set, { ...set, id: "not-done", reps: 99, completedAt: null }],
      },
    ],
  };
  const text = sessionAsText(session, {
    date: "Today",
    stats: "1:00",
    unit: "kg",
    unitLabel: "kg",
    kind: () => "Warm-up",
    effort: (value) => `RPE ${value}`,
  });
  expect(text).toContain("Warm-up · 60 kg × 8 · RPE 8");
  expect(text).toContain("Pause");
  expect(text).not.toContain("99");
  expect(text).toContain("Push\nToday\n1:00\nNote");
});
