import {
  DEFAULT_PREVIOUS_SOURCE,
  PREVIOUS_SOURCES,
  WEIGHT_UNITS,
  lighterPeriodSchema,
  sessionActiveSeconds,
  resolveExerciseUnit,
} from "@workspace/shared";
import { z } from "zod";
import type { TFunction } from "i18next";
import type { Ghosts, WeightUnit } from "@workspace/shared";
import type { SessionDetail } from "@workspace/sync";
import { currentAction, valuesText } from "../logging/current-action";
import { formatElapsed } from "../timer/clock";

export const liveOptionsSchema = z.object({
  weightUnit: z.enum(["kg", "lb"]),
  weightIncrementKg: z.number().positive().nullable(),
  weightIncrementUnit: z.enum(WEIGHT_UNITS).nullable().optional(),
  lighterWeeks: z.array(lighterPeriodSchema).default([]),
  previousSource: z.enum(PREVIOUS_SOURCES).default(DEFAULT_PREVIOUS_SOURCE),
  /** The body weight on the Session's day, which the stalled-lift verdict scores weighted lifts with. */
  bodyweightKg: z.number().positive().nullable().default(null),
  soundOn: z.boolean(),
  vibrate: z.boolean().default(true),
});
export const liveActionSchema = z.object({
  sessionId: z.string(),
  setId: z.string().nullable(),
  restEndsAtMs: z.number().nullable(),
  restSetId: z.string().nullable(),
  options: liveOptionsSchema,
});

export const workoutLivePayloadSchema = liveActionSchema.extend({
  title: z.string(),
  phase: z.enum(["work", "rest"]),
  url: z.string(),
  text: z.string(),
  next: z.string(),
  restOver: z.string(),
  /** The chronometer's base: the start moved on by the paused time, so it shows the time trained. */
  sessionStartedAtMs: z.number(),
  /** Paused: the clock is stopped and `pausedText` replaces the action line. */
  paused: z.boolean().default(false),
  pausedText: z.string().default(""),
  workStartedAtMs: z.number(),
  segments: z.array(z.object({ total: z.number(), done: z.number() })),
  canComplete: z.boolean(),
  canLog: z.boolean(),
  channelName: z.string(),
  skipLabel: z.string(),
  nudgeLabel: z.string(),
  doneLabel: z.string(),
  openToContinue: z.string(),
});

/** Native clocks tick themselves; none of these strings contains a per-second value. */
export function workoutLiveState(input: {
  session: SessionDetail;
  ghostsFor: (id: string) => Ghosts;
  now: number;
  restEndedAt?: number | null;
  unit: WeightUnit;
  url: string;
  t: TFunction;
  options: z.infer<typeof liveOptionsSchema>;
}) {
  const { session, t } = input;
  const action = currentAction(input);
  const current = action.current;
  const exercise = session.exercises.find((entry) => entry.id === current?.exerciseRowId);
  const unit = resolveExerciseUnit(input.unit, exercise?.unit);
  const set = current
    ? t("session__live_set", { index: current.index + 1, total: current.total })
    : t("session__live_all_done");
  const paused = session.pausedAt !== null;
  const rest = action.phase === "rest" && !paused;
  const restText = current ? t("session__live_rest", { set }) : t("session__live_rest_last");
  return {
    restSetId: session.rest?.setId ?? null,
    sessionId: session.id,
    setId: current?.setId ?? null,
    title: session.title,
    phase: action.phase,
    url: input.url,
    text: rest
      ? restText
      : current
        ? t("session__live_action", {
            title: current.title,
            set,
            values: valuesText(
              current.values,
              unit,
              t(unit === "kg" ? "training__unit_kg" : "training__unit_lb"),
              current.type,
            ),
          })
        : set,
    next: action.next
      ? t("session__live_next", {
          next:
            action.next.kind === "exercise"
              ? action.next.title
              : t("session__live_set_number", { index: action.next.number }),
        })
      : "",
    restOver: current ? t("session__live_rest_over", { set }) : t("session__live_rest_over_last"),
    restEndsAtMs: rest && session.rest ? Date.parse(session.rest.endsAt) : null,
    sessionStartedAtMs: Date.parse(session.startedAt) + session.pausedMs,
    paused,
    pausedText: paused
      ? t("session__live_paused", {
          time: formatElapsed(
            sessionActiveSeconds(
              {
                startedAt: session.startedAt,
                pausedAt: session.pausedAt,
                pausedMs: session.pausedMs,
              },
              input.now,
            ),
          ),
        })
      : "",
    workStartedAtMs: Date.parse(action.workStartedAt),
    segments: session.exercises.map((exercise) => ({
      total: exercise.sets.length,
      done: exercise.sets.filter((entry) => entry.completedAt !== null).length,
    })),
    canComplete: current !== null,
    canLog: current !== null && current.values.every((value) => value.value !== null),
    channelName: t("session__live_channel"),
    skipLabel: t("session__live_skip"),
    nudgeLabel: t("session__live_nudge"),
    doneLabel: t("session__live_done"),
    openToContinue: t("session__live_open"),
    options: input.options,
  };
}
export type WorkoutLiveState = ReturnType<typeof workoutLiveState>;
