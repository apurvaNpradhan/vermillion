import { describe, expect, it } from "vitest";

import {
  DEFAULT_UI_PREFERENCES,
  uiPreferencesPatchSchema,
  uiPreferencesSchema,
} from "../../preferences";
import { DEFAULT_WARMUP_STEPS } from "../logging/warmup-ramp";
import { defaultGymKit } from "../plates/gym-kit";
import { KG_PER_LB } from "./format";
import { EXPERIENCE_WARMUP_STEPS, experienceWarmupSteps } from "./profile";

describe("experience defaults", () => {
  it("moves between presets, even when the saved steps are reordered", () => {
    expect(experienceWarmupSteps("new", DEFAULT_WARMUP_STEPS)).toEqual(EXPERIENCE_WARMUP_STEPS.new);
    expect(
      experienceWarmupSteps("experienced", [...EXPERIENCE_WARMUP_STEPS.new].reverse()),
    ).toEqual(EXPERIENCE_WARMUP_STEPS.experienced);
    expect(experienceWarmupSteps("some", EXPERIENCE_WARMUP_STEPS.experienced)).toEqual(
      DEFAULT_WARMUP_STEPS,
    );
  });

  it("keeps a ramp with custom percentages, reps or duplicate steps", () => {
    expect(experienceWarmupSteps("new", [{ percent: 40, reps: 8 }])).toBeUndefined();
    expect(
      experienceWarmupSteps("experienced", [
        { percent: 60, reps: 4 },
        { percent: 80, reps: 2 },
      ]),
    ).toBeUndefined();
    expect(
      experienceWarmupSteps("experienced", [
        { percent: 60, reps: 5 },
        { percent: 60, reps: 5 },
      ]),
    ).toBeUndefined();
  });

  it("makes ramps the preferences accept", () => {
    for (const steps of Object.values(EXPERIENCE_WARMUP_STEPS)) {
      expect(uiPreferencesPatchSchema.safeParse({ warmupSteps: steps }).success).toBe(true);
    }
  });
});

describe("where you train", () => {
  it("seeds the full gym kit for a gym and when nothing was answered", () => {
    expect(defaultGymKit("kg", "gym")).toEqual(defaultGymKit("kg"));
    expect(defaultGymKit("kg")).toHaveLength(13);
  });

  it("seeds the smaller home kit everywhere else, with no EZ or trap bar", () => {
    for (const place of ["home_barbell", "dumbbells", "bodyweight"] as const) {
      const kit = defaultGymKit("kg", place);
      expect(kit.filter((item) => item.kind === "bar").map((bar) => bar.weight_kg)).toEqual([
        20, 0,
      ]);
      expect(kit.some((item) => item.label !== null)).toBe(false);
      expect(kit.filter((item) => item.kind === "plate").map((plate) => plate.weight_kg)).toEqual([
        20, 15, 10, 5, 2.5, 1.25,
      ]);
    }
  });

  it("stores nominal pound sizes in kilograms and keeps the unit on the kit", () => {
    const kit = defaultGymKit("lb", "home_barbell");
    expect(kit.every((item) => item.unit === "lb")).toBe(true);
    expect(kit.map((item) => item.weight_kg)).toEqual(
      [45, 0, 45, 35, 25, 10, 5, 2.5].map((weight) => weight * KG_PER_LB),
    );
  });
});

describe("the answers are preferences", () => {
  it("are unanswered by default", () => {
    expect(DEFAULT_UI_PREFERENCES.trainingExperience).toBeNull();
    expect(DEFAULT_UI_PREFERENCES.trainingPlace).toBeNull();
  });

  it("loads known values and tolerates future answers without losing other settings", () => {
    expect(
      uiPreferencesSchema.parse({ trainingExperience: "some", trainingPlace: "dumbbells" }),
    ).toMatchObject({
      trainingExperience: "some",
      trainingPlace: "dumbbells",
    });
    const future = { trainingExperience: "advanced", trainingPlace: "beach", weightUnit: "lb" };
    expect(uiPreferencesSchema.parse(future)).toMatchObject({
      trainingExperience: null,
      trainingPlace: null,
      weightUnit: "lb",
    });
    expect(uiPreferencesPatchSchema.safeParse(future).success).toBe(false);
  });
});
