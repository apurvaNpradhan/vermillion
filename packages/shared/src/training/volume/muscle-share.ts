import type { MuscleDetail, MuscleGroup } from "../../exercise/vocabulary";
import type { DetailLoad, MuscleLoad } from "./muscle-distribution";

/** One muscle group's share of the period's weighted sets, with its details ranked inside it. */
export type GroupShare = {
  muscle: MuscleGroup;
  sets: number;
  /** 0 to 1 of every group's sets together. */
  share: number;
  parts: readonly DetailShare[];
};

/** One muscle detail's share of the period's weighted sets (not of its group's). */
export type DetailShare = {
  detail: MuscleDetail;
  muscle: MuscleGroup;
  sets: number;
  share: number;
};

export type MuscleShares = {
  /** The weighted sets of every group added up (the denominator of every share). */
  total: number;
  /** Groups, biggest share first (the order of `loads`). */
  groups: readonly GroupShare[];
  /** Every detail across groups, biggest share first; sets that name no detail are left out. */
  details: readonly DetailShare[];
};

/**
 * The share of sets per muscle group and per detail, from the loads of `muscleDistribution` /
 * `detailDistribution` (so a secondary muscle counts half, as everywhere else). Shares divide by
 * the sum of the group loads, so the groups add up to 1; details sum to at most their group's
 * share, the rest being sets that name no detail. Empty loads give no shares.
 */
export function muscleShares(
  loads: readonly MuscleLoad[],
  details: readonly DetailLoad[],
): MuscleShares {
  const total = loads.reduce((sum, load) => sum + load.sets, 0);
  const fraction = (sets: number) => (total > 0 ? sets / total : 0);
  const byDetail = (muscle: MuscleGroup): DetailShare[] =>
    (details.find((load) => load.muscle === muscle)?.parts ?? [])
      .flatMap((part) =>
        part.detail === "unspecified"
          ? []
          : [{ detail: part.detail, muscle, sets: part.sets, share: fraction(part.sets) }],
      )
      .sort((a, b) => b.sets - a.sets || (a.detail < b.detail ? -1 : 1));
  const groups = loads.flatMap((load): GroupShare[] =>
    load.sets > 0
      ? [
          {
            muscle: load.muscle,
            sets: load.sets,
            share: fraction(load.sets),
            parts: byDetail(load.muscle),
          },
        ]
      : [],
  );
  const flat = groups
    .flatMap((group) => group.parts)
    .sort((a, b) => b.sets - a.sets || (a.detail < b.detail ? -1 : 1));
  return { total, groups, details: flat };
}
