import type { PlannedSet } from "@workspace/shared";

export type DemoExercise = {
  title: string;
  sets: PlannedSet[];
  restSeconds: number | null;
  note: string;
  superset?: string;
};
export type DemoWorkout = { key: string; title: string; note: string; exercises: DemoExercise[] };
const working = (count: number, min: number, max: number, kg?: number): PlannedSet[] =>
  Array.from({ length: count }, () => ({
    kind: "working",
    reps_min: min,
    reps_max: max,
    effort_min: 8,
    effort_max: 9,
    ...(kg === undefined ? {} : { weight_kg: kg }),
  }));
const lift = (
  title: string,
  count: number,
  min: number,
  max: number,
  kg: number,
  restSeconds = 120,
  note = "Keep the movement controlled.",
): DemoExercise => ({ title, sets: working(count, min, max, kg), restSeconds, note });
const warm = (exercise: DemoExercise, kg: number): DemoExercise => ({
  ...exercise,
  sets: [{ kind: "warmup", reps_min: 8, reps_max: 8, weight_kg: kg }, ...exercise.sets],
});
const plank: DemoExercise = {
  title: "Plank",
  sets: Array.from({ length: 3 }, () => ({ kind: "working", duration_s: 45 })),
  restSeconds: 60,
  note: "Maintain a steady position and breathe normally.",
};
const walking: DemoExercise = {
  title: "Walking",
  sets: [{ kind: "working", duration_s: 600, distance_m: 800 }],
  restSeconds: null,
  note: "An easy finish; duration and distance are illustrative.",
};
const row = lift("Seated Cable Row - V Grip (Cable)", 3, 8, 12, 35);
const squat = warm(
  lift("Squat (Barbell)", 3, 5, 8, 60, 180, "Pause briefly to brace before each rep."),
  20,
);
const bench = warm(
  lift("Bench Press (Barbell)", 3, 6, 8, 45, 180, "Keep your setup consistent between sets."),
  20,
);
const rdl = lift(
  "Romanian Deadlift (Barbell)",
  3,
  8,
  10,
  50,
  150,
  "Hinge at the hips; stop before your back position changes.",
);
const pulldown = lift("Lat Pulldown (Cable)", 3, 8, 12, 35);
const curl: DemoExercise = {
  ...lift("Bicep Curl (Dumbbell)", 3, 10, 12, 8),
  restSeconds: null,
  superset: "arms",
  note: "Superset A1. Continue to the triceps exercise, then rest.",
};
const triceps: DemoExercise = {
  ...lift("Triceps Rope Pushdown", 3, 10, 12, 20, 90),
  superset: "arms",
  note: "Superset A2. Rest after completing both exercises.",
};
const lateral = lift("Lateral Raise (Dumbbell)", 2, 12, 15, 5, 90);

export const demoWorkouts = {
  fullA: {
    key: "fullA",
    title: "Full body A",
    note: "Demo plan. Sample loads are fictional, not personalized recommendations. Targets include preparation sets, compounds, core and an easy finish.",
    exercises: [squat, bench, row, rdl, plank, walking],
  },
  fullB: {
    key: "fullB",
    title: "Full body B",
    note: "Demo plan. A second full-body template with a two-exercise arm superset.",
    exercises: [
      lift("Leg Press (Machine)", 3, 10, 12, 90, 150),
      lift("Overhead Press (Dumbbell)", 3, 8, 10, 12),
      pulldown,
      lift("Seated Leg Curl (Machine)", 3, 12, 15, 25, 90),
      curl,
      triceps,
    ],
  },
  push: {
    key: "push",
    title: "Push + arms",
    note: "Demo plan. Demonstrates a warm-up, rep ranges, a drop set and a final to-failure target. Sample loads are fictional.",
    exercises: [
      bench,
      lift("Incline Bench Press (Dumbbell)", 3, 8, 12, 14),
      {
        ...lateral,
        sets: [...lateral.sets, { kind: "drop", reps_min: 12, reps_max: 15, weight_kg: 3 }],
      },
      {
        ...triceps,
        superset: undefined,
        sets: [
          ...working(2, 10, 12, 20),
          {
            kind: "failure",
            reps_min: 10,
            reps_max: 12,
            weight_kg: 15,
            effort_min: 10,
            effort_max: 10,
          },
        ],
        note: "The T badge marks the final to-failure set.",
      },
    ],
  },
  recovery: {
    key: "recovery",
    title: "Recovery + core",
    note: "Demo plan. Demonstrates duration, distance and bodyweight rep targets with rest disabled for continuous cardio.",
    exercises: [
      { ...walking, sets: [{ kind: "working", duration_s: 900, distance_m: 1200 }] },
      {
        title: "Cycling",
        sets: [{ kind: "working", duration_s: 600, distance_m: 2500 }],
        restSeconds: null,
        note: "Easy, steady pace. Example distance only.",
      },
      plank,
      {
        title: "Crunch",
        sets: [
          { kind: "working", reps_min: 15, reps_max: 15 },
          { kind: "working", reps_min: 15, reps_max: 15 },
        ],
        restSeconds: 45,
        note: "Exact-rep target, without external load.",
      },
    ],
  },
  upper: {
    key: "upper",
    title: "Upper body",
    note: "Demo plan. Push and pull movements followed by a superset. Sample loads are fictional.",
    exercises: [bench, row, pulldown, lateral, curl, triceps],
  },
  lower: {
    key: "lower",
    title: "Lower body",
    note: "Demo plan. Squat and hinge patterns, leg isolation and core. Sample loads are fictional.",
    exercises: [
      squat,
      rdl,
      lift("Seated Leg Curl (Machine)", 3, 12, 15, 25, 90),
      lift("Standing Calf Raise (Machine)", 3, 12, 15, 30, 60),
      plank,
    ],
  },
} satisfies Record<string, DemoWorkout>;

export const demoPrograms = [
  {
    title: "Demo · Upper / lower",
    plannedWeeks: 8,
    description:
      "## Upper / lower\nAn example rotation with four training slots and two rest slots.\n\nUpper and Lower each appear twice. Reused slots share the same workout; edit it once to update both places. The order is flexible, not a calendar.\n\nAll loads are fictional demo values.",
    workouts: [demoWorkouts.upper, demoWorkouts.lower],
    rotation: ["upper", "lower", null, "upper", "lower", null],
  },
  {
    title: "Demo · Full-body rotation",
    plannedWeeks: 4,
    description:
      "## Full-body rotation\nAlternate two full-body workouts with recovery between training slots.\n\nThe second A slot deliberately reuses the same workout. Core duration targets, warm-ups and an arm superset demonstrate the editor's different target types.\n\nAll loads are fictional demo values.",
    workouts: [demoWorkouts.fullA, demoWorkouts.fullB],
    rotation: ["fullA", null, "fullB", null, "fullA", null],
  },
];
