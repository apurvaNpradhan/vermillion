import { describe, expect, it } from "vitest";

import { clockTime, padCount, progressStyle } from "./timer-progress";

describe("progressStyle", () => {
  it("collapses from squares to segments to a bar as sets grow", () => {
    expect(progressStyle(0)).toBe("squares");
    expect(progressStyle(16)).toBe("squares");
    expect(progressStyle(17)).toBe("segments");
    expect(progressStyle(60)).toBe("segments");
    expect(progressStyle(61)).toBe("bar");
  });
});

describe("padCount", () => {
  it("pads to two digits and never goes negative", () => {
    expect(padCount(3)).toBe("03");
    expect(padCount(12)).toBe("12");
    expect(padCount(123)).toBe("123");
    expect(padCount(-1)).toBe("00");
  });
});

describe("clockTime", () => {
  it("formats in the given time zone", () => {
    const ms = Date.parse("2026-01-01T14:02:05Z");
    expect(clockTime(ms, "en-GB", "UTC")).toBe("14:02:05");
    expect(clockTime(ms, "en-GB", "Asia/Kolkata")).toBe("19:32:05");
  });
});
