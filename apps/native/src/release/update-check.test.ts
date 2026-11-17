import { describe, expect, it } from "vitest";

import {
  CHECK_INTERVAL_MS,
  isCheckDue,
  parseStoredCheck,
  recordAnswer,
  serializeCheck,
  updateView,
} from "./update-check";

const latest = (version: string) => ({
  version,
  url: "https://example.com/app.apk",
  publishedAt: "2026-11-17T00:00:00Z",
});

describe("update check", () => {
  it("asks at most once an hour", () => {
    const stored = recordAnswer(null, { minimumVersion: null, latest: null }, 1_000);
    expect(isCheckDue(null, 0)).toBe(true);
    expect(isCheckDue(stored, 1_000 + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(isCheckDue(stored, 1_000 + CHECK_INTERVAL_MS)).toBe(true);
  });

  it("round-trips the stored answer and ignores a corrupt one", () => {
    const stored = recordAnswer(null, { minimumVersion: "1.0.0", latest: latest("1.1.0") }, 5);
    expect(parseStoredCheck(serializeCheck(stored))).toEqual(stored);
    expect(parseStoredCheck("{not json")).toBeNull();
    expect(parseStoredCheck(JSON.stringify({ checkedAt: "x" }))).toBeNull();
    expect(parseStoredCheck(null)).toBeNull();
  });

  it("blocks below the minimum and offers below the latest", () => {
    const stored = recordAnswer(null, { minimumVersion: "1.1.0", latest: latest("1.2.0") }, 0);
    expect(updateView("1.0.0", stored)).toEqual({ kind: "required", minimumVersion: "1.1.0" });
    expect(updateView("1.1.0", stored)).toEqual({ kind: "available", version: "1.2.0" });
    expect(updateView("1.2.0", stored)).toEqual({ kind: "none" });
  });

  it("shows nothing without a known answer, and keeps a dismissal per version", () => {
    expect(updateView("0.1.0", null)).toEqual({ kind: "none" });
    const stored = {
      ...recordAnswer(null, { minimumVersion: null, latest: latest("1.2.0") }, 0),
      dismissed: "1.2.0",
    };
    expect(updateView("1.0.0", stored)).toEqual({ kind: "none" });
    const newer = recordAnswer(stored, { minimumVersion: null, latest: latest("1.3.0") }, 1);
    expect(newer.dismissed).toBe("1.2.0");
    expect(updateView("1.0.0", newer)).toEqual({ kind: "available", version: "1.3.0" });
  });
});
