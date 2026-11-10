import {
  SET_FIELDS,
  formatWeight,
  type EffortScale,
  type ExerciseType,
  type PlannedSet,
  type WeightUnit,
} from "@workspace/shared";

import { formatEffortRange } from "./effort";
import { formatClock } from "./rest";
import { sameTarget, targetOf } from "./set-editing";

export type SummaryPrefs = { weightUnit: WeightUnit; effortScale: EffortScale };

/** The words of a summary; the editor passes translated ones, tests plain ones. */
export type SummaryLabels = {
  warmup: (count: number) => string;
  sets: (count: number) => string;
  seconds: (value: number) => string;
  minutes: (value: number) => string;
  minutesSeconds: (minutes: number, seconds: number) => string;
  meters: (value: string) => string;
  kilometers: (value: string) => string;
  floors: (value: number) => string;
  steps: (value: number) => string;
  weight: (value: string, unit: WeightUnit) => string;
  effort: (scale: EffortScale, value: string) => string;
  restOff: string;
  /** What a superset member that does not rest shows: its rest is held by the last member. */
  noRest: string;
};

const SEPARATOR = " · ";

function range(min: number | undefined, max: number | undefined): string | null {
  if (min === undefined || max === undefined) return null;
  return min === max ? String(min) : `${min}–${max}`;
}

export function formatSeconds(total: number, labels: SummaryLabels): string {
  if (total < 60) return labels.seconds(total);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? labels.minutes(minutes) : labels.minutesSeconds(minutes, rest);
}

export function formatDistance(meters: number, labels: SummaryLabels): string {
  return meters >= 1000
    ? labels.kilometers(String(Number((meters / 1000).toFixed(2))))
    : labels.meters(String(Number(meters.toFixed(1))));
}

/** The non-weight targets of one set: reps, duration, distance, floors, steps. */
function targetText(set: PlannedSet, type: ExerciseType, labels: SummaryLabels): string {
  const parts: string[] = [];
  for (const field of SET_FIELDS[type]) {
    if (field === "reps") {
      const reps = range(set.reps_min, set.reps_max);
      if (reps) parts.push(reps);
    } else if (field === "duration" && set.duration_s !== undefined) {
      parts.push(formatSeconds(set.duration_s, labels));
    } else if (field === "distance" && set.distance_m !== undefined) {
      parts.push(formatDistance(set.distance_m, labels));
    } else if (field === "floors" && set.floors !== undefined) {
      parts.push(labels.floors(set.floors));
    } else if (field === "steps" && set.steps !== undefined) {
      parts.push(labels.steps(set.steps));
    }
  }
  return parts.join(SEPARATOR);
}

/** What the working sets of an exercise come to, for one line of text. */
export type WorkingSummary = {
  /** `3 × 8–10`, `3 sets · 6–10` when they differ, `3 sets`; null without working sets. */
  text: string | null;
  /** The weight of alike sets (`100 kg`), or null. */
  weight: string | null;
  /** The effort of alike sets (`RPE 8–9`), or null. */
  effort: string | null;
};

/** The working (non warm-up) sets, counted and spanned. Working sets that differ lose weight and effort. */
export function summariseWorking(
  sets: readonly PlannedSet[],
  type: ExerciseType,
  prefs: SummaryPrefs,
  labels: SummaryLabels,
): WorkingSummary {
  const working = sets.filter((set) => set.kind !== "warmup");
  const first = working[0];
  if (!first) return { text: null, weight: null, effort: null };
  const alike = working.every((set) => sameTarget(targetOf(set), targetOf(first)));
  if (alike) {
    const targets = targetText(first, type, labels);
    const weight =
      SET_FIELDS[type].some((field) => field === "weight") && first.weight_kg !== undefined
        ? labels.weight(formatWeight(first.weight_kg, prefs.weightUnit), prefs.weightUnit)
        : null;
    const effort =
      first.effort_min !== undefined && first.effort_max !== undefined
        ? labels.effort(
            prefs.effortScale,
            formatEffortRange(first.effort_min, first.effort_max, prefs.effortScale),
          )
        : null;
    return {
      text: targets === "" ? labels.sets(working.length) : `${working.length} × ${targets}`,
      weight,
      effort,
    };
  }
  const mins = working.flatMap((set) => (set.reps_min === undefined ? [] : [set.reps_min]));
  const maxs = working.flatMap((set) => (set.reps_max === undefined ? [] : [set.reps_max]));
  const spread = range(
    mins.length > 0 ? Math.min(...mins) : undefined,
    maxs.length > 0 ? Math.max(...maxs) : undefined,
  );
  return {
    text: spread
      ? `${labels.sets(working.length)}${SEPARATOR}${spread}`
      : labels.sets(working.length),
    weight: null,
    effort: null,
  };
}

/** How an exercise row shows its rest. */
export type RestDisplay =
  /** Its own rest: off when null. */
  | "own"
  /** A superset member before the last: no rest, the group's rest is on the last member. */
  | "group";

/**
 * One line for an exercise row: `3 × 8–10 · RPE 8–9 · 2:00`, `2 warm-up + 3 × 6–8 @ 100 kg`,
 * `3 × 30 s`, `Rest off`. Working sets that differ are counted and their reps spanned. A
 * superset member that is not last shows "No rest" (`rest: "group"`).
 */
export function summariseSets(
  sets: readonly PlannedSet[],
  type: ExerciseType,
  restSeconds: number | null,
  prefs: SummaryPrefs,
  labels: SummaryLabels,
  rest: RestDisplay = "own",
): string {
  const warmups = sets.filter((set) => set.kind === "warmup");
  const working = summariseWorking(sets, type, prefs, labels);
  const pieces: string[] = [];
  if (warmups.length > 0) pieces.push(labels.warmup(warmups.length));
  if (working.text !== null) {
    pieces.push(working.weight === null ? working.text : `${working.text} @ ${working.weight}`);
  }
  const head = pieces.join(" + ");
  const restText =
    rest === "group"
      ? labels.noRest
      : restSeconds === null
        ? labels.restOff
        : formatClock(restSeconds);
  return [head === "" ? null : head, working.effort, restText]
    .filter((part) => part !== null)
    .join(SEPARATOR);
}
