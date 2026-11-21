import { describe, expect, it } from "vitest";

import { homeWeek } from "./home-stats";

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
