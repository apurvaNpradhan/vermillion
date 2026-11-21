import { describe, expect, it } from "vitest";

import { DEFAULT_UI_PREFERENCES, uiPreferencesSchema } from "../../preferences";
import { DEFAULT_WARMUP_STEPS } from "../logging/warmup-ramp";
import { defaultGymKit } from "../plates/gym-kit";
import { EXPERIENCE_WARMUP_STEPS, experienceDefaults, kitFor } from "./profile";

const preset = (steps: readonly { percent: number; reps: number }[]) =>
  steps.map((step) => ({ ...step }));

describe("experience defaults", () => {
  it("gives each experience its own warm-up ramp and records the answer", () => {
    const fresh = { warmupSteps: DEFAULT_WARMUP_STEPS };
    expect(experienceDefaults("new", fresh)).toEqual({
      trainingExperience: "new",
      warmupSteps: preset(EXPERIENCE_WARMUP_STEPS.new),
    });
    expect(experienceDefaults("some", fresh).warmupSteps).toEqual(preset(DEFAULT_WARMUP_STEPS));
    expect(experienceDefaults("experienced", fresh).warmupSteps).toHaveLength(4);
  });

  it("moves between presets, so a later answer replaces an earlier one", () => {
    const afterNew = { warmupSteps: EXPERIENCE_WARMUP_STEPS.new };
    expect(experienceDefaults("experienced", afterNew).warmupSteps).toEqual(
      preset(EXPERIENCE_WARMUP_STEPS.experienced),
    );
  });

  it("keeps a ramp the person edited and only records the answer", () => {
    const edited = { warmupSteps: [{ percent: 40, reps: 8 }] };
    expect(experienceDefaults("new", edited)).toEqual({ trainingExperience: "new" });
  });

  it("never sets the progression increment", () => {
    for (const experience of ["new", "some", "experienced"] as const) {
      expect(experienceDefaults(experience, DEFAULT_UI_PREFERENCES)).not.toHaveProperty(
        "weightIncrementKg",
      );
    }
  });

  it("makes ramps the preferences accept", () => {
    for (const experience of ["new", "some", "experienced"] as const) {
      const patch = experienceDefaults(experience, DEFAULT_UI_PREFERENCES);
      expect(uiPreferencesSchema.safeParse(patch).success).toBe(true);
    }
  });
});

describe("where you train", () => {
  it("seeds the full gym kit for a gym and when nothing was answered", () => {
    expect(kitFor("gym")).toBe("gym");
    expect(kitFor(null)).toBe("gym");
    expect(defaultGymKit("kg", "gym")).toEqual(defaultGymKit("kg"));
  });

  it("seeds the smaller home kit everywhere else, with no EZ or trap bar", () => {
    for (const place of ["home_barbell", "dumbbells", "bodyweight"] as const) {
      expect(kitFor(place)).toBe("home");
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

  it("keeps the unit on a home kit", () => {
    expect(defaultGymKit("lb", "home_barbell").every((item) => item.unit === "lb")).toBe(true);
  });
});

describe("the answers are preferences", () => {
  it("are unanswered by default", () => {
    expect(DEFAULT_UI_PREFERENCES.trainingExperience).toBeNull();
    expect(DEFAULT_UI_PREFERENCES.trainingPlace).toBeNull();
  });

  it("read back what was stored and reject anything else", () => {
    expect(
      uiPreferencesSchema.parse({ trainingExperience: "some", trainingPlace: "dumbbells" }),
    ).toMatchObject({ trainingExperience: "some", trainingPlace: "dumbbells" });
    expect(uiPreferencesSchema.safeParse({ trainingPlace: "beach" }).success).toBe(false);
  });
});
