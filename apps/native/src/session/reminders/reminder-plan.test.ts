import { DEFAULT_UI_PREFERENCES } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  defaultTrainingWeekdays,
  desiredReportReminders,
  desiredTrainingReminders,
  periodHadSessions,
  planReminders,
  reminderSignature,
  startedOnDay,
  trainingWeekdays,
  type StartedSession,
} from "./reminder-plan";

// All dates are local wall-clock times, like the notifications.
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();
// Wednesday 2026-11-25, 10:00.
const now = new Date(2026, 10, 25, 10, 0);
const reminder = { enabled: true, weekdays: [2, 4, 6], time: "18:00" };
const days = (entries: { id: string }[]) => entries.map((entry) => entry.id.split(":")[1]);

describe("training weekdays", () => {
  it("follows sessions per week until days are chosen", () => {
    expect(defaultTrainingWeekdays(2)).toEqual([2, 5]);
    expect(defaultTrainingWeekdays(null)).toEqual([2, 4, 6]);
    expect(defaultTrainingWeekdays(9)).toEqual([2, 4, 6]);
    expect(trainingWeekdays({ weekdays: null }, 4)).toEqual([2, 3, 5, 6]);
    expect(trainingWeekdays({ weekdays: [6, 2, 6] }, 4)).toEqual([2, 6]);
  });
});

describe("training reminders", () => {
  const plan = (overrides: Partial<Parameters<typeof desiredTrainingReminders>[0]> = {}) =>
    desiredTrainingReminders({
      now,
      reminder,
      sessionsPerWeek: null,
      sessions: [],
      granted: true,
      ...overrides,
    });

  it("is off by default and without permission", () => {
    expect(plan({ reminder: DEFAULT_UI_PREFERENCES.trainingReminder })).toEqual([]);
    expect(plan({ granted: false })).toEqual([]);
  });

  it("schedules the chosen weekdays for the next two weeks at the reminder time", () => {
    const entries = plan();
    // Wed 25 Nov, Fri 27, Mon 30, Wed 2 Dec, Fri 4, Mon 7, Wed 9; 14 days end on Tue 8 Dec.
    expect(days(entries)).toEqual([
      "2026-11-25",
      "2026-11-27",
      "2026-11-30",
      "2026-12-02",
      "2026-12-04",
      "2026-12-07",
    ]);
    expect(entries[0]?.at).toBe(new Date(2026, 10, 25, 18, 0).getTime());
    expect(entries.every((entry) => entry.url === "/train")).toBe(true);
  });

  it("skips today once its time has passed", () => {
    expect(days(plan({ now: new Date(2026, 10, 25, 18, 0) }))[0]).toBe("2026-11-27");
  });

  it("skips a day on which a Session already started, finished or not", () => {
    const sessions: StartedSession[] = [{ startedAt: local(2026, 11, 25, 7, 30), finished: false }];
    expect(days(plan({ sessions }))[0]).toBe("2026-11-27");
    expect(
      days(plan({ sessions: [{ startedAt: local(2026, 11, 24, 7), finished: true }] }))[0],
    ).toBe("2026-11-25");
  });

  it("uses the setup answer while no days were chosen", () => {
    const entries = plan({ reminder: { ...reminder, weekdays: null }, sessionsPerWeek: 2 });
    expect(days(entries)).toEqual(["2026-11-26", "2026-11-30", "2026-12-03", "2026-12-07"]);
  });
});

describe("startedOnDay", () => {
  it("compares local calendar days", () => {
    const sessions = [{ startedAt: local(2026, 11, 25, 23, 59), finished: true }];
    expect(startedOnDay(sessions, new Date(2026, 10, 25, 0, 1))).toBe(true);
    expect(startedOnDay(sessions, new Date(2026, 10, 26, 0, 1))).toBe(false);
  });
});

describe("report reminders", () => {
  const report = { enabled: true };
  const october = [{ startedAt: local(2026, 10, 14, 18), finished: true }];
  const plan = (nowDate: Date, sessions: StartedSession[]) =>
    desiredReportReminders({
      now: nowDate,
      reminder: report,
      time: "09:00",
      sessions,
      granted: true,
    });

  it("is off by default and without permission", () => {
    expect(
      desiredReportReminders({
        now,
        reminder: DEFAULT_UI_PREFERENCES.reportReminder,
        time: "09:00",
        sessions: october,
        granted: true,
      }),
    ).toEqual([]);
    expect(
      desiredReportReminders({
        now,
        reminder: report,
        time: "09:00",
        sessions: october,
        granted: false,
      }),
    ).toEqual([]);
  });

  it("fires on the 1st for the month before it, only if that month had a finished Session", () => {
    // From mid-October the next 1st is 1 November, for October.
    const entries = plan(new Date(2026, 9, 20, 10), october);
    expect(entries).toEqual([
      {
        kind: "report",
        id: "report-reminder:2026-10",
        at: new Date(2026, 10, 1, 9, 0).getTime(),
        url: "/history/report/2026-10",
        period: { kind: "month", year: 2026, month: 10 },
      },
    ]);
    expect(plan(new Date(2026, 9, 20, 10), [])).toEqual([]);
    expect(plan(new Date(2026, 9, 20, 10), [{ ...october[0]!, finished: false }])).toEqual([]);
  });

  it("targets today's 1st before the time, the next month's after it", () => {
    const sessions = [{ startedAt: local(2026, 10, 14, 18), finished: true }];
    expect(plan(new Date(2026, 10, 1, 8), sessions)[0]?.id).toBe("report-reminder:2026-10");
    expect(plan(new Date(2026, 10, 1, 9, 0), sessions)).toEqual([]);
  });

  it("adds the year on 1 January", () => {
    const sessions = [
      { startedAt: local(2026, 3, 2, 18), finished: true },
      { startedAt: local(2026, 12, 20, 18), finished: true },
    ];
    const entries = plan(new Date(2026, 11, 28, 10), sessions);
    expect(entries.map((entry) => entry.id)).toEqual([
      "report-reminder:2026-12",
      "report-reminder:2026",
    ]);
    expect(entries[1]?.url).toBe("/history/report/2026");
    // A year with Sessions only in early months still offers the year, not December.
    const early = plan(new Date(2026, 11, 28, 10), [sessions[0]!]);
    expect(early.map((entry) => entry.id)).toEqual(["report-reminder:2026"]);
  });

  it("periodHadSessions ignores other periods", () => {
    expect(periodHadSessions(october, { year: 2026, month: 10 })).toBe(true);
    expect(periodHadSessions(october, { year: 2026, month: 9 })).toBe(false);
    expect(periodHadSessions(october, { year: 2025 })).toBe(false);
  });
});

describe("planReminders", () => {
  const content = { title: "Training", body: "Upper A is next." };
  const desired = desiredTrainingReminders({
    now,
    reminder,
    sessionsPerWeek: null,
    sessions: [],
    granted: true,
  }).map((entry) => ({ ...entry, signature: reminderSignature(entry, content) }));

  it("schedules everything once, then nothing", () => {
    const first = planReminders(desired, []);
    expect(first.schedule).toHaveLength(desired.length);
    const held = desired.map(({ id, signature }) => ({ id, signature }));
    expect(planReminders(desired, held)).toEqual({ cancel: [], schedule: [] });
  });

  it("replaces changed text and cancels days that are no longer wanted", () => {
    const held = desired.map(({ id, signature }) => ({ id, signature }));
    const reworded = desired.map((entry) => ({ ...entry, signature: "new" }));
    expect(planReminders(reworded, held).cancel).toHaveLength(desired.length);
    expect(planReminders(desired.slice(1), held).cancel).toEqual([desired[0]?.id]);
  });

  it("never touches requests it does not own", () => {
    const held = [
      { id: "body-reminder:weight", signature: "x" },
      { id: "rest:abc", signature: "" },
    ];
    expect(planReminders([], held)).toEqual({ cancel: [], schedule: [] });
  });
});
