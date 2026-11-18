import { MUSCLE_GROUPS, type MuscleRow } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { RADAR_AXES, muscleRadarAxes, radarAxisOf } from "./muscle-axes";

describe("radarAxisOf", () => {
  it("maps the targeted muscles onto the six axes", () => {
    expect(radarAxisOf("chest")).toBe("push");
    expect(radarAxisOf("lats")).toBe("pull");
    expect(radarAxisOf("upper_back")).toBe("pull");
    expect(radarAxisOf("quadriceps")).toBe("legs");
    expect(radarAxisOf("glutes")).toBe("legs");
    expect(radarAxisOf("abdominals")).toBe("core");
    expect(radarAxisOf("shoulders")).toBe("shoulders");
    expect(radarAxisOf("biceps")).toBe("arms");
    expect(radarAxisOf("triceps")).toBe("arms");
  });
  it("leaves muscles that are not training a part of the body out", () => {
    for (const muscle of ["cardio", "full_body", "other", "neck"] as const) {
      expect(radarAxisOf(muscle)).toBeNull();
    }
  });
  it("only ever returns a known axis", () => {
    for (const muscle of MUSCLE_GROUPS) {
      const axis = radarAxisOf(muscle);
      if (axis !== null) expect(RADAR_AXES).toContain(axis);
    }
  });
});

describe("muscleRadarAxes", () => {
  const row = (muscle: MuscleRow["muscle"], min: number | null): MuscleRow => ({
    muscle,
    sets: 0,
    range: min === null ? null : { min, max: min * 2 },
    status: null,
  });

  it("always lists the six axes in order", () => {
    expect(muscleRadarAxes([], []).map((axis) => axis.key)).toEqual([...RADAR_AXES]);
  });
  it("adds up the sets of every muscle on an axis", () => {
    const axes = muscleRadarAxes(
      [
        { muscle: "biceps", sets: 4 },
        { muscle: "triceps", sets: 5.5 },
        { muscle: "forearms", sets: 1 },
        { muscle: "cardio", sets: 9 },
      ],
      [],
    );
    expect(axes.find((axis) => axis.key === "arms")?.sets).toBe(10.5);
    expect(axes.reduce((sum, axis) => sum + axis.sets, 0)).toBe(10.5);
  });
  it("has no target without a range", () => {
    expect(muscleRadarAxes([], [row("chest", null)]).every((axis) => axis.target === null)).toBe(
      true,
    );
  });
  it("sums the minimums of the targeted muscles on an axis", () => {
    const axes = muscleRadarAxes([], [row("biceps", 6), row("triceps", 8), row("chest", 10)]);
    expect(axes.find((axis) => axis.key === "arms")?.target).toBe(14);
    expect(axes.find((axis) => axis.key === "push")?.target).toBe(10);
    expect(axes.find((axis) => axis.key === "legs")?.target).toBeNull();
  });
  it("turns a total over several weeks into a weekly average", () => {
    const axes = muscleRadarAxes([{ muscle: "chest", sets: 24 }], [], 4);
    expect(axes.find((axis) => axis.key === "push")?.sets).toBe(6);
  });
});
