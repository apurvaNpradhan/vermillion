import { formatLoad, type Evidence, type ExerciseType, type WeightUnit } from "@workspace/shared";

import { addsLoad } from "@workspace/shared";

/** One line of evidence: an i18n key and what it interpolates. */
export type EvidenceLine =
  | { key: "progress__evidence_from"; params: { date: string; sets: string } }
  | { key: "progress__evidence_deload"; params: { percent: number } }
  | { key: "progress__evidence_deload_snapped"; params: SnappedParams }
  | { key: "progress__evidence_break"; params: { count: number; percent: number } }
  | { key: "progress__evidence_break_snapped"; params: SnappedParams & { count: number } }
  | { key: "progress__evidence_cap"; params: { from: string; value: string; unit: WeightUnit } };

type SnappedParams = { percent: number; value: string; unit: WeightUnit; cut: number };

/**
 * The runs of the baseline Session's sets that share a load: "60 kg × 12, 12, 11". A lift with no
 * load is only its reps.
 */
export function evidenceSets(
  sets: readonly { weightKg: number | null; reps: number | null }[],
  type: ExerciseType,
  unit: WeightUnit,
  format: (weight: string, unit: WeightUnit, reps: string) => string,
): string {
  const loaded = type === "weight_reps" || addsLoad(type);
  const runs: { weight: string | null; reps: string[] }[] = [];
  for (const set of sets) {
    const weight = loaded && set.weightKg !== null ? formatLoad(set.weightKg, unit, type) : null;
    const reps = set.reps === null ? "–" : String(set.reps);
    const last = runs.at(-1);
    if (last && last.weight === weight) last.reps.push(reps);
    else runs.push({ weight, reps: [reps] });
  }
  return runs
    .map(({ weight, reps }) =>
      weight === null ? reps.join(", ") : format(weight, unit, reps.join(", ")),
    )
    .join(" · ");
}

/**
 * The one or two quiet lines under a reason: which Session the suggestion was read from and what
 * was done in it, then the factor, snapping or cap that changed the load. `formatDate` turns the
 * Session's start into the lifter's short date.
 */
export function evidenceLines(
  evidence: Evidence | undefined,
  options: {
    type: ExerciseType;
    unit: WeightUnit;
    formatDate: (iso: string) => string;
    formatSets: (weight: string, unit: WeightUnit, reps: string) => string;
  },
): EvidenceLine[] {
  if (!evidence) return [];
  const { baseline, factor, snapped } = evidence;
  const { type, unit } = options;
  const lines: EvidenceLine[] = [];
  if (baseline && baseline.sets.length > 0) {
    lines.push({
      key: "progress__evidence_from",
      params: {
        date: options.formatDate(baseline.at),
        sets: evidenceSets(baseline.sets, type, unit, options.formatSets),
      },
    });
  }
  if (factor) {
    const percent = Math.round(factor.share * 100);
    const to = snapped?.source === "grid" ? snapped : null;
    const snap = to
      ? {
          percent,
          value: formatLoad(to.toKg, unit, type),
          unit,
          cut: Math.round((1 - to.toKg / to.fromKg) * 100),
        }
      : null;
    if (factor.source === "break") {
      lines.push(
        snap
          ? {
              key: "progress__evidence_break_snapped",
              params: { ...snap, count: factor.days ?? 0 },
            }
          : { key: "progress__evidence_break", params: { count: factor.days ?? 0, percent } },
      );
    } else {
      lines.push(
        snap
          ? { key: "progress__evidence_deload_snapped", params: snap }
          : { key: "progress__evidence_deload", params: { percent } },
      );
    }
  } else if (snapped?.source === "cap") {
    lines.push({
      key: "progress__evidence_cap",
      params: {
        from: formatLoad(snapped.fromKg, unit, type),
        value: formatLoad(snapped.toKg, unit, type),
        unit,
      },
    });
  }
  return lines;
}
