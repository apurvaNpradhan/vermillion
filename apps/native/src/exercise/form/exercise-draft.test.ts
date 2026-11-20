import { describe, expect, it } from "vitest";

import {
  applyLatestExercise,
  editExerciseDraft,
  emptyExerciseValues,
  exerciseDraftPatch,
  isExerciseDraftDirty,
  shouldBlockLeaving,
  startExerciseDraft,
  toggleDetail,
  toggleSecondary,
  validateExerciseForm,
  type ExerciseFormValues,
} from "./exercise-draft";

const saved: ExerciseFormValues = {
  title: "My press",
  equipment: "dumbbell",
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
  primaryDetail: ["upper_chest"],
  secondaryDetail: ["rear_delts"],
  exerciseType: "weight_reps",
  notes: "Push.",
};

describe("muscle details in the form", () => {
  it("is clean until a detail changes, then sends only that list", () => {
    let draft = startExerciseDraft(saved);
    expect(exerciseDraftPatch(draft)).toEqual({});
    draft = editExerciseDraft(draft, "primaryDetail", toggleDetail(["upper_chest"], "lower_chest"));
    expect(exerciseDraftPatch(draft)).toEqual({ primary_detail: ["upper_chest", "lower_chest"] });
    expect(isExerciseDraftDirty(draft)).toBe(true);
    expect(exerciseDraftPatch(editExerciseDraft(draft, "primaryDetail", ["upper_chest"]))).toEqual(
      {},
    );
  });

  it("clears the primary details when the primary group changes, and sends the clear", () => {
    const draft = editExerciseDraft(startExerciseDraft(saved), "primaryMuscle", "biceps");
    expect(draft.values.primaryDetail).toEqual([]);
    expect(exerciseDraftPatch(draft)).toMatchObject({
      primary_muscle: "biceps",
      primary_detail: [],
    });
  });

  it("drops a secondary group's details when the group leaves the list", () => {
    const draft = editExerciseDraft(startExerciseDraft(saved), "secondaryMuscles", ["triceps"]);
    expect(draft.values.secondaryDetail).toEqual([]);
    expect(exerciseDraftPatch(draft)).toEqual({
      secondary_muscles: ["triceps"],
      secondary_detail: [],
    });
    // A new primary group that was a secondary one takes its details out too.
    const swapped = editExerciseDraft(startExerciseDraft(saved), "primaryMuscle", "shoulders");
    expect(swapped.values.secondaryDetail).toEqual([]);
  });

  it("toggles details in vocabulary order", () => {
    expect(toggleDetail(["rear_delts"], "front_delts")).toEqual(["front_delts", "rear_delts"]);
    expect(toggleDetail(["front_delts", "rear_delts"], "front_delts")).toEqual(["rear_delts"]);
  });

  it("follows the saved row for untouched details only", () => {
    let draft = startExerciseDraft(saved);
    draft = editExerciseDraft(draft, "primaryDetail", ["lower_chest"]);
    const next = applyLatestExercise(draft, {
      ...saved,
      primaryDetail: ["upper_chest", "lower_chest"],
      secondaryDetail: ["side_delts"],
    });
    expect(next.values.primaryDetail).toEqual(["lower_chest"]);
    expect(next.values.secondaryDetail).toEqual(["side_delts"]);
  });

  it("saves the details with the form and refuses ones outside the groups", () => {
    const ok = validateExerciseForm(saved);
    expect(ok).toMatchObject({
      ok: true,
      input: { primary_detail: ["upper_chest"], secondary_detail: ["rear_delts"] },
    });
    const bad = validateExerciseForm({ ...saved, primaryDetail: ["side_delts"] });
    expect(bad).toMatchObject({
      ok: false,
      errors: { primaryDetail: "exercise__error_details_invalid" },
    });
    expect(validateExerciseForm({ ...saved, secondaryDetail: ["obliques"] }).ok).toBe(false);
  });

  it("starts a new exercise without details", () => {
    expect(emptyExerciseValues("x")).toMatchObject({ primaryDetail: [], secondaryDetail: [] });
  });
});

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
      primary_detail: [],
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
        primary_detail: ["upper_chest"],
        secondary_detail: ["rear_delts"],
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
