import { describe, expect, it } from "vitest";

import { listWorkouts, showWorkoutTools } from "./train-rows";

const make = (id: string, title: string, createdAt: string, exercises: string[] = []) => ({
  id,
  title,
  createdAt,
  exercises: exercises.map((exercise) => ({ title: exercise })),
});
const workouts = [
  make("a", "Push", "2026-01-01", ["Bench Press", "Dips"]),
  make("b", "Pull", "2026-01-02", ["Row", "Chin-up"]),
  make("c", "Légs", "2026-01-03", ["Squat"]),
  make("d", "Arms", "2026-01-04", ["Curl", "Bench Press"]),
];
const nameOf = (workout: { title: string }) => workout.title;
const ids = (list: readonly { id: string }[]) => list.map((workout) => workout.id).join("");

describe("Train workouts list", () => {
  it("offers search and sort only past eight workouts", () => {
    expect(showWorkoutTools(8)).toBe(false);
    expect(showWorkoutTools(9)).toBe(true);
  });

  it("sorts recent by last done, then never-done ones by when they were made", () => {
    const lastDone = new Map([
      ["a", "2026-02-10T08:00:00Z"],
      ["b", "2026-02-12T08:00:00Z"],
    ]);
    expect(ids(listWorkouts({ workouts, query: "", sort: "recent", lastDone, nameOf }))).toBe(
      "badc",
    );
  });

  it("sorts by name ignoring case and accents", () => {
    expect(
      ids(listWorkouts({ workouts, query: "", sort: "name", lastDone: new Map(), nameOf })),
    ).toBe("dcba");
  });

  it("searches names and exercises, every word anywhere", () => {
    const run = (query: string) =>
      ids(listWorkouts({ workouts, query, sort: "name", lastDone: new Map(), nameOf }));
    expect(run("bench")).toBe("da");
    expect(run("bench dips")).toBe("a");
    expect(run("legs")).toBe("c");
    expect(run("  ")).toBe("dcba");
    expect(run("nothing")).toBe("");
  });

  it("keeps a stable order for equal keys", () => {
    const same = [make("y", "Same", "2026-01-01"), make("x", "Same", "2026-01-01")];
    expect(
      ids(listWorkouts({ workouts: same, query: "", sort: "name", lastDone: new Map(), nameOf })),
    ).toBe("xy");
    expect(
      ids(listWorkouts({ workouts: same, query: "", sort: "recent", lastDone: new Map(), nameOf })),
    ).toBe("yx");
  });
});
