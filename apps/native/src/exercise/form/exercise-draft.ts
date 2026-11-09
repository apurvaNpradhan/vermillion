import {
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  MUSCLE_GROUPS,
  customExerciseInput,
  type CustomExerciseInput,
  type Equipment,
  type ExerciseType,
  type MuscleGroup,
} from "@workspace/shared";
import type { ExercisePatch } from "@workspace/sync";

/** What the exercise form shows. Equipment and the primary muscle start empty and are required. */
export type ExerciseFormValues = {
  title: string;
  equipment: Equipment | null;
  primaryMuscle: MuscleGroup | null;
  secondaryMuscles: readonly MuscleGroup[];
  exerciseType: ExerciseType;
  /** Saved as `instructions`. */
  notes: string;
};

export type ExerciseFormField = keyof ExerciseFormValues;

/**
 * An open form (ADR 0019). `baseline` is what each field held when the user started editing it;
 * `values` is what the form shows. Intent is the difference between the two, never a comparison
 * with the newest replicated row.
 */
export type ExerciseDraft = { baseline: ExerciseFormValues; values: ExerciseFormValues };

export function emptyExerciseValues(title = ""): ExerciseFormValues {
  return {
    title,
    equipment: null,
    primaryMuscle: null,
    secondaryMuscles: [],
    exerciseType: "weight_reps",
    notes: "",
  };
}

export function startExerciseDraft(values: ExerciseFormValues): ExerciseDraft {
  return { baseline: { ...values }, values: { ...values } };
}

/**
 * Changes one field. A new primary muscle leaves the secondary list, because a muscle is never
 * both; the secondary change is then part of the patch too.
 */
export function editExerciseDraft<F extends ExerciseFormField>(
  draft: ExerciseDraft,
  field: F,
  value: ExerciseFormValues[F],
): ExerciseDraft {
  const values = { ...draft.values, [field]: value };
  if (field === "primaryMuscle") {
    values.secondaryMuscles = values.secondaryMuscles.filter((muscle) => muscle !== value);
  }
  return { ...draft, values };
}

/** Adds or removes a secondary muscle, keeping the list in the vocabulary's order. */
export function toggleSecondary(
  current: readonly MuscleGroup[],
  muscle: MuscleGroup,
): MuscleGroup[] {
  const next = current.includes(muscle)
    ? current.filter((candidate) => candidate !== muscle)
    : [...current, muscle];
  return MUSCLE_GROUPS.filter((candidate) => next.includes(candidate));
}

const sameMuscles = (a: readonly MuscleGroup[], b: readonly MuscleGroup[]) =>
  a.length === b.length && a.every((muscle) => b.includes(muscle));

const instructionsOf = (notes: string): string | null => (notes.trim() === "" ? null : notes);

/**
 * The fields the user changed since the edit started, as columns: exactly what an update may
 * send. Unchanged fields are never in it, so a change made elsewhere to them is never overwritten.
 */
export function exerciseDraftPatch(draft: ExerciseDraft): ExercisePatch {
  const { baseline, values } = draft;
  return {
    ...(values.title.trim() !== baseline.title.trim() && values.title.trim() !== ""
      ? { title: values.title.trim() }
      : {}),
    ...(values.primaryMuscle !== baseline.primaryMuscle && values.primaryMuscle !== null
      ? { primary_muscle: values.primaryMuscle }
      : {}),
    ...(!sameMuscles(values.secondaryMuscles, baseline.secondaryMuscles)
      ? { secondary_muscles: [...values.secondaryMuscles] }
      : {}),
    ...(values.equipment !== baseline.equipment && values.equipment !== null
      ? { equipment: values.equipment }
      : {}),
    ...(values.exerciseType !== baseline.exerciseType
      ? { exercise_type: values.exerciseType }
      : {}),
    ...(instructionsOf(values.notes) !== instructionsOf(baseline.notes)
      ? { instructions: instructionsOf(values.notes) }
      : {}),
  };
}

/**
 * Whether leaving the form must ask first: only with unsaved changes, and never while saving, once
 * saved, or once the user has chosen to discard.
 */
export function shouldBlockLeaving(state: {
  dirty: boolean;
  saving: boolean;
  done: boolean;
  discarded: boolean;
}): boolean {
  return state.dirty && !state.saving && !state.done && !state.discarded;
}

/** Whether the user has changed anything (a blank title counts: it is a change to refuse). */
export function isExerciseDraftDirty(draft: ExerciseDraft): boolean {
  const { baseline, values } = draft;
  return (
    values.title.trim() !== baseline.title.trim() ||
    values.primaryMuscle !== baseline.primaryMuscle ||
    values.equipment !== baseline.equipment ||
    values.exerciseType !== baseline.exerciseType ||
    !sameMuscles(values.secondaryMuscles, baseline.secondaryMuscles) ||
    instructionsOf(values.notes) !== instructionsOf(baseline.notes)
  );
}

/**
 * The saved exercise changed while the form is open. Untouched fields follow the row (and their
 * baseline moves with them); edited fields keep the user's text and the original baseline.
 */
export function applyLatestExercise(
  draft: ExerciseDraft,
  latest: ExerciseFormValues,
): ExerciseDraft {
  const baseline: ExerciseFormValues = { ...draft.baseline };
  const values: ExerciseFormValues = { ...draft.values };
  const follow = <F extends ExerciseFormField>(field: F, same: boolean) => {
    if (!same) return;
    baseline[field] = latest[field];
    values[field] = latest[field];
  };
  follow("title", draft.values.title === draft.baseline.title);
  follow("equipment", draft.values.equipment === draft.baseline.equipment);
  follow("primaryMuscle", draft.values.primaryMuscle === draft.baseline.primaryMuscle);
  follow("exerciseType", draft.values.exerciseType === draft.baseline.exerciseType);
  follow("notes", draft.values.notes === draft.baseline.notes);
  follow(
    "secondaryMuscles",
    sameMuscles(draft.values.secondaryMuscles, draft.baseline.secondaryMuscles),
  );
  return { baseline, values };
}

/** Keys of the inline error messages, one per way a field can be wrong. */
export type ExerciseFormErrorKey =
  | "exercise__error_title_required"
  | "exercise__error_title_long"
  | "exercise__error_equipment_required"
  | "exercise__error_muscle_required"
  | "exercise__error_notes_long";

export type ExerciseFormErrors = Partial<Record<ExerciseFormField, ExerciseFormErrorKey>>;

/**
 * Checks the form with the shared `customExerciseInput` (the same rules the server applies) and
 * names the first problem of each field. Returns the input to save when there is none.
 */
export function validateExerciseForm(
  values: ExerciseFormValues,
  isFullBodyweight = false,
): { ok: true; input: CustomExerciseInput } | { ok: false; errors: ExerciseFormErrors } {
  const errors: ExerciseFormErrors = {};
  const title = values.title.trim();
  if (title === "") errors.title = "exercise__error_title_required";
  else if (title.length > EXERCISE_TITLE_MAX) errors.title = "exercise__error_title_long";
  if (values.equipment === null) errors.equipment = "exercise__error_equipment_required";
  if (values.primaryMuscle === null) errors.primaryMuscle = "exercise__error_muscle_required";
  if (values.notes.length > EXERCISE_INSTRUCTIONS_MAX) errors.notes = "exercise__error_notes_long";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = customExerciseInput.safeParse({
    title,
    primary_muscle: values.primaryMuscle,
    secondary_muscles: [...values.secondaryMuscles],
    equipment: values.equipment,
    exercise_type: values.exerciseType,
    is_full_bodyweight: isFullBodyweight,
    instructions: instructionsOf(values.notes),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  // Unreachable while the checks above mirror the schema; never save what the schema refuses.
  return { ok: false, errors: { title: "exercise__error_title_required" } };
}
