/**
 * Source: PanelUI Calendar and lib/date (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Gregorian day and month helpers ported to UTC calendar days so the caller can supply any zone.
 */
import { weekStartDay, type WeekStart } from "@workspace/shared";

const DAY_MS = 86_400_000;

export function calendarMonth(day: number, offset = 0) {
  const date = new Date(day);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

export function calendarGrid(month: number, weekStart: WeekStart) {
  const first = weekStartDay(month, weekStart);
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => first + (row * 7 + column) * DAY_MS),
  );
}

export function calendarPage(month: number, direction: -1 | 1, min: number, max: number) {
  const page = calendarMonth(month, direction);
  return page >= calendarMonth(min) && page <= calendarMonth(max) ? page : null;
}
