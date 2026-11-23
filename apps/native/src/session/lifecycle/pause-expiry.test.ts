import { PAUSE_AUTO_RESUME_MS } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { expiredPauses } from "./pause-expiry";

const T0 = Date.parse("2026-01-01T10:00:00.000Z");
const paused = (id: string, offsetMs: number, deviceId = "me") => ({
  id,
  deviceId,
  pausedAt: new Date(T0 + offsetMs).toISOString(),
});

describe("expiredPauses", () => {
  it("lists a pause that reached four hours, resumed where it ran out", () => {
    const now = T0 + PAUSE_AUTO_RESUME_MS + 90 * 60_000;
    expect(expiredPauses([paused("a", 0)], now, "me")).toEqual([
      { id: "a", resumeAt: T0 + PAUSE_AUTO_RESUME_MS },
    ]);
  });
  it("leaves a shorter pause, a running Session and another device's Session", () => {
    const now = T0 + PAUSE_AUTO_RESUME_MS - 1;
    expect(
      expiredPauses(
        [
          paused("a", 0),
          { id: "b", deviceId: "me", pausedAt: null },
          paused("c", -PAUSE_AUTO_RESUME_MS * 2, "other"),
        ],
        now,
        "me",
      ),
    ).toEqual([]);
  });
});
