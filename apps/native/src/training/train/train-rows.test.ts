import { describe, expect, it } from "vitest";

import { trainRows, type TrainRow } from "./train-rows";

const workouts = [{ id: "c" }, { id: "b" }, { id: "a" }, { id: "d" }];
const label = (row: TrainRow<{ id: string }>) =>
  row.kind === "workout" ? row.workout.id : row.kind === "program" ? `[${row.title}]` : "[other]";

describe("trainRows", () => {
  it("lists every Workout without headings when there are no Programs", () => {
    const rows = trainRows({ workouts, programs: [], activeProgramId: null });
    expect(rows.map(label)).toEqual(["c", "b", "a", "d"]);
    expect(rows.every((row) => row.kind === "workout" && !row.owned)).toBe(true);
  });

  it("groups Workouts under their Program, the active one first, then the rest", () => {
    const rows = trainRows({
      workouts,
      programs: [
        { id: "p1", title: "Upper Lower", workoutIds: ["c"] },
        { id: "p2", title: "PPL", workoutIds: ["a", null, "b", "a"] },
      ],
      activeProgramId: "p2",
    });
    expect(rows.map(label)).toEqual(["[PPL]", "a", "b", "[Upper Lower]", "c", "[other]", "d"]);
    expect(rows.flatMap((row) => (row.kind === "program" ? [row.active] : []))).toEqual([
      true,
      false,
    ]);
    expect(rows.flatMap((row) => (row.kind === "workout" ? [row.owned] : []))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("skips Programs with no Workouts and omits the other heading when nothing is left", () => {
    const rows = trainRows({
      workouts: [{ id: "a" }],
      programs: [
        { id: "p1", title: "Empty", workoutIds: [null, "gone"] },
        { id: "p2", title: "PPL", workoutIds: ["a"] },
      ],
      activeProgramId: null,
    });
    expect(rows.map(label)).toEqual(["[PPL]", "a"]);
  });

  it("gives a Workout shared by two Programs a distinct key in each", () => {
    const rows = trainRows({
      workouts: [{ id: "a" }],
      programs: [
        { id: "p1", title: "One", workoutIds: ["a"] },
        { id: "p2", title: "Two", workoutIds: ["a"] },
      ],
      activeProgramId: null,
    });
    const keys = rows.flatMap((row) => (row.kind === "workout" ? [row.key] : []));
    expect(new Set(keys).size).toBe(2);
  });
});
