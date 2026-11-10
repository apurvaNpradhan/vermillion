/** Week timestamps encode calendar Mondays, not instants in the device timezone. */
export function formatWeekLabel(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(timestamp);
}
