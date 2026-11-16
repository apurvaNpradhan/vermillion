import { weekColumn, type WeekStart } from "@workspace/shared";

/** Six fixed weeks keep the sheet the same height for every month. Weeks begin on `weekStart`. */
export function monthDays(month: string, weekStart: WeekStart): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - weekColumn(first.getUTCDay(), weekStart) + 1;
    return day >= 1 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}
