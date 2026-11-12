import { expect, it } from "vitest";
import { bestProgressSet, exerciseWeeklyVolume, oneRepMaxSeries } from "./progress";
import type { SessionHistory } from "./logged-set";
const now = Date.parse("2026-11-12T12:00:00Z");
const session = (id: string, date: string, weight = 100): SessionHistory => ({
  id,
  started_at: date,
  finished_at: date,
  sets: [
    {
      id,
      exercise_id: "e",
      exercise_type: "weight_reps",
      kind: "working",
      completed_at: date,
      weight_kg: weight,
      reps: 5,
    },
  ],
});
it("ranges history and picks the best set per session, excluding warm-ups and other exercises", () => {
  const recent = session("a", "2026-11-01");
  recent.sets = [
    ...recent.sets,
    { ...recent.sets[0]!, kind: "warmup", weight_kg: 500 },
    { ...recent.sets[0]!, exercise_id: "other", weight_kg: 600 },
  ];
  const history = [recent, session("old", "2025-01-01", 200)];
  expect(bestProgressSet(history, "e", "3M", now)?.set.weight_kg).toBe(100);
  expect(bestProgressSet(history, "e", "All", now)?.set.weight_kg).toBe(200);
  expect(oneRepMaxSeries(history, "e", "1Y", now)).toHaveLength(1);
  expect(oneRepMaxSeries(history, "e", "All", now).map((p) => p.id)).toEqual(["old", "a"]);
});
it("buckets volume by Monday in the account's timezone and keeps zero data", () => {
  const history = [
    session("a", "2026-11-02T00:30:00Z"),
    session("b", "2026-11-01T12:00:00Z"),
    session("c", "2026-11-05", 0),
  ];
  expect(
    exerciseWeeklyVolume(history, "e", "3M", now, "America/Los_Angeles").map((p) => [p.id, p.y]),
  ).toEqual([
    ["2026-10-26", 1000],
    ["2026-11-02", 0],
  ]);
  expect(bestProgressSet([], "e", "All", now)).toBeNull();
  expect(oneRepMaxSeries([session("zero", "2026-11-01", 0)], "e", "All", now)).toEqual([]);
});

it("ranks by estimated strength rather than heaviest weight and ignores unsupported reps", () => {
  const s = session("a", "2026-11-01", 120);
  s.sets = [
    { ...s.sets[0]!, reps: 1 },
    { ...s.sets[0]!, id: "stronger", weight_kg: 100, reps: 12 },
    { ...s.sets[0]!, weight_kg: 1000, reps: 13 },
  ];
  expect(bestProgressSet([s], "e", "All", now)?.set.id).toBe("stronger");
  expect(oneRepMaxSeries([s], "e", "All", now)[0]?.y).toBe(144);
});
it("clamps calendar month ends and excludes future and unfinished sessions", () => {
  const now = Date.parse("2026-05-31T00:00:00Z");
  const history = [
    session("edge", "2026-02-28"),
    session("old", "2026-02-27"),
    session("future", "2026-06-01"),
    { ...session("active", "2026-05-01"), finished_at: null },
  ];
  expect(oneRepMaxSeries(history, "e", "3M", now).map((p) => p.id)).toEqual(["edge"]);
});
