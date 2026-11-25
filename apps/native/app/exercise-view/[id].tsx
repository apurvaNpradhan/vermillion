import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseDetailScreen } from "@/exercise";

export default function ExerciseViewRoute() {
  const router = useRouter();
  const { id, sessionId } = z
    .object({ id: z.string(), sessionId: z.string().optional() })
    .parse(useLocalSearchParams());
  return (
    <ExerciseDetailScreen
      id={id}
      sessionId={sessionId}
      onSeeHistory={() => router.push({ pathname: "/exercise-view/[id]/history", params: { id } })}
      onOpenExercise={(next) =>
        router.push({ pathname: "/exercise-view/[id]", params: { id: next, sessionId } })
      }
    />
  );
}
