import { z } from "zod";

/** Most dots the widget draws; a larger goal is shown as text only. */
export const WIDGET_MAX_DOTS = 7;

export const widgetColorsSchema = z.object({
  surface: z.string(),
  ink: z.string(),
  muted: z.string(),
  accent: z.string(),
  onAccent: z.string(),
});
export type WidgetColors = z.infer<typeof widgetColorsSchema>;

/**
 * What the Android widget shows, already localised. The widget never reads the database or any
 * string resource: it draws this and opens `url` when the button is tapped.
 */
export const widgetSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["workout", "resume", "empty", "signedOut"]),
  /** Small line above the title ("Next · Day 2 of 4"); empty when there is none. */
  eyebrow: z.string(),
  title: z.string(),
  button: z.string(),
  url: z.string(),
  /** Null when no weekly goal or no week to show (signed out, empty). */
  week: z
    .object({
      heading: z.string(),
      label: z.string(),
      dots: z.array(z.boolean()),
    })
    .nullable(),
  colors: widgetColorsSchema,
  updatedAt: z.number(),
});
export type WidgetSnapshot = z.infer<typeof widgetSnapshotSchema>;

export type WidgetText = {
  signedOutTitle: string;
  openApp: string;
  planWorkout: string;
  noWorkouts: string;
  start: string;
  resume: string;
  nextWorkout: string;
  nextDay: (day: number, total: number) => string;
  inProgress: string;
  weekHeading: string;
  weekLabel: (done: number, goal: number | null) => string;
};

export type WidgetInput = {
  signedIn: boolean;
  scheme: string;
  now: number;
  colors: WidgetColors;
  text: WidgetText;
  /** An unfinished Session on this device, which the button resumes. */
  active: { id: string; title: string } | null;
  /** The next Workout in the active Program's rotation, if any. */
  next: { workoutId: string; title: string; day: number; total: number } | null;
  /** The most recently trained Workout, used when there is no Program. */
  recent: { workoutId: string; title: string } | null;
  /** Sessions started this week (in the user's week-start and time zone). */
  sessionsThisWeek: number;
  goal: number | null;
};

const link = (scheme: string, path: string) => `${scheme}://${path}`;

/** Filled dots for the sessions done against the goal; none without a goal. */
export function weekDots(done: number, goal: number | null): boolean[] {
  if (goal === null || goal <= 0) return [];
  const count = Math.min(goal, WIDGET_MAX_DOTS);
  const filled = Math.min(Math.max(done, 0), count);
  return Array.from({ length: count }, (_, index) => index < filled);
}

/** The widget's content for one moment; pure, so the host only gathers its inputs. */
export function buildWidgetSnapshot(input: WidgetInput): WidgetSnapshot {
  const { text, scheme } = input;
  const base = { version: 1 as const, colors: input.colors, updatedAt: input.now };
  if (!input.signedIn) {
    return {
      ...base,
      kind: "signedOut",
      eyebrow: "",
      title: text.signedOutTitle,
      button: text.openApp,
      url: link(scheme, ""),
      week: null,
    };
  }
  const week = {
    heading: text.weekHeading,
    label: text.weekLabel(input.sessionsThisWeek, input.goal),
    dots: weekDots(input.sessionsThisWeek, input.goal),
  };
  if (input.active) {
    return {
      ...base,
      kind: "resume",
      eyebrow: text.inProgress,
      title: input.active.title,
      button: text.resume,
      url: link(scheme, `session/${encodeURIComponent(input.active.id)}`),
      week,
    };
  }
  const target = input.next ?? input.recent;
  if (!target) {
    return {
      ...base,
      kind: "empty",
      eyebrow: "",
      title: text.noWorkouts,
      button: text.planWorkout,
      url: link(scheme, "train"),
      week,
    };
  }
  return {
    ...base,
    kind: "workout",
    eyebrow: input.next ? text.nextDay(input.next.day, input.next.total) : text.nextWorkout,
    title: target.title,
    button: text.start,
    url: link(scheme, `widget-start?workout=${encodeURIComponent(target.workoutId)}`),
    week,
  };
}

/** Two snapshots that differ only in time need no native write. */
export const sameSnapshotContent = (a: WidgetSnapshot, b: WidgetSnapshot): boolean =>
  JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
