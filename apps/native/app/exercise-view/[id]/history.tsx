import { useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { ExerciseHistoryScreen } from "@/exercise";

export default function ExerciseHistoryRoute() {
  const { id } = z.object({ id: z.string() }).parse(useLocalSearchParams());
  return <ExerciseHistoryScreen id={id} />;
}
