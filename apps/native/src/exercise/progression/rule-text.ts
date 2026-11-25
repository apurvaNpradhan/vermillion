import {
  addsLoad,
  formatLoad,
  type ExerciseType,
  type RuleId,
  type WeightUnit,
} from "@workspace/shared";

/** The rules in the order the sheet lists them, each with its name and hint keys. */
export const RULE_OPTIONS = [
  { id: "double", titleKey: "progress__rule_double", hintKey: "progress__rule_double_hint" },
  { id: "linear", titleKey: "progress__rule_linear", hintKey: "progress__rule_linear_hint" },
  {
    id: "top_backoff",
    titleKey: "progress__rule_top_backoff",
    hintKey: "progress__rule_top_backoff_hint",
  },
  { id: "maintain", titleKey: "progress__rule_maintain", hintKey: "progress__rule_maintain_hint" },
] as const satisfies readonly { id: RuleId; titleKey: string; hintKey: string }[];

/** One run of identical sets in a previewed Session: "3 × 62.5 kg × 8". */
export type PreviewGroup = {
  count: number;
  weight: string | null;
  reps: number | null;
  /** Timed and carried work: the time and distance of each set. */
  durationS?: number;
  distanceM?: number;
};

/** The sets of a previewed Session, runs of identical ones folded into a count. */
export function previewGroups(
  session: {
    sets: readonly {
      weightKg: number | null;
      reps: number | null;
      durationS?: number;
      distanceM?: number;
    }[];
  },
  type: ExerciseType,
  unit: WeightUnit,
): PreviewGroup[] {
  const loaded =
    type === "weight_reps" ||
    type === "short_distance_weight" ||
    type === "bodyweight_assisted_reps" ||
    addsLoad(type);
  const groups: PreviewGroup[] = [];
  for (const set of session.sets) {
    const weight = loaded && set.weightKg !== null ? formatLoad(set.weightKg, unit, type) : null;
    const last = groups.at(-1);
    if (
      last &&
      last.weight === weight &&
      last.reps === set.reps &&
      last.durationS === set.durationS &&
      last.distanceM === set.distanceM
    )
      last.count += 1;
    else
      groups.push({
        count: 1,
        weight,
        reps: set.reps,
        ...(set.durationS === undefined ? {} : { durationS: set.durationS }),
        ...(set.distanceM === undefined ? {} : { distanceM: set.distanceM }),
      });
  }
  return groups;
}
