import { describe, expect, it } from "vitest";

import { planRestSchedule, restNotificationId, type ScheduleSession } from "./rest-schedule";

const now = Date.parse("2026-01-01T10:00:00.000Z");
const soon = "2026-01-01T10:01:30.000Z";
const session = (overrides: Partial<ScheduleSession> = {}): ScheduleSession => ({
  id: "s1",
  title: "Push",
  restEndsAt: soon,
  owned: true,
  ...overrides,
});
const plan = (
  sessions: ScheduleSession[],
  scheduledIds: string[] = [],
  known: [string, number][] = [],
  granted = true,
) => planRestSchedule({ sessions, scheduledIds, known: new Map(known), now, granted });

describe("planRestSchedule", () => {
  it("schedules the Rest of a Session this device owns at its end", () => {
    expect(plan([session()])).toEqual({
      schedule: [{ sessionId: "s1", title: "Push", endsAt: Date.parse(soon) }],
      cancel: [],
    });
  });

  it("leaves a notification alone that is already scheduled for the stored end", () => {
    const held = [restNotificationId("s1")];
    expect(plan([session()], held, [["s1", Date.parse(soon)]])).toEqual({
      schedule: [],
      cancel: [],
    });
  });

  it("replaces one whose end moved (+15 or a new tick), and one the system lost", () => {
    const held = [restNotificationId("s1")];
    expect(plan([session()], held, [["s1", Date.parse(soon) - 15_000]]).schedule).toHaveLength(1);
    expect(plan([session()], [], [["s1", Date.parse(soon)]]).schedule).toHaveLength(1);
  });

  it("cancels when the Rest was skipped, ended or cleared", () => {
    const held = [restNotificationId("s1")];
    expect(plan([session({ restEndsAt: null })], held)).toEqual({ schedule: [], cancel: held });
    expect(plan([session({ restEndsAt: "2026-01-01T09:59:00.000Z" })], held).cancel).toEqual(held);
    expect(plan([session({ restEndsAt: "2026-01-01T10:00:00.500Z" })], held).cancel).toEqual(held);
  });

  it("cancels a Session taken over by another device and one that is gone", () => {
    const held = [restNotificationId("s1"), restNotificationId("gone")];
    expect(plan([session({ owned: false })], held)).toEqual({ schedule: [], cancel: held });
  });

  it("schedules nothing without permission and cancels what is left", () => {
    const held = [restNotificationId("s1")];
    expect(plan([session()], held, [], false)).toEqual({ schedule: [], cancel: held });
  });

  it("keeps one notification per Session", () => {
    const result = plan([session(), session({ id: "s2", restEndsAt: "2026-01-01T10:05:00.000Z" })]);
    expect(result.schedule.map((entry) => entry.sessionId)).toEqual(["s1", "s2"]);
  });
});
