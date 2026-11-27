import type { TFunction } from "i18next";

/** A time held, as the lifter reads it: "45 s", "2 min", "1 min 30 s". */
export function durationText(t: TFunction, total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  if (minutes === 0) return t("training__duration_seconds", { value: seconds });
  return seconds === 0
    ? t("training__duration_minutes", { value: minutes })
    : t("training__duration_minutes_seconds", { minutes, seconds });
}

/** A distance covered: "40 m", "1.5 km". */
export function distanceText(t: TFunction, metres: number): string {
  return metres >= 1000
    ? t("training__distance_kilometers", { value: Number((metres / 1000).toFixed(2)) })
    : t("training__distance_meters", { value: Number(metres.toFixed(1)) });
}

/** What a timed or carried set did, joined: "40 m · 30 s". Null when it has neither. */
export function workText(
  t: TFunction,
  set: { durationS?: number; distanceM?: number },
): string | null {
  const parts = [
    set.distanceM === undefined ? null : distanceText(t, set.distanceM),
    set.durationS === undefined ? null : durationText(t, set.durationS),
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}
