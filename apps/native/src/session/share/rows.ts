import type { SessionDetail } from "@workspace/sync";

import { rowDetail, type RowDetail } from "./best-set";

/** One exercise of a Session as a card row. */
export type ShareRow = {
  id: string;
  title: string;
  thumbnailKey: string | null;
  imageMediaId: string | null;
  /** Counted sets: ticked, no warm-ups. */
  sets: number;
  detail: RowDetail;
  /** A Counted set of it set a Record. */
  record: boolean;
};

/**
 * The exercises that have Counted sets, in Session order. Warm-ups and unticked sets are left
 * out, so an exercise with only those has no row. `flagged` says which set ids set a Record.
 */
export function shareRows(
  session: SessionDetail,
  flagged: { has: (setId: string) => boolean },
  showWeights: boolean,
): ShareRow[] {
  return session.exercises.flatMap((entry) => {
    const counted = entry.sets.filter((set) => set.completedAt !== null && set.kind !== "warmup");
    const detail = rowDetail(entry.type, counted, showWeights);
    if (counted.length === 0 || detail === null) return [];
    return [
      {
        id: entry.id,
        title: entry.title,
        thumbnailKey: entry.exercise?.thumbnailKey ?? null,
        imageMediaId: entry.exercise?.imageMediaId ?? null,
        sets: counted.length,
        detail,
        record: counted.some((set) => flagged.has(set.id)),
      },
    ];
  });
}

/** The most exercise rows a card shows before it says "+N more". */
export const MAX_ROWS = 12;

/** The rows that fit and how many were left out. */
export type CompactedRows<Row> = { shown: Row[]; more: number };

export function compactRows<Row>(rows: readonly Row[], max: number = MAX_ROWS): CompactedRows<Row> {
  return { shown: rows.slice(0, max), more: Math.max(0, rows.length - max) };
}

/** Sizes in card units for a list of this many rows, so up to 12 fit the space under the stats. */
export type RowMetrics = { height: number; thumb: number; name: number; detail: number };

export function rowMetrics(count: number): RowMetrics {
  if (count <= 6) return { height: 132, thumb: 88, name: 42, detail: 34 };
  if (count <= 9) return { height: 100, thumb: 68, name: 36, detail: 30 };
  return { height: 72, thumb: 52, name: 30, detail: 26 };
}
