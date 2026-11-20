import { describe, expect, it } from "vitest";

import { workoutIdFromParam } from "./widget-start";

describe("workoutIdFromParam", () => {
  it("accepts a workout id", () => {
    const id = "0192f0a0-0000-7000-8000-000000000001";
    expect(workoutIdFromParam(id)).toBe(id);
  });

  it("rejects a missing, empty, repeated or malformed id", () => {
    expect(workoutIdFromParam(undefined)).toBeNull();
    expect(workoutIdFromParam("")).toBeNull();
    expect(workoutIdFromParam("w 1")).toBeNull();
    expect(workoutIdFromParam(["0192f0a0-0000-7000-8000-000000000001"])).toBeNull();
  });
});
