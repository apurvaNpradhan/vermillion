import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { z } from "zod";

import { ExerciseDetailScreen, useExerciseActions } from "@/exercise";
import { AddToWorkoutSheet } from "@/training";

const paramsSchema = z.object({ id: z.string() });

export default function ExerciseDetailRoute() {
  const router = useRouter();
  const { archive, restore } = useExerciseActions();
  const { id } = paramsSchema.parse(useLocalSearchParams());
  const [adding, setAdding] = useState(false);
  return (
    <>
      <ExerciseDetailScreen
        id={id}
        onOpenExercise={(next) =>
          router.push({ pathname: "/exercises/[id]", params: { id: next } })
        }
        onBrowseGroup={(muscle) =>
          router.navigate({ pathname: "/exercises", params: { muscle, at: String(Date.now()) } })
        }
        onEdit={(target) =>
          router.push({ pathname: "/exercises/[id]/edit", params: { id: target } })
        }
        onArchive={(target, title) => void archive(target, title).catch(() => undefined)}
        onRestore={(target) => void restore(target).catch(() => undefined)}
        onAddToWorkout={() => setAdding(true)}
      />
      <AddToWorkoutSheet exerciseId={id} isOpen={adding} onOpenChange={setAdding} />
    </>
  );
}
