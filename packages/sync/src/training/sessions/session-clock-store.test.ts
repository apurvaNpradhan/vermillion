import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import { pauseSession, resumeSession, setSessionStart } from "./session-clock-store";
import { tickSet, updateSet } from "./session-content-store";
import { adjustRest, finishSession, startRest, startSession } from "./session-store";

const T0 = Date.parse("2026-06-01T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

beforeEach(() => {
  // Only the clock moves: the fake database and its promises keep running.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

async function started(s: Sessions) {
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  const [, work1, work2] = s.sets(squat ?? "").map((row) => String(row["id"]));
  const [hold] = s.sets(plank ?? "").map((row) => String(row["id"]));
  return { id, work1: work1 ?? "", work2: work2 ?? "", hold: hold ?? "" };
}

const row = (s: Sessions, id: string) => s.one("training_session", id);

describe("pauseSession and resumeSession", () => {
  it("pauses once, and resume settles the span into paused_ms", async () => {
    const s = await setupSessions();
    const t = await started(s);
    vi.setSystemTime(T0 + 60_000);
    expect(await pauseSession(s.training, t.id)).toBe(true);
    expect(row(s, t.id)).toMatchObject({ paused_at: at(60) });
    // A second pause changes nothing.
    vi.setSystemTime(T0 + 90_000);
    expect(await pauseSession(s.training, t.id)).toBe(false);
    expect(row(s, t.id)).toMatchObject({ paused_at: at(60) });

    vi.setSystemTime(T0 + 160_000);
    expect(await resumeSession(s.training, t.id)).toBe(true);
    expect(row(s, t.id)).toMatchObject({ paused_at: null, paused_ms: 100_000 });
    expect(await resumeSession(s.training, t.id)).toBe(false);
  });

  it("adds up several pauses and reads rows from before pausing existed", async () => {
    const s = await setupSessions();
    const t = await started(s);
    s.sqlite.prepare("UPDATE training_session SET paused_ms = NULL").run();
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 30_000);
    await resumeSession(s.training, t.id);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 50_000);
    await resumeSession(s.training, t.id);
    expect(row(s, t.id)).toMatchObject({ paused_at: null, paused_ms: 50_000 });
  });

  it("moves the Rest and running set timers by the paused span, so they have the same time left", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await startRest(s.training, t.id, t.work1, 120);
    await updateSet(s.training, t.hold, { timer_started_at: at(0) });
    vi.setSystemTime(T0 + 30_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 330_000);
    await resumeSession(s.training, t.id);
    // 30 s of the Rest had passed at the pause; 90 s are left from the resume.
    expect(row(s, t.id)).toMatchObject({
      rest_started_at: at(300),
      rest_ends_at: at(420),
      paused_ms: 300_000,
    });
    expect(s.one("session_set", t.hold)).toMatchObject({ timer_started_at: at(300) });
  });

  it("leaves a Rest that had already ended", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await startRest(s.training, t.id, t.work1, 20);
    vi.setSystemTime(T0 + 60_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 160_000);
    await resumeSession(s.training, t.id);
    expect(row(s, t.id)).toMatchObject({ rest_started_at: at(0), rest_ends_at: at(20) });
  });

  it("ends a forgotten pause where it ran out", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 10 * 3600_000);
    await resumeSession(s.training, t.id, undefined, T0 + 4 * 3600_000);
    expect(row(s, t.id)).toMatchObject({ paused_at: null, paused_ms: 4 * 3600_000 });
  });

  it("does not let a queued countdown or a refused tick change a paused workout", async () => {
    const s = await setupSessions();
    const { id, work1, hold } = await started(s);
    await updateSet(s.training, hold, { duration_s: 30, timer_started_at: at(0) });
    vi.setSystemTime(T0 + 20_000);
    await pauseSession(s.training, id);
    vi.setSystemTime(T0 + 40_000);
    expect(
      await tickSet(s.training, hold, { duration: 30 }, undefined, null, T0 + 30_000),
    ).toMatchObject({ ok: true, wrote: false });
    expect(await tickSet(s.training, work1, {})).toMatchObject({ ok: false });
    expect(row(s, id)).toMatchObject({ paused_at: at(20) });
  });

  it("does not pause a finished Session", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await finishSession(s.training, t.id);
    expect(await pauseSession(s.training, t.id)).toBe(false);
  });

  it("refuses a stale install", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await expect(pauseSession(s.training, t.id, "someone-else")).rejects.toThrow();
  });
});

describe("a paused Session that is used", () => {
  it("resumes when a set is ticked, with the new Rest running from the tick", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 600_000);
    const result = await tickSet(s.training, t.work1, { weight: 100, reps: 5 }, undefined, 90);
    expect(result).toMatchObject({ ok: true, wrote: true });
    expect(row(s, t.id)).toMatchObject({
      paused_at: null,
      paused_ms: 600_000,
      rest_started_at: at(600),
      rest_ends_at: at(690),
    });
  });

  it("resumes when a duration timer is started", async () => {
    const s = await setupSessions();
    const t = await started(s);
    vi.setSystemTime(T0 + 10_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 70_000);
    await updateSet(s.training, t.hold, { timer_started_at: at(70) });
    expect(row(s, t.id)).toMatchObject({ paused_at: null, paused_ms: 60_000 });
    expect(s.one("session_set", t.hold)).toMatchObject({ timer_started_at: at(70) });
  });

  it("does not resume for an edit that is not a tick or a timer start", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await pauseSession(s.training, t.id);
    await updateSet(s.training, t.work1, { weight_kg: 90 });
    expect(row(s, t.id)).toMatchObject({ paused_at: at(0) });
  });

  it("measures a nudge of the Rest from the pause, so it is not cleared", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await startRest(s.training, t.id, t.work1, 60);
    vi.setSystemTime(T0 + 20_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 500_000);
    const moved = await adjustRest(s.training, t.id, -15);
    expect(moved?.endsAt).toBe(at(45));
    expect(row(s, t.id)).toMatchObject({ rest_ends_at: at(45) });
  });

  it("counts the open pause as paused when it is finished", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    vi.setSystemTime(T0 + 60_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 360_000);
    await finishSession(s.training, t.id);
    expect(row(s, t.id)).toMatchObject({
      paused_at: null,
      paused_ms: 300_000,
      finished_at: at(360),
    });
  });

  it("finishes a forgotten pause at an earlier time without a negative span", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    vi.setSystemTime(T0 + 600_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 5 * 3600_000);
    await finishSession(s.training, t.id, { finishedAt: at(300) });
    expect(row(s, t.id)).toMatchObject({ paused_at: null, paused_ms: 0, finished_at: at(300) });
  });
});

describe("setSessionStart", () => {
  it("moves the start earlier", async () => {
    const s = await setupSessions();
    const t = await started(s);
    vi.setSystemTime(T0 + 3600_000);
    expect(await setSessionStart(s.training, t.id, at(-600))).toEqual({ ok: true });
    expect(row(s, t.id)).toMatchObject({ started_at: at(-600) });
  });

  it("refuses the future, a start after the first ticked set and after the pause", async () => {
    const s = await setupSessions();
    const t = await started(s);
    vi.setSystemTime(T0 + 3600_000);
    expect(await setSessionStart(s.training, t.id, at(3601))).toEqual({
      ok: false,
      problem: "future",
    });
    vi.setSystemTime(T0 + 600_000);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    vi.setSystemTime(T0 + 1800_000);
    expect(await setSessionStart(s.training, t.id, at(601))).toEqual({
      ok: false,
      problem: "after-tick",
    });
    expect(await setSessionStart(s.training, t.id, at(600))).toEqual({ ok: true });
    await pauseSession(s.training, t.id);
    await updateSet(s.training, t.work2, { weight_kg: 90 });
    expect(await setSessionStart(s.training, t.id, at(1000))).toEqual({
      ok: false,
      problem: "after-tick",
    });
    expect(row(s, t.id)).toMatchObject({ started_at: at(600) });
  });

  it("refuses a start after the current pause when nothing is ticked", async () => {
    const s = await setupSessions();
    const t = await started(s);
    vi.setSystemTime(T0 + 300_000);
    await pauseSession(s.training, t.id);
    vi.setSystemTime(T0 + 900_000);
    expect(await setSessionStart(s.training, t.id, at(301))).toEqual({
      ok: false,
      problem: "after-pause",
    });
    expect(await setSessionStart(s.training, t.id, at(299))).toEqual({ ok: true });
  });

  it("refuses a start more than ten years back and a finished Session", async () => {
    const s = await setupSessions();
    const t = await started(s);
    expect(await setSessionStart(s.training, t.id, "2010-01-01T00:00:00.000Z")).toEqual({
      ok: false,
      problem: "too-old",
    });
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await finishSession(s.training, t.id);
    await expect(setSessionStart(s.training, t.id, at(-60))).rejects.toThrow();
  });
});
