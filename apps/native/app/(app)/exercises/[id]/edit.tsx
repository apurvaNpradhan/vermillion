import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseFormScreen } from "@/exercise";

const paramsSchema = z.object({ id: z.string() });

export default function EditExercise() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return <ExerciseFormScreen target={{ kind: "edit", id }} onClose={() => router.back()} />;
}
