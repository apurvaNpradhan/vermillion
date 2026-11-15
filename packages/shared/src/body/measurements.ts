import type { BodyMetric } from "../body";

type Entry = { value: number; local_date: string; measured_at: string; id?: string };

/**
 * Calendar order, then capture instant, then id, including multiple entries on one day. Instants
 * are compared parsed: `12:00+05:30` is before `08:00Z`, though its text sorts after.
 */
export function lastN<T extends Entry>(entries: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  return [...entries]
    .sort(
      (a, b) =>
        a.local_date.localeCompare(b.local_date) ||
        Date.parse(a.measured_at) - Date.parse(b.measured_at) ||
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

/** A body value for display: always one decimal, in the reader's locale (80 → "80.0"). */
export function formatBodyValue(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * The canonical value to save from a keypad draft, or `undefined` when the draft still shows the
 * baseline: then nothing is written, so re-entering the shown figure never replaces the precise
 * stored value with a rounded conversion or overwrites another device's change.
 */
export function changedCanonical(
  draft: string,
  baselineDraft: string,
  toCanonical: (shown: number) => number,
): number | undefined {
  if (Number(draft) === Number(baselineDraft) && draft.trim() !== "") return undefined;
  return toCanonical(Number(draft));
}
