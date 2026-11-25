import { expect, it } from "vitest";

import { readStallMemory } from "./stall-state";

it("only honors a manual dismissal for the same baseline Session", () => {
  const stored =
    '{"sessionId":"s1","dismissed":true,"applied":true,"dismissedUntil":9999999999999}';
  expect(readStallMemory(stored, "s1")).toEqual({ dismissed: true });
  expect(readStallMemory(stored, "s2")).toEqual({ dismissed: false });
  expect(readStallMemory(null, "s1")).toEqual({ dismissed: false });
  expect(readStallMemory("{nope", "s1")).toEqual({ dismissed: false });
});
