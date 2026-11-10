import { SessionDetailScreen } from "@/session";
import { useLocalSearchParams } from "expo-router";
import { z } from "zod";
export default function Route() {
  const { id } = z.object({ id: z.string() }).parse(useLocalSearchParams());
  return <SessionDetailScreen id={id} />;
}
