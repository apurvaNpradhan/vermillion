import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { z } from "zod";

import { ExerciseSheetScreen } from "@/training";

const paramsSchema = z.object({ id: z.string(), entry: z.string() });

export default function ExerciseSheetRoute() {
  const router = useRouter();
  const { id, entry } = paramsSchema.parse(useLocalSearchParams());
  const close = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace("/train")),
    [router],
  );
  return (
    <ExerciseSheetScreen
      workoutId={id}
      entryId={entry}
      onClose={close}
      onOpenExercise={(exerciseId) =>
        router.push({ pathname: "/train/exercise/[id]", params: { id: exerciseId } })
      }
    />
  );
}
