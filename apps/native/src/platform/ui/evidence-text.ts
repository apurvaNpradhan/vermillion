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

/** How the parts of a set read; the screen passes translated ones, tests plain ones. */
export type EvidenceFormats = {
  /** A load with its reps (or its time, or its distance): "60 kg × 12". */
  sets: (weight: string, unit: WeightUnit, reps: string) => string;
  /** Help on an assisted lift, with its reps: "20 kg assist × 8". */
  assisted: (weight: string, unit: WeightUnit, reps: string) => string;
  duration: (seconds: number) => string;
  distance: (metres: number) => string;
};

/**
 * The runs of the baseline Session's sets that share a load: "60 kg × 12, 12, 11". A lift with no
 * load is only its reps; timed work says how long, carried work how far, and an assisted lift how
 * much help.
 */
export function evidenceSets(
  sets: readonly {
    weightKg: number | null;
    reps: number | null;
    durationS?: number;
    distanceM?: number;
  }[],
  type: ExerciseType,
  unit: WeightUnit,
  formats: EvidenceFormats,
): string {
  const assisted = type === "bodyweight_assisted_reps";
  const loaded =
    type === "weight_reps" || type === "short_distance_weight" || addsLoad(type) || assisted;
  const runs: { weight: string | null; reps: string[] }[] = [];
  for (const set of sets) {
    const weight = loaded && set.weightKg !== null ? formatLoad(set.weightKg, unit, type) : null;
    const parts = [
      set.reps === null ? null : String(set.reps),
      set.durationS === undefined ? null : formats.duration(set.durationS),
      set.distanceM === undefined ? null : formats.distance(set.distanceM),
    ].filter((part) => part !== null);
    const reps = parts.length === 0 ? "–" : parts.join(" · ");
    const last = runs.at(-1);
    if (last && last.weight === weight) last.reps.push(reps);
    else runs.push({ weight, reps: [reps] });
  }
  return runs
    .map(({ weight, reps }) =>
      weight === null
        ? reps.join(", ")
        : (assisted ? formats.assisted : formats.sets)(weight, unit, reps.join(", ")),
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
    formats: EvidenceFormats;
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
        sets: evidenceSets(baseline.sets, type, unit, options.formats),
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
