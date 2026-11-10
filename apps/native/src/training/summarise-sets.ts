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

function withWeight(
  text: string,
  set: PlannedSet,
  type: ExerciseType,
  prefs: SummaryPrefs,
  labels: SummaryLabels,
): string {
  if (!SET_FIELDS[type].some((field) => field === "weight") || set.weight_kg === undefined) {
    return text;
  }
  const weight = labels.weight(formatWeight(set.weight_kg, prefs.weightUnit), prefs.weightUnit);
  return text === "" ? `@ ${weight}` : `${text} @ ${weight}`;
}

/**
 * One line for an exercise row: `3 × 8–10 · RPE 8–9 · 2:00`, `2 warm-up + 3 × 6–8 @ 100 kg`,
 * `3 × 30 s`, `Rest off`. Working sets that differ are counted and their reps spanned.
 */
export function summariseSets(
  sets: readonly PlannedSet[],
  type: ExerciseType,
  restSeconds: number | null,
  prefs: SummaryPrefs,
  labels: SummaryLabels,
): string {
  const warmups = sets.filter((set) => set.kind === "warmup");
  const working = sets.filter((set) => set.kind !== "warmup");
  const first = working[0];
  const pieces: string[] = [];
  if (warmups.length > 0) pieces.push(labels.warmup(warmups.length));
  let effort: string | null = null;
  if (first) {
    const alike = working.every((set) => sameTarget(targetOf(set), targetOf(first)));
    if (alike) {
      const text = withWeight(targetText(first, type, labels), first, type, prefs, labels);
      pieces.push(text === "" ? labels.sets(working.length) : `${working.length} × ${text}`);
      if (first.effort_min !== undefined && first.effort_max !== undefined) {
        effort = labels.effort(
          prefs.effortScale,
          formatEffortRange(first.effort_min, first.effort_max, prefs.effortScale),
        );
      }
    } else {
      const mins = working.flatMap((set) => (set.reps_min === undefined ? [] : [set.reps_min]));
      const maxs = working.flatMap((set) => (set.reps_max === undefined ? [] : [set.reps_max]));
      const spread = range(
        mins.length > 0 ? Math.min(...mins) : undefined,
        maxs.length > 0 ? Math.max(...maxs) : undefined,
      );
      pieces.push(
        spread
          ? `${labels.sets(working.length)}${SEPARATOR}${spread}`
          : labels.sets(working.length),
      );
    }
  }
  const head = pieces.join(" + ");
  return [
    head === "" ? null : head,
    effort,
    restSeconds === null ? labels.restOff : formatClock(restSeconds),
  ]
    .filter((part) => part !== null)
    .join(SEPARATOR);
}
