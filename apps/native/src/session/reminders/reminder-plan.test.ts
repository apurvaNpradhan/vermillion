import { DEFAULT_UI_PREFERENCES } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  defaultTrainingWeekdays,
  desiredReportReminders,
  desiredTrainingReminders,
  planReminders,
  reminderSignature,
  startedTrainingReminderId,
  trainingWeekdays,
  type StartedSession,
} from "./reminder-plan";

// Default the test phone to UTC, independent of the test runner’s time zone.
const timeZone = "UTC";
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  date(y, m - 1, d, h, min).toISOString();
const date = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, d, h, min));
// Wednesday 2026-11-25, 10:00.
const now = date(2026, 10, 25, 10, 0);
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
      timeZone,
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
    expect(entries[0]?.at).toBe(date(2026, 10, 25, 18, 0).getTime());
    expect(entries.every((entry) => entry.url === "/train")).toBe(true);
  });

  it("skips today once its time has passed", () => {
    expect(days(plan({ now: date(2026, 10, 25, 18, 0) }))[0]).toBe("2026-11-27");
  });

  it("skips a day on which a Session already started, finished or not", () => {
    const sessions: StartedSession[] = [{ startedAt: local(2026, 11, 25, 7, 30), finished: false }];
    expect(days(plan({ sessions }))[0]).toBe("2026-11-27");
    expect(
      days(plan({ sessions: [{ startedAt: local(2026, 11, 24, 7), finished: true }] }))[0],
    ).toBe("2026-11-25");
  });

  it("moves a skipped spring-forward time forward and keeps the following Sunday at 02:30", () => {
    const entries = plan({
      now: new Date("2026-03-08T05:00:00Z"),
      timeZone: "America/New_York",
      reminder: { enabled: true, weekdays: [1], time: "02:30" },
    });
    expect(entries.map(({ at }) => new Date(at).toISOString())).toEqual([
      "2026-03-08T07:30:00.000Z",
      "2026-03-15T06:30:00.000Z",
    ]);
  });

  it("uses the first fall-back occurrence and never schedules the second one", () => {
    const input = {
      timeZone: "America/New_York",
      reminder: { enabled: true, weekdays: [1], time: "01:30" },
    };
    const entries = plan({ ...input, now: new Date("2026-11-01T04:00:00Z") });
    expect(entries.map(({ at }) => new Date(at).toISOString())).toEqual([
      "2026-11-01T05:30:00.000Z",
      "2026-11-08T06:30:00.000Z",
    ]);
    expect(days(plan({ ...input, now: new Date("2026-11-01T06:00:00Z") }))).not.toContain(
      "2026-11-01",
    );
  });

  it("uses the setup answer while no days were chosen", () => {
    const entries = plan({ reminder: { ...reminder, weekdays: null }, sessionsPerWeek: 2 });
    expect(days(entries)).toEqual(["2026-11-26", "2026-11-30", "2026-12-03", "2026-12-07"]);
  });
});

describe("startedTrainingReminderId", () => {
  it("cancels the request for the phone's local date as soon as a Session is visible", () => {
    const zone = "Asia/Kolkata";
    const sessions = [{ startedAt: "2026-11-25T22:00:00Z", finished: false }];
    expect(startedTrainingReminderId(sessions, new Date("2026-11-26T02:00:00Z"), zone)).toBe(
      "training-reminder:2026-11-26",
    );
    expect(startedTrainingReminderId(sessions, new Date("2026-11-25T16:00:00Z"), zone)).toBeNull();
  });
});

describe("report reminders", () => {
  const report = { enabled: true };
  const october = [{ startedAt: local(2026, 10, 14, 18), finished: true }];
  const plan = (nowDate: Date, sessions: StartedSession[]) =>
    desiredReportReminders({
      now: nowDate,
      timeZone,
      reminder: report,
      time: "09:00",
      sessions,
      granted: true,
    });

  it("is off by default and without permission", () => {
    expect(
      desiredReportReminders({
        now,
        timeZone,
        reminder: DEFAULT_UI_PREFERENCES.reportReminder,
        time: "09:00",
        sessions: october,
        granted: true,
      }),
    ).toEqual([]);
    expect(
      desiredReportReminders({
        now,
        timeZone,
        reminder: report,
        time: "09:00",
        sessions: october,
        granted: false,
      }),
    ).toEqual([]);
  });

  it("fires on the 1st for the month before it, only if that month had a finished Session", () => {
    // From mid-October the next 1st is 1 November, for October.
    const entries = plan(date(2026, 9, 20, 10), october);
    expect(entries.slice(0, 1)).toEqual([
      {
        kind: "report",
        id: "report-reminder:2026-10",
        at: date(2026, 10, 1, 9, 0).getTime(),
        url: "/history/report/2026-10",
        period: { kind: "month", year: 2026, month: 10 },
      },
    ]);
    expect(plan(date(2026, 9, 20, 10), [])).toEqual([]);
    expect(plan(date(2026, 9, 20, 10), [{ ...october[0]!, finished: false }])).toEqual([]);
  });

  it("targets today's 1st before the time, the next month's after it", () => {
    const sessions = [{ startedAt: local(2026, 10, 14, 18), finished: true }];
    expect(plan(date(2026, 10, 1, 8), sessions)[0]?.id).toBe("report-reminder:2026-10");
    expect(plan(date(2026, 10, 1, 9, 0), sessions).map(({ id }) => id)).toEqual([
      "report-reminder:2026",
    ]);
  });

  it("adds the year on 1 January", () => {
    const sessions = [
      { startedAt: local(2026, 3, 2, 18), finished: true },
      { startedAt: local(2026, 12, 20, 18), finished: true },
    ];
    const entries = plan(date(2026, 11, 28, 10), sessions);
    expect(entries.map((entry) => entry.id)).toEqual([
      "report-reminder:2026-12",
      "report-reminder:2026",
    ]);
    expect(entries[1]?.url).toBe("/history/report/2026");
    // A year with Sessions only in early months still offers the year, not December.
    const early = plan(date(2026, 11, 28, 10), [sessions[0]!]);
    expect(early.map((entry) => entry.id)).toEqual(["report-reminder:2026"]);
  });

  it("schedules January's yearly report even when the next monthly report is in December", () => {
    const sessions = [{ startedAt: local(2026, 11, 10, 18), finished: true }];
    expect(plan(date(2026, 10, 25, 10), sessions).map(({ id, at }) => [id, at])).toEqual([
      ["report-reminder:2026-11", Date.UTC(2026, 11, 1, 9)],
      ["report-reminder:2026", Date.UTC(2027, 0, 1, 9)],
    ]);
  });
});

describe("planReminders", () => {
  const content = { title: "Training", body: "Upper A is next." };
  const desired = desiredTrainingReminders({
    now,
    timeZone,
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

  it("replaces dates at the old zone's instants after travel", () => {
    const moved = desiredTrainingReminders({
      now,
      timeZone: "America/Los_Angeles",
      reminder,
      sessionsPerWeek: null,
      sessions: [],
      granted: true,
    }).map((entry) => ({ ...entry, signature: reminderSignature(entry, content) }));

    const result = planReminders(moved, desired);
    expect(result.cancel).toEqual(desired.map(({ id }) => id));
    expect(result.schedule).toEqual(moved);
    expect(moved[0]?.at).toBe(Date.UTC(2026, 10, 26, 2));
  });

  it("never touches requests it does not own", () => {
    const held = [
      { id: "body-reminder:weight", signature: "x" },
      { id: "rest:abc", signature: "" },
    ];
    expect(planReminders([], held)).toEqual({ cancel: [], schedule: [] });
  });
});
