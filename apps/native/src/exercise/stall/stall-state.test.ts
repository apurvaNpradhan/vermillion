import { describe, expect, it } from "vitest";

import { readStallMemory, writeStallMemory } from "./stall-state";

describe("stall memory", () => {
  it("is empty without a stored value, a Session or valid JSON", () => {
    const none = { dismissed: false, applied: false };
    expect(readStallMemory(null, "s1")).toEqual(none);
    expect(readStallMemory(writeStallMemory(null, "s1", { dismissed: true }), null)).toEqual(none);
    expect(readStallMemory("{nope", "s1")).toEqual(none);
    expect(readStallMemory('{"sessionId":1}', "s1")).toEqual(none);
  });

  it("remembers a dismissal and an applied deload for the same last Session", () => {
    const dismissed = writeStallMemory(null, "s1", { dismissed: true });
    expect(readStallMemory(dismissed, "s1")).toEqual({ dismissed: true, applied: false });
    const both = writeStallMemory(dismissed, "s1", { applied: true });
    expect(readStallMemory(both, "s1")).toEqual({ dismissed: true, applied: true });
    expect(readStallMemory(writeStallMemory(both, "s1", { applied: false }), "s1")).toEqual({
      dismissed: true,
      applied: false,
    });
  });

  it("forgets everything once the exercise has a newer Session", () => {
    const stored = writeStallMemory(null, "s1", { dismissed: true, applied: true });
    expect(readStallMemory(stored, "s2")).toEqual({ dismissed: false, applied: false });
    expect(readStallMemory(writeStallMemory(stored, "s2", { applied: true }), "s2")).toEqual({
      dismissed: false,
      applied: true,
    });
  });
});
