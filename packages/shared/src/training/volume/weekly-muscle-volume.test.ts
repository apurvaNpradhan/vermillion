import { describe, expect, it } from "vitest";

import { loggedSet, sessionOf, untickedSet } from "../logging/session-fixtures";
import { weekRange } from "../plans/week";
import type { SetKind } from "../vocabulary/vocabulary";
import {
  muscleContributions,
  muscleRows,
  onTargetCount,
  plannedMuscleVolume,
  shiftWeek,
  weeklyDetailVolume,
  weeklyMuscleVolume,
} from "./weekly-muscle-volume";

const exercises = [
  { id: "bench", title: "Bench", primary_muscle: "chest", secondary_muscles: ["triceps"] },
  { id: "row", title: "Row", primary_muscle: "upper_back", secondary_muscles: ["biceps"] },
] as const;

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday
const week = (weekStart: "monday" | "sunday" | "saturday", timezone = "UTC") =>
  weekRange(NOW, timezone, weekStart);

describe("weeklyDetailVolume", () => {
  it("splits the week's Counted sets and leaves other weeks out", () => {
    const lateral = {
      id: "lateral",
      primary_muscle: "shoulders",
      secondary_muscles: [],
      primary_detail: ["side_delts"],
    } as const;
    const sessions = [
      sessionOf("a", "2026-11-17T10:00:00Z", [loggedSet({ exercise_id: "lateral" })]),
      sessionOf("b", "2026-11-02T10:00:00Z", [loggedSet({ exercise_id: "lateral" })]),
    ];
    expect(weeklyDetailVolume(sessions, [lateral], week("monday"), "UTC")).toEqual([
      { muscle: "shoulders", parts: [{ detail: "side_delts", sets: 1 }] },
    ]);
  });
});

describe("weeklyMuscleVolume", () => {
  it("gives 1 set to the primary muscle and 0.5 to each secondary", () => {
    const sessions = [
      sessionOf("a", "2026-11-17T10:00:00Z", [
        loggedSet({ exercise_id: "bench" }),
        loggedSet({ exercise_id: "bench" }),
        loggedSet({ exercise_id: "row" }),
      ]),
    ];
    expect(weeklyMuscleVolume(sessions, exercises, week("monday"), "UTC")).toEqual([
      { muscle: "chest", sets: 2 },
      { muscle: "triceps", sets: 1 },
      { muscle: "upper_back", sets: 1 },
      { muscle: "biceps", sets: 0.5 },
    ]);
  });

  it("leaves out warm-ups and unticked sets, and counts every other kind", () => {
    const kinds = ["warmup", "working", "top", "backoff", "drop", "myo", "failure"] as const;
    const sessions = [
      sessionOf("a", "2026-11-17T10:00:00Z", [
        ...kinds.map((kind) => loggedSet({ exercise_id: "bench", kind })),
        untickedSet({ exercise_id: "bench" }),
      ]),
    ];
    const loads = weeklyMuscleVolume(sessions, exercises, week("monday"), "UTC");
    expect(loads.find((load) => load.muscle === "chest")?.sets).toBe(6);
    expect(loads.find((load) => load.muscle === "triceps")?.sets).toBe(3);
  });

  it("buckets by the week start preference: Sunday 15 Nov belongs to the next week for Monday", () => {
    const sessions = [
      sessionOf("sun", "2026-11-15T10:00:00Z", [loggedSet({ exercise_id: "bench" })]),
      sessionOf("mon", "2026-11-16T10:00:00Z", [loggedSet({ exercise_id: "bench" })]),
      sessionOf("old", "2026-11-14T10:00:00Z", [loggedSet({ exercise_id: "bench" })]),
    ];
    const chest = (weekStart: "monday" | "sunday" | "saturday") =>
      weeklyMuscleVolume(sessions, exercises, week(weekStart), "UTC").find(
        (load) => load.muscle === "chest",
      )?.sets;
    expect(chest("monday")).toBe(1); // 16 Nov only
    expect(chest("sunday")).toBe(2); // 15 and 16 Nov
    expect(chest("saturday")).toBe(3); // 14, 15 and 16 Nov
  });

  it("buckets by the calendar day in the user's time zone", () => {
    // 23:30 UTC on Saturday is Sunday 12:30 in Auckland.
    const sessions = [
      sessionOf("a", "2026-11-14T23:30:00Z", [loggedSet({ exercise_id: "bench" })]),
    ];
    expect(weeklyMuscleVolume(sessions, exercises, week("sunday", "UTC"), "UTC")).toEqual([]);
    expect(
      weeklyMuscleVolume(
        sessions,
        exercises,
        week("sunday", "Pacific/Auckland"),
        "Pacific/Auckland",
      ),
    ).toHaveLength(2);
  });

  it("reads last week with shiftWeek and its end is exclusive", () => {
    const sessions = [
      sessionOf("last", "2026-11-12T10:00:00Z", [loggedSet({ exercise_id: "bench" })]),
      sessionOf("edge", "2026-11-16T00:00:00Z", [loggedSet({ exercise_id: "row" })]),
    ];
    const previous = shiftWeek(week("monday"), 1);
    expect(weeklyMuscleVolume(sessions, exercises, previous, "UTC").map((l) => l.muscle)).toEqual([
      "chest",
      "triceps",
    ]);
  });
});

it("counts repeated workouts and half-credit secondary muscles in the weekly plan", () => {
  const sets: { kind: SetKind }[] = [{ kind: "warmup" }, { kind: "working" }, { kind: "drop" }];
  const exercise = {
    primaryMuscle: exercises[0].primary_muscle,
    secondaryMuscles: exercises[0].secondary_muscles,
    sets,
  };
  const workout = { exercises: [exercise] };
  const slots = [{ workout }, { workout: null }, { workout }];
  expect(plannedMuscleVolume({ slots, sessionsPerWeek: null })).toEqual([
    { muscle: "chest", sets: 4 },
    { muscle: "triceps", sets: 2 },
  ]);
  expect(plannedMuscleVolume({ slots, sessionsPerWeek: null }, 0.5)).toEqual([
    { muscle: "chest", sets: 2 },
    { muscle: "triceps", sets: 1 },
  ]);
});

describe("muscleRows", () => {
  it("shows volume without targets when there is no active program and no saved goal", () => {
    const rows = muscleRows([{ muscle: "chest", sets: 10 }], {});
    expect(rows[0]).toEqual({ muscle: "chest", sets: 10, range: null, status: null });
    expect(onTargetCount(rows)).toBe(0);
  });

  it("keeps saved goals when the active program ends", () => {
    const loads = [{ muscle: "chest", sets: 10 }] as const;
    const goals = { chest: { level: "custom", min: 8, max: 12 } } as const;
    const withProgram = muscleRows(loads, goals, [{ muscle: "chest", sets: 4 }]);
    const stopped = muscleRows(loads, goals);
    expect(stopped.find((row) => row.muscle === "chest")).toEqual({
      muscle: "chest",
      sets: 10,
      range: { min: 8, max: 12 },
      status: "on_target",
    });
    expect(stopped).toEqual(withProgram);
    expect(stopped.find((row) => row.muscle === "lats")?.range).toBeNull();
  });

  it("lists every targeted muscle with below target first, the furthest below first", () => {
    const rows = muscleRows(
      [
        { muscle: "chest", sets: 12 },
        { muscle: "lats", sets: 25 },
        { muscle: "biceps", sets: 9 },
        { muscle: "shoulders", sets: 2 },
      ],
      { biceps: { level: "maintain" } },
      [
        { muscle: "chest", sets: 12 },
        { muscle: "lats", sets: 20 },
        { muscle: "biceps", sets: 5 },
        { muscle: "shoulders", sets: 10 },
      ],
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]?.status).toBe("below");
    expect(rows.find((row) => row.muscle === "lats")).toMatchObject({ status: "above" });
    const biceps = rows.find((row) => row.muscle === "biceps");
    expect(biceps).toMatchObject({ status: "on_target", range: { min: 6, max: 10 } });
    expect(rows.find((row) => row.muscle === "chest")?.status).toBe("on_target");
    expect(rows.findIndex((row) => row.muscle === "shoulders")).toBeLessThan(
      rows.findIndex((row) => row.muscle === "chest"),
    );
    expect(onTargetCount(rows)).toBe(2);
  });
});

describe("muscleContributions", () => {
  it("lists the exercises that fed a muscle with their credit", () => {
    const sessions = [
      sessionOf("a", "2026-11-17T10:00:00Z", [
        loggedSet({ exercise_id: "bench" }),
        loggedSet({ exercise_id: "bench" }),
        loggedSet({ exercise_id: "row" }),
      ]),
    ];
    expect(muscleContributions(sessions, exercises, "triceps", week("monday"), "UTC")).toEqual([
      { exerciseId: "bench", title: "Bench", sets: 1 },
    ]);
    expect(muscleContributions(sessions, exercises, "chest", week("monday"), "UTC")).toEqual([
      { exerciseId: "bench", title: "Bench", sets: 2 },
    ]);
  });
});
