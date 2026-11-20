import {
  MUSCLE_GROUPS,
  type MuscleDetail,
  type MuscleGroup,
  type MuscleShares,
} from "@workspace/shared";

/** A bar of the distribution list. `detail` is set on a detail row, which also names its group. */
export type ShareRow = {
  key: string;
  muscle: MuscleGroup;
  detail: MuscleDetail | null;
  /** The weighted sets behind the bar. */
  sets: number;
  /** 0 to 1 of the period's sets. */
  share: number;
  /** Which of the five chart tokens colours it (1 to 5). */
  tone: 1 | 2 | 3 | 4 | 5;
};

const TONES = [1, 2, 3, 4, 5] as const;

/** A group keeps one chart colour everywhere; its details wear it too. */
export function toneOf(muscle: MuscleGroup): ShareRow["tone"] {
  return TONES[Math.max(0, MUSCLE_GROUPS.indexOf(muscle)) % TONES.length] ?? 1;
}

/** The groups' shares as bars, biggest first; `limit` keeps only the top of the list. */
export function groupRows(shares: MuscleShares, limit?: number): ShareRow[] {
  return shares.groups.slice(0, limit).map((group) => ({
    key: group.muscle,
    muscle: group.muscle,
    detail: null,
    sets: group.sets,
    share: group.share,
    tone: toneOf(group.muscle),
  }));
}

/** The details' shares as bars, biggest first. */
export function detailRows(shares: MuscleShares, limit?: number): ShareRow[] {
  return shares.details.slice(0, limit).map((part) => ({
    key: part.detail,
    muscle: part.muscle,
    detail: part.detail,
    sets: part.sets,
    share: part.share,
    tone: toneOf(part.muscle),
  }));
}

/** Whether the period names any detail at all (otherwise the Details view says nothing more). */
export const hasDetails = (shares: MuscleShares) => shares.details.length > 0;

/** "34%"; a muscle with any sets never reads as "0%". */
export function formatPercent(share: number, locale: string): string {
  const rounded = Math.round(share * 100);
  const percent = share > 0 && rounded === 0 ? 1 : rounded;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    percent / 100,
  );
}
