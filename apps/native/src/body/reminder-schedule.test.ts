import { describe, expect, it } from "vitest";
import { DEFAULT_UI_PREFERENCES } from "@workspace/shared";
import { desiredBodyReminders, nextReminderFire, planBodyReminders } from "./reminder-schedule";
const ui = {
  ...DEFAULT_UI_PREFERENCES,
  weighInReminder: { enabled: true, time: "08:00" },
  checkInReminder: { enabled: true, weekday: 2, time: "09:30" },
};
const now = new Date(2026, 10, 15, 7).getTime();
const desired = (loggedToday = false, granted = true) =>
  desiredBodyReminders({ ui, now, loggedToday, granted });
describe("body reminder schedule", () => {
  it("has no requests by default or without permission", () => {
    expect(
      desiredBodyReminders({ ui: DEFAULT_UI_PREFERENCES, now, loggedToday: false, granted: true }),
    ).toEqual([]);
    expect(desired(false, false)).toEqual([]);
  });
  it("uses a daily and a weekly repeating request", () => {
    expect(desired()).toEqual([
      { id: "body-reminder:weight", kind: "weight", time: "08:00" },
      { id: "body-reminder:check-in", kind: "check-in", time: "09:30", weekday: 2 },
    ]);
  });
  it("skips today's weigh-in without dropping the other weekdays or Check-in", () => {
    const requests = desired(true);
    expect(requests).toHaveLength(55);
    const fire = requests
      .filter((entry) => entry.kind === "weight")
      .map((entry) => entry.date ?? nextReminderFire(now, entry.time, entry.weekday));
    expect(fire.every((time) => time > new Date(2026, 10, 15, 23, 59).getTime())).toBe(true);
    expect(requests.some((entry) => entry.kind === "check-in")).toBe(true);
    expect(fire).toContain(new Date(2026, 10, 16, 8).getTime());
    expect(fire).toContain(new Date(2026, 10, 22, 8).getTime());
  });
  it("restores daily repetition after today's chosen time", () => {
    expect(
      desiredBodyReminders({
        ui,
        now: new Date(2026, 10, 15, 9).getTime(),
        loggedToday: true,
        granted: true,
      }),
    ).toEqual(desired());
  });
  it("is idempotent and replaces changed settings, text or zone", () => {
    const first = planBodyReminders(desired(), [], "en:zone");
    const held = first.schedule.map((entry) => ({ id: entry.id, signature: entry.signature }));
    expect(planBodyReminders(desired(), held, "en:zone")).toEqual({ cancel: [], schedule: [] });
    expect(planBodyReminders(desired(), held, "new-zone").cancel).toHaveLength(2);
    const changed = desired().map((entry) => ({ ...entry, time: "10:00" }));
    expect(planBodyReminders(changed, held, "en:zone").schedule).toHaveLength(2);
    expect(
      planBodyReminders([], [...held, { id: "rest:other", signature: "" }], "en:zone"),
    ).toEqual({ cancel: held.map((entry) => entry.id), schedule: [] });
  });
  it("replaces the skipped-day requests on the next reconciliation", () => {
    const held = planBodyReminders(desired(true), [], "en").schedule;
    const plan = planBodyReminders(desired(), held, "en");
    expect(plan.cancel).toHaveLength(54);
    expect(plan.schedule).toHaveLength(1);
  });
});
describe("next reminder fire", () => {
  it("keeps device wall-clock time and advances at the exact firing time", () => {
    expect(nextReminderFire(now, "08:00")).toBe(new Date(2026, 10, 15, 8).getTime());
    expect(nextReminderFire(new Date(2026, 10, 15, 8).getTime(), "08:00")).toBe(
      new Date(2026, 10, 16, 8).getTime(),
    );
  });
  it("wraps weekdays and crosses year boundaries", () => {
    expect(nextReminderFire(now, "09:30", 2)).toBe(new Date(2026, 10, 16, 9, 30).getTime());
    const monday = new Date(2026, 10, 16, 10).getTime();
    expect(nextReminderFire(monday, "09:30", 2)).toBe(new Date(2026, 10, 23, 9, 30).getTime());
    expect(nextReminderFire(new Date(2026, 11, 31, 23).getTime(), "08:00")).toBe(
      new Date(2027, 0, 1, 8).getTime(),
    );
  });
});

it("keeps the chosen hour over spring and autumn DST transitions", () => {
  for (const { month, day } of [
    { month: 2, day: 13 },
    { month: 10, day: 6 },
  ]) {
    const before = new Date(2027, month, day, 23).getTime();
    const next = new Date(nextReminderFire(before, "08:00"));
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(day + 1);
  }
});

it("returns to the chosen hour after a nonexistent spring-forward time", () => {
  const now = new Date(2027, 2, 14, 4).getTime();
  expect(nextReminderFire(now, "02:30")).toBe(new Date(2027, 2, 15, 2, 30).getTime());
});
