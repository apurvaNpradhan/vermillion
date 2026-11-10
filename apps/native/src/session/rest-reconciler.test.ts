import { expect, it } from "vitest";
import { createRestReconciler } from "./rest-reconciler";

it("serializes pending schedules before the newest cancellation", async () => {
  const reconciler = createRestReconciler();
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events: string[] = [];
  const first = reconciler.enqueue(async (current) => {
    events.push("schedule started");
    await pending;
    events.push("scheduled");
    if (!current()) return;
    events.push("obsolete bookkeeping");
  });
  await Promise.resolve();
  await Promise.resolve();
  const latest = reconciler.enqueue(async (current) => {
    events.push("cancelled");
    await Promise.resolve();
    expect(current()).toBe(true);
  });
  release();
  await Promise.all([first, latest]);
  expect(events).toEqual(["schedule started", "scheduled", "cancelled"]);
});
