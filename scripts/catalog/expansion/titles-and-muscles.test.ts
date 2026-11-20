import { describe, expect, it } from "vitest";

import { movementId, parseDataset } from "./dataset.ts";
import {
  capSecondaries,
  distinctMuscleCount,
  dropsRotatorCuff,
  mapMuscles,
  pickPrimaryGroup,
} from "./muscles.ts";
import {
  isNotTraining,
  mapEquipment,
  mapType,
  normalizeTitle,
  stripNoise,
  suggestAka,
  suggestTitle,
  titleCase,
  titleSimilarity,
} from "./titles.ts";

describe("movementId", () => {
  it("takes the first four digits of the media file name", () => {
    expect(movementId("static/exercises/mp4/00251201-Barbell-Bench-Press_Chest-FIX2_.mp4")).toBe(
      "0025",
    );
    expect(movementId("exercises/v1/exercise-assets/00851201-Barbell-Romanian.mp4")).toBe("0085");
  });
  it("is null without a key or a leading id", () => {
    expect(movementId(null)).toBeNull();
    expect(movementId("static/exercises/mp4/notes.mp4")).toBeNull();
  });
});

describe("parseDataset", () => {
  const files = {
    muscles: JSON.stringify([
      { id: "m1", name: "DELTOID_LATERAL" },
      { id: "m2", name: "TRICEPS_BRACHII" },
    ]),
    equipment: JSON.stringify([{ id: "e1", name: "Dumbbell" }]),
    bodyParts: JSON.stringify([{ id: "b1", name: "Shoulders" }]),
    exercises: `${JSON.stringify({
      id: "x1",
      name: "Lateral Raise",
      exercise_type: "weight_reps",
      image_key: null,
      video_key: "static/00331201-Dumbbell-Lateral-Raise.mp4",
      body_part_ids: ["b1"],
      equipment_ids: ["e1"],
      primary_muscle_ids: ["m1"],
      secondary_muscle_ids: ["m2"],
      extra: "ignored",
    })}\n`,
  };

  it("resolves ids to names", () => {
    expect(parseDataset(files)).toEqual([
      {
        id: "x1",
        name: "Lateral Raise",
        type: "weight_reps",
        videoKey: "static/00331201-Dumbbell-Lateral-Raise.mp4",
        imageKey: null,
        bodyParts: ["Shoulders"],
        equipment: ["Dumbbell"],
        primary: ["DELTOID_LATERAL"],
        secondary: ["TRICEPS_BRACHII"],
      },
    ]);
  });
  it("refuses an unknown muscle, id or malformed line", () => {
    expect(() =>
      parseDataset({ ...files, muscles: JSON.stringify([{ id: "m1", name: "X" }]) }),
    ).toThrow();
    expect(() => parseDataset({ ...files, equipment: "[]" })).toThrow(/unknown equipment/);
    expect(() => parseDataset({ ...files, exercises: "{nope" })).toThrow(/not valid JSON/);
  });
});

describe("muscle mapping", () => {
  it("maps heads, fibres and cuff muscles to details and the rest to groups", () => {
    expect(mapMuscles(["PECTORALIS_MAJOR_CLAVICULAR_HEAD", "DELTOID_POSTERIOR"])).toEqual({
      groups: ["chest", "shoulders"],
      details: ["upper_chest", "rear_delts"],
    });
    expect(mapMuscles(["TRAPEZIUS_UPPER_FIBERS", "TRAPEZIUS_LOWER_FIBERS"])).toEqual({
      groups: ["traps", "upper_back"],
      details: ["lower_traps"],
    });
    expect(mapMuscles(["INFRASPINATUS", "TERES_MINOR", "SUBSCAPULARIS"]).details).toEqual([
      "rotator_cuff",
    ]);
    expect(mapMuscles(["SARTORIUS", "POPLITEUS", "ILIOPSOAS"])).toEqual({
      groups: ["calves", "quadriceps"],
      details: ["hip_flexors"],
    });
  });
  it("counts distinct muscles, merging the two glute and the cuff muscles", () => {
    expect(distinctMuscleCount(["GLUTEUS_MEDIUS", "GLUTEUS_MINIMUS", "QUADRICEPS"])).toBe(2);
  });
  it("picks the primary group legs first, then back, chest, shoulders, arms, core", () => {
    expect(pickPrimaryGroup(["chest", "quadriceps", "abdominals"])).toBe("quadriceps");
    expect(pickPrimaryGroup(["triceps", "shoulders", "chest"])).toBe("chest");
    expect(pickPrimaryGroup(["abdominals", "biceps"])).toBe("biceps");
    expect(pickPrimaryGroup([])).toBeNull();
  });
  it("caps secondaries at five, other primaries first", () => {
    const all = ["abdominals", "biceps", "calves", "chest", "glutes", "lats", "triceps"] as const;
    const result = capSecondaries(["glutes", "chest"], all, "chest");
    expect(result).toHaveLength(5);
    expect(result).toContain("glutes");
    expect(result).not.toContain("chest");
  });
  it("drops a secondary rotator cuff on compound presses, pulls and rows only", () => {
    expect(dropsRotatorCuff("Incline Bench Press (Barbell)")).toBe(true);
    expect(dropsRotatorCuff("Seated Cable Row")).toBe(true);
    expect(dropsRotatorCuff("Cable External Rotation")).toBe(false);
    expect(dropsRotatorCuff("Face Pull")).toBe(false);
    expect(dropsRotatorCuff("Lateral Raise")).toBe(false);
  });
});

describe("title cleaning", () => {
  it("strips gender, version and spacing", () => {
    expect(stripNoise("Bicycle  Crunch (male)")).toBe("Bicycle Crunch");
    expect(stripNoise("Lever Seated Calf Press (VERSION 2) (male)")).toBe(
      "Lever Seated Calf Press",
    );
    expect(normalizeTitle("Dumbbell Pullover (VERSION 2)")).toBe("dumbbell pullover");
  });
  it("title-cases with small words lower and hyphen parts capitalised", () => {
    expect(titleCase("standing push-up on the bench")).toBe("Standing Push-Up on the Bench");
    expect(titleCase("EZ bar curl")).toBe("EZ Bar Curl");
  });
  it("moves the equipment word from the front to a suffix", () => {
    expect(suggestTitle("Cable Seated Face Pull (with rope) (male)", ["Cable"])).toBe(
      "Seated Face Pull (With Rope) (Cable)",
    );
    expect(suggestTitle("Lever Triceps Extension (VERSION 2)", ["Leverage machine"])).toBe(
      "Triceps Extension (Machine)",
    );
    expect(suggestTitle("Bench Press", ["Barbell"])).toBe("Bench Press (Barbell)");
    expect(suggestTitle("Smith Wide Shrug", ["Smith machine"])).toBe("Wide Shrug (Smith Machine)");
    expect(suggestTitle("Weighted Sit Up", ["Weighted"])).toBe("Sit Up (Weighted)");
  });
  it("adds no suffix for body weight and uses the old name for other kit", () => {
    expect(suggestTitle("Deep Push Up", ["Body weight"])).toBe("Deep Push Up");
    expect(suggestTitle("Seated Twist", ["Stability ball"])).toBe("Seated Twist (Stability Ball)");
  });
  it("proposes aka only when the source differs a lot", () => {
    expect(suggestAka("Dumbbell Pullover", "Pullover (Dumbbell)")).toBeNull();
    expect(suggestAka("Skullcrusher Thing", "Lying Triceps Extension (Barbell)")).toBe(
      "Skullcrusher Thing",
    );
  });
  it("scores similarity without equipment words", () => {
    expect(titleSimilarity("Pendulum Squat (Machine)", "Lever Pendulum Squat (plate loaded)")).toBe(
      1,
    );
    expect(titleSimilarity("Hammer Curl (Cable)", "Cable Hammer Grip Curl")).toBeCloseTo(0.67, 1);
    expect(titleSimilarity("Torso Rotation", "Barbell One Arm Floor Press")).toBe(0);
  });
  it("rejects stretches, yoga, rolling, warm-ups and vibration", () => {
    for (const title of [
      "Hamstring Stretch",
      "Downward Dog Pose",
      "Pilates Hundred",
      "Rolling on Foam Roller",
      "Back Massage",
      "Dynamic Warm Up",
      "Vibrate Plate Squat",
    ]) {
      expect(isNotTraining(title)).toBe(true);
    }
    expect(isNotTraining("Romanian Deadlift")).toBe(false);
  });
});

describe("equipment and type mapping", () => {
  it("maps 28 kinds to 13", () => {
    const cases: [string[], string][] = [
      [["Leverage machine"], "machine"],
      [["Sled machine"], "machine"],
      [["Assisted"], "machine"],
      [["Smith machine"], "smith_machine"],
      [["Cable"], "cable"],
      [["Rope"], "cable"],
      [["Olympic barbell"], "barbell"],
      [["EZ Barbell"], "ez_bar"],
      [["Trap bar"], "trap_bar"],
      [["Body weight"], "none"],
      [["Resistance Band"], "resistance_band"],
      [["Weighted"], "plate"],
      [["Bosu ball"], "other"],
      [["Stability ball", "Dumbbell"], "dumbbell"],
      [["Bosu ball", "Body weight"], "other"],
    ];
    for (const [names, expected] of cases) expect(mapEquipment(names)).toBe(expected);
  });
  it("maps types from the old type, equipment and title", () => {
    expect(mapType("weight_reps", ["Body weight"], "Push Up")).toEqual({
      type: "bodyweight_reps",
      guessed: false,
    });
    expect(mapType("weight_reps", ["Assisted"], "Pull Up").type).toBe("bodyweight_assisted_reps");
    expect(mapType("weight_reps", ["Weighted"], "Dip").type).toBe("bodyweight_weighted_reps");
    expect(mapType("weight_reps", ["Band"], "Pull Apart")).toEqual({
      type: "reps_only",
      guessed: true,
    });
    expect(mapType("weight_reps", ["Sled machine"], "Sled Push")).toEqual({
      type: "short_distance_weight",
      guessed: true,
    });
    expect(mapType("weight_reps", ["Dumbbell"], "Curl").type).toBe("weight_reps");
    expect(mapType("duration", ["Body weight"], "Plank").type).toBe("duration");
    expect(mapType("distance_duration", ["Body weight"], "Run").type).toBe("distance_duration");
  });
});
