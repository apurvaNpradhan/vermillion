import { REST_SECONDS_MAX, WARMUP_REST_SECONDS, type SetKind } from "@workspace/shared";

import type { Block, BlockExercise } from "./blocks";
import { remainingSeconds, type Countdown } from "./clock";

/** What the rest rules need of a Session exercise. */
export type RestExercise = Omit<BlockExercise, "sets"> & {
  restSeconds: number | null;
  sets: readonly { id: string; completedAt: string | null; kind: SetKind }[];
};

/**
 * The rest a tick starts, in seconds, or null for none (ADR 0038).
 * - The exercise's rest, or the fixed warm-up rest after a warm-up. Rest off (null or 0) starts
 *   nothing, after a warm-up too.
 * - In a superset only the last member's set of a round starts the rest: the last member that has
 *   a set in that round, so a member with fewer sets does not stall the later rounds. The group's
 *   rest is the last member's.
 * - The result stays within the 10 minutes a Rest may last.
 */
export function restAfterTick(
  block: Block<RestExercise>,
  exerciseId: string,
  setId: string,
): number | null {
  const member = block.members.find((candidate) => candidate.id === exerciseId);
  const index = member?.sets.findIndex((set) => set.id === setId) ?? -1;
  const set = member?.sets[index];
  if (!member || !set) return null;
  let own = member.restSeconds;
  if (block.superset) {
    const inRound = block.members.filter((candidate) => candidate.sets[index] !== undefined);
    if (inRound.at(-1)?.id !== exerciseId) return null;
    own = block.members.at(-1)?.restSeconds ?? member.restSeconds;
  }
  if (own === null || own <= 0) return null;
  const seconds = set.kind === "warmup" ? WARMUP_REST_SECONDS : own;
  return Math.min(REST_SECONDS_MAX, seconds);
}

/** The change a −15 / +15 press makes, and whether it ends the Rest. */
export type Adjustment = { delta: number; ends: boolean };

/** The −15 and +15 buttons. */
export const REST_ADJUST_SECONDS = 15;

/**
 * The change to apply for a −15 / +15 press, so the Rest stays between 0 and 10 minutes: a +15
 * near the cap adds what fits (nothing at the cap); a −15 that would reach 0 ends the Rest.
 */
export function clampedAdjustment(remaining: number, delta: number): Adjustment {
  const next = Math.min(REST_SECONDS_MAX, Math.max(0, remaining + delta));
  return { delta: next - remaining, ends: next === 0 };
}

/** The Rest as the bar shows it. */
export type RestView = { remaining: number; total: number; running: boolean };

/**
 * Where the Rest stands now, from its stored times: seconds left (never above the set length even
 * if the clock jumped back), its length, and whether it is still running.
 */
export function restView(rest: Countdown, now: number): RestView {
  const total = Math.max(
    0,
    Math.ceil((Date.parse(rest.endsAt) - Date.parse(rest.startedAt)) / 1000),
  );
  const remaining = remainingSeconds(rest, now);
  return { remaining, total, running: remaining > 0 };
}

/** Whether the Rest on the Session was started by one of `exercise`'s sets, and is running. */
export function restBelongsTo(
  rest: { setId: string } | null,
  exercise: { sets: readonly { id: string }[] },
  running: boolean,
): boolean {
  return running && rest !== null && exercise.sets.some((set) => set.id === rest.setId);
}
