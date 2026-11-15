import type { BodyMetric } from "../body";

type Entry = { value: number; local_date: string; measured_at: string; id?: string };

/** Calendar order, then capture time, then id, including multiple entries on one day. */
export function lastN<T extends Entry>(entries: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  return [...entries]
    .sort(
      (a, b) =>
        a.local_date.localeCompare(b.local_date) ||
        a.measured_at.localeCompare(b.measured_at) ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    )
    .slice(-count);
}
export function changeSincePrevious(entries: readonly Entry[]): number | null {
  const rows = lastN(entries, 2);
  return rows.length < 2 ? null : rows[1]!.value - rows[0]!.value;
}
export function ratios(latest: Partial<Record<BodyMetric, number>>, heightCm: number | null) {
  const waist = latest.waist;
  return {
    waistToHeight: waist && heightCm && heightCm > 0 ? waist / heightCm : null,
    waistToHip: waist && latest.hips && latest.hips > 0 ? waist / latest.hips : null,
  };
}
