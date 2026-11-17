import { describe, expect, it } from "vitest";

import { catalogExerciseInput, EXERCISE_MEDIA_LIMITS, exerciseMediaProblem } from "./catalog";

describe("exercise media limits", () => {
  it("accepts a small JPEG or WebP thumbnail and an MP4 video", () => {
    expect(exerciseMediaProblem("thumbnail", { type: "image/jpeg", size: 1000 })).toBeNull();
    expect(exerciseMediaProblem("thumbnail", { type: "image/webp", size: 1000 })).toBeNull();
    expect(exerciseMediaProblem("video", { type: "video/mp4", size: 1000 })).toBeNull();
  });

  it("refuses the wrong type, an empty file and an oversized one", () => {
    expect(exerciseMediaProblem("thumbnail", { type: "image/png", size: 10 })).toBe("type");
    expect(exerciseMediaProblem("video", { type: "video/mp4", size: 0 })).toBe("empty");
    expect(
      exerciseMediaProblem("thumbnail", {
        type: "image/jpeg",
        size: EXERCISE_MEDIA_LIMITS.thumbnail.maxBytes + 1,
      }),
    ).toBe("size");
    expect(
      exerciseMediaProblem("video", {
        type: "video/mp4",
        size: EXERCISE_MEDIA_LIMITS.video.maxBytes + 1,
      }),
    ).toBe("size");
  });
});

describe("catalog exercise input", () => {
  const valid = {
    title: " Hip Thrust (Band) ",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings"],
    equipment: "resistance_band",
    exerciseType: "weight_reps",
    isFullBodyweight: false,
    aka: "",
    searchTerms: "bridge",
    instructions: null,
    rank: 3,
  };

  it("trims text and turns blank optional text into null", () => {
    const parsed = catalogExerciseInput.parse(valid);
    expect(parsed.title).toBe("Hip Thrust (Band)");
    expect(parsed.aka).toBeNull();
  });

  it("refuses the primary muscle among the secondary ones and unknown slugs", () => {
    expect(catalogExerciseInput.safeParse({ ...valid, secondaryMuscles: ["glutes"] }).success).toBe(
      false,
    );
    expect(catalogExerciseInput.safeParse({ ...valid, equipment: "spaceship" }).success).toBe(
      false,
    );
  });
});
