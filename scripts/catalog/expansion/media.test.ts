import { describe, expect, it } from "vitest";

import { EXERCISE_MEDIA_LIMITS } from "../../../packages/shared/src/exercise/catalog.ts";

import {
  baseName,
  encodeKey,
  keysFor,
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  mediumSourceKey,
  planRow,
  thumbnailKey,
  videoFits,
} from "./media.ts";

const SMALL = "static/exercises/png/24761101-3-4-Sit-up-(female)_Waist_small.png";
const MP4 = "static/exercises/mp4/24761201-3-4-Sit-up-(female)_Waist.mp4";

describe("key mapping", () => {
  it("uses the source base name", () => {
    expect(baseName(SMALL)).toBe("24761101-3-4-Sit-up-(female)_Waist_small");
    expect(thumbnailKey(SMALL)).toBe(
      "exercises/v2/thumbnails/24761101-3-4-Sit-up-(female)_Waist_small.webp",
    );
  });

  it("encodes path segments for URLs", () => {
    expect(encodeKey("exercises/v2/a b/(x)@3x.webp")).toBe("exercises/v2/a%20b/(x)%403x.webp");
  });

  it("finds the medium PNG only next to a small one", () => {
    expect(mediumSourceKey(SMALL)).toBe(
      "static/exercises/png/24761101-3-4-Sit-up-(female)_Waist_medium.png",
    );
    expect(mediumSourceKey("static/exercises/png/x_GREEN.png")).toBeNull();
  });
});

describe("planRow", () => {
  it("makes a thumbnail and a video for a row with a video, never a medium image", () => {
    const plan = planRow({ id: "a", imageKey: SMALL, videoKey: MP4 });
    expect(plan.problem).toBeNull();
    expect(plan.tasks.map((t) => [t.kind, t.dest])).toEqual([
      ["thumbnail", "exercises/v2/thumbnails/24761101-3-4-Sit-up-(female)_Waist_small.webp"],
      ["video", "exercises/v2/videos/24761201-3-4-Sit-up-(female)_Waist.mp4"],
    ]);
  });

  it("adds the medium image for a row without a video", () => {
    const plan = planRow({ id: "a", imageKey: SMALL, videoKey: null });
    expect(plan.tasks.map((t) => t.kind)).toEqual(["thumbnail", "image"]);
    expect(plan.tasks[1]?.source).toBe(
      "static/exercises/png/24761101-3-4-Sit-up-(female)_Waist_medium.png",
    );
    expect(plan.tasks[1]?.dest).toBe(
      "exercises/v2/images/24761101-3-4-Sit-up-(female)_Waist_medium.webp",
    );
  });

  it("reports rows with nothing to convert", () => {
    expect(planRow({ id: "a", imageKey: null, videoKey: MP4 }).problem).toBe("no source image");
    expect(planRow({ id: "a", imageKey: "x/y_GREEN.png", videoKey: null }).problem).toBe(
      "no video and no medium image",
    );
  });
});

describe("keysFor", () => {
  it("collects the destination keys of finished tasks", () => {
    const plan = planRow({ id: "a", imageKey: SMALL, videoKey: null });
    expect(keysFor(plan.tasks)).toMatchObject({ video_key: null, image_key: expect.any(String) });
    expect(keysFor(plan.tasks.slice(0, 1))).toEqual({
      thumbnail_key: plan.tasks[0]?.dest,
      video_key: null,
    });
  });
});

describe("videoFits", () => {
  it("accepts up to 10 MB", () => {
    expect(videoFits(10 * 1024 * 1024)).toBe(true);
    expect(videoFits(10 * 1024 * 1024 + 1)).toBe(false);
    expect(videoFits(0)).toBe(false);
  });
});

describe("limits", () => {
  it("match the shared slot limits", () => {
    expect(MAX_THUMBNAIL_BYTES).toBe(EXERCISE_MEDIA_LIMITS.thumbnail.maxBytes);
    expect(MAX_VIDEO_BYTES).toBe(EXERCISE_MEDIA_LIMITS.video.maxBytes);
  });
});
