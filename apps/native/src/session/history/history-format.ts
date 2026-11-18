import { KG_PER_LB, type WeightUnit } from "@workspace/shared";

export function historyFormat(locale: string, unit: WeightUnit) {
  const date = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
  const full = date({ dateStyle: "full" });
  const medium = date({ dateStyle: "medium" });
  const monthYear = date({ month: "long", year: "numeric" });
  const shortMonth = date({ month: "short" });
  const longMonth = date({ month: "long" });
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  const year = date({ year: "numeric" });
  const day = date({ day: "numeric" });
  const weekday = date({ weekday: "short" });
  const weekdayLetter = date({ weekday: "narrow" });
  const integer = new Intl.NumberFormat(locale);
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const delta = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const volumeValue = (kg: number) => (unit === "kg" ? kg / 1000 : kg / KG_PER_LB);

  const volumeUnit: "session__volume_tonnes" | "training__unit_lb" =
    unit === "kg" ? "session__volume_tonnes" : "training__unit_lb";

  return {
    locale,
    full: full.format,
    medium: medium.format,
    shortMonth: shortMonth.format,
    longMonth: longMonth.format,
    list: (items: string[]) => list.format(items),
    monthYear: monthYear.format,
    year: year.format,
    day: day.format,
    weekday: weekday.format,
    weekdayLetter: weekdayLetter.format,
    integer: integer.format,
    decimal: decimal.format,
    delta: delta.format,
    volumeValue,
    volumeUnit,
  };
}

export type HistoryFormat = ReturnType<typeof historyFormat>;
