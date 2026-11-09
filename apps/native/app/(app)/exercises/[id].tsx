import { useLocalSearchParams, useRouter } from "expo-router";
import { z } from "zod";

import { ExerciseDetailScreen, useExerciseActions } from "@/exercise";

const paramsSchema = z.object({ id: z.string() });

export default function ExerciseDetailRoute() {
  const router = useRouter();
  const { archive, restore } = useExerciseActions();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  return (
    <ExerciseDetailScreen
      id={id}
      onOpenExercise={(next) => router.push({ pathname: "/exercises/[id]", params: { id: next } })}
      onBrowseGroup={(muscle) =>
        router.navigate({ pathname: "/exercises", params: { muscle, at: String(Date.now()) } })
      }
      onEdit={(target) => router.push({ pathname: "/exercises/[id]/edit", params: { id: target } })}
      onArchive={(target, title) => void archive(target, title).catch(() => undefined)}
      onRestore={(target) => void restore(target).catch(() => undefined)}
    />
  );
}
