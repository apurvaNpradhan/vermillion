import { useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { WorkoutPreviewScreen } from "@/training";
const paramsSchema = z.object({ id: z.string() });
export default function WorkoutRoute() {
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return <WorkoutPreviewScreen id={id} />;
}
