import { afterEach, expect, it, vi } from "vitest";

import { nudged, restFrom } from "./optimistic";
import { RestNudges } from "./rest-nudges";
import { planRestSchedule, restNotificationId } from "./rest-schedule";

const now = Date.parse("2026-01-01T10:00:00Z");
const rest = restFrom("set", 120, now);
afterEach(() => vi.useRealTimers());

it("shows every tap synchronously and saves and reschedules only once after quiet", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const saved: number[] = [];
  const schedules: number[] = [];
  const show = vi.fn();
  const nudges = new RestNudges(async (delta) => {
    saved.push(delta);
    const next = nudged(rest, delta, Date.now());
    const plan = planRestSchedule({
      sessions: [
        { id: "session", title: "Workout", owned: true, restEndsAt: next?.endsAt ?? null },
      ],
      scheduledIds: [restNotificationId("session")],
      known: new Map([["session", Date.parse(rest.endsAt)]]),
      now: Date.now(),
      granted: true,
    });
    schedules.push(...plan.schedule.map((entry) => entry.endsAt));
    return { rest: next };
  }, show);
  for (let tap = 1; tap <= 3; tap++) {
    nudges.add(rest, 15, now);
    expect(show).toHaveBeenLastCalledWith(nudged(rest, tap * 15, now));
    await vi.advanceTimersByTimeAsync(100);
  }
  expect(saved).toEqual([]);
  await vi.advanceTimersByTimeAsync(400);
  expect(saved).toEqual([45]);
  expect(schedules).toEqual([now + 165_000]);
  nudges.observe(rest); // An old watch emission cannot roll the display back.
  expect(show).toHaveBeenLastCalledWith(nudged(rest, 45, now));
  nudges.observe(nudged(rest, 45, now));
  expect(show).toHaveBeenLastCalledWith(undefined);
});

it("rolls back a failed save, including an adjustment that ends rest", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const show = vi.fn();
  const nudges = new RestNudges(async () => null, show);
  nudges.add(rest, 15, now);
  await nudges.flush();
  expect(show).toHaveBeenLastCalledWith(rest);
  nudges.add(rest, -150, now);
  await nudges.flush();
  expect(show).toHaveBeenLastCalledWith(rest);
});

it("flushes early and serializes taps made during a save", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let complete = (_value: { rest: typeof rest } | null) => {};
  const save = vi.fn(
    () =>
      new Promise<{ rest: typeof rest } | null>((resolve) => {
        complete = resolve;
      }),
  );
  const show = vi.fn();
  const nudges = new RestNudges(save, show);
  nudges.add(rest, 15, now);
  const first = nudges.flush();
  nudges.add(rest, 15, now);
  complete({ rest: restFrom("set", 135, now) });
  await first;
  nudges.observe(restFrom("set", 135, now));
  expect(show).toHaveBeenLastCalledWith(restFrom("set", 150, now));
  const second = nudges.flush();
  expect(save.mock.calls).toEqual([[15], [15]]);
  complete({ rest: restFrom("set", 150, now) });
  await second;
  nudges.observe(restFrom("set", 135, now));
  expect(show).toHaveBeenLastCalledWith(restFrom("set", 150, now));
  nudges.observe(restFrom("set", 150, now));
  expect(show).toHaveBeenLastCalledWith(undefined);
});

it("clamps each tap against the immediate target, including mixed taps near the cap", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const save = vi.fn(async (_delta: number) => ({ rest }));
  const show = vi.fn();
  const nudges = new RestNudges(save, show);
  nudges.add(restFrom("set", 595, now), 15, now);
  nudges.add(rest, 15, now);
  expect(show).toHaveBeenLastCalledWith(restFrom("set", 600, now));
  nudges.add(rest, -15, now);
  expect(show).toHaveBeenLastCalledWith(restFrom("set", 585, now));
  await nudges.flush();
  expect(save).toHaveBeenCalledExactlyOnceWith(-10);
});
