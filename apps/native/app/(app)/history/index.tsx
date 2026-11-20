import { useLocalSearchParams } from "expo-router";
import { z } from "zod";

import { HistoryScreen } from "@/session";

export default function Route() {
  const { day } = useLocalSearchParams();
  const date = z.iso.date().safeParse(day);
  const initialDay = date.success ? Date.parse(date.data) : null;
  return <HistoryScreen key={initialDay ?? "current"} initialDay={initialDay} />;
}
