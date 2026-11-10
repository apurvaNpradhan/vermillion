import { supersetPlaces, type ExerciseType, type PlannedSet } from "@workspace/shared";

import { markdownRuns } from "../platform/ui/markdown";
import { formatClock } from "./rest";
import { summariseWorking, type SummaryLabels, type SummaryPrefs } from "./summarise-sets";

/** One exercise of a plan, as the text needs it. */
export type SharedExercise = {
  name: string;
  type: ExerciseType;
  sets: readonly PlannedSet[];
  restSeconds: number | null;
  note: string | null;
  supersetGroup: string | null;
};

/** A Workout with the title it shows (derived when it has none). */
export type SharedWorkout = {
  title: string;
  note: string | null;
  exercises: readonly SharedExercise[];
};

export type SharedProgram = {
  title: string;
  /** Markdown; the text carries it as plain text. */
  description: string | null;
  /** In Rotation order; null is a Rest Slot. */
  slots: readonly (SharedWorkout | null)[];
};

export type SharedPlan =
  | { kind: "workout"; workout: SharedWorkout }
  | { kind: "program"; program: SharedProgram };

/** The words of the text: the summary words plus the ones only the share text uses. */
export type PlanTextLabels = SummaryLabels & {
  /** `rest 3:00` */
  rest: (clock: string) => string;
  /** `at 100 kg` */
  at: (weight: string) => string;
  /** The line above a superset's exercises. */
  superset: string;
  /** `1. Push` */
  slot: (number: number, title: string) => string;
  /** `2. Rest` */
  restDay: (number: number) => string;
};

const INDENT = "  ";

/** A Markdown description as the plain text it reads as. */
export function plainText(markdown: string): string {
  return markdownRuns(markdown)
    .map((run) => run.text)
    .join("")
    .trim();
}

function exerciseLines(
  exercise: SharedExercise,
  shows: "own" | "none",
  prefs: SummaryPrefs,
  labels: PlanTextLabels,
  indent: string,
): string[] {
  const warmups = exercise.sets.filter((set) => set.kind === "warmup").length;
  const working = summariseWorking(exercise.sets, exercise.type, prefs, labels);
  const parts: string[] = [];
  if (warmups > 0) parts.push(labels.warmup(warmups));
  if (working.text !== null) {
    const weight = working.weight === null ? "" : ` ${labels.at(working.weight)}`;
    const effort = working.effort === null ? "" : ` @ ${working.effort}`;
    parts.push(`${working.text}${weight}${effort}`);
  }
  if (shows === "own" && exercise.restSeconds !== null) {
    parts.push(labels.rest(formatClock(exercise.restSeconds)));
  }
  const head = parts.length === 0 ? exercise.name : `${exercise.name}: ${parts.join(", ")}`;
  const note = exercise.note?.trim();
  return [`${indent}${head}`, ...(note ? [`${indent}${INDENT}${note}`] : [])];
}

/** The exercises of a Workout: a plain line each, supersets under their own heading. */
function workoutLines(
  exercises: readonly SharedExercise[],
  prefs: SummaryPrefs,
  labels: PlanTextLabels,
): string[] {
  const places = supersetPlaces(exercises, (exercise) => exercise.supersetGroup);
  const lines: string[] = [];
  exercises.forEach((exercise, index) => {
    const place = places[index] ?? "none";
    if (place === "none") {
      lines.push(...exerciseLines(exercise, "own", prefs, labels, ""));
      return;
    }
    if (place === "first") lines.push(labels.superset);
    lines.push(
      ...exerciseLines(exercise, place === "last" ? "own" : "none", prefs, labels, INDENT),
    );
  });
  return lines;
}

function workoutBlock(
  workout: SharedWorkout,
  heading: string,
  prefs: SummaryPrefs,
  labels: PlanTextLabels,
): string {
  const note = workout.note?.trim();
  return [heading, ...(note ? [note] : []), ...workoutLines(workout.exercises, prefs, labels)].join(
    "\n",
  );
}

/**
 * A Workout or a whole Program as text for a message: the title, the description as plain text,
 * then each Slot (or the Workout) with one line per exercise, such as
 * `Bench Press: 2 warm-up, 3 × 6–8 @ RIR 1–2, rest 3:00`, and the pinned note on the next line.
 * Superset members sit under a "Superset" line; its rest is on the last one. Weight and effort
 * follow the preferences.
 */
export function planAsText(plan: SharedPlan, prefs: SummaryPrefs, labels: PlanTextLabels): string {
  if (plan.kind === "workout") {
    return workoutBlock(plan.workout, plan.workout.title, prefs, labels);
  }
  const { program } = plan;
  const description = program.description === null ? "" : plainText(program.description);
  const sections = [
    program.title,
    ...(description === "" ? [] : [description]),
    ...program.slots.map((slot, index) =>
      slot === null
        ? labels.restDay(index + 1)
        : workoutBlock(slot, labels.slot(index + 1, slot.title), prefs, labels),
    ),
  ];
  return sections.join("\n\n");
}
