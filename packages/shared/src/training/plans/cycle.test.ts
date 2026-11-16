import { describe, expect, it } from "vitest";
import { activeRun, cycleState, runWeek } from "./cycle";
const slots = [
  { id: "a", workoutId: "upper" },
  { id: "rest", workoutId: null },
  { id: "b", workoutId: "lower" },
  { id: "c", workoutId: "upper" },
];
const done = (id: string, workoutId: string, cycle = 1) => ({
  id,
  workoutId,
  cycle,
  startedAt: id,
  finishedAt: id,
});
describe("cycle state", () => {
  it("trains out of order and repeated workouts fill their first untrained slot", () => {
    const state = cycleState(slots, [done("1", "lower"), done("2", "upper")]);
    expect([...state.trained]).toEqual(["b", "a"]);
    expect(state.next?.id).toBe("c");
  });
  it("ignores rest and begins the next cycle after the last workout", () => {
    const state = cycleState(slots, [done("1", "upper"), done("2", "lower"), done("3", "upper")]);
    expect(state.complete).toBe(true);
    expect(state.cycle).toBe(2);
    expect(state.next?.id).toBe("a");
  });
  it("deleting a session untrains its slot", () => {
    expect(cycleState(slots, [done("2", "lower")]).next?.id).toBe("a");
  });
  it("uses the edited rotation and ignores removed workouts", () => {
    const state = cycleState(
      [{ id: "new", workoutId: "new" }, ...slots],
      [done("1", "gone"), done("2", "upper")],
    );
    expect(state.next?.id).toBe("new");
    expect([...state.trained]).toEqual(["a"]);
  });
  it("does not count unfinished sessions or an empty rotation as complete", () => {
    expect(cycleState(slots, [{ ...done("1", "upper"), finishedAt: null }]).trained.size).toBe(0);
    expect(cycleState([], []).complete).toBe(false);
  });
});
it("counts calendar weeks in the user's timezone across DST", () => {
  expect(
    runWeek("2026-03-02T05:00:00Z", new Date("2026-03-09T04:00:00Z"), "America/New_York"),
  ).toBe(2);
  expect(runWeek("2026-01-01T23:00:00Z", new Date("2026-01-08T22:00:00Z"), "Asia/Kolkata")).toBe(2);
  expect(runWeek(null, new Date(), "UTC")).toBe(1);
});
it("resolves conflicting activations deterministically on both devices", () => {
  const a = { id: "a", activated_at: "2026-01-01", finished_at: null };
  const b = { id: "b", activated_at: "2026-01-02", finished_at: null };
  expect(activeRun([a, b])).toEqual(b);
  expect(activeRun([b, a])).toEqual(b);
  expect(activeRun([b, { ...a, activated_at: b.activated_at }])).toEqual(b);
  expect(activeRun([{ ...b, finished_at: "2026-01-03" }, a])).toEqual(a);
});
