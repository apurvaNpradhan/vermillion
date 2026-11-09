import { describe, expect, it } from "vitest";

import { exerciseMediaUrl, thumbnailUrl, videoUrl } from "./media-url";

const base = "https://media.example.com";

describe("exercise media URLs", () => {
  it("joins the base and the key", () => {
    expect(exerciseMediaUrl(base, "thumbnails/abc.jpg")).toBe(
      "https://media.example.com/thumbnails/abc.jpg",
    );
  });

  it("tolerates trailing and leading slashes", () => {
    expect(exerciseMediaUrl(`${base}/`, "/thumbnails//abc.jpg")).toBe(
      "https://media.example.com/thumbnails/abc.jpg",
    );
  });

  it("encodes each segment but keeps the separators", () => {
    expect(exerciseMediaUrl(base, "thumbnails/Bench Press (flat)?.jpg")).toBe(
      "https://media.example.com/thumbnails/Bench%20Press%20(flat)%3F.jpg",
    );
    expect(exerciseMediaUrl(base, "a#b/c%d/é.png")).toBe(
      "https://media.example.com/a%23b/c%25d/%C3%A9.png",
    );
  });

  it("returns null for a missing or blank thumbnail key", () => {
    expect(thumbnailUrl(base, null)).toBeNull();
    expect(thumbnailUrl(base, " ")).toBeNull();
    expect(thumbnailUrl(base, "t/1.jpg")).toBe("https://media.example.com/t/1.jpg");
  });
});

describe("video URLs", () => {
  it("builds the URL of a key, and none for a missing or blank key", () => {
    expect(videoUrl(base, "videos/a b.mp4")).toBe("https://media.example.com/videos/a%20b.mp4");
    expect(videoUrl(base, null)).toBeNull();
    expect(videoUrl(base, "  ")).toBeNull();
  });
});
