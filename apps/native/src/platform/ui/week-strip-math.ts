/**
 * Source: PanelUI WeekStrip (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Day arithmetic ported to UTC calendar-day numbers, like `calendar-math.ts`.
 */
const DAY_MS = 86_400_000;

/** `count` consecutive calendar days from `start` (UTC midnight), oldest first. */
export function stripDays(start: number, count = 7): number[] {
  return Array.from({ length: count }, (_, index) => start + index * DAY_MS);
}

/**
 * The day the next workout is planned for: today when nothing was trained yet today, otherwise
 * the next day of the strip. Null when the strip does not hold such a day (a trained last day).
 */
export function plannedDay(days: readonly number[], trained: ReadonlySet<number>, today: number) {
  const from = trained.has(today) ? today + DAY_MS : today;
  return days.find((day) => day >= from) ?? null;
}

/**
 * The left offset of column `index` in a strip of `count` equal columns separated by `gap`, in a
 * row `width` wide; the highlight slides to it. Zero until the row has a width.
 */
export function columnOffset(index: number, count: number, width: number, gap: number): number {
  if (count <= 0 || width <= 0 || index < 0) return 0;
  const column = (width - gap * (count - 1)) / count;
  return index * (column + gap);
}

/** The width of one column, as above. */
export function columnWidth(count: number, width: number, gap: number): number {
  if (count <= 0 || width <= 0) return 0;
  return (width - gap * (count - 1)) / count;
}
