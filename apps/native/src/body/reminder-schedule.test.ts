import { describe, expect, it } from "vitest";
import { DEFAULT_UI_PREFERENCES } from "@workspace/shared";
import { BODY_REMINDER_PREFIX, desiredBodyReminders, planBodyReminders } from "./reminder-schedule";
const ui = {
  ...DEFAULT_UI_PREFERENCES,
  weighInReminder: { enabled: true, time: "08:00" },
  checkInReminder: { enabled: true, weekday: 2, time: "09:30" },
};
const desired = (granted = true) => desiredBodyReminders({ ui, granted });
describe("body reminder schedule", () => {
  it("has no requests by default or without permission", () => {
    expect(desiredBodyReminders({ ui: DEFAULT_UI_PREFERENCES, granted: true })).toEqual([]);
    expect(desired(false)).toEqual([]);
  });
  it("uses one daily and one weekly repeating request, never dated ones", () => {
    expect(desired()).toEqual([
      { id: "body-reminder:weight", kind: "weight", time: "08:00" },
      { id: "body-reminder:check-in", kind: "check-in", time: "09:30", weekday: 2 },
    ]);
  });
  it("is idempotent and replaces changed settings or text", () => {
    const first = planBodyReminders(desired(), [], "en");
    const held = first.schedule.map((entry) => ({ id: entry.id, signature: entry.signature }));
    expect(planBodyReminders(desired(), held, "en")).toEqual({ cancel: [], schedule: [] });
    expect(planBodyReminders(desired(), held, "new text").cancel).toHaveLength(2);
    const changed = desired().map((entry) => ({ ...entry, time: "10:00" }));
    expect(planBodyReminders(changed, held, "en").schedule).toHaveLength(2);
  });
  it("cancels only its own requests, including leftovers from older schedules", () => {
    const held = planBodyReminders(desired(), [], "en").schedule.map(({ id, signature }) => ({
      id,
      signature,
    }));
    const leftover = { id: `${BODY_REMINDER_PREFIX}weight:skip:3`, signature: "old" };
    expect(
      planBodyReminders(desired(), [...held, leftover, { id: "rest:other", signature: "" }], "en"),
    ).toEqual({ cancel: [leftover.id], schedule: [] });
    expect(planBodyReminders([], held, "en").cancel).toEqual(held.map((entry) => entry.id));
  });
});
