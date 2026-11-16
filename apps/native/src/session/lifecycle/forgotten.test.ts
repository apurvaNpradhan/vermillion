import { describe, expect, it } from "vitest";

import { FORGOTTEN_AFTER_MS, finishTimeOf, forgottenSession } from "./forgotten";

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-01-01T20:00:00.000Z");
const session = (
  id: string,
  lastTickedAt: string | null,
  startedAt = "2026-01-01T08:00:00.000Z",
) => ({
  id,
  lastTickedAt,
  startedAt,
  restEndsAt: null,
});

describe("forgottenSession", () => {
  it("is a Session whose last tick is more than 3 hours old", () => {
    expect(FORGOTTEN_AFTER_MS).toBe(3 * HOUR);
    expect(forgottenSession([session("a", "2026-01-01T16:59:59.000Z")], now)?.id).toBe("a");
    expect(forgottenSession([session("a", "2026-01-01T17:00:01.000Z")], now)).toBeNull();
    expect(forgottenSession([session("a", "2026-01-01T17:00:00.000Z")], now)).toBeNull();
  });

  it("uses the start when nothing was ticked, and picks the oldest", () => {
    expect(forgottenSession([session("a", null, "2026-01-01T19:00:00.000Z")], now)).toBeNull();
    expect(forgottenSession([session("a", null, "2026-01-01T10:00:00.000Z")], now)?.id).toBe("a");
    const list = [
      session("new", "2026-01-01T12:00:00.000Z"),
      session("old", "2026-01-01T09:00:00.000Z"),
    ];
    expect(forgottenSession(list, now)?.id).toBe("old");
    expect(forgottenSession([], now)).toBeNull();
  });

  it("asks again only 3 hours after the user chose to keep going", () => {
    const list = [session("a", "2026-01-01T09:00:00.000Z")];
    const snoozed = new Map([["a", now - HOUR]]);
    expect(forgottenSession(list, now, snoozed)).toBeNull();
    expect(forgottenSession(list, now + 2 * HOUR + 1, snoozed)?.id).toBe("a");
  });
});

describe("finishTimeOf", () => {
  it("is the last tick plus the rest it started, else the last tick, else the start", () => {
    expect(
      finishTimeOf({
        lastTickedAt: "2026-01-01T10:00:00.000Z",
        startedAt: "2026-01-01T09:00:00.000Z",
        restEndsAt: "2026-01-01T10:02:00.000Z",
      }),
    ).toBe("2026-01-01T10:02:00.000Z");
    expect(
      finishTimeOf({
        lastTickedAt: "2026-01-01T10:00:00.000Z",
        startedAt: "2026-01-01T09:00:00.000Z",
        restEndsAt: null,
      }),
    ).toBe("2026-01-01T10:00:00.000Z");
    expect(
      finishTimeOf({
        lastTickedAt: null,
        startedAt: "2026-01-01T09:00:00.000Z",
        restEndsAt: "2026-01-01T09:30:00.000Z",
      }),
    ).toBe("2026-01-01T09:00:00.000Z");
    // A rest that ended before the tick is stale and ignored.
    expect(
      finishTimeOf({
        lastTickedAt: "2026-01-01T10:00:00.000Z",
        startedAt: "2026-01-01T09:00:00.000Z",
        restEndsAt: "2026-01-01T09:50:00.000Z",
      }),
    ).toBe("2026-01-01T10:00:00.000Z");
  });
});
