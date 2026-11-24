import { describe, expect, it } from "vitest";

import { homeWeek, lastWorkoutSession, sessionMinutes, weekSummary } from "./home-stats";

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday

describe("homeWeek", () => {
  const sessions = [
    { started_at: "2026-11-16T07:00:00Z" },
    { started_at: "2026-11-18T09:00:00Z" },
    { started_at: "2026-11-18T17:00:00Z" },
    { started_at: "2026-11-09T09:00:00Z" },
  ];
  const week = homeWeek(sessions, NOW, "UTC", "monday", true);

  it("runs Monday to Sunday with today", () => {
    expect(new Date(week.days[0] ?? 0).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(week.days).toHaveLength(7);
    expect(new Date(week.today).toISOString().slice(0, 10)).toBe("2026-11-18");
  });
  it("marks each trained day once and ignores other weeks", () => {
    expect([...week.trained].toSorted()).toEqual([
      Date.parse("2026-11-16"),
      Date.parse("2026-11-18"),
    ]);
  });
  it("plans the next workout for tomorrow once today is trained", () => {
    expect(new Date(week.planned ?? 0).toISOString().slice(0, 10)).toBe("2026-11-19");
  });
  it("plans it for today until today is trained", () => {
    const early = homeWeek(sessions.slice(0, 1), NOW, "UTC", "monday", true);
    expect(early.planned).toBe(early.today);
  });
  it("plans nothing without a next workout", () => {
    expect(homeWeek(sessions, NOW, "UTC", "monday", false).planned).toBeNull();
  });
  it("uses the user's zone for the day a Session started on", () => {
    // 23:30 UTC Sunday is already Monday in Auckland.
    const auckland = homeWeek(
      [{ started_at: "2026-11-15T23:30:00Z" }],
      NOW,
      "Pacific/Auckland",
      "monday",
      false,
    );
    expect(auckland.trained.has(Date.parse("2026-11-16"))).toBe(true);
  });
  it("follows a Sunday week start", () => {
    const sunday = homeWeek([], NOW, "UTC", "sunday", false);
    expect(new Date(sunday.days[0] ?? 0).toISOString().slice(0, 10)).toBe("2026-11-15");
  });
  it("browses a past week with that week's trained days and no future plan", () => {
    const previous = homeWeek(sessions, NOW, "UTC", "monday", true, 1);
    expect(previous.days[0]).toBe(Date.parse("2026-11-09"));
    expect([...previous.trained]).toEqual([Date.parse("2026-11-09")]);
    expect(previous.today).toBe(Date.parse("2026-11-18"));
    expect(previous.planned).toBeNull();
  });
});

describe("weekSummary", () => {
  const set = (id: string, weight: number, reps: number) => ({
    id,
    exercise_id: "squat",
    exercise_type: "weight_reps" as const,
    kind: "working" as const,
    completed_at: "2026-11-16T07:30:00Z",
    weight_kg: weight,
    reps,
    duration_s: null,
    distance_m: null,
    floors: null,
    steps: null,
  });
  const sessions = [
    { started_at: "2026-11-18T09:00:00Z", sets: [set("a", 100, 5), set("b", 100, 5)] },
    { started_at: "2026-11-16T07:00:00Z", sets: [set("c", 50, 10)] },
    { started_at: "2026-11-10T09:00:00Z", sets: [set("d", 80, 5)] },
    { started_at: "2026-10-01T09:00:00Z", sets: [set("e", 80, 5)] },
  ];

  it("totals this week and last week up to the same point", () => {
    const { current, previous } = weekSummary(sessions, NOW, "UTC", "monday");
    // Last week up to Wednesday 12:00: the Tuesday session counts.
    expect(current).toEqual({ sessions: 2, sets: 3, volumeKg: 1500 });
    expect(previous).toEqual({ sessions: 1, sets: 1, volumeKg: 400 });
  });

  it("leaves out last week's sessions after the same weekday and time", () => {
    const later = [
      ...sessions,
      { started_at: "2026-11-11T12:00:01Z", sets: [set("f", 100, 10)] }, // 1 s after the cut-off
      { started_at: "2026-11-14T09:00:00Z", sets: [set("g", 100, 10)] }, // Saturday
    ];
    expect(weekSummary(later, NOW, "UTC", "monday").previous.sessions).toBe(1);
    const atCutoff = [{ started_at: "2026-11-11T12:00:00Z", sets: [set("h", 60, 5)] }];
    expect(weekSummary(atCutoff, NOW, "UTC", "monday").previous.sessions).toBe(1);
  });

  it("has an empty comparison when last week has nothing yet", () => {
    const lateOnly = [{ started_at: "2026-11-13T09:00:00Z", sets: [set("i", 80, 5)] }];
    expect(weekSummary(lateOnly, NOW, "UTC", "monday").previous.sessions).toBe(0);
  });

  it("follows the week start", () => {
    // Sunday start: this week began Sunday 15th, last week Sunday 8th; cut-off is Sun 8th + 3 d 12 h.
    const sundays = [
      { started_at: "2026-11-08T10:00:00Z", sets: [set("j", 50, 5)] },
      { started_at: "2026-11-11T13:00:00Z", sets: [set("k", 50, 5)] }, // after the cut-off
    ];
    expect(weekSummary(sundays, NOW, "UTC", "sunday").previous.sessions).toBe(1);
    // Monday start: last week began Monday 9th, cut-off Wed 11th 12:00, so both count.
    expect(weekSummary(sundays, NOW, "UTC", "monday").previous.sessions).toBe(0);
  });

  it("uses the user's zone for the weekday and time of day", () => {
    // Now is Wed 12:00 UTC = Thu 01:00 in Auckland (UTC+13): the cut-off is Thu 01:00 local.
    const zoned = [
      { started_at: "2026-11-11T11:30:00Z", sets: [set("l", 50, 5)] }, // Thu 00:30 local, in
      { started_at: "2026-11-11T12:30:00Z", sets: [set("m", 50, 5)] }, // Thu 01:30 local, out
    ];
    expect(weekSummary(zoned, NOW, "Pacific/Auckland", "monday").previous.sessions).toBe(1);
  });

  it("keeps the wall-clock offset across a daylight-saving change", () => {
    // Berlin leaves summer time on 2026-10-25. Now is Wed 28 Oct 12:00 local (11:00 UTC); last
    // week's cut-off is Wed 21 Oct 12:00 local (10:00 UTC), before the change.
    const berlin = new Date("2026-10-28T11:00:00Z");
    const zoned = [
      { started_at: "2026-10-21T09:59:00Z", sets: [set("n", 50, 5)] }, // 11:59 local, in
      { started_at: "2026-10-21T10:01:00Z", sets: [set("o", 50, 5)] }, // 12:01 local, out
    ];
    expect(weekSummary(zoned, berlin, "Europe/Berlin", "monday").previous.sessions).toBe(1);
  });
});

describe("lastWorkoutSession", () => {
  const sessions = [
    { id: "a", workoutId: "push" },
    { id: "b", workoutId: "pull" },
    { id: "c", workoutId: "push" },
  ];
  it("finds the newest session of the workout", () => {
    expect(lastWorkoutSession(sessions, "push")?.id).toBe("a");
    expect(lastWorkoutSession(sessions, "legs")).toBeNull();
    expect(lastWorkoutSession(sessions, null)).toBeNull();
  });
});

describe("sessionMinutes", () => {
  it("rounds the elapsed time without the pauses", () => {
    expect(
      sessionMinutes({
        started_at: "2026-11-16T07:00:00Z",
        finished_at: "2026-11-16T08:05:00Z",
        durationS: null,
        pausedMs: 5 * 60_000,
      }),
    ).toBe(60);
  });
});
