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
  hasCountedSet: true,
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
  it("ignores a finished session with only warm-ups", () => {
    const state = cycleState(slots, [{ ...done("1", "upper"), hasCountedSet: false }]);
    expect(state.trained.size).toBe(0);
    expect(state.next?.id).toBe("a");
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

describe("cycle state with skips", () => {
  it("counts a skipped slot as done for its cycle and moves next past it", () => {
    const state = cycleState(slots, [done("1", "upper")], [{ slotId: "b", cycle: 1 }]);
    expect([...state.trained].sort()).toEqual(["a", "b"]);
    expect([...state.skipped]).toEqual(["b"]);
    expect(state.next?.id).toBe("c");
    expect(state.complete).toBe(false);
  });

  it("completes the cycle when every other slot is trained, with no new session", () => {
    const state = cycleState(
      slots,
      [done("1", "upper"), done("2", "upper")],
      [{ slotId: "b", cycle: 1 }],
    );
    expect(state.complete).toBe(true);
    expect(state.cycle).toBe(2);
    expect(state.trained.size).toBe(0);
    expect(state.skipped.size).toBe(0);
    expect(state.next?.id).toBe("a");
  });

  it("skips only the cycle it was made for", () => {
    const skips = [{ slotId: "a", cycle: 1 }];
    // Cycle 1 completes (a skipped, b and c trained), so cycle 2 starts with a untrained.
    const next = cycleState(slots, [done("1", "lower"), done("2", "upper")], skips);
    expect(next.cycle).toBe(2);
    expect(next.next?.id).toBe("a");
    // A skip of cycle 2 is not applied while cycle 1 is the one in progress.
    const other = cycleState(slots, [], [{ slotId: "a", cycle: 2 }]);
    expect(other.cycle).toBe(1);
    expect(other.skipped.size).toBe(0);
    expect(other.next?.id).toBe("a");
  });

  it("applies a skip of a later cycle when a session of that cycle moves the run there", () => {
    const state = cycleState(
      slots,
      [done("1", "upper"), done("2", "lower"), done("3", "upper"), done("4", "upper", 2)],
      [{ slotId: "b", cycle: 2 }],
    );
    expect(state.cycle).toBe(2);
    expect([...state.trained].sort()).toEqual(["a", "b"]);
    expect([...state.skipped]).toEqual(["b"]);
    expect(state.next?.id).toBe("c");
  });

  it("trains a workout into its next slot when its first slot was skipped", () => {
    // `upper` fills a and c: skipping a leaves c for the next upper session.
    const state = cycleState(slots, [done("1", "upper")], [{ slotId: "a", cycle: 1 }]);
    expect([...state.trained].sort()).toEqual(["a", "c"]);
    expect(state.next?.id).toBe("b");
  });

  it("ignores skips of rest, of unknown slots and duplicates", () => {
    const state = cycleState(
      slots,
      [],
      [
        { slotId: "rest", cycle: 1 },
        { slotId: "gone", cycle: 1 },
        { slotId: "a", cycle: 1 },
        { slotId: "a", cycle: 1 },
      ],
    );
    expect([...state.trained]).toEqual(["a"]);
    expect(state.next?.id).toBe("b");
  });

  it("is unchanged without skips", () => {
    const sessions = [done("1", "lower"), done("2", "upper")];
    const plain = cycleState(slots, sessions);
    const empty = cycleState(slots, sessions, []);
    expect([...empty.trained]).toEqual([...plain.trained]);
    expect(empty.next?.id).toBe(plain.next?.id);
    expect(empty.skipped.size).toBe(0);
  });
});

it("advances past multiple fully skipped cycles", () => {
  const work = [{ id: "a", workoutId: "upper" }];
  const state = cycleState(
    work,
    [],
    [
      { slotId: "a", cycle: 1 },
      { slotId: "a", cycle: 2 },
    ],
  );
  expect(state.cycle).toBe(3);
  expect(state.next?.id).toBe("a");
});

it("credits a recorded slot even when another device skipped it", () => {
  const state = cycleState(
    slots,
    [{ ...done("1", "upper"), slotId: "c" }],
    [{ slotId: "c", cycle: 1 }],
  );
  expect([...state.trained]).toEqual(["c"]);
  expect(state.skipped.has("c")).toBe(false);
  expect(state.next?.id).toBe("a");
});

it("reserves recorded slots before assigning legacy sessions to repeated workouts", () => {
  const state = cycleState(slots, [done("1", "upper"), { ...done("2", "upper"), slotId: "a" }]);
  expect([...state.trained]).toEqual(["a", "c"]);
  expect(state.next?.id).toBe("b");
});

it("seals earlier cycles once a later counted session exists, even after an Undo arrives", () => {
  const sessions = [{ ...done("1", "upper", 2), slotId: "c" }];
  const withSkip = cycleState(slots, sessions, [{ slotId: "a", cycle: 1 }]);
  expect(cycleState(slots, sessions)).toEqual(withSkip);
  expect(withSkip.latestCountedCycle).toBe(2);
  expect(withSkip.cycle).toBe(2);
});

it.each([
  [
    "UTC",
    "2026-03-02T00:00:00Z",
    "2026-03-07T12:00:00Z",
    "2026-03-08T12:00:00Z",
    "2026-03-09T00:00:00Z",
  ],
  [
    "America/New_York",
    "2026-03-02T05:00:00Z",
    "2026-03-07T17:00:00Z",
    "2026-03-08T16:00:00Z",
    "2026-03-09T04:00:00Z",
  ],
  [
    "Asia/Kolkata",
    "2026-03-01T18:30:00Z",
    "2026-03-07T06:30:00Z",
    "2026-03-08T06:30:00Z",
    "2026-03-08T18:30:00Z",
  ],
])("counts only whole local days paused in %s", (zone, start, from, until, through) => {
  const now = new Date(through);
  expect(runWeek(start, now, zone, [{ from, until }])).toBe(1);
  const almost = new Date(Date.parse(until) - 60_000).toISOString();
  expect(runWeek(start, now, zone, [{ from, until: almost }])).toBe(2);
});

it("unions overlapping pauses across a fall DST change and ignores a short midnight crossing", () => {
  const week = (pauses: Parameters<typeof runWeek>[3]) =>
    runWeek("2026-10-27T04:00:00Z", new Date("2026-11-03T05:00:00Z"), "America/New_York", pauses);
  const from = "2026-11-01T03:30:00Z";
  const until = "2026-11-01T04:30:00Z";
  expect(week([{ from, until }])).toBe(2);
  expect(
    week([
      { from, until: "2026-11-02T04:29:00Z" },
      { from: until, until: "2026-11-02T04:29:00Z" },
    ]),
  ).toBe(2);
  expect(
    week([
      { from, until: "2026-11-02T05:30:00Z" },
      { from: until, until: "2026-11-02T04:30:00Z" },
    ]),
  ).toBe(1);
});
