import { describe, expect, it } from "vitest";

import { trainList, trainRows, type TrainListItem, type TrainRow } from "./train-rows";

const workouts = [{ id: "c" }, { id: "b" }, { id: "a" }, { id: "d" }];
const label = (row: TrainRow<{ id: string }> | TrainListItem<{ id: string }>) =>
  row.kind === "workout"
    ? row.workout.id
    : row.kind === "program"
      ? `[${row.title}]`
      : row.kind === "more"
        ? `[more ${row.count}${row.expanded ? " open" : ""}]`
        : "[other]";

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

describe("trainList", () => {
  const rows: TrainRow<{ id: string }>[] = trainRows({
    workouts,
    programs: [
      { id: "p1", title: "Upper Lower", workoutIds: ["c"] },
      { id: "p2", title: "PPL", workoutIds: ["a", "b"] },
    ],
    activeProgramId: "p2",
  });

  it("lists the active Program's Workouts and folds the rest behind a toggle", () => {
    expect(trainList(rows, false).map(label)).toEqual(["a", "b", "[more 2]"]);
  });
  it("opens the toggle onto the other Programs and Workouts without a second heading", () => {
    expect(trainList(rows, true).map(label)).toEqual([
      "a",
      "b",
      "[more 2 open]",
      "[Upper Lower]",
      "c",
      "d",
    ]);
  });
  it("has no toggle when nothing else exists", () => {
    const only = trainRows({
      workouts: [{ id: "a" }],
      programs: [{ id: "p", title: "PPL", workoutIds: ["a"] }],
      activeProgramId: "p",
    });
    expect(trainList(only, false).map(label)).toEqual(["a"]);
  });
  it("lists every row without a toggle when no Program is active", () => {
    const none = trainRows({
      workouts,
      programs: [{ id: "p1", title: "One", workoutIds: ["c"] }],
      activeProgramId: null,
    });
    expect(trainList(none, false).map(label)).toEqual(["[One]", "c", "b", "a", "d"]);
  });
});
