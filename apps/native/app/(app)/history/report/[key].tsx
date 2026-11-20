import { Redirect, useLocalSearchParams } from "expo-router";
import { z } from "zod";

import { ReportScreen, parseReportKey } from "@/session";

/** The report of one month (`2026-10`) or year (`2026`). */
export default function Route() {
  const { key } = z.object({ key: z.string() }).parse(useLocalSearchParams());
  const period = parseReportKey(key);
  return period ? <ReportScreen period={period} /> : <Redirect href="/history" />;
}
