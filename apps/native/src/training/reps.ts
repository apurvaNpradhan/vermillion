/** Input stays a draft until both bounds form a valid target. Empty clears the target. */
export function parseRepTarget(
  minText: string,
  maxText: string,
  range: boolean,
): { reps_min?: number; reps_max?: number } | null {
  const low = minText.trim();
  const high = range ? maxText.trim() : low;
  if (low === "" && high === "") return { reps_min: undefined, reps_max: undefined };
  if (!/^\d{1,3}$/.test(low) || !/^\d{1,3}$/.test(high)) return null;
  const min = Number(low);
  const max = Number(high);
  return min >= 1 && min <= max ? { reps_min: min, reps_max: max } : null;
}
