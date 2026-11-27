import type { ActiveSession } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { openSessionOf } from "./open-session-of";

const active = (id: string, workoutId: string | null) => ({ id, workoutId }) as ActiveSession;

describe("openSessionOf", () => {
  it("finds the open Session of the workout", () => {
    const sessions = [active("s1", "upper-b")];
    expect(openSessionOf(sessions, "upper-b")?.id).toBe("s1");
  });

  it("is undefined for another workout, an empty Session or no workout", () => {
    expect(openSessionOf([active("s1", "upper-b")], "lower-a")).toBeUndefined();
    expect(openSessionOf([active("s1", null)], "lower-a")).toBeUndefined();
    expect(openSessionOf([active("s1", "upper-b")], null)).toBeUndefined();
    expect(openSessionOf([], "upper-b")).toBeUndefined();
  });

  it("takes the newest of several (the list is newest first)", () => {
    const sessions = [active("new", "upper-b"), active("old", "upper-b")];
    expect(openSessionOf(sessions, "upper-b")?.id).toBe("new");
  });
});
