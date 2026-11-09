import { describe, expect, it } from "vitest";

import {
  applyLatestExercise,
  editExerciseDraft,
  emptyExerciseValues,
  exerciseDraftPatch,
  isExerciseDraftDirty,
  shouldBlockLeaving,
  startExerciseDraft,
  toggleSecondary,
  validateExerciseForm,
  type ExerciseFormValues,
} from "./exercise-draft";

const saved: ExerciseFormValues = {
  title: "My press",
  equipment: "dumbbell",
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
  exerciseType: "weight_reps",
  notes: "Push.",
};

describe("the form's dirty-field diff", () => {
  it("is empty and clean until the user changes something", () => {
    const draft = startExerciseDraft(saved);
    expect(exerciseDraftPatch(draft)).toEqual({});
    expect(isExerciseDraftDirty(draft)).toBe(false);
  });

  it("sends only the fields that changed, as columns", () => {
    let draft = startExerciseDraft(saved);
    draft = editExerciseDraft(draft, "title", "  Better press ");
    draft = editExerciseDraft(draft, "equipment", "barbell");
    expect(exerciseDraftPatch(draft)).toEqual({ title: "Better press", equipment: "barbell" });
    expect(isExerciseDraftDirty(draft)).toBe(true);
  });

  it("treats a restored value, whitespace around the title and the order of muscles as no change", () => {
    let draft = startExerciseDraft(saved);
    draft = editExerciseDraft(draft, "title", "My press ");
    draft = editExerciseDraft(draft, "secondaryMuscles", ["shoulders", "triceps"]);
    expect(exerciseDraftPatch(draft)).toEqual({});
    expect(isExerciseDraftDirty(draft)).toBe(false);
  });

  it("saves empty notes as null and sends them only when they changed", () => {
    const cleared = editExerciseDraft(startExerciseDraft(saved), "notes", "   ");
    expect(exerciseDraftPatch(cleared)).toEqual({ instructions: null });
    const none = startExerciseDraft({ ...saved, notes: "" });
    expect(exerciseDraftPatch(editExerciseDraft(none, "notes", "  "))).toEqual({});
  });

  it("drops a new primary muscle from the secondary list and sends both", () => {
    const draft = editExerciseDraft(startExerciseDraft(saved), "primaryMuscle", "triceps");
    expect(draft.values.secondaryMuscles).toEqual(["shoulders"]);
    expect(exerciseDraftPatch(draft)).toEqual({
      primary_muscle: "triceps",
      secondary_muscles: ["shoulders"],
    });
  });

  it("keeps edited fields and follows the rest when the saved row changes", () => {
    let draft = startExerciseDraft(saved);
    draft = editExerciseDraft(draft, "title", "Mine");
    const next = applyLatestExercise(draft, {
      ...saved,
      title: "Renamed elsewhere",
      equipment: "machine",
    });
    expect(next.values.title).toBe("Mine");
    expect(next.values.equipment).toBe("machine");
    expect(exerciseDraftPatch(next)).toEqual({ title: "Mine" });
  });

  it("toggles secondary muscles in vocabulary order", () => {
    expect(toggleSecondary(["triceps"], "biceps")).toEqual(["biceps", "triceps"]);
    expect(toggleSecondary(["biceps", "triceps"], "biceps")).toEqual(["triceps"]);
  });
});

describe("validation", () => {
  it("names each missing required field of an empty form", () => {
    const result = validateExerciseForm(emptyExerciseValues());
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "exercise__error_title_required",
        equipment: "exercise__error_equipment_required",
        primaryMuscle: "exercise__error_muscle_required",
      },
    });
  });

  it("accepts a title of 100 characters and refuses 101", () => {
    const ok = validateExerciseForm({ ...saved, title: "a".repeat(100) });
    expect(ok.ok).toBe(true);
    const long = validateExerciseForm({ ...saved, title: "a".repeat(101) });
    expect(long).toMatchObject({ ok: false, errors: { title: "exercise__error_title_long" } });
  });

  it("returns the input to save", () => {
    expect(validateExerciseForm({ ...saved, notes: "" })).toEqual({
      ok: true,
      input: {
        title: "My press",
        primary_muscle: "chest",
        secondary_muscles: ["triceps", "shoulders"],
        equipment: "dumbbell",
        exercise_type: "weight_reps",
        is_full_bodyweight: false,
        instructions: null,
      },
    });
  });
});

describe("leaving the form", () => {
  const base = { dirty: true, saving: false, done: false, discarded: false };
  it("asks only with unsaved changes", () => {
    expect(shouldBlockLeaving(base)).toBe(true);
    expect(shouldBlockLeaving({ ...base, dirty: false })).toBe(false);
  });
  it("stops asking while saving, once saved and once discarded", () => {
    expect(shouldBlockLeaving({ ...base, saving: true })).toBe(false);
    expect(shouldBlockLeaving({ ...base, done: true })).toBe(false);
    expect(shouldBlockLeaving({ ...base, discarded: true })).toBe(false);
  });
});
