import { SET_FIELDS, type ExerciseType, type SetKind, type WeightUnit } from "@workspace/shared";

import { formatCell } from "./set-values";

/** The fields of a Session set the summary reads. */
export type SummarySet = {
  kind: SetKind;
  completedAt: string | null;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  floors: number | null;
  steps: number | null;
};

/** "2/4": ticked sets over all sets. */
export function progressText(sets: readonly Pick<SummarySet, "completedAt">[]): string {
  return `${sets.filter((set) => set.completedAt !== null).length}/${sets.length}`;
}

/** Whether every set is ticked and there is at least one. */
export function allTicked(sets: readonly Pick<SummarySet, "completedAt">[]): boolean {
  return sets.length > 0 && sets.every((set) => set.completedAt !== null);
}

/**
 * What a finished exercise's row says after "4/4 · ": its counted sets (warm-ups left out), as
 * "60 kg × 8, 8, 7 · 62.5 kg × 6" for weight and reps (consecutive sets of one weight share it),
 * otherwise each set's values, "12, 10, 8" or "0:30, 0:30". Empty when nothing counted.
 */
export function doneSummary(
  sets: readonly SummarySet[],
  type: ExerciseType,
  unit: WeightUnit,
  unitLabel: string,
): string {
  const counted = sets.filter((set) => set.completedAt !== null && set.kind !== "warmup");
  const fields: readonly string[] = SET_FIELDS[type];
  if (fields.includes("weight") && fields.includes("reps")) {
    const groups: { weight: string; reps: string[] }[] = [];
    for (const set of counted) {
      const weight = formatCell("weight", set.weightKg ?? 0, unit);
      const reps = formatCell("reps", set.reps, unit);
      const last = groups.at(-1);
      if (last && last.weight === weight) last.reps.push(reps);
      else groups.push({ weight, reps: [reps] });
    }
    return groups
      .map((group) => `${group.weight} ${unitLabel} × ${group.reps.join(", ")}`)
      .join(" · ");
  }
  const cell = (set: SummarySet, field: string): string => {
    switch (field) {
      case "reps":
        return formatCell("reps", set.reps, unit);
      case "duration":
        return formatCell("duration", set.durationS, unit);
      case "distance":
        return formatCell("distance", set.distanceM, unit);
      case "floors":
        return formatCell("floors", set.floors, unit);
      case "steps":
        return formatCell("steps", set.steps, unit);
      default:
        return formatCell("weight", set.weightKg, unit);
    }
  };
  return counted
    .map((set) =>
      fields
        .flatMap((field) => {
          const text = cell(set, field);
          return text === "" ? [] : [text];
        })
        .join(" · "),
    )
    .join(", ");
}

/**
 * The thousands-separated volume in the user's unit: "4,250". `locale` is the app's language.
 */
export function formatVolume(volumeKg: number, unit: WeightUnit, locale: string): string {
  const shown = unit === "kg" ? volumeKg : volumeKg / 0.45359237;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(shown));
}
