import { expect, it } from "vitest";
import { createProgram, createWorkout, addSlot } from "./store";
import {
  activateProgram,
  finishRun,
  keepGoing,
  readRuns,
  runAgain,
  stopProgram,
} from "./run-store";
import { setupSessions } from "./session-fixtures";
import { startSession } from "./session-store";
import { activeRun } from "@workspace/shared";

it("activates, starts, continues and reruns without losing earlier dates", async () => {
  const s = await setupSessions();
  try {
    const programId = await createProgram(s.training, {
      title: "Plan",
      description: null,
      planned_weeks: 4,
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
it("switching stops the prior Run and rejects a stale account scope", async () => {
  const s = await setupSessions();
  try {
    const one = await createProgram(s.training, {
      title: "One",
      description: null,
      planned_weeks: null,
    });
    const two = await createProgram(s.training, {
      title: "Two",
      description: null,
      planned_weeks: null,
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
    });
    const two = await createProgram(s.training, {
      title: "Two",
      description: null,
      planned_weeks: null,
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
