import { describe, expect, it } from "vitest";

import {
  comparableWeekSessions,
  ratioChange,
  goalFraction,
  homeWeek,
  sessionsInWeek,
  weekSummary,
} from "./home-stats";

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday

it("compares through the same local weekday in both weeks", () => {
  const sessions = [
    { started_at: "2026-11-11T04:00:00Z" },
    { started_at: "2026-11-11T23:00:00Z" }, // Thursday in Kolkata
    { started_at: "2026-11-18T04:00:00Z" },
  ];
  expect(comparableWeekSessions(sessions, NOW, "Asia/Kolkata", "monday")).toEqual({
    current: [sessions[2]],
    previous: [sessions[0]],
  });
});

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
  const set = (reps: number, completed = true) => ({
    id: String(reps),
    exercise_id: "e",
    exercise_type: "weight_reps" as const,
    kind: "working" as const,
    completed_at: completed ? "2026-11-18T09:00:00Z" : null,
    weight_kg: 100,
    reps,
  });
  it("counts completed sets and compares them with last week", () => {
    const summary = weekSummary(
      [{ sets: [set(5), set(5), set(5, false)] }, { sets: [set(10)] }],
      [{ sets: [set(5)] }],
      null,
    );
    expect(summary.sessions).toBe(2);
    expect(summary.sets).toBe(3);
    expect(summary.volume).toBe(2000);
    expect(summary.setsChange).toBe(2);
    expect(summary.volumeChange).toBe(3);
  });
  it("has no change when last week was empty", () => {
    expect(weekSummary([{ sets: [set(5)] }], [], null).setsChange).toBeNull();
  });
});

describe("goalFraction", () => {
  it("is the share of the goal, capped at one", () => {
    expect(goalFraction(2, 4)).toBe(0.5);
    expect(goalFraction(6, 4)).toBe(1);
  });
  it("is zero without a goal", () => {
    expect(goalFraction(3, null)).toBe(0);
    expect(goalFraction(3, 0)).toBe(0);
  });
});

describe("sessionsInWeek", () => {
  const sessions = [
    { started_at: "2026-11-15T09:00:00Z" },
    { started_at: "2026-11-16T09:00:00Z" },
    { started_at: "2026-11-10T09:00:00Z" },
  ];
  it("keeps Sessions of this week or of an earlier one", () => {
    expect(sessionsInWeek(sessions, NOW, "UTC", "monday")).toHaveLength(1);
    expect(sessionsInWeek(sessions, NOW, "UTC", "monday", 1)).toHaveLength(2);
    // With Sunday first the Sunday Session belongs to this week.
    expect(sessionsInWeek(sessions, NOW, "UTC", "sunday")).toHaveLength(2);
  });
});

describe("ratioChange", () => {
  it("is null when last week was zero", () => {
    expect(ratioChange(5, 0)).toBeNull();
  });
  it("is the relative change", () => {
    expect(ratioChange(106, 100)).toBeCloseTo(0.06);
    expect(ratioChange(50, 100)).toBeCloseTo(-0.5);
  });
});
