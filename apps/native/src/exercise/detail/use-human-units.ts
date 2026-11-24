import { useTranslation } from "@/platform/i18n";

import { formatClock, formatPace, humanDistance } from "./numbers";

/** Durations, distances and paces as people say them: 40:00, 7.0 km, 850 m, 5:43 /km. */
export function useHumanUnits() {
  const { t, i18n } = useTranslation();
  return {
    duration: formatClock,
    distance: (metres: number) => {
      const { value, unit } = humanDistance(metres, i18n.language);
      return t(unit === "km" ? "exercise__value_km" : "exercise__value_metres", { value });
    },
    /** `metresPerSecond` is how records store pace; it is shown per kilometre. */
    pace: (metresPerSecond: number) =>
      t("exercise__value_pace", { value: formatPace(metresPerSecond) }),
  };
}
