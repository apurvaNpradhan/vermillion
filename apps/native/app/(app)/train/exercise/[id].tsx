import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseDetailScreen } from "@/exercise";

const paramsSchema = z.object({ id: z.string() });

/** An exercise's detail, opened from a Workout so back returns to the Workout. */
export default function TrainExerciseDetail() {
  const router = useRouter();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return (
    <ExerciseDetailScreen
      id={id}
      onOpenExercise={(next) =>
        router.push({ pathname: "/train/exercise/[id]", params: { id: next } })
      }
      onBrowseGroup={(muscle) =>
        router.navigate({ pathname: "/exercises", params: { muscle, at: String(Date.now()) } })
      }
    />
  );
}
