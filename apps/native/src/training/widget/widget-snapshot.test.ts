import { nativeColors } from "@workspace/ui/tokens/brand";
import { describe, expect, it } from "vitest";

import {
  buildWidgetSnapshot,
  sameSnapshotContent,
  weekDots,
  weekExpiry,
  widgetSnapshotSchema,
  type WidgetInput,
} from "./widget-snapshot";

const input = (over: Partial<WidgetInput> = {}): WidgetInput => ({
  signedIn: true,
  scheme: "cinnabar",
  now: 1000,
  colors: {
    surface: "#111111",
    ink: "#ffffff",
    muted: "#999999",
    accent: "#aa66ff",
    onAccent: "#000000",
  },
  text: {
    signedOutTitle: "Sign in",
    openApp: "Open Cinnabar",
    planWorkout: "Plan a workout",
    noWorkouts: "No workouts yet",
    start: "Start",
    resume: "Resume",
    nextWorkout: "Next workout",
    nextDay: (day, total) => `Next · Day ${day} of ${total}`,
    inProgress: "In progress",
    weekHeading: "This week",
    weekLabel: (done, goal) => (goal === null ? `${done}` : `${done} of ${goal}`),
  },
  active: null,
  next: null,
  recent: null,
  sessionsThisWeek: 2,
  weekExpiresAt: Date.parse("1970-01-05T00:00:00Z"),
  goal: 4,
  ...over,
});

describe("buildWidgetSnapshot", () => {
  it("points at the next workout with its rotation position", () => {
    const snapshot = buildWidgetSnapshot(
      input({ next: { workoutId: "w 1", title: "Push", day: 2, total: 4 } }),
    );
    expect(snapshot).toMatchObject({
      kind: "workout",
      eyebrow: "Next · Day 2 of 4",
      title: "Push",
      button: "Start",
      url: "cinnabar://widget-start?workout=w%201",
    });
    expect(snapshot.week).toEqual({
      heading: "This week",
      label: "2 of 4",
      dots: [true, true, false, false],
      expiresAt: Date.parse("1970-01-05T00:00:00Z"),
    });
    expect(widgetSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("falls back to the most recent workout without a program", () => {
    const snapshot = buildWidgetSnapshot(input({ recent: { workoutId: "r", title: "Legs" } }));
    expect(snapshot).toMatchObject({ kind: "workout", title: "Legs", eyebrow: "Next workout" });
  });

  it("resumes an active session before anything else", () => {
    const snapshot = buildWidgetSnapshot(
      input({
        active: { id: "s1", title: "Pull" },
        next: { workoutId: "w", title: "Push", day: 1, total: 3 },
      }),
    );
    expect(snapshot).toMatchObject({
      kind: "resume",
      title: "Pull",
      button: "Resume",
      url: "cinnabar://session/s1",
    });
  });

  it("offers planning a workout when there are none", () => {
    expect(buildWidgetSnapshot(input())).toMatchObject({
      kind: "empty",
      button: "Plan a workout",
      url: "cinnabar://train",
    });
  });

  it("asks a signed-out user to open the app and shows no week", () => {
    expect(buildWidgetSnapshot(input({ signedIn: false }))).toMatchObject({
      kind: "signedOut",
      button: "Open Cinnabar",
      url: "cinnabar://",
      week: null,
    });
  });
});

describe("weekExpiry", () => {
  it("expires at the start of the next local week across a DST change", () => {
    const sunday = new Date("2026-10-31T23:00:00Z");
    expect(weekExpiry(sunday, "America/New_York", "monday")).toBe(
      Date.parse("2026-11-02T05:00:00Z"),
    );
    expect(weekExpiry(sunday, "America/New_York", "sunday")).toBe(
      Date.parse("2026-11-01T04:00:00Z"),
    );
  });
});

describe("weekDots", () => {
  it("has no dots without a goal", () => {
    expect(weekDots(3, null)).toEqual([]);
    expect(weekDots(3, 0)).toEqual([]);
  });
  it("caps at the goal and at the dot limit", () => {
    expect(weekDots(6, 3)).toEqual([true, true, true]);
    expect(weekDots(1, 12)).toHaveLength(7);
  });
});

describe("sameSnapshotContent", () => {
  it("ignores the time stamp", () => {
    expect(
      sameSnapshotContent(buildWidgetSnapshot(input()), buildWidgetSnapshot(input({ now: 9 }))),
    ).toBe(true);
    expect(
      sameSnapshotContent(buildWidgetSnapshot(input()), buildWidgetSnapshot(input({ goal: 5 }))),
    ).toBe(false);
    expect(
      sameSnapshotContent(
        buildWidgetSnapshot(input()),
        buildWidgetSnapshot(input({ weekExpiresAt: Date.parse("1970-01-12T00:00:00Z") })),
      ),
    ).toBe(false);
  });
});

describe("theme colours", () => {
  it("are hex in every variant, which the widget parses natively", () => {
    for (const tokens of Object.values(nativeColors)) {
      for (const role of [
        "surface",
        "text-primary",
        "text-muted",
        "action",
        "on-action",
      ] as const) {
        expect(tokens[role]).toMatch(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
      }
    }
  });
});
