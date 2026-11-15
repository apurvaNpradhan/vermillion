import { describe, expect, it } from "vitest";

import { plausibleCaptureDate, progressPhotoInput } from "../body";
import {
  daysSince,
  defaultCompareDates,
  filterByPose,
  groupPhotosByDate,
  latestOnOrBefore,
  latestPhoto,
  photoOnDate,
  poseDates,
  type PhotoLike,
} from "./photos";

const photo = (
  id: string,
  pose: PhotoLike["pose"],
  local_date: string,
  time = "12:00",
): PhotoLike => ({ id, pose, local_date, taken_at: `${local_date}T${time}:00Z` });

describe("progress photo selection", () => {
  const photos = [
    photo("a", "back", "2026-03-01"),
    photo("b", "front", "2026-03-01"),
    photo("c", "front", "2026-01-05"),
    photo("d", "side", "2026-03-01"),
    photo("e", "front", "2026-03-01", "18:00"),
  ];

  it("groups by date, newest first, and orders a day front, side, back", () => {
    const days = groupPhotosByDate(photos);
    expect(days.map((d) => d.date)).toEqual(["2026-03-01", "2026-01-05"]);
    expect(days[0]?.photos.map((p) => p.id)).toEqual(["b", "e", "d", "a"]);
    expect(groupPhotosByDate([])).toEqual([]);
  });

  it("filters by pose without touching the input", () => {
    expect(filterByPose(photos, "front").map((p) => p.id)).toEqual(["b", "c", "e"]);
    expect(filterByPose(photos, null)).toHaveLength(5);
    expect(photos).toHaveLength(5);
  });

  it("lists a pose's dates oldest first, each once", () => {
    expect(poseDates(photos, "front")).toEqual(["2026-01-05", "2026-03-01"]);
    expect(poseDates(photos, "side")).toEqual(["2026-03-01"]);
  });

  it("defaults Compare to the first and latest date, and needs two", () => {
    expect(defaultCompareDates(["2026-03-01", "2026-01-05", "2026-02-01"])).toEqual({
      before: "2026-01-05",
      after: "2026-03-01",
    });
    expect(defaultCompareDates(["2026-03-01"])).toEqual({ before: null, after: null });
    expect(defaultCompareDates(["2026-03-01", "2026-03-01"])).toEqual({
      before: null,
      after: null,
    });
    expect(defaultCompareDates([])).toEqual({ before: null, after: null });
  });

  it("takes the last retake of a pose on a date", () => {
    expect(photoOnDate(photos, "front", "2026-03-01")?.id).toBe("e");
    expect(photoOnDate(photos, "back", "2026-01-05")).toBeNull();
  });

  it("finds the latest photo by date then time", () => {
    expect(latestPhoto(photos)?.id).toBe("e");
    expect(latestPhoto([])).toBeNull();
  });

  it("counts whole days and never goes negative", () => {
    expect(daysSince("2026-03-01", "2026-03-04")).toBe(3);
    expect(daysSince("2026-03-04", "2026-03-04")).toBe(0);
    expect(daysSince("2026-03-05", "2026-03-04")).toBe(0);
    expect(daysSince("2026-02-27", "2026-03-01")).toBe(2);
  });

  it("uses the latest entry on or before a date", () => {
    const entries = [
      { local_date: "2026-01-01", measured_at: "2026-01-01T08:00:00Z", value: 90 },
      { local_date: "2026-02-01", measured_at: "2026-02-01T08:00:00Z", value: 88 },
      { local_date: "2026-02-01", measured_at: "2026-02-01T20:00:00Z", value: 87 },
    ];
    expect(latestOnOrBefore(entries, "2026-02-01")?.value).toBe(87);
    expect(latestOnOrBefore(entries, "2026-01-31")?.value).toBe(90);
    expect(latestOnOrBefore(entries, "2025-12-31")).toBeNull();
  });
});

describe("progress photo input", () => {
  const now = Date.parse("2026-03-10T12:00:00Z");
  it("accepts a plausible capture and refuses the future and old dates", () => {
    expect(plausibleCaptureDate("2026-03-10T08:00:00Z", "2026-03-10", now)).toBe(true);
    expect(plausibleCaptureDate("2026-03-11T08:00:00Z", "2026-03-11", now)).toBe(false);
    expect(plausibleCaptureDate("2010-03-10T08:00:00Z", "2010-03-10", now)).toBe(false);
    expect(plausibleCaptureDate("2026-03-10T08:00:00Z", "2026-03-20", now)).toBe(false);
  });

  it("is strict about its fields and poses", () => {
    const base = {
      media_id: "0198f0a0-0000-7000-8000-000000000001",
      pose: "front",
      local_date: "2026-01-01",
      taken_at: "2026-01-01T08:00:00Z",
    };
    expect(progressPhotoInput.safeParse(base).success).toBe(true);
    expect(progressPhotoInput.safeParse({ ...base, pose: "top" }).success).toBe(false);
    expect(progressPhotoInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(progressPhotoInput.safeParse({ ...base, media_id: "nope" }).success).toBe(false);
  });
});
