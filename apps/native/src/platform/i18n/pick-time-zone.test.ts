import { describe, expect, it } from "vitest";

import { pickTimeZone } from "./pick-time-zone";

describe("pickTimeZone", () => {
  it("uses the zone the phone's calendar reports", () => {
    expect(pickTimeZone("Asia/Kolkata", "UTC")).toBe("Asia/Kolkata");
  });
  it("falls back to the engine's zone, then UTC", () => {
    expect(pickTimeZone(null, "Europe/Berlin")).toBe("Europe/Berlin");
    expect(pickTimeZone(undefined, "Europe/Berlin")).toBe("Europe/Berlin");
    expect(pickTimeZone(" ", "")).toBe("UTC");
    expect(pickTimeZone("GMT+05:30", "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(pickTimeZone(null, "invalid")).toBe("UTC");
  });
});
