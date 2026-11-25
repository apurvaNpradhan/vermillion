import { expect, it } from "vitest";
import { createProgram, createWorkout, addSlot, addExercises } from "../store";
import {
  activateProgram,
  finishRun,
  hasCountedSetSql,
  keepGoing,
  readRuns,
  runAgain,
  stopProgram,
} from "./run-store";
import { skipSlot, unskipSlot } from "./skip-store";
import { setupSessions, SQUAT } from "../sessions/session-fixtures";
import { beginSession, startSession, logPastSession } from "../sessions/session-store";
import { activeRun, cycleState } from "@workspace/shared";
import { tickSet } from "../sessions/session-content-store";

it("activates, starts, continues and reruns without losing earlier dates", async () => {
  const s = await setupSessions();
  try {
    const programId = await createProgram(s.training, {
      title: "Plan",
      description: null,
      planned_weeks: 4,
      sessions_per_week: null,
    });
    const workoutId = await createWorkout(s.training, { title: "Day", program_id: programId });
    const slotId = await addSlot(s.training, programId, workoutId);
    const runId = await activateProgram(s.training, programId, s.installId);
    expect(await activateProgram(s.training, programId)).toBe(runId);
    expect(activeRun(await readRuns(s.training))?.started_at).toBeNull();
    const id = await startSession(s.training, { workoutId, derivedTitle: "Day" });
    expect(s.one("training_session", id)).toMatchObject({
      run_id: runId,
      slot_id: slotId,
      cycle: 1,
    });
    const before = activeRun(await readRuns(s.training));
    expect(before?.started_at).toBeTruthy();
    await keepGoing(s.training, runId);
    expect(activeRun(await readRuns(s.training))?.continued_at).toBeTruthy();
    const again = await runAgain(s.training, runId, programId);
    expect(again).not.toBe(runId);
    expect((await readRuns(s.training)).find((r) => r.id === runId)).toMatchObject({
      started_at: before?.started_at,
      activated_at: before?.activated_at,
      outcome: "completed",
    });
    await stopProgram(s.training, again);
    expect(activeRun(await readRuns(s.training))).toBeNull();
    const final = await activateProgram(s.training, programId);
    await finishRun(s.training, final);
    expect(activeRun(await readRuns(s.training))).toBeNull();
  } finally {
    s.sqlite.close();
  }
});
it("assigns a recent backfill to the active workout's run and leaves older backfills out", async () => {
  const s = await setupSessions();
  try {
    const programId = await createProgram(s.training, {
      title: "Plan",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const workoutId = await createWorkout(s.training, { title: "Day", program_id: programId });
    await addExercises(s.training, workoutId, [SQUAT]);
    const slotId = await addSlot(s.training, programId, workoutId);
    const runId = await activateProgram(s.training, programId);
    const source = { workoutId, derivedTitle: "Day" };
    const recent = await logPastSession(s.training, source, {
      startedAt: new Date(Date.now() - 86400000).toISOString(),
    });
    expect(s.one("training_session", recent)).toMatchObject({
      run_id: runId,
      slot_id: slotId,
      cycle: 1,
    });
    const older = await logPastSession(s.training, source, {
      startedAt: new Date(Date.now() - 172800000).toISOString(),
    });
    expect(s.one("training_session", older)).toMatchObject({
      run_id: null,
      slot_id: null,
      cycle: null,
    });
  } finally {
    s.sqlite.close();
  }
});

it("switching stops the prior Run and rejects a stale account scope", async () => {
  const s = await setupSessions();
  try {
    const one = await createProgram(s.training, {
      title: "One",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const two = await createProgram(s.training, {
      title: "Two",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const first = await activateProgram(s.training, one);
    const second = await activateProgram(s.training, two);
    expect(activeRun(await readRuns(s.training))?.id).toBe(second);
    expect((await readRuns(s.training)).find((r) => r.id === first)?.outcome).toBe("stopped");
    await expect(activateProgram(s.training, one, "stale")).rejects.toThrow();
  } finally {
    s.sqlite.close();
  }
});
it("stops an offline losing activation on the next training write", async () => {
  const s = await setupSessions();
  try {
    const one = await createProgram(s.training, {
      title: "One",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const two = await createProgram(s.training, {
      title: "Two",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const first = await activateProgram(s.training, one);
    // Replication can deliver an independent offline activation before a client reconciles.
    s.sqlite
      .prepare(
        "INSERT INTO program_run (id,user_id,program_id,activated_at,created_at) VALUES (?,?,?,?,?)",
      )
      .run("other-device", "owner", two, "2099-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    await createWorkout(s.training, { title: "Next write" });
    expect(activeRun(await readRuns(s.training))?.id).toBe("other-device");
    expect((await readRuns(s.training)).find((r) => r.id === first)?.outcome).toBe("stopped");
  } finally {
    s.sqlite.close();
  }
});

async function rotation(count: number) {
  const s = await setupSessions();
  const programId = await createProgram(s.training, {
    title: "Plan",
    description: null,
    planned_weeks: null,
    sessions_per_week: null,
  });
  const days: { workoutId: string; slotId: string }[] = [];
  for (let i = 0; i < count; i++) {
    const workoutId = await createWorkout(s.training, { title: `Day ${i}`, program_id: programId });
    await addExercises(s.training, workoutId, [SQUAT]);
    days.push({ workoutId, slotId: await addSlot(s.training, programId, workoutId) });
  }
  const runId = await activateProgram(s.training, programId);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const backfill = async (day: number, ago: number) => {
    const workoutId = days[day]?.workoutId ?? null;
    return logPastSession(
      s.training,
      { workoutId, derivedTitle: "Day" },
      { startedAt: daysAgo(ago) },
    );
  };
  const tick = async (id: string) => {
    const entry = String(s.exercises(id)[0]?.["id"]);
    await tickSet(s.training, String(s.sets(entry)[0]?.["id"]), { weight: 100, reps: 5 });
  };
  const progress = () => {
    const rows = s.sqlite
      .prepare(
        `SELECT id, workout_id, slot_id, cycle, started_at, finished_at, ${hasCountedSetSql} AS counted
         FROM training_session WHERE run_id = ?`,
      )
      .all(runId);
    const skips = s.sqlite
      .prepare("SELECT slot_id, cycle FROM program_slot_skip WHERE run_id = ?")
      .all(runId)
      .map((row) => ({ slotId: String(row["slot_id"]), cycle: Number(row["cycle"]) }));
    return cycleState(
      days.map((day) => ({ id: day.slotId, workoutId: day.workoutId })),
      rows.map((row) => ({
        id: String(row["id"]),
        workoutId: row["workout_id"] === null ? null : String(row["workout_id"]),
        slotId: row["slot_id"] === null ? null : String(row["slot_id"]),
        cycle: row["cycle"] === null ? null : Number(row["cycle"]),
        startedAt: String(row["started_at"]),
        finishedAt: row["finished_at"] === null ? null : String(row["finished_at"]),
        hasCountedSet: row["counted"] === 1,
      })),
      skips,
    );
  };
  return { s, days, runId, backfill, tick, progress };
}

it("keeps a backfill in the active run when an unrelated newer session exists", async () => {
  const { s, days, runId, backfill, tick, progress } = await rotation(2);
  try {
    // A newer, unfinished standalone session must not take the backfill out of the run.
    await startSession(s.training, { workoutId: null, derivedTitle: "Free" });
    const id = await backfill(0, 1);
    expect(s.one("training_session", id)).toMatchObject({
      run_id: runId,
      slot_id: days[0]?.slotId,
      cycle: 1,
    });
    await tick(id);
    expect(progress().next?.id).toBe(days[1]?.slotId);
  } finally {
    s.sqlite.close();
  }
});

it("places an out-of-order backfill by the run's own history", async () => {
  const { s, days, runId, backfill, tick, progress } = await rotation(3);
  try {
    const first = await backfill(0, 0.9);
    const last = await backfill(2, 0.3);
    await tick(first);
    await tick(last);
    expect(progress().next?.id).toBe(days[1]?.slotId);
    const middle = await backfill(1, 0.6);
    expect(s.one("training_session", middle)).toMatchObject({
      run_id: runId,
      slot_id: days[1]?.slotId,
      cycle: 1,
    });
    await tick(middle);
    expect(progress().cycle).toBe(2);
    // Before the run's first session, a backfill belongs to an earlier period.
    const earlier = await backfill(0, 5);
    expect(s.one("training_session", earlier)).toMatchObject({ run_id: null, cycle: null });
  } finally {
    s.sqlite.close();
  }
});

it("skips a slot for one cycle, completes the cycle without it and lets the skip be undone", async () => {
  const { s, days, runId, backfill, tick, progress } = await rotation(3);
  try {
    const first = await backfill(0, 0.9);
    await tick(first);
    expect(progress().next?.id).toBe(days[1]?.slotId);
    const skip = await skipSlot(s.training, {
      runId,
      slotId: days[1]?.slotId ?? "",
      cycle: 1,
    });
    expect(skip).not.toBeNull();
    // Skipping again is a no-op that returns the same record.
    expect(await skipSlot(s.training, { runId, slotId: days[1]?.slotId ?? "", cycle: 1 })).toBe(
      skip,
    );
    expect(s.all("program_slot_skip")).toHaveLength(1);
    expect(progress().skipped.has(days[1]?.slotId ?? "")).toBe(true);
    expect(progress().next?.id).toBe(days[2]?.slotId);

    // The last Workout completes the Cycle even though the middle one was never trained.
    const last = await backfill(2, 0.3);
    await tick(last);
    expect(progress().complete).toBe(true);
    expect(progress().cycle).toBe(2);
    expect(progress().next?.id).toBe(days[0]?.slotId);

    // Undoing the skip of the finished Cycle brings that Slot back; nothing else changes.
    expect(await unskipSlot(s.training, { runId, slotId: days[1]?.slotId ?? "", cycle: 1 })).toBe(
      true,
    );
    expect(await unskipSlot(s.training, { runId, slotId: days[1]?.slotId ?? "", cycle: 1 })).toBe(
      false,
    );
    expect(progress().cycle).toBe(1);
    expect(progress().next?.id).toBe(days[1]?.slotId);
  } finally {
    s.sqlite.close();
  }
});

it("stamps a new session with the next slot after a skip, and never skips rest or a foreign slot", async () => {
  const { s, days, runId } = await rotation(3);
  try {
    await skipSlot(s.training, { runId, slotId: days[0]?.slotId ?? "", cycle: 1 });
    const started = await startSession(s.training, {
      workoutId: days[1]?.workoutId ?? null,
      derivedTitle: "Day",
    });
    expect(s.one("training_session", started)).toMatchObject({
      slot_id: days[1]?.slotId,
      cycle: 1,
    });

    // A Rest slot and a Slot of another Program are not skippable.
    const programId = String(s.one("program_run", runId)?.["program_id"]);
    const rest = await addSlot(s.training, programId, null);
    expect(await skipSlot(s.training, { runId, slotId: rest, cycle: 1 })).toBeNull();
    const other = await createProgram(s.training, {
      title: "Other",
      description: null,
      planned_weeks: null,
      sessions_per_week: null,
    });
    const otherWorkout = await createWorkout(s.training, { title: "X", program_id: other });
    const otherSlot = await addSlot(s.training, other, otherWorkout);
    expect(await skipSlot(s.training, { runId, slotId: otherSlot, cycle: 1 })).toBeNull();
    await expect(
      skipSlot(s.training, { runId, slotId: days[1]?.slotId ?? "", cycle: 0 }),
    ).rejects.toThrow("cycle");
    expect(s.all("program_slot_skip")).toHaveLength(1);
  } finally {
    s.sqlite.close();
  }
});

it("keeps the skip on Resume and consumes it when the repeated day is actually started", async () => {
  const { s, days, runId } = await rotation(2);
  try {
    const programId = String(s.one("program_run", runId)?.["program_id"]);
    const workoutId = days[0]?.workoutId ?? "";
    const secondSlotId = await addSlot(s.training, programId, workoutId);
    const day = { runId, cycle: 1, slotId: secondSlotId };
    const skipped = await skipSlot(s.training, day);
    const open = await startSession(s.training, { workoutId: null, derivedTitle: "Open" });
    const source = { workoutId, day };
    expect(await beginSession(s.training, source, "Chosen", { resumeActive: true })).toMatchObject({
      id: open,
      outcome: "resumed",
    });
    expect(s.one("program_slot_skip", skipped ?? "")).toBeDefined();

    await expect(
      beginSession(s.training, { ...source, day: { ...day, cycle: 2 } }, "Stale", {
        discardIds: [open],
      }),
    ).rejects.toThrow("no longer available");
    expect(s.one("training_session", open)).toBeDefined();
    expect(s.one("program_slot_skip", skipped ?? "")).toBeDefined();

    const started = await beginSession(s.training, source, "Chosen", { discardIds: [open] });
    expect(s.one("program_slot_skip", skipped ?? "")).toBeUndefined();
    expect(s.one("training_session", started.id)).toMatchObject({
      run_id: runId,
      cycle: 1,
      slot_id: secondSlotId,
    });
  } finally {
    s.sqlite.close();
  }
});
